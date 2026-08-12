"""
Audit log reads (hr.md §29).

Read-only by design: there is deliberately no PUT, PATCH or DELETE here, which is
what makes `hr_audit_logs` append-only from the application's side.

Raw document shape (written by services/audit_service.audit):
    {
        "_id":             ObjectId,
        "action":          str,             # "salary.updated"
        "actor_id":        ObjectId,
        "actor_email":     str,
        "actor_roles":     [str],
        "entity_type":     str,             # "compensation"
        "entity_id":       str | None,
        "subject_user_id": ObjectId | None, # whose data was touched
        "changes":         {field: {"old": Any, "new": Any}},
        "changed_fields":  [str],
        "success":         bool,            # False for denied attempts
        "ip":              str | None,
        "user_agent":      str,
        "request_id":      str | None,
        "meta":            dict,
        "created_at":      datetime,
    }
"""

from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from database import get_db
from middleware.permissions import has_permission, require_permission
from services.audit_service import SALARY_ACTIONS

router = APIRouter()


def _oid(value: str, field: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {field} format")


def _serialize(doc: dict, *, reveal_sensitive: bool) -> dict:
    """Flatten an audit row for the wire.

    Salary-bearing rows keep their metadata but have `changes` masked unless the
    caller holds audit.read_sensitive — otherwise the audit log becomes a side
    channel that leaks the very pay figures the permission system withholds.
    """
    changes = doc.get("changes", {})
    if doc.get("action") in SALARY_ACTIONS and not reveal_sensitive:
        changes = {field: {"old": "***", "new": "***"} for field in changes}

    created = doc.get("created_at")
    return {
        "id":              str(doc["_id"]),
        "action":          doc.get("action", ""),
        "actor_id":        str(doc["actor_id"]) if doc.get("actor_id") else None,
        "actor_email":     doc.get("actor_email", ""),
        "actor_roles":     doc.get("actor_roles", []),
        "entity_type":     doc.get("entity_type", ""),
        "entity_id":       doc.get("entity_id"),
        "subject_user_id": str(doc["subject_user_id"]) if doc.get("subject_user_id") else None,
        "changes":         changes,
        "changed_fields":  doc.get("changed_fields", []),
        "success":         doc.get("success", True),
        "ip":              doc.get("ip"),
        "request_id":      doc.get("request_id"),
        "created_at":      created.isoformat() if isinstance(created, datetime) else created,
    }


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_audit_logs(
    action: str | None = Query(None, description="Exact action, e.g. salary.updated"),
    entity_type: str | None = Query(None),
    entity_id: str | None = Query(None),
    actor_id: str | None = Query(None),
    subject_user_id: str | None = Query(None),
    success: bool | None = Query(None, description="False returns denied attempts only"),
    date_from: str | None = Query(None, description="ISO date, inclusive"),
    date_to: str | None = Query(None, description="ISO date, inclusive"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user=Depends(require_permission("audit.read")),
    db=Depends(get_db),
):
    """Audit trail, newest first. Requires audit.read."""
    query: dict = {}
    if action:
        query["action"] = action
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    if actor_id:
        query["actor_id"] = _oid(actor_id, "actor_id")
    if subject_user_id:
        query["subject_user_id"] = _oid(subject_user_id, "subject_user_id")
    if success is not None:
        query["success"] = success

    if date_from or date_to:
        window: dict = {}
        if date_from:
            window["$gte"] = _parse_date(date_from, "date_from")
        if date_to:
            window["$lte"] = _parse_date(date_to, "date_to")
        query["created_at"] = window

    reveal = has_permission(current_user, "audit.read_sensitive")
    skip = (page - 1) * limit
    cursor = db.hr_audit_logs.find(query).sort("created_at", -1).skip(skip).limit(limit)
    logs = [_serialize(doc, reveal_sensitive=reveal) async for doc in cursor]
    total = await db.hr_audit_logs.count_documents(query)

    return {"logs": logs, "total": total, "page": page, "limit": limit}


# ── Actions vocabulary ────────────────────────────────────────────────────────

@router.get("/actions")
async def list_audit_actions(
    current_user=Depends(require_permission("audit.read")),
    db=Depends(get_db),
):
    """Distinct actions present in the log — populates the filter dropdown."""
    actions = await db.hr_audit_logs.distinct("action")
    return {"actions": sorted(actions)}


# ── Temporary Phase-1 probe ───────────────────────────────────────────────────
# Verifies require_permission end-to-end before any HR module exists.
# DELETE once routers/hr/employees.py lands in Phase 2.

@router.get("/_probe")
async def permission_probe(current_user=Depends(require_permission("employee.read"))):
    from middleware.permissions import get_user_permissions
    return {
        "ok": True,
        "email": current_user.get("email"),
        "roles": current_user.get("roles", []),
        "permission_count": len(get_user_permissions(current_user)),
    }


def _parse_date(value: str, field: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field}; expected ISO 8601.")
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
