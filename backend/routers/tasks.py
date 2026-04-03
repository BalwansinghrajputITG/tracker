from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional

from database import get_db
from middleware.auth import get_current_user
from middleware.rbac import require_manager
from services.notification_service import notify_users
from utils.team_scope import (
    is_exec, is_pm, is_team_lead,
    get_team_project_ids,
    get_pm_project_ids,
    assert_task_access,
)

router = APIRouter()


class TaskCreate(BaseModel):
    project_id: str
    title: str
    description: str = ""
    priority: str = "medium"
    assignee_ids: list[str] = []
    due_date: Optional[datetime] = None
    estimated_hours: float = 0


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_ids: Optional[list[str]] = None
    due_date: Optional[datetime] = None
    is_blocked: Optional[bool] = None
    blocked_reason: Optional[str] = None


class TaskComment(BaseModel):
    text: str


class LogHours(BaseModel):
    hours: float


@router.get("")
async def list_tasks(
    project_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    status: Optional[str] = None,
    is_blocked: Optional[bool] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    query = {}

    if is_exec(current_user):
        pass  # see all tasks (further filtered by project_id / assignee_id below)

    elif is_pm(current_user):
        # PM: only tasks in their own teams' projects
        pm_pids = await get_pm_project_ids(db, current_user)
        query["project_id"] = {"$in": pm_pids}

    elif is_team_lead(current_user):
        # Only tasks belonging to the team lead's projects
        allowed_project_ids = await get_team_project_ids(db, current_user)
        query["project_id"] = {"$in": allowed_project_ids}

    else:
        # Employee: only tasks assigned to them
        query["assignee_ids"] = current_user["_id"]

    # Apply explicit filters (must respect the scope set above)
    if project_id:
        pid = ObjectId(project_id)
        # For scoped roles: make sure the requested project is within their allowed set
        if (is_pm(current_user) or is_team_lead(current_user)) and "project_id" in query:
            allowed = query["project_id"]["$in"]
            if pid not in allowed:
                return {"tasks": [], "total": 0}
            query["project_id"] = pid
        else:
            query["project_id"] = pid

    if assignee_id:
        query["assignee_ids"] = ObjectId(assignee_id)
    if status:
        query["status"] = status
    if is_blocked is not None:
        query["is_blocked"] = is_blocked

    skip = (page - 1) * limit
    cursor = db.tasks.find(query).skip(skip).limit(limit).sort("due_date", 1)
    tasks = []
    async for t in cursor:
        t["id"] = str(t.pop("_id"))
        t["project_id"] = str(t.get("project_id", ""))
        t["reporter_id"] = str(t["reporter_id"]) if t.get("reporter_id") else None
        t["assignee_ids"] = [str(a) for a in t.get("assignee_ids", [])]
        if t.get("due_date"):
            t["due_date"] = t["due_date"].isoformat()
        if t.get("created_at"):
            t["created_at"] = t["created_at"].isoformat()
        if t.get("updated_at"):
            t["updated_at"] = t["updated_at"].isoformat()
        tasks.append(t)

    total = await db.tasks.count_documents(query)
    return {"tasks": tasks, "total": total, "page": page, "limit": limit}


@router.post("", status_code=201)
async def create_task(
    body: TaskCreate,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    # Scope check: PM and team_lead can only create tasks in their own projects
    if is_pm(current_user) and not is_exec(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        if ObjectId(body.project_id) not in pm_pids:
            raise HTTPException(status_code=403, detail="You can only create tasks in your teams' projects.")
    elif is_team_lead(current_user):
        allowed_ids = await get_team_project_ids(db, current_user)
        if ObjectId(body.project_id) not in allowed_ids:
            raise HTTPException(
                status_code=403,
                detail="You can only create tasks in your team's projects."
            )

    assignee_ids = [ObjectId(a) for a in body.assignee_ids]
    doc = {
        "project_id": ObjectId(body.project_id),
        "title": body.title,
        "description": body.description,
        "status": "todo",
        "priority": body.priority,
        "assignee_ids": assignee_ids,
        "reporter_id": current_user["_id"],
        "due_date": body.due_date,
        "estimated_hours": body.estimated_hours,
        "logged_hours": 0,
        "tags": [],
        "attachments": [],
        "comments": [],
        "is_blocked": False,
        "blocked_reason": None,
        "parent_task_id": None,
        "subtask_ids": [],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.tasks.insert_one(doc)
    task_id = str(result.inserted_id)

    if body.assignee_ids:
        await notify_users(
            db=db,
            user_ids=body.assignee_ids,
            notification_type="task_assigned",
            title=f"New task assigned: {body.title}",
            body=f"Priority: {body.priority}",
            reference_id=task_id,
            reference_type="task",
        )

    return {"task_id": task_id}


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await assert_task_access(db, task, current_user)

    task["id"] = str(task.pop("_id"))
    task["project_id"] = str(task.get("project_id", ""))
    task["reporter_id"] = str(task["reporter_id"]) if task.get("reporter_id") else None
    assignee_ids = [str(a) for a in task.get("assignee_ids", [])]
    task["assignee_ids"] = assignee_ids

    # Resolve assignee names
    assignees = []
    if assignee_ids:
        async for u in db.users.find(
            {"_id": {"$in": [ObjectId(a) for a in assignee_ids]}},
            {"full_name": 1, "primary_role": 1, "department": 1},
        ):
            assignees.append({"id": str(u["_id"]), "name": u["full_name"],
                               "role": u.get("primary_role", ""), "department": u.get("department", "")})
    task["assignees"] = assignees

    for f in ("due_date", "created_at", "updated_at"):
        if task.get(f):
            task[f] = task[f].isoformat()
    return task


class StatusUpdate(BaseModel):
    status: str


VALID_STATUSES = {"todo", "in_progress", "review", "done", "blocked"}


@router.patch("/{task_id}/status")
async def update_task_status(
    task_id: str,
    body: StatusUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Any assignee (including employees) can update task status."""
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Valid: {', '.join(VALID_STATUSES)}")

    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await assert_task_access(db, task, current_user)

    await db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$set": {"status": body.status, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Status updated", "status": body.status}


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await assert_task_access(db, task, current_user)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    # Employees may only update status via this endpoint
    is_manager = bool(set(current_user.get("roles", [])).intersection({"ceo", "coo", "pm", "team_lead"}))
    if not is_manager:
        restricted = set(updates.keys()) - {"status"}
        if restricted:
            raise HTTPException(status_code=403, detail="Employees can only update task status.")
        if "status" in updates and updates["status"] not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status.")

    if "assignee_ids" in updates:
        new_ids = [ObjectId(a) for a in updates["assignee_ids"]]
        updates["assignee_ids"] = new_ids
        # Notify newly added assignees
        old_ids = {str(a) for a in task.get("assignee_ids", [])}
        new_assignees = [str(a) for a in new_ids if str(a) not in old_ids]
        if new_assignees:
            await notify_users(
                db=db, user_ids=new_assignees,
                notification_type="task_assigned",
                title=f"Task assigned to you: {task['title']}",
                body=f"Priority: {task.get('priority', 'medium')}",
                reference_id=task_id, reference_type="task",
            )

    updates["updated_at"] = datetime.now(timezone.utc)
    await db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": updates})
    return {"message": "Task updated"}


@router.post("/{task_id}/comments")
async def add_comment(
    task_id: str,
    body: TaskComment,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await assert_task_access(db, task, current_user)

    comment = {
        "id": str(ObjectId()),
        "user_id": str(current_user["_id"]),
        "user_name": current_user["full_name"],
        "text": body.text,
        "created_at": datetime.now(timezone.utc),
    }
    await db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$push": {"comments": comment}},
    )
    return {"comment": comment}


@router.post("/{task_id}/log-hours")
async def log_hours(
    task_id: str,
    body: LogHours,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await assert_task_access(db, task, current_user)

    await db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$inc": {"logged_hours": body.hours}},
    )
    return {"message": f"Logged {body.hours}h"}
