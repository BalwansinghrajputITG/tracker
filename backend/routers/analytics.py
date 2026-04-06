from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from database import get_db
from middleware.auth import get_current_user
from middleware.rbac import require_manager
from utils.team_scope import (
    is_exec, is_pm, is_team_lead,
    get_pm_project_ids, get_pm_member_ids,
    get_team_project_ids, get_team_member_ids,
)

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

    # ── Scope filtering ─────────────────────────────────────
    proj_filter: dict = {}
    member_filter: dict = {}
    task_filter: dict = {}
    report_member_filter: dict = {}
    if is_exec(current_user):
        pass  # full access, no filter
    elif is_pm(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        pm_mids = await get_pm_member_ids(db, current_user)
        proj_filter  = {"_id": {"$in": pm_pids}}
        task_filter  = {"project_id": {"$in": pm_pids}}
        report_member_filter = {"user_id": {"$in": pm_mids}}
        member_filter = {"_id": {"$in": pm_mids}}
    elif is_team_lead(current_user):
        tl_pids = await get_team_project_ids(db, current_user)
        tl_mids = await get_team_member_ids(db, current_user)
        proj_filter  = {"_id": {"$in": tl_pids}}
        task_filter  = {"project_id": {"$in": tl_pids}}
        report_member_filter = {"user_id": {"$in": tl_mids}}
        member_filter = {"_id": {"$in": tl_mids}}

    # ── project health ──────────────────────────────────────
    total_projects    = await db.projects.count_documents(proj_filter)
    active_projects   = await db.projects.count_documents({**proj_filter, "status": "active"})
    delayed_projects  = await db.projects.count_documents({
        **proj_filter,
        "$or": [{"due_date": {"$lt": now}}, {"is_delayed": True}],
        "status": "active",
    })
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
    if is_exec(current_user):
        pass  # full access
    elif is_pm(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        proj_scope = {"_id": {"$in": pm_pids}}
    elif is_team_lead(current_user):
        tl_pids = await get_team_project_ids(db, current_user)
        proj_scope = {"_id": {"$in": tl_pids}}

    # Fetch all projects upfront to enable batch queries
    projects_list = await db.projects.find(
        proj_scope,
        {"name": 1, "status": 1, "priority": 1, "progress_percentage": 1,
         "is_delayed": 1, "due_date": 1, "member_ids": 1, "tags": 1, "department": 1}
    ).to_list(500)

    if not projects_list:
        return {"projects": [], "period_days": days}

    all_pids = [p["_id"] for p in projects_list]

    # Batch 1: task counts per project (replaces 4 count_documents per project)
    task_pipeline = [
        {"$match": {"project_id": {"$in": all_pids}}},
        {"$group": {
            "_id":     "$project_id",
            "total":   {"$sum": 1},
            "done":    {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}},
            "blocked": {"$sum": {"$cond": [
                {"$and": [{"$eq": ["$is_blocked", True]}, {"$ne": ["$status", "done"]}]}, 1, 0,
            ]}},
            "overdue": {"$sum": {"$cond": [
                {"$and": [{"$lt": ["$due_date", now]}, {"$ne": ["$status", "done"]}]}, 1, 0,
            ]}},
        }},
    ]
    task_map: dict = {}
    async for r in db.tasks.aggregate(task_pipeline):
        task_map[r["_id"]] = r

    # Batch 2: report counts per project
    report_pipeline = [
        {"$match": {"project_id": {"$in": all_pids}, "report_date": {"$gte": cutoff}}},
        {"$group": {"_id": "$project_id", "count": {"$sum": 1}}},
    ]
    report_map: dict = {}
    async for r in db.daily_reports.aggregate(report_pipeline):
        report_map[r["_id"]] = r["count"]

    result = []
    for p in projects_list:
        pid  = p["_id"]
        ts   = task_map.get(pid, {})
        total_tasks   = ts.get("total", 0)
        done_tasks    = ts.get("done", 0)
        blocked_tasks = ts.get("blocked", 0)
        overdue_tasks = ts.get("overdue", 0)
        reports_in_period = report_map.get(pid, 0)
        task_rate  = round(done_tasks / total_tasks * 100) if total_tasks else 0
        progress   = p.get("progress_percentage", 0)
        is_delayed = p.get("is_delayed", False)

        due = p.get("due_date")
        if due and due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        days_overdue = max(0, (now - due).days) if due and due < now else 0

        # Performance score 0–100
        #   40 pts: task completion rate
        #   30 pts: progress percentage
        #   20 pts: on-time (not delayed)
        #   10 pts: no blocked tasks
        perf_score = max(0, min(100, round(
            task_rate  * 0.40 +
            progress   * 0.30 +
            (0 if is_delayed else 20) +
            (10 if blocked_tasks == 0 else max(0, 10 - blocked_tasks * 2))
        )))

        result.append({
            "id":                  str(pid),
            "name":                p["name"],
            "status":              p.get("status", "active"),
            "priority":            p.get("priority", "medium"),
            "progress":            progress,
            "is_delayed":          is_delayed,
            "due_date":            due.isoformat() if due else None,
            "days_overdue":        days_overdue,
            "member_count":        len(p.get("member_ids", [])),
            "tags":                p.get("tags", []),
            "total_tasks":         total_tasks,
            "done_tasks":          done_tasks,
            "blocked_tasks":       blocked_tasks,
            "overdue_tasks":       overdue_tasks,
            "task_completion_rate": task_rate,
            "reports_in_period":   reports_in_period,
            "performance_score":   perf_score,
        })

    # Sort best-performing projects first
    result.sort(key=lambda x: x["performance_score"], reverse=True)

    # Assign rank and tier after sorting
    for i, r in enumerate(result):
        rank = i + 1
        r["rank"] = rank
        if rank <= 5:
            r["performance_tier"] = "top"
        elif r["performance_score"] < 40 or r["is_delayed"]:
            r["performance_tier"] = "low"
        else:
            r["performance_tier"] = "normal"

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

    # Scope guard
    if is_exec(current_user):
        pass  # full access
    elif is_pm(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        if pid not in pm_pids:
            raise HTTPException(status_code=403, detail="Access denied: project not in your teams.")
    elif is_team_lead(current_user):
        tl_pids = await get_team_project_ids(db, current_user)
        if pid not in tl_pids:
            raise HTTPException(status_code=403, detail="Access denied: project not in your team.")

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
    # Batch-resolve user names — one query for all members instead of one per member
    workload_user_ids = [m["_id"] for m in member_workload]
    workload_user_map: dict = {}
    if workload_user_ids:
        async for u in db.users.find({"_id": {"$in": workload_user_ids}}, {"full_name": 1, "department": 1}):
            workload_user_map[u["_id"]] = u
    for m in member_workload:
        user = workload_user_map.get(m["_id"])
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

    # Single aggregation replaces 4 separate count_documents queries
    counts_pipeline = [
        {"$match": {"project_id": pid}},
        {"$group": {
            "_id": None,
            "total_tasks":   {"$sum": 1},
            "done_tasks":    {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}},
            "blocked_tasks": {"$sum": {"$cond": [
                {"$and": [{"$eq": ["$is_blocked", True]}, {"$ne": ["$status", "done"]}]}, 1, 0
            ]}},
            "overdue_tasks": {"$sum": {"$cond": [
                {"$and": [{"$lt": ["$due_date", now]}, {"$not": {"$in": ["$status", ["done"]]}}]}, 1, 0
            ]}},
        }},
    ]
    counts_result = await db.tasks.aggregate(counts_pipeline).to_list(1)
    counts = counts_result[0] if counts_result else {}
    total_tasks   = counts.get("total_tasks", 0)
    done_tasks    = counts.get("done_tasks", 0)
    blocked_tasks = counts.get("blocked_tasks", 0)
    overdue_tasks = counts.get("overdue_tasks", 0)

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
#  Shared: compute performance mode score
# ─────────────────────────────────────────────────────────────

def _perf_mode(avg_hours: float, task_rate: int, report_compliance: float,
               commits_per_day: float = 0.0, github_repos: int = 0,
               docs_edits_per_day: float = 0.0, tracking_docs: int = 0) -> dict:
    """
    Score 0-100 from five signals:
      25 pts — daily work hours        (avg vs 8h expected)
      20 pts — task completion rate
      15 pts — report compliance        (reports / expected working days)
      20 pts — GitHub commits           (commits_per_day; 2+ commits/day = full score)
               OR github_repos*6        (fallback when no actual commits)
      20 pts — Docs/Sheets activity     (docs_edits_per_day; OR tracking_docs*5 fallback)
    """
    hours_score      = min(25, round((avg_hours / 8.0) * 25)) if avg_hours else 0
    task_score       = min(20, round(task_rate * 0.20))
    compliance_score = min(15, round(report_compliance * 15))

    if commits_per_day > 0:
        commit_score = min(20, round((commits_per_day / 2.0) * 20))
    else:
        commit_score = min(20, github_repos * 6)

    if docs_edits_per_day > 0:
        docs_score = min(20, round((docs_edits_per_day / 5.0) * 20))
    else:
        docs_score = min(20, tracking_docs * 5)

    score = hours_score + task_score + compliance_score + commit_score + docs_score
    if score >= 80:
        label, color = "Excellent",       "green"
    elif score >= 60:
        label, color = "On Track",        "blue"
    elif score >= 40:
        label, color = "Needs Attention", "amber"
    else:
        label, color = "At Risk",         "red"

    return {
        "score": score, "label": label, "color": color,
        "breakdown": {
            "hours":      hours_score,
            "tasks":      task_score,
            "compliance": compliance_score,
            "commits":    commit_score,
            "docs":       docs_score,
        },
    }


# ─────────────────────────────────────────────────────────────
#  /analytics/employees  — all employees with metrics
# ─────────────────────────────────────────────────────────────
@router.get("/employees")
async def employees_analytics(
    days: int = Query(30, le=90),
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    now    = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    today  = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # expected working days ≈ days * 5/7
    expected_days = max(1, round(days * 5 / 7))

    emp_scope: dict = {"is_active": True, "primary_role": {"$in": ["employee", "team_lead", "pm"]}}
    if is_pm(current_user) and not is_exec(current_user):
        pm_mids = await get_pm_member_ids(db, current_user)
        emp_scope["_id"] = {"$in": pm_mids}

    users_list = await db.users.find(
        emp_scope,
        {"full_name": 1, "email": 1, "department": 1, "roles": 1, "primary_role": 1}
    ).sort("full_name", 1).to_list(500)

    # ── Batch: count projects-with-repo each user belongs to ────────────────
    # Used as a proxy signal for the list view (no live API calls at scale).
    all_uids = [u["_id"] for u in users_list]
    all_uid_strs = {str(u) for u in all_uids}
    project_repo_map: dict = {}   # str(uid) -> int (projects with repo_url)
    async for proj in db.projects.find(
        {"member_ids": {"$in": all_uids}, "repo_url": {"$exists": True, "$ne": ""}},
        {"member_ids": 1},
    ):
        for mid in proj.get("member_ids", []):
            k = str(mid)
            if k in all_uid_strs:
                project_repo_map[k] = project_repo_map.get(k, 0) + 1

    # ── Batch all per-user metrics in 4 queries instead of 8×N ─────────────────

    # Batch 1: report counts + hours per user
    report_stats_pipeline = [
        {"$match": {"user_id": {"$in": all_uids}, "report_date": {"$gte": cutoff}}},
        {"$group": {
            "_id":         "$user_id",
            "count":       {"$sum": 1},
            "total_hours": {"$sum": "$structured_data.hours_worked"},
            "avg_hours":   {"$avg": "$structured_data.hours_worked"},
        }},
    ]
    report_stats_map: dict = {}
    async for r in db.daily_reports.aggregate(report_stats_pipeline):
        report_stats_map[r["_id"]] = r

    # Batch 2: submitted today per user
    today_pipeline = [
        {"$match": {"user_id": {"$in": all_uids}, "report_date": {"$gte": today}}},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
    ]
    today_map: dict = {}
    async for r in db.daily_reports.aggregate(today_pipeline):
        today_map[r["_id"]] = r["count"]

    # Batch 3: last mood per user
    mood_pipeline = [
        {"$match": {"user_id": {"$in": all_uids}}},
        {"$sort": {"report_date": -1}},
        {"$group": {"_id": "$user_id", "last_mood": {"$first": "$mood"}}},
    ]
    mood_map: dict = {}
    async for r in db.daily_reports.aggregate(mood_pipeline):
        mood_map[r["_id"]] = r.get("last_mood", "")

    # Batch 4: task counts per user (total, done, open, overdue)
    task_stats_pipeline = [
        {"$match": {"assignee_ids": {"$in": all_uids}}},
        {"$unwind": "$assignee_ids"},
        {"$match": {"assignee_ids": {"$in": all_uids}}},
        {"$group": {
            "_id":     "$assignee_ids",
            "total":   {"$sum": 1},
            "done":    {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}},
            "open":    {"$sum": {"$cond": [{"$ne": ["$status", "done"]}, 1, 0]}},
            "overdue": {"$sum": {"$cond": [
                {"$and": [
                    {"$lt":  ["$due_date", now]},
                    {"$ne":  ["$status", "done"]},
                ]}, 1, 0,
            ]}},
        }},
    ]
    task_stats_map: dict = {}
    async for r in db.tasks.aggregate(task_stats_pipeline):
        task_stats_map[r["_id"]] = r

    # ── Build result from pre-fetched maps ────────────────────────────────────
    result = []
    for u in users_list:
        uid      = u["_id"]
        uid_str  = str(uid)

        rs           = report_stats_map.get(uid, {})
        reports_count  = rs.get("count", 0)
        total_hours    = round(rs.get("total_hours") or 0, 1)
        avg_hours      = round(rs.get("avg_hours")   or 0, 1)
        submitted_today = today_map.get(uid, 0)
        last_mood       = mood_map.get(uid, "")

        ts          = task_stats_map.get(uid, {})
        total_tasks = ts.get("total", 0)
        done_tasks  = ts.get("done",  0)
        open_tasks  = ts.get("open",  0)
        overdue     = ts.get("overdue", 0)

        task_rate     = round(done_tasks / total_tasks * 100) if total_tasks else 0
        project_repos = project_repo_map.get(uid_str, 0)
        compliance    = min(1.0, reports_count / expected_days)
        mode          = _perf_mode(avg_hours, task_rate, compliance, github_repos=project_repos)

        result.append({
            "id":                   uid_str,
            "name":                 u["full_name"],
            "email":                u["email"],
            "department":           u.get("department", ""),
            "role":                 u.get("primary_role") or (u.get("roles") or ["employee"])[0],
            "reports_in_period":    reports_count,
            "submitted_today":      bool(submitted_today),
            "total_tasks":          total_tasks,
            "done_tasks":           done_tasks,
            "open_tasks":           open_tasks,
            "overdue_tasks":        overdue,
            "task_completion_rate": task_rate,
            "total_hours":          total_hours,
            "avg_hours_per_day":    avg_hours,
            "last_mood":            last_mood,
            "github_repos":         project_repos,
            "performance_mode":     mode,
        })

    # Sort best-performing employees first
    result.sort(key=lambda x: x["performance_mode"]["score"], reverse=True)

    # Assign rank and tier after sorting
    for i, emp in enumerate(result):
        rank = i + 1
        emp["rank"] = rank
        score = emp["performance_mode"]["score"]
        if rank <= 5:
            emp["performance_tier"] = "top"
        elif score < 40:
            emp["performance_tier"] = "low"
        else:
            emp["performance_tier"] = "normal"

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

    # ── GitHub commits from project repositories (filtered by this user's email) ──
    from utils.repo import fetch_commits as _fetch_commits
    from utils.token_encrypt import decrypt_token as _decrypt_token
    user_email = user.get("email", "")
    github_results = []
    total_commits  = 0

    # Fetch all projects the user is a member of that have a repo_url
    projects_with_repo_cursor = db.projects.find(
        {"member_ids": uid, "repo_url": {"$exists": True, "$ne": ""}},
        {"name": 1, "repo_url": 1, "repo_token": 1},
    )
    async for proj in projects_with_repo_cursor:
        repo_url = proj.get("repo_url", "")
        if not repo_url:
            continue
        try:
            raw_token = _decrypt_token(proj.get("repo_token", ""))
            cr = await _fetch_commits(
                repo_url,
                project_token=raw_token,
                per_page=100,
                author_email=user_email,
            )
            commits_count = cr.get("total", 0)
            recent = [
                {
                    "sha":     c["sha"][:7],
                    "author":  c["author"],
                    "message": c["message"].split("\n")[0][:80],
                    "date":    c["date"],
                }
                for c in cr.get("commits", [])[:5]
            ]
            total_commits += commits_count
            github_results.append({
                "repo_url":      repo_url,
                "repo_name":     proj.get("name") or repo_url.rstrip("/").split("/")[-1],
                "project_name":  proj.get("name", ""),
                "total_commits": commits_count,
                "recent":        recent,
                "error":         cr.get("error"),
            })
        except Exception as e:
            github_results.append({
                "repo_url":     repo_url,
                "repo_name":    proj.get("name", repo_url),
                "project_name": proj.get("name", ""),
                "total_commits": 0,
                "recent":        [],
                "error":         str(e),
            })

    # commits per day based on the selected period
    commits_per_day = round(total_commits / days, 2) if days and total_commits else 0

    # ── Tracking docs activity (PM role) ─────────────────────────────────────
    from utils.gdrive import fetch_gdrive_stats as _fetch_gdrive_stats
    user_role = user.get("primary_role") or (user.get("roles") or ["employee"])[0]
    tracking_docs_results = []
    total_doc_edits = 0
    docs_edits_per_day = 0.0

    if user_role in ("pm", "ceo", "coo"):
        # Collect all tracking_docs from projects this PM manages
        pm_projects_cursor = db.projects.find(
            {"pm_id": uid}, {"tracking_docs": 1, "name": 1}
        )
        async for proj in pm_projects_cursor:
            proj_name = proj.get("name", "")
            for d in (proj.get("tracking_docs") or []):
                file_id = d.get("file_id", "")
                api_key = d.get("api_key", "")
                if not file_id or not api_key:
                    tracking_docs_results.append({
                        "project": proj_name,
                        "title": d.get("title", ""),
                        "url": d.get("url", ""),
                        "doc_type": d.get("doc_type", "other"),
                        "version": None,
                        "error": "No API key configured",
                    })
                    continue
                stats = await _fetch_gdrive_stats(file_id, api_key)
                version = stats.get("version")
                if version is not None:
                    total_doc_edits += version
                tracking_docs_results.append({
                    "project":       proj_name,
                    "title":         d.get("title", ""),
                    "url":           d.get("url", ""),
                    "doc_type":      d.get("doc_type", "other"),
                    "version":       version,
                    "modified_time": stats.get("modified_time"),
                    "last_modifier": stats.get("last_modifier"),
                    "error":         stats.get("error"),
                })
        # edits per day (use period days as denominator; version accumulates over doc lifetime so use as proxy)
        docs_edits_per_day = round(total_doc_edits / days, 2) if days and total_doc_edits else 0.0

    # ── Performance mode (with real commit + docs signal) ─────────────────────
    expected_days     = max(1, round(days * 5 / 7))
    done_t            = sum(task_dist.get(s, 0) for s in ["done"])
    all_t             = sum(task_dist.values()) or 1
    task_rate_pct     = round(done_t / all_t * 100)
    report_compliance = min(1.0, len(report_trend) / expected_days)
    avg_h             = hours_summary.get("avg", 0) if hours_summary else 0
    mode              = _perf_mode(
        avg_h, task_rate_pct, report_compliance,
        commits_per_day=commits_per_day,
        docs_edits_per_day=docs_edits_per_day,
        tracking_docs=len(tracking_docs_results),
    )

    return {
        "employee": {
            "id": str(uid),
            "name": user["full_name"],
            "email": user["email"],
            "department": user.get("department", ""),
            "role": user_role,
        },
        "report_trend": [
            {"date": r["date"], "hours": round(r.get("hours") or 0, 1),
             "mood": r.get("mood", ""), "blockers": r.get("blockers_count", 0)}
            for r in report_trend
        ],
        "mood_distribution":  mood_dist,
        "task_distribution":  task_dist,
        "hours_summary":      hours_summary,
        "projects_involved":  projects_involved,
        "github_commits": {
            "repos":            github_results,
            "total_commits":    total_commits,
            "commits_per_day":  commits_per_day,
        },
        "tracking_docs": {
            "docs":             tracking_docs_results,
            "total_edits":      total_doc_edits,
            "edits_per_day":    docs_edits_per_day,
        },
        "performance_mode": mode,
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
