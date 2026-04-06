from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional
import hashlib
import re
from passlib.context import CryptContext

from database import get_db
from middleware.auth import get_current_user
from middleware.rbac import require_ceo_coo, require_manager, require_user_manager
from utils.team_scope import (
    is_exec, is_pm, is_admin, is_team_lead,
    get_team_member_ids,
    get_pm_member_ids,
    assert_user_access,
)
from utils.token_encrypt import decrypt_token

router = APIRouter()
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Roles each creator level is allowed to assign
_ALLOWED_ROLES: dict[str, list[str]] = {
    "ceo":       ["ceo", "coo", "admin", "pm", "team_lead", "employee"],
    "coo":       ["ceo", "coo", "admin", "pm", "team_lead", "employee"],
    "admin":     ["ceo", "coo", "admin", "pm", "team_lead", "employee"],
    "pm":        ["team_lead", "employee"],
    "team_lead": ["employee"],
}


def _hash_password(password: str) -> str:
    normalized = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return _pwd_context.hash(normalized)


def serialize(doc):
    if doc:
        doc["id"] = str(doc.pop("_id"))
        doc.pop("password_hash", None)
        for k, v in doc.items():
            if isinstance(v, ObjectId):
                doc[k] = str(v)
            elif isinstance(v, list):
                doc[k] = [str(i) if isinstance(i, ObjectId) else i for i in v]
    return doc


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    department: str
    roles: list[str] = ["employee"]
    phone: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    notification_preferences: Optional[dict] = None
    # Admin / exec-only fields
    email: Optional[str] = None
    roles: Optional[list[str]] = None
    primary_role: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    return serialize(dict(current_user))


@router.get("")
async def list_users(
    department: Optional[str] = None,
    role: Optional[str] = None,
    team_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user=Depends(require_user_manager),
    db=Depends(get_db),
):
    query: dict = {"is_active": True}

    if is_exec(current_user) or is_admin(current_user):
        # CEO / COO / Admin: see all users
        pass

    elif is_pm(current_user):
        # PM: only their teams' members
        pm_member_ids = await get_pm_member_ids(db, current_user)
        query["_id"] = {"$in": pm_member_ids}

    elif is_team_lead(current_user):
        # team_lead: only their own team members
        allowed_ids = await get_team_member_ids(db, current_user)
        query["_id"] = {"$in": allowed_ids}

    # Optional narrowing filters (applied on top of the scope above)
    if department:
        query["department"] = department
    if role:
        query["roles"] = role
    if team_id:
        query["team_ids"] = ObjectId(team_id)
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email":     {"$regex": search, "$options": "i"}},
            {"department":{"$regex": search, "$options": "i"}},
        ]

    skip = (page - 1) * limit
    cursor = db.users.find(query, {"password_hash": 0}).skip(skip).limit(limit)
    users = [serialize(u) async for u in cursor]
    total = await db.users.count_documents(query)
    return {"users": users, "total": total}


@router.post("", status_code=201)
async def create_user(
    body: UserCreate,
    current_user=Depends(require_user_manager),
    db=Depends(get_db),
):
    """
    Create a new user account.
    Role hierarchy:
      CEO / COO  → can assign any role
      PM         → can assign team_lead or employee
      Team Lead  → can assign employee only
    """
    caller_role = current_user.get("primary_role", "employee")
    allowed = _ALLOWED_ROLES.get(caller_role, [])
    for r in body.roles:
        if r not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Your role ({caller_role}) cannot assign the '{r}' role.",
            )

    existing = await db.users.find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    now = datetime.now(timezone.utc)
    doc = {
        "email": body.email,
        "password_hash": _hash_password(body.password),
        "full_name": body.full_name,
        "department": body.department,
        "phone": body.phone or "",
        "roles": body.roles,
        "primary_role": body.roles[0] if body.roles else "employee",
        "team_ids": [],
        "project_ids": [],
        "manager_id": current_user["_id"],
        "is_active": True,
        "last_seen": now,
        "notification_preferences": {"email": True, "in_app": True, "daily_digest": False},
        "created_by": current_user["_id"],
        "created_at": now,
        "updated_at": now,
    }
    result = await db.users.insert_one(doc)
    return {"user_id": str(result.inserted_id), "message": "User created successfully."}


