from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone

from database import get_db
from middleware.auth import get_current_user
from middleware.rbac import require_dept_admin
from models.department import (
    DepartmentCreate,
    DepartmentUpdate,
    MemberIds,
    DepartmentResponse,
    DepartmentMemberResponse,
)

router = APIRouter()


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format.")


def _serialize_user(u: dict) -> DepartmentMemberResponse:
    return DepartmentMemberResponse(
        id=str(u["_id"]),
        full_name=u.get("full_name", ""),
        email=u.get("email", ""),
        primary_role=u.get("primary_role", ""),
        department=u.get("department", ""),
    )


def _serialize_dept(d: dict, user_count: int = 0, name_map: dict | None = None) -> DepartmentResponse:
    nm = name_map or {}
    pm_oid = d.get("pm_id")
    tl_oid = d.get("tl_id")
    return DepartmentResponse(
        id=str(d["_id"]),
        name=d["name"],
        description=d.get("description", ""),
        user_count=user_count,
        created_at=d["created_at"].isoformat() if d.get("created_at") else "",
        pm_id=str(pm_oid) if pm_oid else None,
        pm_name=nm.get(str(pm_oid)) if pm_oid else None,
        tl_id=str(tl_oid) if tl_oid else None,
        tl_name=nm.get(str(tl_oid)) if tl_oid else None,
    )


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_departments(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """List all departments with live member count. All authenticated roles."""
    raw = await db.departments.find({}).sort("name", 1).to_list(None)

    # Batch-resolve pm/tl names in one query
    ref_ids = list({
        d[k] for d in raw for k in ("pm_id", "tl_id")
        if d.get(k) and isinstance(d[k], ObjectId)
    })
    name_map: dict = {}
    if ref_ids:
        async for u in db.users.find({"_id": {"$in": ref_ids}}, {"full_name": 1}):
            name_map[str(u["_id"])] = u["full_name"]

    depts = []
    for d in raw:
        count = await db.users.count_documents({"department": d["name"], "is_active": True})
        depts.append(_serialize_dept(d, count, name_map).model_dump())
    return {"departments": depts}


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_department(
    body: DepartmentCreate,
    current_user=Depends(require_dept_admin),
    db=Depends(get_db),
):
    """Create a new department. CEO / COO / Admin only."""
    existing = await db.departments.find_one(
        {"name": {"$regex": f"^{body.name}$", "$options": "i"}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="A department with this name already exists.")

    now = datetime.now(timezone.utc)
    result = await db.departments.insert_one({
        "name":        body.name,
        "description": body.description,
        "pm_id":       _oid(body.pm_id) if body.pm_id else None,
        "tl_id":       _oid(body.tl_id) if body.tl_id else None,
        "created_by":  current_user["_id"],
        "created_at":  now,
        "updated_at":  now,
    })
    return {"id": str(result.inserted_id), "name": body.name, "message": "Department created."}


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/{dept_id}")
async def update_department(
    dept_id: str,
    body: DepartmentUpdate,
    current_user=Depends(require_dept_admin),
    db=Depends(get_db),
):
    """
    Update name and/or description. CEO / COO / Admin only.
    Renaming cascades to all users and teams that carry the old name.
    """
    oid  = _oid(dept_id)
    dept = await db.departments.find_one({"_id": oid})
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    updates: dict = {"updated_at": datetime.now(timezone.utc)}

    if body.name is not None and body.name.lower() != dept["name"].lower():
        collision = await db.departments.find_one({
            "name": {"$regex": f"^{body.name}$", "$options": "i"},
            "_id":  {"$ne": oid},
        })
        if collision:
            raise HTTPException(status_code=400, detail="Another department with this name already exists.")

        old_name = dept["name"]
        updates["name"] = body.name
        now = datetime.now(timezone.utc)
        await db.users.update_many(
            {"department": old_name},
            {"$set": {"department": body.name, "updated_at": now}},
        )
        await db.teams.update_many(
            {"department": old_name},
            {"$set": {"department": body.name, "updated_at": now}},
        )

    if body.description is not None:
        updates["description"] = body.description

    if body.pm_id is not None:
        updates["pm_id"] = _oid(body.pm_id) if body.pm_id else None
    if body.tl_id is not None:
        updates["tl_id"] = _oid(body.tl_id) if body.tl_id else None

    if len(updates) == 1:
        return {"message": "Nothing to update."}

    await db.departments.update_one({"_id": oid}, {"$set": updates})
    return {"message": "Department updated."}


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{dept_id}")
async def delete_department(
    dept_id: str,
    current_user=Depends(require_dept_admin),
    db=Depends(get_db),
):
    """Delete a department. CEO / COO / Admin only."""
    oid  = _oid(dept_id)
    dept = await db.departments.find_one({"_id": oid})
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    await db.departments.delete_one({"_id": oid})
    return {"message": f"Department '{dept['name']}' deleted."}


# ── Member endpoints ──────────────────────────────────────────────────────────

@router.get("/{dept_id}/members")
async def list_members(
    dept_id: str,
    current_user=Depends(require_dept_admin),
    db=Depends(get_db),
):
    """Return all active users whose department matches this department."""
    oid  = _oid(dept_id)
    dept = await db.departments.find_one({"_id": oid})
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    cursor = db.users.find(
        {"department": dept["name"], "is_active": True},
        {"password_hash": 0},
    ).sort("full_name", 1)
    members = [_serialize_user(u).model_dump() async for u in cursor]
    return {"department": dept["name"], "members": members}


@router.post("/{dept_id}/members")
async def add_members(
    dept_id: str,
    body: MemberIds,
    current_user=Depends(require_dept_admin),
    db=Depends(get_db),
):
    """Assign users to this department by setting their department field."""
    oid  = _oid(dept_id)
    dept = await db.departments.find_one({"_id": oid})
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    user_oids = [_oid(uid) for uid in body.user_ids]
    result = await db.users.update_many(
        {"_id": {"$in": user_oids}},
        {"$set": {"department": dept["name"], "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": f"{result.modified_count} user(s) assigned to '{dept['name']}'."}


@router.put("/{dept_id}/members")
async def replace_members(
    dept_id: str,
    body: MemberIds,
    current_user=Depends(require_dept_admin),
    db=Depends(get_db),
):
    """
    Replace the entire member list.
    Users no longer in the new list will have their department field cleared.
    """
    oid      = _oid(dept_id)
    dept     = await db.departments.find_one({"_id": oid})
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    dept_name  = dept["name"]
    now        = datetime.now(timezone.utc)
    new_oids   = [_oid(uid) for uid in body.user_ids]
    new_id_set = {str(o) for o in new_oids}

    old_cursor = db.users.find(
        {"department": dept_name, "is_active": True},
        {"_id": 1},
    )
    to_remove = [u["_id"] async for u in old_cursor if str(u["_id"]) not in new_id_set]

    if to_remove:
        await db.users.update_many(
            {"_id": {"$in": to_remove}},
            {"$set": {"department": "", "updated_at": now}},
        )

    if new_oids:
        await db.users.update_many(
            {"_id": {"$in": new_oids}},
            {"$set": {"department": dept_name, "updated_at": now}},
        )

    return {
        "message": f"Department '{dept_name}' members replaced.",
        "added":   len(new_oids),
        "removed": len(to_remove),
    }


@router.delete("/{dept_id}/members/{user_id}")
async def remove_member(
    dept_id: str,
    user_id: str,
    current_user=Depends(require_dept_admin),
    db=Depends(get_db),
):
    """Remove a user from a department by clearing their department field."""
    oid  = _oid(dept_id)
    dept = await db.departments.find_one({"_id": oid})
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    uid  = _oid(user_id)
    user = await db.users.find_one({"_id": uid}, {"full_name": 1, "department": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.get("department") != dept["name"]:
        raise HTTPException(status_code=400, detail="User is not a member of this department.")

    await db.users.update_one(
        {"_id": uid},
        {"$set": {"department": "", "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": f"'{user.get('full_name', user_id)}' removed from '{dept['name']}'."}
