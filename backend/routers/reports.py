from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone, date, timedelta
from typing import Optional

from database import get_db, get_redis
from middleware.auth import get_current_user
from middleware.rbac import require_manager
from services.notification_service import notify_users
from utils.cache import invalidate_on_report_write
from utils.team_scope import (
    is_exec, is_pm, is_team_lead,
    get_team_member_ids,
    get_pm_member_ids,
    assert_report_access,
)

router = APIRouter()


def serialize(doc):
    if doc:
        doc["id"] = str(doc.pop("_id"))
        for k, v in list(doc.items()):
            if isinstance(v, ObjectId):
                doc[k] = str(v)
            elif isinstance(v, datetime):
                doc[k] = v.isoformat()
            elif isinstance(v, list):
                doc[k] = [
                    str(i) if isinstance(i, ObjectId)
                    else i.isoformat() if isinstance(i, datetime)
                    else i
                    for i in v
                ]
    return doc


class TaskCompleted(BaseModel):
    task: str = ""
    # legacy fields (ignored but accepted to avoid 422 if sent)
    description: Optional[str] = None
    hours_spent: Optional[float] = None
    status: str = "completed"


class StructuredData(BaseModel):
    hours_worked: float = 8
    tasks_completed: list[TaskCompleted] = []
    tasks_planned: list[str] = []
    blockers: list[str] = []


class ReportCreate(BaseModel):
    project_id: str
    report_date: date
    mood: str = "good"
    unstructured_notes: str = ""
    structured_data: StructuredData = StructuredData()


class ReportReview(BaseModel):
    review_comment: str


