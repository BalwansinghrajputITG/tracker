from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from database import get_db
from middleware.auth import get_current_user
from middleware.rbac import require_manager
from utils.team_scope import is_exec, is_pm, get_pm_project_ids, get_pm_member_ids

router = APIRouter()


# ─────────────────────────────────────────────────────────────
#  /analytics/company   (was missing — this is what the UI calls)
# ─────────────────────────────────────────────────────────────
@router.get("/company")
async def company_analytics(
    days: int = Query(30, le=90),
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    # ── PM scope ────────────────────────────────────────────
    proj_filter: dict = {}
    member_filter: dict = {}
    task_filter: dict = {}
    report_member_filter: dict = {}
    if is_pm(current_user) and not is_exec(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        pm_mids = await get_pm_member_ids(db, current_user)
        proj_filter  = {"_id": {"$in": pm_pids}}
        task_filter  = {"project_id": {"$in": pm_pids}}
        report_member_filter = {"user_id": {"$in": pm_mids}}
        member_filter = {"_id": {"$in": pm_mids}}

    # ── project health ──────────────────────────────────────
    total_projects    = await db.projects.count_documents(proj_filter)
    active_projects   = await db.projects.count_documents({**proj_filter, "status": "active"})
    delayed_projects  = await db.projects.count_documents({**proj_filter, "is_delayed": True})
    completed_projects = await db.projects.count_documents({**proj_filter, "status": "completed"})
    on_hold_projects  = await db.projects.count_documents({**proj_filter, "status": "on_hold"})
    completion_rate   = round(completed_projects / total_projects * 100) if total_projects else 0
    delay_rate        = round(delayed_projects / total_projects * 100) if total_projects else 0

    # ── task metrics ────────────────────────────────────────
    total_tasks     = await db.tasks.count_documents(task_filter)
    completed_tasks = await db.tasks.count_documents({**task_filter, "status": "done"})
    overdue_tasks   = await db.tasks.count_documents({**task_filter, "due_date": {"$lt": now}, "status": {"$nin": ["done"]}})
    task_rate       = round(completed_tasks / total_tasks * 100) if total_tasks else 0

    # ── report trend (per day) ──────────────────────────────
    trend_pipeline = [
        {"$match": {"report_date": {"$gte": cutoff}, **report_member_filter}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$report_date"}},
            "count": {"$sum": 1},
            "avg_hours": {"$avg": "$structured_data.hours_worked"},
        }},
        {"$sort": {"_id": 1}},
    ]
    trend_raw = await db.daily_reports.aggregate(trend_pipeline).to_list(days)
    report_trend = [
        {"date": r["_id"], "count": r["count"], "avg_hours": round(r.get("avg_hours") or 0, 1)}
        for r in trend_raw
    ]

    # ── by department ───────────────────────────────────────
    dept_match = {"report_date": {"$gte": cutoff}, **report_member_filter}
    dept_pipeline = [
        {"$match": dept_match},
        {"$lookup": {"from": "users", "localField": "user_id", "foreignField": "_id", "as": "u"}},
        {"$unwind": "$u"},
        {"$group": {"_id": "$u.department", "reports": {"$sum": 1}}},
        {"$sort": {"reports": -1}},
    ]
    dept_raw = await db.daily_reports.aggregate(dept_pipeline).to_list(20)
    by_department = [{"department": d["_id"] or "Unknown", "reports": d["reports"]} for d in dept_raw]

    # ── productivity score ──────────────────────────────────
    emp_query = {"is_active": True, "roles": {"$in": ["employee", "team_lead"]}, **member_filter}
    total_employees = await db.users.count_documents(emp_query)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    reports_today   = await db.daily_reports.count_documents({"report_date": {"$gte": today}, **report_member_filter})
    compliance_rate = round(reports_today / total_employees * 100) if total_employees else 0
    productivity_score = round(
        compliance_rate * 0.35 +
        (100 - min(delay_rate, 100)) * 0.35 +
        task_rate * 0.30
    )

    return {
        "project_health": {
            "total": total_projects,
            "active": active_projects,
            "delayed": delayed_projects,
            "completed": completed_projects,
            "on_hold": on_hold_projects,
            "completion_rate": completion_rate,
            "delay_rate": delay_rate,
        },
        "task_metrics": {
            "total": total_tasks,
            "completed": completed_tasks,
            "overdue": overdue_tasks,
            "completion_rate": task_rate,
        },
        "report_trend": report_trend,
        "productivity_score": productivity_score,
        "by_department": by_department,
    }


# ─────────────────────────────────────────────────────────────
#  /analytics/projects  — list of all projects with metrics
# ─────────────────────────────────────────────────────────────
@router.get("/projects")
async def projects_analytics(
    days: int = Query(30, le=90),
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    proj_scope: dict = {}
    if is_pm(current_user) and not is_exec(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        proj_scope = {"_id": {"$in": pm_pids}}

    projects_cursor = db.projects.find(
        proj_scope,
        {"name": 1, "status": 1, "priority": 1, "progress_percentage": 1,
         "is_delayed": 1, "due_date": 1, "member_ids": 1, "tags": 1, "department": 1}
    ).sort("name", 1)

    result = []
    async for p in projects_cursor:
        pid = p["_id"]
        total_tasks     = await db.tasks.count_documents({"project_id": pid})
        done_tasks      = await db.tasks.count_documents({"project_id": pid, "status": "done"})
        blocked_tasks   = await db.tasks.count_documents({"project_id": pid, "is_blocked": True, "status": {"$ne": "done"}})
        overdue_tasks   = await db.tasks.count_documents({"project_id": pid, "due_date": {"$lt": now}, "status": {"$nin": ["done"]}})
        reports_in_period = await db.daily_reports.count_documents(
            {"project_id": pid, "report_date": {"$gte": cutoff}}
        )
        task_rate = round(done_tasks / total_tasks * 100) if total_tasks else 0
        due = p.get("due_date")
        if due and due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        days_overdue = max(0, (now - due).days) if due and due < now else 0

        result.append({
            "id": str(pid),
            "name": p["name"],
            "status": p.get("status", "active"),
            "priority": p.get("priority", "medium"),
            "progress": p.get("progress_percentage", 0),
            "is_delayed": p.get("is_delayed", False),
            "due_date": due.isoformat() if due else None,
            "days_overdue": days_overdue,
            "member_count": len(p.get("member_ids", [])),
            "tags": p.get("tags", []),
            "total_tasks": total_tasks,
            "done_tasks": done_tasks,
            "blocked_tasks": blocked_tasks,
            "overdue_tasks": overdue_tasks,
            "task_completion_rate": task_rate,
            "reports_in_period": reports_in_period,
        })

    return {"projects": result, "period_days": days}


# ─────────────────────────────────────────────────────────────
#  /analytics/project/{id}  — deep dive for one project
# ─────────────────────────────────────────────────────────────
@router.get("/project/{project_id}")
async def project_analytics(
    project_id: str,
    days: int = Query(30, le=90),
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    from utils.repo import fetch_commits as _fetch_commits, fetch_contributor_stats as _fetch_contributor_stats
    from utils.token_encrypt import decrypt_token as _decrypt_token

    pid = ObjectId(project_id)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    # PM scope guard
    if is_pm(current_user) and not is_exec(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        if pid not in pm_pids:
            raise HTTPException(status_code=403, detail="Access denied: project not in your teams.")

    # Fetch project doc for member_ids, repo_url, repo_token, phase_stages
    project_doc = await db.projects.find_one({"_id": pid}, {"repo_url": 1, "repo_token": 1, "member_ids": 1, "phase_stages": 1})
    project_member_ids = (project_doc or {}).get("member_ids", [])

    # Task distribution by status
    task_pipeline = [
        {"$match": {"project_id": pid}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}, "total_hours": {"$sum": "$logged_hours"}}},
    ]
    task_stats = await db.tasks.aggregate(task_pipeline).to_list(10)

    # Report trend — filter by project members (covers chatbot-submitted reports without project_id)
    report_pipeline = [
        {"$match": {"user_id": {"$in": project_member_ids}, "report_date": {"$gte": cutoff}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$report_date"}},
            "count": {"$sum": 1},
            "avg_hours": {"$avg": "$structured_data.hours_worked"},
        }},
        {"$sort": {"_id": 1}},
    ]
    report_trend = await db.daily_reports.aggregate(report_pipeline).to_list(days)

    # Member workload
    member_pipeline = [
        {"$match": {"project_id": pid, "status": {"$ne": "done"}}},
        {"$unwind": "$assignee_ids"},
        {"$group": {"_id": "$assignee_ids", "open_tasks": {"$sum": 1}, "blocked": {"$sum": {"$cond": ["$is_blocked", 1, 0]}}}},
        {"$sort": {"open_tasks": -1}},
    ]
    member_workload = await db.tasks.aggregate(member_pipeline).to_list(20)
    for m in member_workload:
        user = await db.users.find_one({"_id": m["_id"]}, {"full_name": 1, "department": 1})
        m["user_id"] = str(m.pop("_id"))
        m["name"] = user["full_name"] if user else "Unknown"
        m["department"] = user.get("department", "") if user else ""

    # GitHub commit data
    repo_commits = {}
    repo_url = (project_doc or {}).get("repo_url", "")
    if repo_url:
        try:
            _raw_token = _decrypt_token((project_doc or {}).get("repo_token", ""))
            cr = await _fetch_commits(repo_url, project_token=_raw_token, per_page=20)
            csr = await _fetch_contributor_stats(repo_url, project_token=_raw_token)
            repo_commits = {
                "total": cr.get("total", 0),
                "recent": [
                    {
                        "sha": c["sha"],
                        "author": c["author"],
                        "message": c["message"].split("\n")[0][:80],
                        "date": c["date"],
                    }
                    for c in cr.get("commits", [])[:5]
                ],
                "contributors": csr.get("contributors", [])[:8],
                "error": cr.get("error") or csr.get("error"),
            }
        except Exception as e:
            repo_commits = {"error": str(e)}

    # Phase breakdown
    phase_stages: dict = (project_doc or {}).get("phase_stages") or {}
    phase_breakdown = []
    today = now.date()
    for ph, stages in phase_stages.items():
        total = len(stages)
        done = sum(1 for s in stages if s.get("completed"))
        overdue = sum(
            1 for s in stages
            if not s.get("completed") and s.get("due_date") and
               datetime.fromisoformat(str(s["due_date"])).date() < today
        )
        phase_breakdown.append({
            "phase": ph,
            "total": total,
            "completed": done,
            "overdue": overdue,
            "pct": round((done / total) * 100) if total else 0,
        })

    return {
        "task_distribution": {
            (t["_id"] or "unknown"): {"count": t["count"], "hours": round(t.get("total_hours") or 0, 1)}
            for t in task_stats
        },
        "report_trend": [
            {"date": r["_id"], "count": r["count"], "avg_hours": round(r.get("avg_hours") or 0, 1)}
            for r in report_trend
        ],
        "member_workload": member_workload,
        "commits": repo_commits,
        "project_member_ids": [str(i) for i in (project_doc or {}).get("member_ids", [])],
        "phase_breakdown": phase_breakdown,
    }


# ─────────────────────────────────────────────────────────────
#  /analytics/project/{id}/ai  — AI recommendations for a project
# ─────────────────────────────────────────────────────────────
@router.get("/project/{project_id}/ai")
async def project_ai_suggestions(
    project_id: str,
    days: int = Query(30, le=90),
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    from chatbot.llm_client import chat_completion

    pid = ObjectId(project_id)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    # PM scope guard
    if is_pm(current_user) and not is_exec(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        if pid not in pm_pids:
            raise HTTPException(status_code=403, detail="Access denied: project not in your teams.")

    project = await db.projects.find_one(
        {"_id": pid},
        {"name": 1, "status": 1, "priority": 1, "progress_percentage": 1,
         "is_delayed": 1, "due_date": 1, "member_ids": 1, "tags": 1}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    total_tasks   = await db.tasks.count_documents({"project_id": pid})
    done_tasks    = await db.tasks.count_documents({"project_id": pid, "status": "done"})
    blocked_tasks = await db.tasks.count_documents({"project_id": pid, "is_blocked": True, "status": {"$ne": "done"}})
    overdue_tasks = await db.tasks.count_documents({"project_id": pid, "due_date": {"$lt": now}, "status": {"$nin": ["done"]}})

    due = project.get("due_date")
    if due and due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    days_until_due = (due - now).days if due and due > now else (-(now - due).days if due else None)

    context = {
        "name": project["name"],
        "status": project.get("status"),
        "priority": project.get("priority"),
        "progress": project.get("progress_percentage", 0),
        "is_delayed": project.get("is_delayed", False),
        "days_until_due": days_until_due,
        "member_count": len(project.get("member_ids", [])),
        "total_tasks": total_tasks,
        "done_tasks": done_tasks,
        "blocked_tasks": blocked_tasks,
        "overdue_tasks": overdue_tasks,
        "task_completion_rate": round(done_tasks / total_tasks * 100) if total_tasks else 0,
        "tags": project.get("tags", []),
    }

    prompt = f"""You are a senior project management consultant. Analyze this project and give 4-6 specific, actionable recommendations.

Project Data:
- Name: {context['name']}
- Status: {context['status']} | Priority: {context['priority']}
- Progress: {context['progress']}% | Delayed: {context['is_delayed']}
- Days until due: {context['days_until_due']}
- Team size: {context['member_count']} members
- Tasks: {context['done_tasks']}/{context['total_tasks']} done ({context['task_completion_rate']}%), {context['blocked_tasks']} blocked, {context['overdue_tasks']} overdue

Return ONLY a JSON array of 4-6 strings. Each string is one specific, actionable recommendation (max 120 chars each).
Example: ["Unblock the 3 blocked tasks immediately by scheduling a blocker session", "..."]
No markdown, no explanation, just the JSON array."""

    try:
        raw = await chat_completion([{"role": "user", "content": prompt}], temperature=0.4, max_tokens=600)
        raw = raw.strip()
        if raw.startswith("```"):
            import re
            raw = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
        import json
        suggestions = json.loads(raw)
        if not isinstance(suggestions, list):
            suggestions = [str(suggestions)]
    except Exception as e:
        suggestions = [f"Unable to generate AI suggestions: {e}"]

    return {"suggestions": suggestions, "context": context, "generated_at": now.isoformat()}


# ─────────────────────────────────────────────────────────────
#  /analytics/employees  — all employees with metrics
# ─────────────────────────────────────────────────────────────
@router.get("/employees")
async def employees_analytics(
    days: int = Query(30, le=90),
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    today  = now.replace(hour=0, minute=0, second=0, microsecond=0)

    emp_scope: dict = {"is_active": True, "primary_role": {"$in": ["employee", "team_lead"]}}
    if is_pm(current_user) and not is_exec(current_user):
        pm_mids = await get_pm_member_ids(db, current_user)
        emp_scope["_id"] = {"$in": pm_mids}

    users_cursor = db.users.find(
        emp_scope,
        {"full_name": 1, "email": 1, "department": 1, "roles": 1, "primary_role": 1}
    ).sort("full_name", 1)

    result = []
    async for u in users_cursor:
        uid = u["_id"]

        reports_count = await db.daily_reports.count_documents(
            {"user_id": uid, "report_date": {"$gte": cutoff}}
        )
        submitted_today = await db.daily_reports.count_documents(
            {"user_id": uid, "report_date": {"$gte": today}}
        )
        total_tasks = await db.tasks.count_documents({"assignee_ids": uid})
        done_tasks  = await db.tasks.count_documents({"assignee_ids": uid, "status": "done"})
        open_tasks  = await db.tasks.count_documents({"assignee_ids": uid, "status": {"$nin": ["done"]}})

        # Hours worked in period
        hours_pipeline = [
            {"$match": {"user_id": uid, "report_date": {"$gte": cutoff}}},
            {"$group": {"_id": None, "total": {"$sum": "$structured_data.hours_worked"}, "avg": {"$avg": "$structured_data.hours_worked"}}},
        ]
        hours_res = await db.daily_reports.aggregate(hours_pipeline).to_list(1)
        total_hours = round(hours_res[0]["total"] or 0, 1) if hours_res else 0
        avg_hours   = round(hours_res[0]["avg"]   or 0, 1) if hours_res else 0

        # Last mood
        last_report = await db.daily_reports.find_one(
            {"user_id": uid},
            {"mood": 1},
            sort=[("report_date", -1)],
        )
        last_mood = last_report.get("mood", "") if last_report else ""

        task_rate = round(done_tasks / total_tasks * 100) if total_tasks else 0

        result.append({
            "id": str(uid),
            "name": u["full_name"],
            "email": u["email"],
            "department": u.get("department", ""),
            "role": u.get("primary_role") or (u.get("roles") or ["employee"])[0],
            "reports_in_period": reports_count,
            "submitted_today": bool(submitted_today),
            "total_tasks": total_tasks,
            "done_tasks": done_tasks,
            "open_tasks": open_tasks,
            "task_completion_rate": task_rate,
            "total_hours": total_hours,
            "avg_hours_per_day": avg_hours,
            "last_mood": last_mood,
        })

    return {"employees": result, "period_days": days}


# ─────────────────────────────────────────────────────────────
#  /analytics/employee/{id}  — deep dive for one employee
# ─────────────────────────────────────────────────────────────
@router.get("/employee/{employee_id}")
async def employee_analytics(
    employee_id: str,
    days: int = Query(30, le=90),
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    uid = ObjectId(employee_id)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    user = await db.users.find_one({"_id": uid}, {"password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    # PM scope guard — PM can only view members in their teams
    if is_pm(current_user) and not is_exec(current_user):
        pm_mids = await get_pm_member_ids(db, current_user)
        if uid not in pm_mids:
            raise HTTPException(status_code=403, detail="Access denied: employee not in your teams.")

    # Report trend
    report_trend_pipeline = [
        {"$match": {"user_id": uid, "report_date": {"$gte": cutoff}}},
        {"$sort": {"report_date": 1}},
        {"$project": {
            "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$report_date"}},
            "hours": "$structured_data.hours_worked",
            "mood": "$mood",
            "blockers_count": {"$size": {"$ifNull": ["$structured_data.blockers", []]}},
        }},
    ]
    report_trend = await db.daily_reports.aggregate(report_trend_pipeline).to_list(days)

    # Mood distribution
    mood_pipeline = [
        {"$match": {"user_id": uid, "report_date": {"$gte": cutoff}}},
        {"$group": {"_id": "$mood", "count": {"$sum": 1}}},
    ]
    mood_raw = await db.daily_reports.aggregate(mood_pipeline).to_list(10)
    mood_dist = {m["_id"] or "unknown": m["count"] for m in mood_raw}

    # Task breakdown
    task_pipeline = [
        {"$match": {"assignee_ids": uid}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    task_raw = await db.tasks.aggregate(task_pipeline).to_list(10)
    task_dist = {t["_id"] or "unknown": t["count"] for t in task_raw}

    # Hours summary
    hours_pipeline = [
        {"$match": {"user_id": uid, "report_date": {"$gte": cutoff}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": "$structured_data.hours_worked"},
            "avg": {"$avg": "$structured_data.hours_worked"},
            "max": {"$max": "$structured_data.hours_worked"},
        }},
    ]
    hours_res = await db.daily_reports.aggregate(hours_pipeline).to_list(1)
    hours_summary = {}
    if hours_res:
        hours_summary = {
            "total": round(hours_res[0]["total"] or 0, 1),
            "avg": round(hours_res[0]["avg"] or 0, 1),
            "max": round(hours_res[0]["max"] or 0, 1),
        }

    # Projects involved in
    project_ids_with_tasks = await db.tasks.distinct("project_id", {"assignee_ids": uid})
    projects_involved = []
    for pid in project_ids_with_tasks[:10]:
        proj = await db.projects.find_one({"_id": pid}, {"name": 1, "status": 1, "progress_percentage": 1})
        if proj:
            pt = await db.tasks.count_documents({"assignee_ids": uid, "project_id": pid})
            pd = await db.tasks.count_documents({"assignee_ids": uid, "project_id": pid, "status": "done"})
            projects_involved.append({
                "id": str(pid),
                "name": proj["name"],
                "status": proj.get("status", "active"),
                "progress": proj.get("progress_percentage", 0),
                "tasks_assigned": pt,
                "tasks_done": pd,
            })

    return {
        "employee": {
            "id": str(uid),
            "name": user["full_name"],
            "email": user["email"],
            "department": user.get("department", ""),
            "role": user.get("primary_role") or (user.get("roles") or ["employee"])[0],
        },
        "report_trend": [
            {"date": r["date"], "hours": round(r.get("hours") or 0, 1),
             "mood": r.get("mood", ""), "blockers": r.get("blockers_count", 0)}
            for r in report_trend
        ],
        "mood_distribution": mood_dist,
        "task_distribution": task_dist,
        "hours_summary": hours_summary,
        "projects_involved": projects_involved,
        "period_days": days,
    }


# ─────────────────────────────────────────────────────────────
#  /analytics/company/productivity  (kept for backwards compat)
# ─────────────────────────────────────────────────────────────
@router.get("/company/productivity")
async def company_productivity(
    days: int = Query(30, le=90),
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {"report_date": {"$gte": cutoff}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$report_date"}},
            "submission_count": {"$sum": 1},
            "avg_hours": {"$avg": "$structured_data.hours_worked"},
        }},
        {"$sort": {"_id": 1}},
    ]
    trend = await db.daily_reports.aggregate(pipeline).to_list(days)
    dept_pipeline = [
        {"$match": {"report_date": {"$gte": cutoff}}},
        {"$lookup": {"from": "users", "localField": "user_id", "foreignField": "_id", "as": "user"}},
        {"$unwind": "$user"},
        {"$group": {"_id": "$user.department", "reports": {"$sum": 1}}},
        {"$sort": {"reports": -1}},
    ]
    dept_activity = await db.daily_reports.aggregate(dept_pipeline).to_list(20)
    return {
        "period_days": days,
        "daily_trend": [{"date": t["_id"], "submission_count": t["submission_count"], "avg_hours": t.get("avg_hours", 0)} for t in trend],
        "by_department": [{"department": d["_id"] or "unknown", "reports": d["reports"]} for d in dept_activity],
    }
