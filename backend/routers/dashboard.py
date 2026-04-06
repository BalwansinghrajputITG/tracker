from fastapi import APIRouter, Depends
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from database import get_db
from middleware.auth import get_current_user
from middleware.rbac import require_ceo_coo, require_manager
from utils.team_scope import get_pm_project_ids, get_pm_member_ids

router = APIRouter()


@router.get("/ceo")
async def ceo_dashboard(
    current_user=Depends(require_ceo_coo),
    db=Depends(get_db),
):
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)

    # Auto-sync: mark any active project past its due_date as is_delayed=True
    await db.projects.update_many(
        {"due_date": {"$lt": now}, "status": "active", "is_delayed": {"$ne": True}},
        {"$set": {"is_delayed": True}},
    )

    # Delayed / at-risk count: overdue by date OR manually flagged
    at_risk_cutoff = now + timedelta(days=7)
    delayed_filter = {
        "$or": [
            {"due_date": {"$lt": now}},   # already past deadline
            {"is_delayed": True},         # manually flagged via API
        ],
        "status": "active",
    }
    delayed = await db.projects.count_documents(delayed_filter)
    total_projects = await db.projects.count_documents({"status": "active"})

    # Today's report compliance
    all_employees = await db.users.count_documents({"is_active": True, "roles": "employee"})
    reports_today = await db.daily_reports.count_documents({"report_date": {"$gte": today}})
    compliance_rate = round((reports_today / all_employees * 100) if all_employees else 0, 1)

    # Projects by status
    pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    status_agg = await db.projects.aggregate(pipeline).to_list(20)

    # Task stats
    total_tasks = await db.tasks.count_documents({})
    completed_tasks = await db.tasks.count_documents({"status": "done"})
    blocked_tasks = await db.tasks.count_documents({"is_blocked": True, "status": {"$ne": "done"}})
    overdue_tasks = await db.tasks.count_documents({
        "due_date": {"$lt": now},
        "status": {"$nin": ["done"]},
    })

    # Average project progress
    progress_pipeline = [
        {"$match": {"status": "active"}},
        {"$group": {"_id": None, "avg_progress": {"$avg": "$progress_percentage"}}},
    ]
    prog_result = await db.projects.aggregate(progress_pipeline).to_list(1)
    avg_progress = round(prog_result[0]["avg_progress"]) if prog_result else 0

    # Total teams
    total_teams = await db.teams.count_documents({"is_active": True})

    # Team activity with names
    teams_cursor = db.teams.find({"is_active": True}, {"name": 1, "member_ids": 1})
    teams_map = {}
    async for t in teams_cursor:
        teams_map[str(t["_id"])] = {"name": t["name"], "members": len(t.get("member_ids", []))}

    team_pipeline = [
        {"$match": {"report_date": {"$gte": week_ago}, "team_id": {"$ne": None}}},
        {"$group": {"_id": "$team_id", "report_count": {"$sum": 1}}},
        {"$sort": {"report_count": -1}},
        {"$limit": 8},
    ]
    raw_team_activity = await db.daily_reports.aggregate(team_pipeline).to_list(8)
    team_activity = []
    for t in raw_team_activity:
        tid = str(t["_id"]) if t["_id"] else None
        info = teams_map.get(tid, {})
        team_activity.append({
            "team_id": tid,
            "name": info.get("name", "Unknown"),
            "member_count": info.get("members", 0),
            "report_count": t["report_count"],
        })

    # At-risk & delayed list: overdue OR due within 7 days OR manually flagged
    at_risk_list_filter = {
        "$or": [
            {"due_date": {"$lte": at_risk_cutoff}},  # overdue or due soon
            {"is_delayed": True},                     # manually flagged
        ],
        "status": "active",
    }
    delayed_projects_cursor = db.projects.find(
        at_risk_list_filter,
        {"name": 1, "delay_reason": 1, "due_date": 1, "pm_id": 1,
         "progress_percentage": 1, "priority": 1, "is_delayed": 1}
    ).sort("due_date", 1).limit(10)
    delayed_list = []
    async for p in delayed_projects_cursor:
        p["id"] = str(p.pop("_id"))
        p["pm_id"] = str(p["pm_id"]) if p.get("pm_id") else ""
        due = p.get("due_date")
        if due:
            # Motor returns timezone-naive datetimes; normalise before subtraction
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            p["due_date"] = due.isoformat()
            p["days_overdue"] = (now - due).days  # negative = still in future (at risk)
        else:
            p["due_date"] = None
            p["days_overdue"] = 0
        delayed_list.append(p)

    # Department headcount
    dept_pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$department", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    dept_agg = await db.users.aggregate(dept_pipeline).to_list(20)
    dept_headcount = [{"department": d["_id"] or "Unknown", "count": d["count"]} for d in dept_agg]

    # Health score: weighted composite
    delay_rate = (delayed / total_projects * 100) if total_projects else 0
    task_completion_rate = (completed_tasks / total_tasks * 100) if total_tasks else 100
    health_score = round(
        compliance_rate * 0.35 +
        (100 - min(delay_rate, 100)) * 0.35 +
        task_completion_rate * 0.30
    )

    return {
        "summary": {
            "total_active_projects": total_projects,
            "delayed_projects": delayed,
            "total_employees": all_employees,
            "total_teams": total_teams,
            "blocked_tasks": blocked_tasks,
            "overdue_tasks": overdue_tasks,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "avg_project_progress": avg_progress,
            "report_compliance_today": f"{compliance_rate}%",
            "compliance_rate_value": compliance_rate,
            "reports_submitted_today": reports_today,
            "health_score": health_score,
        },
        "projects_by_status": {(s["_id"] or "unknown"): s["count"] for s in status_agg},
        "team_activity_last_7_days": team_activity,
        "delayed_projects": delayed_list,
        "department_headcount": dept_headcount,
    }


