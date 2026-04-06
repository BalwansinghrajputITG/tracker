from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from typing import Optional

from database import get_db
from middleware.auth import get_current_user

router = APIRouter()

_MANAGER_ROLES = {"ceo", "coo", "pm", "team_lead"}


def _serialize(doc: dict) -> dict:
    if doc:
        doc["id"] = str(doc.pop("_id"))
        for k, v in list(doc.items()):
            if isinstance(v, ObjectId):
                doc[k] = str(v)
            elif isinstance(v, datetime):
                doc[k] = v.isoformat()
    return doc


# ─── Shared evaluation helper ─────────────────────────────────────────────────

async def _compute_evaluation(uid: ObjectId, db) -> dict:
    """
    Compute work-hours + tool-coverage + task + compliance signals
    and return a scored evaluation mode for the given user.
    """
    now        = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start  = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Tasks ──────────────────────────────────────────────────────────────────
    total_tasks   = await db.tasks.count_documents({"assignee_ids": uid})
    done_tasks    = await db.tasks.count_documents({"assignee_ids": uid, "status": "done"})
    in_prog       = await db.tasks.count_documents({"assignee_ids": uid, "status": "in_progress"})
    blocked       = await db.tasks.count_documents({"assignee_ids": uid, "is_blocked": True, "status": {"$ne": "done"}})
    overdue       = await db.tasks.count_documents({"assignee_ids": uid, "due_date": {"$lt": now}, "status": {"$nin": ["done"]}})
    done_month    = await db.tasks.count_documents({"assignee_ids": uid, "status": "done", "updated_at": {"$gte": month_start}})

    hours_res = await db.tasks.aggregate([
        {"$match": {"assignee_ids": uid}},
        {"$group": {"_id": None, "total": {"$sum": "$logged_hours"}}},
    ]).to_list(1)
    total_logged_hours = round(hours_res[0]["total"] if hours_res else 0, 1)
    completion_rate    = round(done_tasks / total_tasks * 100) if total_tasks else 0

    # ── Reports ────────────────────────────────────────────────────────────────
    total_reports  = await db.daily_reports.count_documents({"user_id": uid})
    reports_month  = await db.daily_reports.count_documents({"user_id": uid, "report_date": {"$gte": month_start}})
    reports_week   = await db.daily_reports.count_documents({"user_id": uid, "report_date": {"$gte": week_start}})

    avg_h_res = await db.daily_reports.aggregate([
        {"$match": {"user_id": uid, "report_date": {"$gte": month_start}}},
        {"$group": {"_id": None, "avg": {"$avg": "$structured_data.hours_worked"}}},
    ]).to_list(1)
    avg_hours_day = round(avg_h_res[0]["avg"] or 0, 1) if avg_h_res else 0.0

    # ── Mood trend ─────────────────────────────────────────────────────────────
    mood_docs = await db.daily_reports.find(
        {"user_id": uid, "report_date": {"$gte": month_start}},
        {"mood": 1, "report_date": 1},
    ).sort("report_date", 1).to_list(31)
    mood_trend = [
        {"date": r["report_date"].isoformat() if r.get("report_date") else "", "mood": r.get("mood", "")}
        for r in mood_docs
    ]

    # ── Recent completed ───────────────────────────────────────────────────────
    recent_cursor = db.tasks.find(
        {"assignee_ids": uid, "status": "done"},
        {"title": 1, "updated_at": 1, "priority": 1},
    ).sort("updated_at", -1).limit(8)
    recent_tasks = []
    async for t in recent_cursor:
        recent_tasks.append({
            "id": str(t["_id"]),
            "title": t["title"],
            "priority": t.get("priority", "medium"),
            "updated_at": t["updated_at"].isoformat() if t.get("updated_at") else "",
        })

    # ── Tracking tools (personal links) ───────────────────────────────────────
    tool_counts: dict = {"docs": 0, "sheets": 0, "github": 0, "other": 0}
    async for lnk in db.personal_links.find({"user_id": uid}, {"link_type": 1}):
        lt = lnk.get("link_type", "other")
        tool_counts[lt] = tool_counts.get(lt, 0) + 1

    # Weighted evaluation score (0 – 100)
    # 25 pts  — average daily hours (expected 8 h/day)
    hours_score      = min(25, round((avg_hours_day / 8.0) * 25)) if avg_hours_day else 0
    # 25 pts  — task completion rate
    task_score       = min(25, round(completion_rate * 0.25))
    # 20 pts  — report compliance this week (expected 5 reports)
    compliance_score = min(20, round((reports_week / 5.0) * 20))
    # 15 pts  — tracking tools coverage (docs + sheets + github, 5 pts each, max 3)
    tracking_types   = sum(1 for lt in ("docs", "sheets", "github") if tool_counts.get(lt, 0) > 0)
    tool_score       = min(15, tracking_types * 5)
    # 15 pts  — reliability: starts at 15, loses 3 per overdue task
    reliability_score = max(0, 15 - overdue * 3)

    eval_score = hours_score + task_score + compliance_score + tool_score + reliability_score

    if eval_score >= 80:
        eval_label, eval_color = "Excellent",        "green"
    elif eval_score >= 60:
        eval_label, eval_color = "On Track",         "blue"
    elif eval_score >= 40:
        eval_label, eval_color = "Needs Attention",  "amber"
    else:
        eval_label, eval_color = "At Risk",          "red"

    return {
        "tasks": {
            "total": total_tasks, "done": done_tasks, "in_progress": in_prog,
            "blocked": blocked, "overdue": overdue, "done_this_month": done_month,
            "completion_rate": completion_rate, "total_hours": total_logged_hours,
        },
        "reports": {
            "total": total_reports, "this_month": reports_month,
            "this_week": reports_week, "avg_hours_day": avg_hours_day,
        },
        "tracking_tools": {
            "docs":   tool_counts["docs"],
            "sheets": tool_counts["sheets"],
            "github": tool_counts["github"],
            "other":  tool_counts["other"],
            "total_tracking": tracking_types,   # docs + sheets + github (not other)
        },
        "evaluation": {
            "score": eval_score,
            "label": eval_label,
            "color": eval_color,
            "breakdown": {
                "hours":       hours_score,
                "tasks":       task_score,
                "compliance":  compliance_score,
                "tools":       tool_score,
                "reliability": reliability_score,
            },
        },
        "mood_trend":       mood_trend,
        "recent_completed": recent_tasks,
    }


