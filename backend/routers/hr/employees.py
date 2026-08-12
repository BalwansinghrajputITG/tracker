"""
Employee records (hr.md §3) and the organizational chart (§5).

Row scoping follows the house "scope first, narrow second" idiom: build the
allowed set from the caller's permissions/role, then layer filters on top, and
re-check any explicit filter against the scope rather than letting it widen.

No endpoint here returns compensation. Pay is served by routers/hr/compensation.py
behind salary.read, so it cannot leak by being forgotten in a serializer.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from database import get_db
from middleware.auth import get_current_user
from middleware.permissions import has_permission, require_permission
from models.hr import EmployeeCreate, EmployeeUpdate
from routers.hr.common import (
    assert_employee_access, iso, name_map, next_employee_code, oid,
    parse_date, scoped_user_ids, user_map,
)
from services.audit_service import audit
from utils.export import csv_filename, csv_headers, stream_csv

router = APIRouter()

# Fields a user may change on their OWN record via employee.update_self.
# Everything else — designation, manager, employment status — is an HR decision,
# not self-service, or an employee could promote themselves.
_SELF_EDITABLE = {
    "personal_email", "phone", "address", "emergency_contact",
    "date_of_birth", "gender",
}

_DATE_FIELDS = {
    "joining_date", "date_of_birth", "probation_end_date",
    "confirmation_date", "exit_date",
}


# ── Serialization ─────────────────────────────────────────────────────────────

def _serialize(
    emp: dict, *, users: dict, designations: dict, departments: dict, detail: bool = False,
) -> dict:
    """Build the wire shape from an employee doc plus batch-fetched lookups.

    An explicit allow-list, not a deny-list: a field is present because it is
    named here. That is the opposite of routers/users.py serialize(), where a new
    field on the document becomes publicly readable the moment it is added.
    """
    u = users.get(str(emp.get("user_id")), {})
    mgr = users.get(str(emp.get("manager_user_id")), {})

    out = {
        "id":                str(emp["_id"]),
        "user_id":           str(emp["user_id"]),
        "employee_code":     emp.get("employee_code", ""),
        "full_name":         u.get("full_name", ""),
        "email":             u.get("email", ""),
        "avatar_url":        u.get("avatar_url", ""),
        "primary_role":      u.get("primary_role", ""),
        "is_active":         u.get("is_active", True),
        "joining_date":      iso(emp.get("joining_date")),
        "designation_id":    str(emp["designation_id"]) if emp.get("designation_id") else None,
        "designation_title": designations.get(str(emp.get("designation_id")), ""),
        "department_id":     str(emp["department_id"]) if emp.get("department_id") else None,
        "department_name":   departments.get(str(emp.get("department_id")), ""),
        "manager_user_id":   str(emp["manager_user_id"]) if emp.get("manager_user_id") else None,
        "manager_name":      mgr.get("full_name", ""),
        "employment_type":   emp.get("employment_type", "full_time"),
        "employment_status": emp.get("employment_status", "active"),
        "work_mode":         emp.get("work_mode", "onsite"),
        "work_location":     emp.get("work_location", ""),
        "probation_status":  emp.get("probation_status", "not_applicable"),
    }

    if detail:
        out.update({
            "date_of_birth":      iso(emp.get("date_of_birth")),
            "gender":             emp.get("gender", ""),
            "personal_email":     emp.get("personal_email", ""),
            "phone":              emp.get("phone", ""),
            "address":            emp.get("address", ""),
            "emergency_contact":  emp.get("emergency_contact") or {"name": "", "relationship": "", "phone": ""},
            "probation_end_date": iso(emp.get("probation_end_date")),
            "confirmation_date":  iso(emp.get("confirmation_date")),
            "exit_date":          iso(emp.get("exit_date")),
            "exit_reason":        emp.get("exit_reason", ""),
            "created_at":         iso(emp.get("created_at")),
            "updated_at":         iso(emp.get("updated_at")),
        })
    return out


async def _hydrate(db, employees: list[dict], *, detail: bool = False) -> list[dict]:
    """Batch-resolve every lookup for a page of employees — 3 queries, not 3N."""
    if not employees:
        return []
    uids = {e.get("user_id") for e in employees} | {e.get("manager_user_id") for e in employees}
    users = await user_map(db, uids)
    designations = await name_map(db, "hr_designations", {e.get("designation_id") for e in employees}, "title")
    departments = await name_map(db, "departments", {e.get("department_id") for e in employees}, "name")
    return [
        _serialize(e, users=users, designations=designations, departments=departments, detail=detail)
        for e in employees
    ]


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_employees(
    search: str | None = Query(None, description="Matches name, email or employee code"),
    department_id: str | None = Query(None),
    designation_id: str | None = Query(None),
    employment_status: str | None = Query(None),
    employment_type: str | None = Query(None),
    manager_user_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user=Depends(require_permission("employee.read")),
    db=Depends(get_db),
):
    """Employee directory, scoped to what the caller may see."""
    query: dict = {}

    allowed = await scoped_user_ids(db, current_user)
    if allowed is not None:
        query["user_id"] = {"$in": allowed}

    if department_id:
        query["department_id"] = oid(department_id, "department_id")
    if designation_id:
        query["designation_id"] = oid(designation_id, "designation_id")
    if employment_status:
        query["employment_status"] = employment_status
    if employment_type:
        query["employment_type"] = employment_type

    if manager_user_id:
        requested = oid(manager_user_id, "manager_user_id")
        # Re-check against scope rather than replacing it: without this, a team
        # lead could enumerate another manager's reports by passing their id.
        if allowed is not None and requested not in allowed and requested != current_user["_id"]:
            return {"employees": [], "total": 0, "page": page, "limit": limit}
        query["manager_user_id"] = requested

    if search:
        # Name/email live on `users`, so resolve matching user ids first and
        # intersect — a $lookup here would defeat the index on user_id.
        pattern = re.escape(search.strip())
        matching = await db.users.find(
            {"$or": [
                {"full_name": {"$regex": pattern, "$options": "i"}},
                {"email": {"$regex": pattern, "$options": "i"}},
            ]},
            {"_id": 1},
        ).to_list(500)
        matched_ids = [u["_id"] for u in matching]
        if allowed is not None:
            matched_ids = [i for i in matched_ids if i in set(allowed)]
        query = {
            "$and": [
                query,
                {"$or": [
                    {"user_id": {"$in": matched_ids}},
                    {"employee_code": {"$regex": pattern, "$options": "i"}},
                ]},
            ]
        }

    skip = (page - 1) * limit
    cursor = db.hr_employees.find(query).sort("employee_code", 1).skip(skip).limit(limit)
    employees = await cursor.to_list(limit)
    total = await db.hr_employees.count_documents(query)

    return {
        "employees": await _hydrate(db, employees),
        "total": total, "page": page, "limit": limit,
    }


# ── Self ──────────────────────────────────────────────────────────────────────
# Declared before /{employee_id} so the path param does not swallow it.

@router.get("/me")
async def get_my_employee_record(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """The caller's own HR profile. Needs no permission — identity is the authorization."""
    emp = await db.hr_employees.find_one({"user_id": current_user["_id"]})
    if not emp:
        raise HTTPException(status_code=404, detail="You do not have an HR profile yet.")
    hydrated = await _hydrate(db, [emp], detail=True)
    return hydrated[0]


