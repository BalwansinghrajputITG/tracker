"""
Employee documents (hr.md §23 document management, §38 file storage).

Access model, in order:
  1. document.read_all       — HR/exec, sees everything
  2. the subject themselves  — sees their own, unless flagged confidential
  3. everyone else           — 403

Download is two-step by design: an authenticated, permission-checked, audited
call returns a SHORT-LIVED signed URL. The URL itself carries no identity, so its
lifetime is its access control — which is exactly why it is measured in minutes.
The raw storage key is never returned to a client.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response

from config import settings
from database import get_db
from middleware.auth import get_current_user
from middleware.permissions import has_permission, require_permission
from models.hr.document import DOC_TYPES, DocumentUpdate
from routers.hr.common import aware, iso, oid, parse_date, user_map, utcnow
from services.audit_service import audit, audit_denied
from services.storage import get_storage, verify_signature
from utils.file_validation import ALLOWED_MIME_TYPES, detect_mime, safe_filename

router = APIRouter()

EXPIRY_WARNING_DAYS = 30


def _expiry_state(expires_at) -> str:
    exp = aware(expires_at)
    if not exp:
        return "none"
    now = utcnow()
    if exp < now:
        return "expired"
    if exp < now + timedelta(days=EXPIRY_WARNING_DAYS):
        return "expiring_soon"
    return "valid"


def _serialize(doc: dict, *, users: dict) -> dict:
    subject = users.get(str(doc.get("user_id")), {})
    uploader = users.get(str(doc.get("uploaded_by")), {})
    return {
        "id":               str(doc["_id"]),
        "doc_group_id":     str(doc.get("doc_group_id", doc["_id"])),
        "version":          doc.get("version", 1),
        "is_current":       doc.get("is_current", True),
        "user_id":          str(doc["user_id"]) if doc.get("user_id") else None,
        "subject_name":     subject.get("full_name", ""),
        "doc_type":         doc.get("doc_type", "other"),
        "title":            doc.get("title", ""),
        "description":      doc.get("description", ""),
        "file_name":        doc.get("file_name", ""),
        "mime_type":        doc.get("mime_type", ""),
        "size_bytes":       doc.get("size_bytes", 0),
        "expires_at":       iso(doc.get("expires_at")),
        "expiry_state":     _expiry_state(doc.get("expires_at")),
        "is_confidential":  doc.get("is_confidential", False),
        "scan_status":      doc.get("scan_status", "skipped"),
        "uploaded_by":      str(doc["uploaded_by"]) if doc.get("uploaded_by") else None,
        "uploaded_by_name": uploader.get("full_name", ""),
        "created_at":       iso(doc.get("created_at")),
    }


async def _assert_document_access(db, doc: dict, current_user: dict, *, action: str) -> None:
    """Raise 403 unless the caller may see this document."""
    if has_permission(current_user, "document.read_all"):
        return
    is_subject = doc.get("user_id") and str(doc["user_id"]) == str(current_user["_id"])
    # Confidential documents (background checks, disciplinary records) are
    # withheld even from their subject — that is what the flag is for.
    if is_subject and not doc.get("is_confidential"):
        return
    raise HTTPException(status_code=403, detail=f"You cannot {action} this document.")


# ── Signed file delivery (LocalDiskBackend only) ──────────────────────────────
# Declared first: it is unauthenticated by design, and must not be shadowed by
# the /{document_id} path parameter below.

@router.get("/file")
async def serve_signed_file(
    key: str = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
    name: str = Query("download"),
):
    """Serve a locally-stored file against an HMAC-signed, expiring URL.

    Deliberately requires no Authorization header — that is what makes the link
    usable by a browser download, and why it expires in minutes. On S3 this route
    is unused; the presigned URL points at the bucket instead.
    """
    ok, reason = verify_signature(key, exp, sig)
    if not ok:
        raise HTTPException(status_code=403, detail=reason)

    storage = get_storage()
    try:
        data = await storage.read(key)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found in storage.")

    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={
            # Always an attachment: an inline HTML or SVG would run scripts in
            # this API's origin.
            "Content-Disposition": f'attachment; filename="{safe_filename(name, "")}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_documents(
    user_id: str | None = Query(None),
    doc_type: str | None = Query(None),
    expiry_state: str | None = Query(None, description="expired | expiring_soon"),
    include_versions: bool = Query(False, description="Include superseded versions"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user=Depends(require_permission("document.read")),
    db=Depends(get_db),
):
    """Documents the caller may see."""
    query: dict = {"deleted_at": None}

    if not include_versions:
        query["is_current"] = True

    if has_permission(current_user, "document.read_all"):
        if user_id:
            query["user_id"] = oid(user_id, "user_id")
    else:
        # No read_all: own documents only, and never confidential ones.
        query["user_id"] = current_user["_id"]
        query["is_confidential"] = {"$ne": True}

    if doc_type:
        query["doc_type"] = doc_type

    if expiry_state == "expired":
        query["expires_at"] = {"$lt": utcnow()}
    elif expiry_state == "expiring_soon":
        query["expires_at"] = {"$gte": utcnow(), "$lt": utcnow() + timedelta(days=EXPIRY_WARNING_DAYS)}

    skip = (page - 1) * limit
    docs = await db.hr_documents.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.hr_documents.count_documents(query)

    users = await user_map(db, {d.get("user_id") for d in docs} | {d.get("uploaded_by") for d in docs})
    return {
        "documents": [_serialize(d, users=users) for d in docs],
        "total": total, "page": page, "limit": limit,
    }


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Form(...),
    doc_type: str = Form("other"),
    title: str = Form(""),
    description: str = Form(""),
    expires_at: str = Form(""),
    is_confidential: bool = Form(False),
    doc_group_id: str = Form("", description="Set to add a new version of an existing document"),
    current_user=Depends(require_permission("document.upload")),
    db=Depends(get_db),
):
    """Upload a document, or a new version of one.

    Read fully into memory: the size cap is 8 MB and main.py already rejects
    bodies over 10 MB, so streaming would add complexity for no benefit here.
    """
    if doc_type not in DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"doc_type must be one of: {', '.join(DOC_TYPES)}")

    subject_oid = oid(user_id, "user_id")

    # Uploading a document ABOUT someone is an HR action, not self-service —
    # otherwise anyone could file a forged "offer_letter" onto their own record.
    if not has_permission(current_user, "document.read_all") and subject_oid != current_user["_id"]:
        await audit_denied(
            db, "document.upload", current_user, "document",
            request=request, reason="not permitted to upload for another user",
        )
        raise HTTPException(status_code=403, detail="You cannot upload documents for another employee.")

    contents = await file.read()
    max_bytes = settings.MAX_DOCUMENT_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File must be smaller than {settings.MAX_DOCUMENT_SIZE_MB} MB.",
        )

    ok, mime, error = detect_mime(contents, file.content_type or "")
    if not ok:
        await audit_denied(
            db, "document.upload", current_user, "document",
            request=request, reason=f"rejected file: {error}",
        )
        raise HTTPException(status_code=400, detail=error)

    filename = safe_filename(file.filename or "document", mime)
    checksum = hashlib.sha256(contents).hexdigest()
    now = utcnow()

    # Versioning: a new upload into an existing group supersedes the current one.
    version = 1
    group_oid = None
    if doc_group_id:
        group_oid = oid(doc_group_id, "doc_group_id")
        previous = await db.hr_documents.find(
            {"doc_group_id": group_oid, "deleted_at": None}
        ).sort("version", -1).limit(1).to_list(1)
        if not previous:
            raise HTTPException(status_code=404, detail="No document group with that id.")
        await _assert_document_access(db, previous[0], current_user, action="add a version to")
        version = previous[0].get("version", 1) + 1

    storage = get_storage()
    # Content-addressed within the subject's folder: two uploads never collide,
    # and the key reveals nothing about the document's contents or title.
    storage_key = f"hr/{subject_oid}/{checksum[:16]}-v{version}{'' if '.' not in filename else '.' + filename.rsplit('.', 1)[1]}"

    try:
        await storage.put(storage_key, contents, mime)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Storage unavailable: {exc}")

    doc = {
        "doc_group_id":    group_oid,          # patched to _id below for v1
        "version":         version,
        "is_current":      True,
        "user_id":         subject_oid,
        "candidate_id":    None,
        "doc_type":        doc_type,
        "title":           (title or filename).strip()[:200],
        "description":     description.strip()[:500],
        "storage_key":     storage_key,
        "file_name":       filename,
        "mime_type":       mime,
        "size_bytes":      len(contents),
        "checksum_sha256": checksum,
        "expires_at":      parse_date(expires_at or None, "expires_at"),
        "reminders_sent":  [],
        "is_confidential": is_confidential,
        # No AV engine on the deployment target; the field exists so a scanner
        # can be dropped in without a migration. Documented, accepted gap (§37).
        "scan_status":     "skipped",
        "uploaded_by":     current_user["_id"],
        "created_at":      now,
        "deleted_at":      None,
    }
    result = await db.hr_documents.insert_one(doc)

    if group_oid is None:
        # v1 is its own group root.
        group_oid = result.inserted_id
        await db.hr_documents.update_one({"_id": result.inserted_id}, {"$set": {"doc_group_id": group_oid}})
    else:
        await db.hr_documents.update_many(
            {"doc_group_id": group_oid, "_id": {"$ne": result.inserted_id}},
            {"$set": {"is_current": False}},
        )

    await audit(
        db, "document.uploaded", current_user, "document", str(result.inserted_id),
        after={"doc_type": doc_type, "title": doc["title"], "file_name": filename,
               "version": version, "size_bytes": len(contents), "is_confidential": is_confidential},
        request=request, subject_user_id=subject_oid,
    )

    return {
        "document_id": str(result.inserted_id),
        "doc_group_id": str(group_oid),
        "version": version,
        "message": f"Document uploaded (v{version}).",
    }


# ── Download ──────────────────────────────────────────────────────────────────

@router.get("/{document_id}/download")
async def download_document(
    document_id: str,
    request: Request,
    current_user=Depends(require_permission("document.download")),
    db=Depends(get_db),
):
    """Issue a short-lived signed URL. Permission-checked and audited."""
    doc = await db.hr_documents.find_one({"_id": oid(document_id, "document_id"), "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        await _assert_document_access(db, doc, current_user, action="download")
    except HTTPException:
        await audit_denied(
            db, "document.downloaded", current_user, "document", document_id,
            request=request, reason="access denied",
        )
        raise

    url = get_storage().signed_url(
        doc["storage_key"],
        expires_in=settings.DOCUMENT_URL_TTL_SECONDS,
        filename=doc.get("file_name", "document"),
    )

    await audit(
        db, "document.downloaded", current_user, "document", document_id,
        request=request, subject_user_id=doc.get("user_id"),
        meta={"doc_type": doc.get("doc_type"), "version": doc.get("version"),
              "file_name": doc.get("file_name")},
    )

    return {"url": url, "expires_in": settings.DOCUMENT_URL_TTL_SECONDS,
            "file_name": doc.get("file_name")}


# ── Version history ───────────────────────────────────────────────────────────

@router.get("/{document_id}/versions")
async def document_versions(
    document_id: str,
    current_user=Depends(require_permission("document.read")),
    db=Depends(get_db),
):
    doc = await db.hr_documents.find_one({"_id": oid(document_id, "document_id")})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await _assert_document_access(db, doc, current_user, action="view versions of")

    versions = await db.hr_documents.find(
        {"doc_group_id": doc.get("doc_group_id", doc["_id"]), "deleted_at": None}
    ).sort("version", -1).to_list(50)

    users = await user_map(db, {d.get("user_id") for d in versions} | {d.get("uploaded_by") for d in versions})
    return {"versions": [_serialize(v, users=users) for v in versions], "total": len(versions)}


# ── Metadata update ───────────────────────────────────────────────────────────

@router.put("/{document_id}")
async def update_document(
    document_id: str,
    body: DocumentUpdate,
    request: Request,
    current_user=Depends(require_permission("document.upload")),
    db=Depends(get_db),
):
    doc_oid = oid(document_id, "document_id")
    doc = await db.hr_documents.find_one({"_id": doc_oid, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await _assert_document_access(db, doc, current_user, action="edit")

    updates = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        updates[key] = parse_date(value, key) if key == "expires_at" else value

    if not updates:
        return {"message": "Nothing to update."}

    # A changed expiry restarts the reminder cycle — otherwise a document
    # extended by a year would never warn again, having already "sent" its 7d.
    if "expires_at" in updates:
        updates["reminders_sent"] = []

    before = {k: doc.get(k) for k in updates}
    await db.hr_documents.update_one({"_id": doc_oid}, {"$set": updates})

    await audit(
        db, "document.updated", current_user, "document", document_id,
        before=before, after=updates, request=request, subject_user_id=doc.get("user_id"),
    )
    return {"message": "Document updated."}


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    request: Request,
    current_user=Depends(require_permission("document.delete")),
    db=Depends(get_db),
):
    """Soft-delete the record and remove the stored object.

    The metadata row is kept so the audit trail still resolves what was deleted;
    the bytes are removed because retaining an ID scan nobody can reach is a
    liability, not a safeguard.
    """
    doc_oid = oid(document_id, "document_id")
    doc = await db.hr_documents.find_one({"_id": doc_oid, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        await get_storage().delete(doc["storage_key"])
    except Exception as exc:
        # Metadata still gets marked deleted; a stranded object is preferable to
        # a record that says "present" for a file that may already be gone.
        import logging
        logging.getLogger(__name__).error("Failed to delete stored object %s: %s", doc["storage_key"], exc)

    await db.hr_documents.update_one({"_id": doc_oid}, {"$set": {"deleted_at": utcnow(), "is_current": False}})

    # Promote the previous version so the group is not left with nothing current.
    remaining = await db.hr_documents.find(
        {"doc_group_id": doc.get("doc_group_id"), "deleted_at": None}
    ).sort("version", -1).limit(1).to_list(1)
    if remaining:
        await db.hr_documents.update_one({"_id": remaining[0]["_id"]}, {"$set": {"is_current": True}})

    await audit(
        db, "document.deleted", current_user, "document", document_id,
        before={"title": doc.get("title"), "doc_type": doc.get("doc_type"),
                "version": doc.get("version"), "file_name": doc.get("file_name")},
        request=request, subject_user_id=doc.get("user_id"),
    )
    return {"message": "Document deleted."}
