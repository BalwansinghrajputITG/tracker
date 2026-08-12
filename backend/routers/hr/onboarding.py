"""
Onboarding checklists (hr.md §10).

Tasks are created by the offer→employee conversion, not here — this module reads
and completes them. Creating a checklist independently would allow one to exist
for someone who was never actually hired.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from database import get_db
from middleware.auth import get_current_user
from middleware.permissions import has_permission, require_permission
from models.hr.onboarding import ONBOARDING_TEMPLATE, OnboardingTaskCreate, OnboardingTaskUpdate
from routers.hr.common import iso, oid, parse_date, user_map, utcnow
from services.audit_service import audit

router = APIRouter()


def _serialize(task: dict, *, users: dict) -> dict:
    return {
        "id":            str(task["_id"]),
        "user_id":       str(task["user_id"]),
        "employee_name": users.get(str(task.get("user_id")), {}).get("full_name", ""),
        "title":         task.get("title", ""),
        "category":      task.get("category", ""),
        "owner_role":    task.get("owner_role", ""),
        "owner_user_id": str(task["owner_user_id"]) if task.get("owner_user_id") else None,
        "owner_name":    users.get(str(task.get("owner_user_id")), {}).get("full_name", ""),
        "due_date":      iso(task.get("due_date")),
        "order":         task.get("order", 0),
        "status":        task.get("status", "pending"),
        "completed_at":  iso(task.get("completed_at")),
        "completed_by":  users.get(str(task.get("completed_by")), {}).get("full_name", ""),
        "notes":         task.get("notes", ""),
    }


@router.get("")
async def list_onboarding(
    user_id: str | None = Query(None),
    status: str | None = Query(None),
    current_user=Depends(require_permission("onboarding.read")),
    db=Depends(get_db),
):
    """Onboarding tasks, grouped by employee with a progress figure."""
    query: dict = {}
    if user_id:
        query["user_id"] = oid(user_id, "user_id")
    elif not has_permission(current_user, "onboarding.manage"):
        # No manage permission: your own checklist only.
        query["user_id"] = current_user["_id"]
    if status:
        query["status"] = status

    tasks = await db.hr_onboarding_tasks.find(query).sort([("user_id", 1), ("order", 1)]).to_list(2000)
    users = await user_map(db, {t.get("user_id") for t in tasks} | {t.get("owner_user_id") for t in tasks})

    # Grouped rather than flat: a checklist is only meaningful per person, and
    # the progress figure is what anyone actually looks at.
    grouped: dict[str, dict] = {}
    for task in tasks:
        key = str(task["user_id"])
        entry = grouped.setdefault(key, {
            "user_id": key,
            "employee_name": users.get(key, {}).get("full_name", ""),
            "tasks": [], "completed": 0, "total": 0,
        })
        entry["tasks"].append(_serialize(task, users=users))
        entry["total"] += 1
        if task.get("status") in ("completed", "skipped"):
            entry["completed"] += 1

    for entry in grouped.values():
        entry["progress"] = round(100 * entry["completed"] / max(1, entry["total"]))

    return {
        "onboarding": sorted(grouped.values(), key=lambda e: e["progress"]),
        "total_employees": len(grouped),
    }


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    body: OnboardingTaskUpdate,
    request: Request,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Update a task. The assigned owner or anyone with onboarding.manage."""
    task_oid = oid(task_id, "task_id")
    task = await db.hr_onboarding_tasks.find_one({"_id": task_oid})
    if not task:
        raise HTTPException(status_code=404, detail="Onboarding task not found")

    is_owner = task.get("owner_user_id") == current_user["_id"]
    is_subject = task.get("user_id") == current_user["_id"]
    if not (is_owner or is_subject or has_permission(current_user, "onboarding.manage")):
        raise HTTPException(status_code=403, detail="You cannot update this onboarding task.")

    updates: dict = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if key == "due_date":
            updates[key] = parse_date(value, key)
        elif key == "owner_user_id":
            updates[key] = oid(value, key) if value else None
        else:
            updates[key] = value

    if not updates:
        return {"message": "Nothing to update."}

    now = utcnow()
    if updates.get("status") == "completed" and task.get("status") != "completed":
        updates["completed_at"] = now
        updates["completed_by"] = current_user["_id"]
    elif updates.get("status") in ("pending", "in_progress") and task.get("status") == "completed":
        # Reopening clears the completion stamp, so it never claims to have been
        # finished by someone at a time it was later undone.
        updates["completed_at"] = None
        updates["completed_by"] = None

    before = {k: task.get(k) for k in updates}
    updates["updated_at"] = now
    await db.hr_onboarding_tasks.update_one({"_id": task_oid}, {"$set": updates})

    await audit(db, "onboarding.task_updated", current_user, "onboarding_task", task_id,
                before=before, after=updates, request=request, subject_user_id=task.get("user_id"))

    remaining = await db.hr_onboarding_tasks.count_documents(
        {"user_id": task["user_id"], "status": {"$nin": ["completed", "skipped"]}}
    )
    return {"message": "Task updated.", "remaining": remaining,
            "onboarding_complete": remaining == 0}


@router.post("", status_code=201)
async def create_task(
    body: OnboardingTaskCreate,
    request: Request,
    current_user=Depends(require_permission("onboarding.manage")),
    db=Depends(get_db),
):
    """Add an ad-hoc task beyond the template."""
    target = oid(body.user_id, "user_id")
    if not await db.hr_employees.find_one({"user_id": target}):
        raise HTTPException(status_code=404, detail="No employee record for that user.")

    now = utcnow()
    last = await db.hr_onboarding_tasks.find({"user_id": target}).sort("order", -1).limit(1).to_list(1)
    result = await db.hr_onboarding_tasks.insert_one({
        "user_id":       target,
        "candidate_id":  None, "offer_id": None,
        "title":         body.title,
        "category":      body.category,
        "owner_role":    "hr",
        "owner_user_id": oid(body.owner_user_id, "owner_user_id") if body.owner_user_id else None,
        "due_date":      parse_date(body.due_date, "due_date"),
        "order":         (last[0].get("order", 0) + 1) if last else len(ONBOARDING_TEMPLATE),
        "status":        "pending",
        "completed_at":  None, "completed_by": None, "notes": "",
        "created_at":    now, "updated_at": now,
    })
    await audit(db, "onboarding.task_created", current_user, "onboarding_task",
                str(result.inserted_id), after={"title": body.title}, request=request,
                subject_user_id=target)
    return {"task_id": str(result.inserted_id), "message": "Onboarding task added."}