# ── CSV export (§39) ──────────────────────────────────────────────────────────

@router.get("/export.csv")
async def export_employees_csv(
    request: Request,
    department_id: str | None = Query(None),
    employment_status: str | None = Query(None),
    current_user=Depends(require_permission("employee.read")),
    db=Depends(get_db),
):
    """Stream the employee directory as CSV, scoped exactly like the list view.

    No compensation columns: export is a common way for sensitive data to walk
    out of a system, and this endpoint requires only employee.read.
    """
    query: dict = {}
    allowed = await scoped_user_ids(db, current_user)
    if allowed is not None:
        query["user_id"] = {"$in": allowed}
    if department_id:
        query["department_id"] = oid(department_id, "department_id")
    if employment_status:
        query["employment_status"] = employment_status

    employees = await db.hr_employees.find(query).sort("employee_code", 1).to_list(5000)
    rows_data = await _hydrate(db, employees)

    headers = [
        "Employee Code", "Name", "Email", "Designation", "Department",
        "Reports To", "Employment Type", "Work Mode", "Location",
        "Status", "Probation", "Joining Date",
    ]

    async def rows():
        for e in rows_data:
            yield [
                e["employee_code"], e["full_name"], e["email"],
                e["designation_title"], e["department_name"], e["manager_name"],
                e["employment_type"], e["work_mode"], e["work_location"],
                e["employment_status"], e["probation_status"],
                (e["joining_date"] or "")[:10],
            ]

    await audit(
        db, "report.exported", current_user, "employee_export", None,
        request=request,
        meta={"format": "csv", "row_count": len(rows_data),
              "filters": {"department_id": department_id, "employment_status": employment_status}},
    )

    filename = csv_filename("employees")
    return StreamingResponse(
        stream_csv(headers, rows()),
        media_type="text/csv",
        headers=csv_headers(filename),
    )


# ── Org chart (§5) ────────────────────────────────────────────────────────────