# ─── Personal Links ───────────────────────────────────────────────────────────

class LinkCreate(BaseModel):
    title: str
    url: str
    link_type: str = "docs"   # docs | sheets | other


class LinkUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    link_type: Optional[str] = None


@router.get("/links")
async def list_links(current_user=Depends(get_current_user), db=Depends(get_db)):
    cursor = db.personal_links.find({"user_id": current_user["_id"]}).sort("created_at", -1)
    return {"links": [_serialize(l) async for l in cursor]}


@router.post("/links", status_code=201)
async def create_link(body: LinkCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
    now = datetime.now(timezone.utc)
    result = await db.personal_links.insert_one({
        "user_id": current_user["_id"],
        "title":     body.title.strip(),
        "url":       body.url.strip(),
        "link_type": body.link_type,
        "created_at": now,
    })
    return {"link_id": str(result.inserted_id)}


@router.put("/links/{link_id}")
async def update_link(link_id: str, body: LinkUpdate, current_user=Depends(get_current_user), db=Depends(get_db)):
    link = await db.personal_links.find_one({"_id": ObjectId(link_id), "user_id": current_user["_id"]})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.personal_links.update_one({"_id": ObjectId(link_id)}, {"$set": updates})
    return {"message": "Link updated"}


@router.delete("/links/{link_id}")
async def delete_link(link_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    result = await db.personal_links.delete_one({"_id": ObjectId(link_id), "user_id": current_user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"message": "Link deleted"}


# ─── Sticky Notes ─────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    content: str
    color: str = "yellow"   # yellow | blue | green | pink | purple


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    color:   Optional[str] = None
    pinned:  Optional[bool] = None


@router.get("/notes")
async def list_notes(current_user=Depends(get_current_user), db=Depends(get_db)):
    cursor = db.personal_notes.find({"user_id": current_user["_id"]}).sort(
        [("pinned", -1), ("updated_at", -1)]
    )
    return {"notes": [_serialize(n) async for n in cursor]}


@router.post("/notes", status_code=201)
async def create_note(body: NoteCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
    now = datetime.now(timezone.utc)
    result = await db.personal_notes.insert_one({
        "user_id":    current_user["_id"],
        "content":    body.content,
        "color":      body.color,
        "pinned":     False,
        "created_at": now,
        "updated_at": now,
    })
    return {"note_id": str(result.inserted_id)}


@router.put("/notes/{note_id}")
async def update_note(note_id: str, body: NoteUpdate, current_user=Depends(get_current_user), db=Depends(get_db)):
    note = await db.personal_notes.find_one({"_id": ObjectId(note_id), "user_id": current_user["_id"]})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.personal_notes.update_one({"_id": ObjectId(note_id)}, {"$set": updates})
    return {"message": "Note updated"}


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    result = await db.personal_notes.delete_one({"_id": ObjectId(note_id), "user_id": current_user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted"}


# ─── Personal Targets ─────────────────────────────────────────────────────────

class TargetCreate(BaseModel):
    title:        str
    description:  str = ""
    target_value: float
    unit:         str = "tasks"   # tasks | hours | reports | % | custom
    deadline:     Optional[datetime] = None


class TargetUpdate(BaseModel):
    title:         Optional[str]      = None
    description:   Optional[str]      = None
    target_value:  Optional[float]    = None
    current_value: Optional[float]    = None
    unit:          Optional[str]      = None
    deadline:      Optional[datetime] = None
    completed:     Optional[bool]     = None


@router.get("/targets")
async def list_targets(current_user=Depends(get_current_user), db=Depends(get_db)):
    cursor = db.personal_targets.find({"user_id": current_user["_id"]}).sort(
        [("completed", 1), ("deadline", 1), ("created_at", -1)]
    )
    return {"targets": [_serialize(t) async for t in cursor]}


@router.post("/targets", status_code=201)
async def create_target(body: TargetCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
    now = datetime.now(timezone.utc)
    result = await db.personal_targets.insert_one({
        "user_id":       current_user["_id"],
        "title":         body.title.strip(),
        "description":   body.description.strip(),
        "target_value":  body.target_value,
        "current_value": 0.0,
        "unit":          body.unit,
        "deadline":      body.deadline,
        "completed":     False,
        "created_at":    now,
        "updated_at":    now,
    })
    return {"target_id": str(result.inserted_id)}


@router.put("/targets/{target_id}")
async def update_target(target_id: str, body: TargetUpdate, current_user=Depends(get_current_user), db=Depends(get_db)):
    target = await db.personal_targets.find_one({"_id": ObjectId(target_id), "user_id": current_user["_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc)
    # Auto-complete when current >= target
    cv = updates.get("current_value", target.get("current_value", 0))
    tv = updates.get("target_value",  target.get("target_value",  1))
    if cv >= tv and "completed" not in updates:
        updates["completed"] = True
    await db.personal_targets.update_one({"_id": ObjectId(target_id)}, {"$set": updates})
    return {"message": "Target updated"}


@router.delete("/targets/{target_id}")
async def delete_target(target_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    result = await db.personal_targets.delete_one({"_id": ObjectId(target_id), "user_id": current_user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Target not found")
    return {"message": "Target deleted"}


# ─── Performance & Evaluation ─────────────────────────────────────────────────

@router.get("/performance")
async def get_performance(current_user=Depends(get_current_user), db=Depends(get_db)):
    """Return full performance + evaluation for the logged-in user."""
    return await _compute_evaluation(current_user["_id"], db)


@router.get("/user-evaluation/{user_id}")
async def get_user_evaluation(
    user_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Managers (CEO/COO/PM/TL) can view any team member's evaluation.
    Returns the same shape as /performance.
    """
    roles = set(current_user.get("roles", []))
    if not roles.intersection(_MANAGER_ROLES):
        raise HTTPException(status_code=403, detail="Access denied")

    target = await db.users.find_one({"_id": ObjectId(user_id), "is_active": True})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    data = await _compute_evaluation(target["_id"], db)
    data["user"] = {
        "id":           str(target["_id"]),
        "full_name":    target["full_name"],
        "primary_role": target.get("primary_role", "employee"),
        "department":   target.get("department", ""),
    }
    return data


@router.get("/team-evaluations")
async def get_team_evaluations(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Returns a summary evaluation row for every direct report,
    scoped by the caller's role (CEO/COO see all, PM/TL see their teams).
    """
    from utils.team_scope import is_exec, is_pm, is_team_lead, get_pm_member_ids, get_team_member_ids

    roles = set(current_user.get("roles", []))
    if not roles.intersection(_MANAGER_ROLES):
        raise HTTPException(status_code=403, detail="Access denied")

    if is_exec(current_user):
        members = await db.users.find(
            {"is_active": True, "roles": {"$in": ["employee", "team_lead", "pm"]}},
            {"full_name": 1, "primary_role": 1, "department": 1},
        ).to_list(500)
    elif is_pm(current_user):
        member_ids = await get_pm_member_ids(db, current_user)
        members = await db.users.find(
            {"_id": {"$in": member_ids}, "is_active": True},
            {"full_name": 1, "primary_role": 1, "department": 1},
        ).to_list(200)
    elif is_team_lead(current_user):
        member_ids = await get_team_member_ids(db, current_user)
        members = await db.users.find(
            {"_id": {"$in": member_ids}, "is_active": True},
            {"full_name": 1, "primary_role": 1, "department": 1},
        ).to_list(100)
    else:
        members = []

    results = []
    for m in members:
        ev = await _compute_evaluation(m["_id"], db)
        results.append({
            "user_id":      str(m["_id"]),
            "full_name":    m["full_name"],
            "primary_role": m.get("primary_role", "employee"),
            "department":   m.get("department", ""),
            "evaluation":   ev["evaluation"],
            "tracking_tools": ev["tracking_tools"],
            "tasks": {
                "done":             ev["tasks"]["done"],
                "overdue":          ev["tasks"]["overdue"],
                "completion_rate":  ev["tasks"]["completion_rate"],
                "total_hours":      ev["tasks"]["total_hours"],
            },
            "reports": {
                "this_week":     ev["reports"]["this_week"],
                "avg_hours_day": ev["reports"]["avg_hours_day"],
            },
        })

    return {"evaluations": results}