@router.get("/for-project")
async def list_users_for_project(
    page: int = Query(1, ge=1),
    limit: int = Query(30, le=500),
    search: Optional[str] = None,
    role: Optional[str] = None,
    roles: Optional[str] = None,
    current_user=Depends(require_user_manager),
    db=Depends(get_db),
):
    """
    Return ALL active users (unscoped) for project/department member assignment.
    Accessible by ceo, coo, admin, pm, team_lead.
    `roles` accepts a comma-separated list, e.g. roles=ceo,coo,pm
    """
    query: dict = {"is_active": True}
    if search:
        escaped = re.escape(search)
        query["$or"] = [
            {"full_name": {"$regex": escaped, "$options": "i"}},
            {"department": {"$regex": escaped, "$options": "i"}},
            {"email": {"$regex": escaped, "$options": "i"}},
        ]
    if role:
        query["primary_role"] = role
    elif roles:
        role_list = [r.strip() for r in roles.split(",") if r.strip()]
        if role_list:
            query["primary_role"] = {"$in": role_list}

    skip = (page - 1) * limit
    cursor = db.users.find(query, {"password_hash": 0}).skip(skip).limit(limit).sort("full_name", 1)
    users = [serialize(u) async for u in cursor]
    total = await db.users.count_documents(query)
    return {"users": users, "total": total, "page": page, "limit": limit}