@router.get("/org-chart")
async def get_org_chart(
    root_user_id: str | None = Query(None, description="Defaults to the top of the tree"),
    current_user=Depends(require_permission("employee.read")),
    db=Depends(get_db),
):
    """The reporting hierarchy, assembled in one pass.

    Two queries total regardless of depth — the tree is built in Python from a
    flat fetch. $graphLookup would issue a lookup per level and cap out at
    maxDepth; recursion in the handler would be one query per node.

    The tree is built from hr_employees.manager_user_id, NOT users.manager_id —
    the latter is set to the record's creator (routers/users.py:211) and is not
    a reporting line.
    """
    employees = await db.hr_employees.find(
        {"employment_status": {"$nin": ["resigned", "terminated"]}},
        {"user_id": 1, "manager_user_id": 1, "designation_id": 1, "department_id": 1},
    ).to_list(2000)

    if not employees:
        return {"roots": [], "total": 0, "orphaned": 0}

    users = await user_map(db, {e["user_id"] for e in employees})
    designations = await name_map(db, "hr_designations", {e.get("designation_id") for e in employees}, "title")
    departments = await name_map(db, "departments", {e.get("department_id") for e in employees}, "name")

    nodes: dict[str, dict] = {}
    for e in employees:
        uid = str(e["user_id"])
        u = users.get(uid, {})
        nodes[uid] = {
            "user_id":           uid,
            "employee_id":       str(e["_id"]),
            "full_name":         u.get("full_name", "Unknown"),
            "avatar_url":        u.get("avatar_url", ""),
            "designation_title": designations.get(str(e.get("designation_id")), ""),
            "department_name":   departments.get(str(e.get("department_id")), ""),
            "reports":           [],
        }

    roots: list[dict] = []
    seen_child = set()
    for e in employees:
        uid = str(e["user_id"])
        mgr = str(e["manager_user_id"]) if e.get("manager_user_id") else None
        # A manager outside the tree (or a self-reference) makes this a root
        # rather than dropping the subtree on the floor.
        if mgr and mgr in nodes and mgr != uid:
            nodes[mgr]["reports"].append(nodes[uid])
            seen_child.add(uid)
        else:
            roots.append(nodes[uid])

    # Cycle guard: A→B→A would leave both out of `roots` and strand the subtree.
    # Anything unreachable from a root is surfaced instead of silently vanishing.
    reachable = set()

    def walk(node: dict) -> None:
        if node["user_id"] in reachable:
            return
        reachable.add(node["user_id"])
        for child in node["reports"]:
            walk(child)

    for root in roots:
        walk(root)
    orphaned = [n for uid, n in nodes.items() if uid not in reachable]
    for node in orphaned:
        node["reports"] = []          # break the cycle for rendering
        roots.append(node)

    if root_user_id:
        subtree = nodes.get(str(oid(root_user_id, "root_user_id")))
        if not subtree:
            raise HTTPException(status_code=404, detail="No employee record for that user.")
        roots = [subtree]

    for node in nodes.values():
        node["reports"].sort(key=lambda n: n["full_name"])
    roots.sort(key=lambda n: n["full_name"])

    return {"roots": roots, "total": len(nodes), "orphaned": len(orphaned)}


# ── Detail ────────────────────────────────────────────────────────────────────