@router.post("", status_code=201)
async def submit_report(
    body: ReportCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    # Check for duplicate submission
    report_date = datetime.combine(body.report_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    existing = await db.daily_reports.find_one({
        "user_id": current_user["_id"],
        "report_date": {"$gte": report_date, "$lt": report_date + timedelta(days=1)},
    })
    if existing:
        raise HTTPException(status_code=400, detail="Report already submitted for this date")

    project = await db.projects.find_one({"_id": ObjectId(body.project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    now = datetime.now(timezone.utc)
    # Consider late if submitted after today (report date is in the past)
    is_late = now.date() > body.report_date

    doc = {
        "user_id": current_user["_id"],
        "project_id": ObjectId(body.project_id),
        "team_ids": current_user.get("team_ids", []),
        "report_date": report_date,
        "structured_data": body.structured_data.model_dump(),
        "unstructured_notes": body.unstructured_notes,
        "mood": body.mood,
        "is_late_submission": is_late,
        "reviewed_by": None,
        "reviewed_at": None,
        "review_comment": None,
        "ai_summary": None,
        "submitted_at": now,
        "created_at": now,
    }

    result = await db.daily_reports.insert_one(doc)
    await invalidate_on_report_write(redis)
    return {"report_id": str(result.inserted_id), "message": "Report submitted"}


@router.get("")
async def list_reports(
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    query = {}

    if is_exec(current_user):
        # CEO / COO: see all reports (optional user_id filter below)
        if user_id:
            query["user_id"] = ObjectId(user_id)

    elif is_pm(current_user):
        # PM: only reports from their team members
        allowed_ids = await get_pm_member_ids(db, current_user)
        if user_id:
            requested = ObjectId(user_id)
            if requested not in allowed_ids:
                return {"reports": [], "total": 0, "page": page, "limit": limit}
            query["user_id"] = requested
        else:
            query["user_id"] = {"$in": allowed_ids}

    elif is_team_lead(current_user):
        # team_lead: only reports from their own team members
        allowed_ids = await get_team_member_ids(db, current_user)
        if user_id:
            requested = ObjectId(user_id)
            if requested not in allowed_ids:
                return {"reports": [], "total": 0, "page": page, "limit": limit}
            query["user_id"] = requested
        else:
            query["user_id"] = {"$in": allowed_ids}

    else:
        # Employee: only their own reports
        query["user_id"] = current_user["_id"]

    if project_id:
        query["project_id"] = ObjectId(project_id)
    if date_from:
        query.setdefault("report_date", {})["$gte"] = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc)
    if date_to:
        query.setdefault("report_date", {})["$lte"] = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc)

    skip = (page - 1) * limit
    cursor = db.daily_reports.find(query).skip(skip).limit(limit).sort("report_date", -1)
    reports = [serialize(r) async for r in cursor]
    total = await db.daily_reports.count_documents(query)

    # Enrich with submitter info (batch lookup)
    uid_strings = list({r["user_id"] for r in reports if r.get("user_id")})
    users_map: dict = {}
    if uid_strings:
        async for u in db.users.find(
            {"_id": {"$in": [ObjectId(uid) for uid in uid_strings]}},
            {"full_name": 1, "department": 1, "primary_role": 1},
        ):
            users_map[str(u["_id"])] = {
                "name": u["full_name"],
                "department": u.get("department", ""),
                "role": u.get("primary_role", ""),
            }
    for r in reports:
        info = users_map.get(r.get("user_id", ""), {})
        r["user_name"]       = info.get("name", "Unknown")
        r["user_department"] = info.get("department", "")
        r["user_role"]       = info.get("role", "")

    # Enrich with project names (batch lookup)
    pid_strings = list({r["project_id"] for r in reports if r.get("project_id")})
    projects_map: dict = {}
    if pid_strings:
        async for p in db.projects.find(
            {"_id": {"$in": [ObjectId(pid) for pid in pid_strings]}},
            {"name": 1},
        ):
            projects_map[str(p["_id"])] = p.get("name", "Unknown Project")
    for r in reports:
        r["project_name"] = projects_map.get(r.get("project_id", ""), "Unknown Project")

    # Enrich reviewed_by with reviewer name (batch lookup)
    reviewer_ids = list({r["reviewed_by"] for r in reports if r.get("reviewed_by")})
    reviewers_map: dict = {}
    if reviewer_ids:
        async for u in db.users.find(
            {"_id": {"$in": [ObjectId(rid) for rid in reviewer_ids]}},
            {"full_name": 1},
        ):
            reviewers_map[str(u["_id"])] = u["full_name"]
    for r in reports:
        r["reviewed_by_name"] = reviewers_map.get(r.get("reviewed_by", ""), None)

    return {"reports": reports, "total": total, "page": page, "limit": limit}


@router.get("/missing")
async def get_missing_reports(
    report_date: Optional[date] = None,
    team_id: Optional[str] = None,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    """Get list of employees who haven't submitted a report for a given date."""
    check_date = report_date or datetime.now(timezone.utc).date()
    dt = datetime.combine(check_date, datetime.min.time()).replace(tzinfo=timezone.utc)

    # Get all active employees — scoped to role
    user_query: dict = {"is_active": True, "roles": {"$in": ["employee", "team_lead"]}}
    if is_exec(current_user):
        if team_id:
            user_query["team_ids"] = ObjectId(team_id)
    elif is_pm(current_user):
        pm_mids = await get_pm_member_ids(db, current_user)
        user_query["_id"] = {"$in": pm_mids}
        if team_id:
            user_query["team_ids"] = ObjectId(team_id)
    elif is_team_lead(current_user):
        allowed_ids = await get_team_member_ids(db, current_user)
        user_query["_id"] = {"$in": allowed_ids}

    all_employees = await db.users.find(
        user_query,
        {"_id": 1, "full_name": 1, "email": 1, "department": 1, "primary_role": 1},
    ).to_list(500)
    employee_ids = [e["_id"] for e in all_employees]

    # Get who submitted today
    submitted = await db.daily_reports.distinct("user_id", {
        "report_date": {"$gte": dt, "$lt": dt + timedelta(days=1)},
        "user_id": {"$in": employee_ids},
    })

    # Last report date per missing employee
    missing_ids = [e["_id"] for e in all_employees if e["_id"] not in submitted]
    last_reports: dict = {}
    if missing_ids:
        cursor = db.daily_reports.find(
            {"user_id": {"$in": missing_ids}},
            {"user_id": 1, "report_date": 1},
        ).sort("report_date", -1)
        async for r in cursor:
            uid = r["user_id"]
            if uid not in last_reports:
                last_reports[uid] = r["report_date"].isoformat() if r.get("report_date") else None

    missing = [
        {
            "user_id": str(e["_id"]),
            "full_name": e["full_name"],
            "email": e["email"],
            "department": e.get("department", ""),
            "primary_role": e.get("primary_role", "employee"),
            "last_report_date": last_reports.get(e["_id"]),
        }
        for e in all_employees
        if e["_id"] not in submitted
    ]
    return {"date": str(check_date), "missing_count": len(missing), "missing": missing}


class ReportUpdate(BaseModel):
    mood: Optional[str] = None
    unstructured_notes: Optional[str] = None
    structured_data: Optional[StructuredData] = None


@router.put("/{report_id}")
async def edit_report(
    report_id: str,
    body: ReportUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    """Owner can edit their own report (only mood, notes, structured_data)."""
    report = await db.daily_reports.find_one({"_id": ObjectId(report_id)})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if str(report.get("user_id", "")) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="You can only edit your own reports")

    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.mood is not None:
        updates["mood"] = body.mood
    if body.unstructured_notes is not None:
        updates["unstructured_notes"] = body.unstructured_notes
    if body.structured_data is not None:
        updates["structured_data"] = body.structured_data.model_dump()

    if len(updates) == 1:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db.daily_reports.update_one({"_id": ObjectId(report_id)}, {"$set": updates})
    await invalidate_on_report_write(redis)
    return {"message": "Report updated"}


@router.put("/{report_id}/review")
async def review_report(
    report_id: str,
    body: ReportReview,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    report = await db.daily_reports.find_one({"_id": ObjectId(report_id)})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    await assert_report_access(db, report, current_user)

    result = await db.daily_reports.update_one(
        {"_id": ObjectId(report_id)},
        {"$set": {
            "reviewed_by": current_user["_id"],
            "reviewed_at": datetime.now(timezone.utc),
            "review_comment": body.review_comment,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")  # pragma: no cover
    return {"message": "Report reviewed"}


@router.delete("/{report_id}")
async def delete_report(
    report_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    report = await db.daily_reports.find_one({"_id": ObjectId(report_id)})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Owner can always delete their own report; managers can delete team reports
    if str(report.get("user_id", "")) != str(current_user["_id"]):
        await assert_report_access(db, report, current_user)

    await db.daily_reports.delete_one({"_id": ObjectId(report_id)})
    await invalidate_on_report_write(redis)
    return {"message": "Report deleted"}