@router.get("/departments")
async def list_departments(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Return distinct department names from active users."""
    departments = await db.users.distinct("department", {"is_active": True})
    return {"departments": sorted(d for d in departments if d)}


@router.get("/subordinates")
async def get_subordinates(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Return all active users visible to the caller (used for dropdowns)."""
    if is_exec(current_user):
        cursor = db.users.find(
            {"is_active": True},
            {"password_hash": 0},
        ).limit(500)
    elif is_pm(current_user):
        pm_mids = await get_pm_member_ids(db, current_user)
        cursor = db.users.find(
            {"_id": {"$in": pm_mids}, "is_active": True},
            {"password_hash": 0},
        ).limit(500)
    elif is_admin(current_user):
        cursor = db.users.find({"is_active": True}, {"password_hash": 0}).limit(500)
    elif is_team_lead(current_user):
        # Only members of the team lead's own teams
        allowed_ids = await get_team_member_ids(db, current_user)
        cursor = db.users.find(
            {"_id": {"$in": allowed_ids}, "is_active": True},
            {"password_hash": 0},
        )
    else:
        cursor = db.users.find(
            {"team_ids": {"$in": current_user.get("team_ids", [])}, "is_active": True},
            {"password_hash": 0},
        )
    users = [serialize(u) async for u in cursor]
    return {"subordinates": users}


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    target = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    await assert_user_access(db, target, current_user)
    return serialize(target)


@router.get("/{user_id}/profile")
async def get_user_profile(
    user_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Full user profile: basic info, teams, projects, tasks, reports, commits.
    Commits are collected from every project the user is a member of, filtered
    by the user's name/email.
    """
    import asyncio
    from utils.repo import fetch_commits as _fetch_commits

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    target = await db.users.find_one({"_id": oid}, {"password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    await assert_user_access(db, target, current_user)

    def _s(v):
        if isinstance(v, ObjectId):  return str(v)
        if isinstance(v, datetime):  return v.isoformat()
        if isinstance(v, list):
            return [str(i) if isinstance(i, ObjectId) else i for i in v]
        return v

    def ser(doc: dict) -> dict:
        return {k: _s(v) for k, v in doc.items() if k != "password_hash"}

    base = ser(dict(target))

    # ── Manager ──────────────────────────────────────────────────────────────
    manager = None
    if target.get("manager_id"):
        mgr = await db.users.find_one(
            {"_id": target["manager_id"]},
            {"full_name": 1, "primary_role": 1, "department": 1, "email": 1},
        )
        if mgr:
            manager = {
                "id": str(mgr["_id"]),
                "name": mgr["full_name"],
                "role": mgr.get("primary_role", ""),
                "department": mgr.get("department", ""),
                "email": mgr.get("email", ""),
            }
    base["manager"] = manager

    # ── Teams ─────────────────────────────────────────────────────────────────
    team_docs = await db.teams.find(
        {"member_ids": oid},
        {"name": 1, "department": 1, "lead_id": 1, "project_ids": 1},
    ).to_list(50)

    # Batch-fetch team leads in one query
    lead_ids = [t.get("lead_id") for t in team_docs if t.get("lead_id")]
    lead_map: dict = {}
    if lead_ids:
        async for u in db.users.find({"_id": {"$in": lead_ids}}, {"full_name": 1}):
            lead_map[u["_id"]] = u["full_name"]

    teams = []
    for t in team_docs:
        teams.append({
            "id": str(t["_id"]),
            "name": t["name"],
            "department": t.get("department", ""),
            "lead": lead_map.get(t.get("lead_id"), "Unassigned"),
            "project_count": len(t.get("project_ids", [])),
        })
    base["teams"] = teams

    # ── Projects ──────────────────────────────────────────────────────────────
    project_docs = await db.projects.find(
        {"member_ids": oid},
        {"name": 1, "status": 1, "priority": 1, "progress_percentage": 1,
         "due_date": 1, "is_delayed": 1, "pm_id": 1, "repo_url": 1, "repo_token": 1},
    ).sort("due_date", 1).to_list(100)

    # Batch-fetch PMs in one query
    pm_ids = [p.get("pm_id") for p in project_docs if p.get("pm_id")]
    pm_map: dict = {}
    if pm_ids:
        async for u in db.users.find({"_id": {"$in": pm_ids}}, {"full_name": 1}):
            pm_map[u["_id"]] = u["full_name"]

    projects = []
    for p in project_docs:
        projects.append({
            "id": str(p["_id"]),
            "name": p["name"],
            "status": p.get("status", ""),
            "priority": p.get("priority", "medium"),
            "progress": p.get("progress_percentage", 0),
            "due_date": p["due_date"].isoformat() if p.get("due_date") else None,
            "is_delayed": p.get("is_delayed", False),
            "pm": pm_map.get(p.get("pm_id"), "Unassigned"),
            "repo_url": p.get("repo_url", ""),
        })
    base["projects"] = projects

    # ── Tasks ─────────────────────────────────────────────────────────────────
    task_docs = await db.tasks.find(
        {"assignee_ids": oid},
        {"title": 1, "status": 1, "priority": 1, "due_date": 1,
         "is_blocked": 1, "project_id": 1, "logged_hours": 1},
    ).sort("due_date", 1).to_list(100)

    # Batch-fetch task projects in one query
    task_proj_ids = list({t.get("project_id") for t in task_docs if t.get("project_id")})
    task_proj_map: dict = {}
    if task_proj_ids:
        async for p in db.projects.find({"_id": {"$in": task_proj_ids}}, {"name": 1}):
            task_proj_map[p["_id"]] = p["name"]

    tasks = []
    for t in task_docs:
        tasks.append({
            "id": str(t["_id"]),
            "title": t["title"],
            "status": t.get("status", "todo"),
            "priority": t.get("priority", "medium"),
            "due_date": t["due_date"].isoformat() if t.get("due_date") else None,
            "is_blocked": t.get("is_blocked", False),
            "project": task_proj_map.get(t.get("project_id"), "Unknown"),
            "logged_hours": t.get("logged_hours", 0),
        })
    base["tasks"] = tasks

    # Task breakdown by status
    status_counts: dict = {}
    for t in tasks:
        status_counts[t["status"]] = status_counts.get(t["status"], 0) + 1
    base["task_breakdown"] = status_counts

    # ── Daily Reports (last 30 days) ──────────────────────────────────────────
    from datetime import timedelta, timezone as _tz
    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    report_docs = await db.daily_reports.find(
        {"user_id": oid, "report_date": {"$gte": month_ago}},
        {"report_date": 1, "structured_data": 1, "mood": 1,
         "unstructured_notes": 1, "reviewed_at": 1, "review_comment": 1},
    ).sort("report_date", -1).to_list(30)

    reports = []
    total_hours = 0.0
    for r in report_docs:
        sd = r.get("structured_data", {})
        hours = sd.get("hours_worked", 0) or 0
        total_hours += hours
        reports.append({
            "date": r["report_date"].isoformat() if r.get("report_date") else "",
            "hours_worked": hours,
            "tasks_completed": len(sd.get("tasks_completed", [])),
            "blockers": sd.get("blockers", []),
            "mood": r.get("mood", ""),
            "notes": (r.get("unstructured_notes") or "")[:200],
            "reviewed": bool(r.get("reviewed_at")),
        })
    base["reports"] = reports
    base["report_count_30d"] = len(reports)
    base["avg_hours_per_day"] = round(total_hours / max(len(reports), 1), 1)

    # ── GitHub Commits (across all projects with repos) ───────────────────────
    user_name_lower  = (target.get("full_name") or "").lower().strip()
    user_email_lower = (target.get("email") or "").lower().strip()

    repos_checked: set[str] = set()
    all_commits: list[dict] = []
    commit_stats: dict[str, dict] = {}   # repo_url → {commits}

    async def _collect_commits(repo_url: str, repo_token: str):
        if not repo_url or repo_url in repos_checked:
            return
        repos_checked.add(repo_url)

        # Pass the user's email to the API so only their commits are returned.
        # GitHub/GitLab both support an author filter at the API level.
        result = await _fetch_commits(
            repo_url,
            project_token=repo_token,
            per_page=100,
            author_email=user_email_lower,
        )

        for c in result.get("commits", []):
            # Secondary guard: if the API returned unfiltered results (e.g. no
            # email match, empty email), apply a strict local check so we never
            # show commits that clearly belong to someone else.
            commit_author = (c.get("author") or "").lower().strip()
            commit_email  = (c.get("email")  or "").lower().strip()

            # Accept the commit if:
            # 1. email matches exactly, OR
            # 2. full name matches exactly (whole-word, not substring)
            email_match = user_email_lower and commit_email == user_email_lower
            name_match  = (user_name_lower and commit_author == user_name_lower)

            if not (email_match or name_match):
                continue

            all_commits.append({
                "repo": repo_url,
                "sha": c.get("sha", "")[:7],
                "message": c.get("message", ""),
                "date": c.get("date", ""),
                "avatar_url": c.get("avatar_url", ""),
                "author": c.get("author", ""),
            })
            stats = commit_stats.setdefault(repo_url, {"commits": 0})
            stats["commits"] += 1

    await asyncio.gather(*[
        _collect_commits(p["repo_url"], decrypt_token(p.get("repo_token", "")))
        for p in project_docs
        if p.get("repo_url")
    ])

    # Sort commits newest-first
    all_commits.sort(key=lambda c: c.get("date", ""), reverse=True)

    base["commits"] = all_commits[:50]
    base["total_commits"] = len(all_commits)
    base["repos_contributed"] = [
        {"repo": url, "commits": stats["commits"]}
        for url, stats in commit_stats.items()
    ]

    # ── Quick stats ───────────────────────────────────────────────────────────
    base["stats"] = {
        "total_tasks":      len(tasks),
        "done_tasks":       status_counts.get("done", 0),
        "blocked_tasks":    status_counts.get("blocked", 0) + sum(1 for t in tasks if t["is_blocked"]),
        "active_projects":  sum(1 for p in projects if p["status"] == "active"),
        "total_projects":   len(projects),
        "total_teams":      len(teams),
        "reports_30d":      len(reports),
        "total_commits":    len(all_commits),
        "avg_hours":        base["avg_hours_per_day"],
    }

    return base


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    is_self = str(current_user["_id"]) == user_id
    caller_role = current_user.get("primary_role", "employee")
    is_privileged = caller_role in ("ceo", "coo", "admin") or is_admin(current_user)
    is_manager = is_privileged or caller_role in ("pm", "team_lead")

    if not is_self and not is_manager:
        raise HTTPException(status_code=403, detail="Cannot update other users.")

    # Only admin / exec can touch privileged fields
    privileged_fields = {"email", "roles", "primary_role", "is_active"}
    updates = {}
    for k, v in body.model_dump().items():
        if v is None:
            continue
        if k in privileged_fields and not is_privileged:
            raise HTTPException(
                status_code=403,
                detail=f"Your role cannot change '{k}'.",
            )
        updates[k] = v

    if not updates:
        return {"message": "Nothing to update"}

    # Keep primary_role consistent when roles list is changed
    if "roles" in updates and "primary_role" not in updates:
        updates["primary_role"] = updates["roles"][0]

    # Email uniqueness check
    if "email" in updates:
        conflict = await db.users.find_one(
            {"email": updates["email"], "_id": {"$ne": ObjectId(user_id)}}
        )
        if conflict:
            raise HTTPException(status_code=400, detail="Email already in use.")

    updates["updated_at"] = datetime.now(timezone.utc)

    result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User updated"}


_DELETABLE_ROLES: dict[str, set] = {
    "ceo":       {"ceo", "coo", "admin", "pm", "team_lead", "employee"},
    "coo":       {"ceo", "coo", "admin", "pm", "team_lead", "employee"},
    "admin":     {"ceo", "coo", "admin", "pm", "team_lead", "employee"},
    "pm":        {"team_lead", "employee"},
    "team_lead": {"employee"},
}


@router.delete("/{user_id}")
async def deactivate_user(
    user_id: str,
    current_user=Depends(require_user_manager),
    db=Depends(get_db),
):
    """Soft-delete a user by setting is_active=False."""
    target = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if str(target["_id"]) == str(current_user["_id"]):
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")

    caller_role = current_user.get("primary_role", "employee")
    target_role = target.get("primary_role", "employee")
    if target_role not in _DELETABLE_ROLES.get(caller_role, set()):
        raise HTTPException(
            status_code=403,
            detail=f"Your role ('{caller_role}') cannot deactivate a '{target_role}' account.",
        )

    await db.users.update_one(
        {"_id": target["_id"]},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": f"User '{target['full_name']}' has been deactivated."}