@router.get("/coo")
async def coo_dashboard(
    current_user=Depends(require_ceo_coo),
    db=Depends(get_db),
):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    # All teams summary
    teams_cursor = db.teams.find({"is_active": True}, {"name": 1, "member_ids": 1, "project_ids": 1})
    teams = []
    async for t in teams_cursor:
        teams.append({
            "id": str(t.pop("_id")),
            "name": t["name"],
            "member_count": len(t.get("member_ids", [])),
            "project_count": len(t.get("project_ids", [])),
        })

    # Blocked tasks count
    blocked_tasks = await db.tasks.count_documents({"is_blocked": True, "status": {"$ne": "done"}})

    # Department breakdown
    dept_pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$department", "count": {"$sum": 1}}},
    ]
    dept_agg = await db.users.aggregate(dept_pipeline).to_list(20)

    return {
        "teams": teams,
        "operational_metrics": {
            "blocked_tasks": blocked_tasks,
            "total_teams": len(teams),
        },
        "department_headcount": {(d["_id"] or "unknown"): d["count"] for d in dept_agg},
    }


@router.get("/pm")
async def pm_dashboard(
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    # All projects in PM's teams scope
    pm_project_ids = await get_pm_project_ids(db, current_user)
    pm_member_ids  = await get_pm_member_ids(db, current_user)

    projects_cursor = db.projects.find({"_id": {"$in": pm_project_ids}})
    projects = []
    async for p in projects_cursor:
        due = p.get("due_date")
        projects.append({
            "id": str(p.pop("_id")),
            "name": p["name"],
            "status": p["status"],
            "progress_percentage": p.get("progress_percentage", 0),
            "is_delayed": p.get("is_delayed", False),
            "due_date": due.isoformat() if due else None,
        })

    project_ids = pm_project_ids

    # Task completion rates across PM's projects
    task_pipeline = [
        {"$match": {"project_id": {"$in": project_ids}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    task_stats = await db.tasks.aggregate(task_pipeline).to_list(10)

    # Reports submitted today by PM's team members
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    reports_today_count = await db.daily_reports.count_documents({
        "user_id": {"$in": pm_member_ids},
        "report_date": {"$gte": today},
    })

    return {
        "projects": projects,
        "task_stats": {(t["_id"] or "unknown"): t["count"] for t in task_stats},
        "reports_submitted_today": reports_today_count,
    }


@router.get("/team-lead")
async def team_lead_dashboard(
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    team_ids = current_user.get("team_ids", [])
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # Team members
    members_cursor = db.users.find(
        {"team_ids": {"$in": team_ids}, "is_active": True},
        {"full_name": 1, "email": 1, "last_seen": 1}
    )
    members = []
    async for m in members_cursor:
        last_seen = m.get("last_seen")
        members.append({
            "id": str(m.pop("_id")),
            "full_name": m["full_name"],
            "email": m["email"],
            "last_seen": last_seen.isoformat() if last_seen else None,
        })

    member_ids = [ObjectId(m["id"]) for m in members]

    # Today's reports
    reports_today_cursor = db.daily_reports.find({
        "user_id": {"$in": member_ids},
        "report_date": {"$gte": today},
    }, {"user_id": 1, "mood": 1, "structured_data.blockers": 1})

    reports_today = []
    blockers = []
    async for r in reports_today_cursor:
        uid = str(r["user_id"])
        reports_today.append(uid)
        b = r.get("structured_data", {}).get("blockers", [])
        if b:
            blockers.extend(b)

    submitted_ids = set(reports_today)
    missing = [m for m in members if m["id"] not in submitted_ids]

    return {
        "team_members": members,
        "reports_today": {"submitted": len(reports_today), "missing": len(missing), "missing_members": missing},
        "active_blockers": blockers[:20],
    }


@router.get("/employee")
async def employee_dashboard(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    user_id = current_user["_id"]
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # My tasks
    tasks_cursor = db.tasks.find(
        {"assignee_ids": user_id, "status": {"$ne": "done"}},
        {"title": 1, "status": 1, "priority": 1, "due_date": 1, "project_id": 1}
    ).limit(20)
    my_tasks = []
    async for t in tasks_cursor:
        t["id"] = str(t.pop("_id"))
        t["project_id"] = str(t.get("project_id", ""))
        my_tasks.append(t)

    # Today's report submitted?
    report_today = await db.daily_reports.find_one({
        "user_id": user_id,
        "report_date": {"$gte": today},
    })

    # Unread notifications
    unread_notifs = await db.notifications.count_documents({"user_id": user_id, "is_read": False})

    return {
        "tasks": my_tasks,
        "report_submitted_today": report_today is not None,
        "unread_notifications": unread_notifs,
    }