@router.get("/{employee_id}")
async def get_employee(
    employee_id: str,
    current_user=Depends(require_permission("employee.read")),
    db=Depends(get_db),
):
    emp = await db.hr_employees.find_one({"_id": oid(employee_id, "employee_id")})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    await assert_employee_access(db, emp, current_user)
    hydrated = await _hydrate(db, [emp], detail=True)
    return hydrated[0]


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_employee(
    body: EmployeeCreate,
    request: Request,
    current_user=Depends(require_permission("employee.create")),
    db=Depends(get_db),
):
    """Attach an HR profile to an existing user account."""
    user_oid = oid(body.user_id, "user_id")
    user = await db.users.find_one({"_id": user_oid}, {"full_name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="No user account with that id.")

    if await db.hr_employees.find_one({"user_id": user_oid}):
        raise HTTPException(status_code=400, detail="This user already has an employee record.")

    code = body.employee_code
    if not code:
        # Derive from the current max rather than a count, so deletions cannot
        # cause a collision against the unique index.
        last = await db.hr_employees.find(
            {"employee_code": {"$regex": r"^EMP-\d+$"}}, {"employee_code": 1},
        ).sort("employee_code", -1).limit(1).to_list(1)
        highest = int(last[0]["employee_code"].split("-")[1]) if last else 0
        code = next_employee_code(highest)
    elif await db.hr_employees.find_one({"employee_code": code}):
        raise HTTPException(status_code=400, detail="That employee code is already in use.")

    now = datetime.now(timezone.utc)
    doc = {
        "user_id":            user_oid,
        "employee_code":      code,
        "joining_date":       parse_date(body.joining_date, "joining_date"),
        "date_of_birth":      parse_date(body.date_of_birth, "date_of_birth"),
        "gender":             body.gender,
        "personal_email":     body.personal_email,
        "phone":              body.phone,
        "address":            body.address,
        "emergency_contact":  body.emergency_contact.model_dump(),
        "designation_id":     oid(body.designation_id, "designation_id") if body.designation_id else None,
        "department_id":      oid(body.department_id, "department_id") if body.department_id else None,
        "manager_user_id":    oid(body.manager_user_id, "manager_user_id") if body.manager_user_id else None,
        "employment_type":    body.employment_type,
        "employment_status":  body.employment_status,
        "work_mode":          body.work_mode,
        "work_location":      body.work_location,
        "probation_status":   body.probation_status,
        "probation_end_date": parse_date(body.probation_end_date, "probation_end_date"),
        "confirmation_date":  None,
        "exit_date":          None,
        "exit_reason":        "",
        "external_ids":       {},
        "sync":               {"last_synced_at": None, "status": "local_only", "error": None},
        "created_by":         current_user["_id"],
        "created_at":         now,
        "updated_at":         now,
    }

    if doc["manager_user_id"] == user_oid:
        raise HTTPException(status_code=400, detail="An employee cannot report to themselves.")

    result = await db.hr_employees.insert_one(doc)

    await audit(
        db, "employee.created", current_user, "employee", str(result.inserted_id),
        before=None, after={k: v for k, v in doc.items() if k not in ("created_by", "created_at", "updated_at")},
        request=request, subject_user_id=user_oid,
    )

    return {
        "employee_id": str(result.inserted_id),
        "employee_code": code,
        "message": f"Employee record created for {user.get('full_name', 'user')}.",
    }


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/{employee_id}")
async def update_employee(
    employee_id: str,
    body: EmployeeUpdate,
    request: Request,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Update an employee record.

    Two doors: employee.update for HR, or employee.update_self for one's own
    record limited to _SELF_EDITABLE. The self path is checked against the
    submitted fields, not the caller's intent.
    """
    emp_oid = oid(employee_id, "employee_id")
    emp = await db.hr_employees.find_one({"_id": emp_oid})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    is_self = str(emp["user_id"]) == str(current_user["_id"])
    can_manage = has_permission(current_user, "employee.update")
    can_self = is_self and has_permission(current_user, "employee.update_self")
    if not (can_manage or can_self):
        raise HTTPException(status_code=403, detail="You cannot update this employee record.")

    updates: dict = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if not can_manage and key not in _SELF_EDITABLE:
            raise HTTPException(status_code=403, detail=f"You cannot change '{key}' on your own record.")
        if key in _DATE_FIELDS:
            updates[key] = parse_date(value, key)
        elif key == "emergency_contact":
            updates[key] = value
        else:
            updates[key] = value

    if not updates:
        return {"message": "Nothing to update."}

    if "manager_user_id" in updates and updates["manager_user_id"]:
        mgr = oid(updates["manager_user_id"], "manager_user_id")
        if mgr == emp["user_id"]:
            raise HTTPException(status_code=400, detail="An employee cannot report to themselves.")
        if await _creates_cycle(db, emp["user_id"], mgr):
            raise HTTPException(
                status_code=400,
                detail="That reporting line would create a cycle in the org chart.",
            )
        updates["manager_user_id"] = mgr

    for ref in ("designation_id", "department_id"):
        if ref in updates and updates[ref]:
            updates[ref] = oid(updates[ref], ref)

    before = {k: emp.get(k) for k in updates}
    updates["updated_at"] = datetime.now(timezone.utc)

    await db.hr_employees.update_one({"_id": emp_oid}, {"$set": updates})

    await audit(
        db, "employee.updated", current_user, "employee", employee_id,
        before=before, after=updates, request=request, subject_user_id=emp["user_id"],
    )

    return {"message": "Employee record updated."}


async def _creates_cycle(db, user_id, new_manager_id) -> bool:
    """True if pointing user_id at new_manager_id would close a loop.

    Walks up from the proposed manager looking for user_id. Without this a
    two-person swap makes both unreachable and strands every subtree beneath
    them — the org chart's cycle guard would then surface them as orphans.
    """
    seen = set()
    cursor_id = new_manager_id
    while cursor_id:
        if cursor_id == user_id:
            return True
        if cursor_id in seen:
            return False          # pre-existing cycle; not one we are adding
        seen.add(cursor_id)
        parent = await db.hr_employees.find_one({"user_id": cursor_id}, {"manager_user_id": 1})
        cursor_id = parent.get("manager_user_id") if parent else None
    return False
