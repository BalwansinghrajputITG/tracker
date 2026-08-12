"""
Designations — the job-title ladder (hr.md §4).

Departments already exist and are managed by routers/departments.py; this module
deliberately does not duplicate them. Phase 2 extends that collection in place
with head_user_id / budget / cost_center rather than forking a second one.

salary_band is stored on the designation but only serialized for callers holding
salary.read: a narrow band plus a title is close enough to an individual's pay to
deserve the same gate.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from database import get_db
from middleware.permissions import has_permission, require_permission
from models.hr import DesignationCreate, DesignationUpdate
from routers.hr.common import name_map, oid
from services.audit_service import audit

router = APIRouter()


def _serialize(doc: dict, *, departments: dict, counts: dict, reveal_band: bool) -> dict:
    out = {
        "id":            str(doc["_id"]),
        "title":         doc.get("title", ""),
        "level":         doc.get("level", 1),
        "career_level":  doc.get("career_level", "ic"),
        "department_id": str(doc["department_id"]) if doc.get("department_id") else None,
        "department_name": departments.get(str(doc.get("department_id")), ""),
        "reports_to_designation_id": (
            str(doc["reports_to_designation_id"]) if doc.get("reports_to_designation_id") else None
        ),
        "description":   doc.get("description", ""),
        "is_active":     doc.get("is_active", True),
        "employee_count": counts.get(str(doc["_id"]), 0),
    }
    # Omitted entirely rather than nulled — an absent key cannot be mistaken for
    # "no band defined" by a caller who simply isn't allowed to see it.
    if reveal_band and doc.get("salary_band"):
        out["salary_band"] = doc["salary_band"]
    return out


async def _designation_counts(db) -> dict:
    """Headcount per designation in ONE aggregation.

    routers/departments.py:75 does a count_documents per row; with the six extra
    per-row metrics §2 wants, that N+1 becomes the dashboard's bottleneck. Doing
    it as a $group here keeps the same page at two queries.
    """
    pipeline = [
        {"$match": {"designation_id": {"$ne": None}}},
        {"$group": {"_id": "$designation_id", "count": {"$sum": 1}}},
    ]
    return {
        str(row["_id"]): row["count"]
        async for row in db.hr_employees.aggregate(pipeline)
    }


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_designations(
    department_id: str | None = Query(None),
    include_inactive: bool = Query(False),
    search: str | None = Query(None),
    current_user=Depends(require_permission("designation.read")),
    db=Depends(get_db),
):
    """The full designation ladder. Unpaginated — this is reference data."""
    query: dict = {}
    if department_id:
        query["department_id"] = oid(department_id, "department_id")
    if not include_inactive:
        query["is_active"] = {"$ne": False}
    if search:
        query["title"] = {"$regex": re.escape(search.strip()), "$options": "i"}

    docs = await db.hr_designations.find(query).sort([("level", -1), ("title", 1)]).to_list(None)
    departments = await name_map(db, "departments", {d.get("department_id") for d in docs}, "name")
    counts = await _designation_counts(db)
    reveal = has_permission(current_user, "salary.read")

    return {
        "designations": [
            _serialize(d, departments=departments, counts=counts, reveal_band=reveal)
            for d in docs
        ],
        "total": len(docs),
    }


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_designation(
    body: DesignationCreate,
    request: Request,
    current_user=Depends(require_permission("designation.manage")),
    db=Depends(get_db),
):
    dept_oid = oid(body.department_id, "department_id") if body.department_id else None

    # Unique per department, case-insensitively — "Senior Engineer" in Design and
    # in Engineering are different ladders, but not two in the same one.
    clash = await db.hr_designations.find_one({
        "title": {"$regex": f"^{re.escape(body.title)}$", "$options": "i"},
        "department_id": dept_oid,
    })
    if clash:
        raise HTTPException(
            status_code=400,
            detail="A designation with this title already exists in that department.",
        )

    now = datetime.now(timezone.utc)
    doc = {
        "title":         body.title,
        "level":         body.level,
        "career_level":  body.career_level,
        "department_id": dept_oid,
        "salary_band":   body.salary_band.model_dump() if body.salary_band else None,
        "reports_to_designation_id": (
            oid(body.reports_to_designation_id, "reports_to_designation_id")
            if body.reports_to_designation_id else None
        ),
        "description":   body.description,
        "is_active":     True,
        "created_by":    current_user["_id"],
        "created_at":    now,
        "updated_at":    now,
    }
    result = await db.hr_designations.insert_one(doc)

    await audit(
        db, "designation.created", current_user, "designation", str(result.inserted_id),
        after={"title": body.title, "level": body.level, "career_level": body.career_level},
        request=request,
    )

    return {"designation_id": str(result.inserted_id), "title": body.title,
            "message": "Designation created."}


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/{designation_id}")
async def update_designation(
    designation_id: str,
    body: DesignationUpdate,
    request: Request,
    current_user=Depends(require_permission("designation.manage")),
    db=Depends(get_db),
):
    des_oid = oid(designation_id, "designation_id")
    existing = await db.hr_designations.find_one({"_id": des_oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Designation not found")

    updates: dict = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if key == "salary_band":
            updates[key] = value
        elif key in ("department_id", "reports_to_designation_id"):
            updates[key] = oid(value, key) if value else None
        else:
            updates[key] = value

    if not updates:
        return {"message": "Nothing to update."}

    if updates.get("reports_to_designation_id") == des_oid:
        raise HTTPException(status_code=400, detail="A designation cannot report to itself.")

    before = {k: existing.get(k) for k in updates}
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.hr_designations.update_one({"_id": des_oid}, {"$set": updates})

    await audit(
        db, "designation.updated", current_user, "designation", designation_id,
        before=before, after=updates, request=request,
    )

    return {"message": "Designation updated."}


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{designation_id}")
async def delete_designation(
    designation_id: str,
    request: Request,
    current_user=Depends(require_permission("designation.manage")),
    db=Depends(get_db),
):
    """Deactivate a designation, or hard-delete it when nobody holds it.

    Deleting one that is in use would leave employees pointing at a missing
    reference and their designation_title silently blank — the same orphan bug
    that routers/departments.py:165-178 has today.
    """
    des_oid = oid(designation_id, "designation_id")
    existing = await db.hr_designations.find_one({"_id": des_oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Designation not found")

    in_use = await db.hr_employees.count_documents({"designation_id": des_oid})
    if in_use:
        await db.hr_designations.update_one(
            {"_id": des_oid},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
        )
        await audit(
            db, "designation.deactivated", current_user, "designation", designation_id,
            before={"is_active": True}, after={"is_active": False},
            request=request, meta={"employees_holding": in_use},
        )
        return {
            "message": f"Designation deactivated — {in_use} employee(s) still hold it.",
            "deactivated": True,
        }

    await db.hr_designations.delete_one({"_id": des_oid})
    await audit(
        db, "designation.deleted", current_user, "designation", designation_id,
        before={"title": existing.get("title")}, request=request,
    )
    return {"message": "Designation deleted.", "deactivated": False}
