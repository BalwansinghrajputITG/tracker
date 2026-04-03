"""
Team-scoped access control helpers.

Rules:
  - CEO / COO       → see everything
  - PM              → see their own projects and subordinates
  - team_lead       → see ONLY their team's projects, members, tasks, reports
  - employee        → see only their own data

Use these helpers to build MongoDB query filters that enforce the above.
"""
from bson import ObjectId
from fastapi import HTTPException


# ─── Role helpers ─────────────────────────────────────────────────────────────

def is_exec(user: dict) -> bool:
    return bool(set(user.get("roles", [])).intersection({"ceo", "coo"}))


def is_pm(user: dict) -> bool:
    return "pm" in user.get("roles", [])


def is_team_lead(user: dict) -> bool:
    return "team_lead" in user.get("roles", [])


def is_admin(user: dict) -> bool:
    return "admin" in user.get("roles", [])


def is_employee(user: dict) -> bool:
    roles = set(user.get("roles", []))
    return not roles.intersection({"ceo", "coo", "admin", "pm", "team_lead"})


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def get_team_member_ids(db, user: dict) -> list:
    """
    Return ObjectIds of every member the team lead can see:
      • members (and leads) of all their teams
      • direct member_ids on any project linked to their teams
    """
    team_ids = user.get("team_ids", [])

    member_ids: set = {user["_id"]}

    # Members from teams
    if team_ids:
        async for team in db.teams.find({"_id": {"$in": team_ids}}, {"member_ids": 1, "lead_id": 1}):
            for mid in team.get("member_ids", []):
                member_ids.add(mid)
            if team.get("lead_id"):
                member_ids.add(team["lead_id"])

    # Direct members on projects the TL can access (catches project-only members)
    tl_project_ids = await get_team_project_ids(db, user)
    if tl_project_ids:
        async for p in db.projects.find({"_id": {"$in": tl_project_ids}}, {"member_ids": 1}):
            for mid in p.get("member_ids", []):
                member_ids.add(mid)

    return list(member_ids)


async def get_team_project_ids(db, user: dict) -> list:
    """
    Return ObjectIds of every project linked to the user's teams.
    Also includes projects where the user is a direct member.
    """
    team_ids = user.get("team_ids", [])

    project_ids: set = set()

    # Projects linked via teams
    if team_ids:
        cursor = db.teams.find({"_id": {"$in": team_ids}}, {"project_ids": 1})
        async for team in cursor:
            for pid in team.get("project_ids", []):
                project_ids.add(pid)

    # Projects where the user is a direct member (fallback / overlap)
    direct_cursor = db.projects.find(
        {"$or": [
            {"member_ids": user["_id"]},
            {"team_ids": {"$in": team_ids}} if team_ids else {"_id": None},
        ]},
        {"_id": 1},
    )
    async for p in direct_cursor:
        project_ids.add(p["_id"])

    return list(project_ids)


async def get_pm_project_ids(db, user: dict) -> list:
    """
    All project ObjectIds a PM can access:
      • projects where they are the pm_id
      • projects linked to teams where they are the pm_id
      • projects linked to teams they are a member of (team_ids)
    """
    user_id  = user["_id"]
    team_ids = [t if isinstance(t, ObjectId) else ObjectId(t) for t in user.get("team_ids", [])]

    project_ids: set = set()

    # Direct pm_id on project
    async for p in db.projects.find({"pm_id": user_id}, {"_id": 1}):
        project_ids.add(p["_id"])

    # Teams where user is the PM
    pm_team_ids: list = []
    async for t in db.teams.find({"pm_id": user_id, "is_active": {"$ne": False}}, {"_id": 1, "project_ids": 1}):
        pm_team_ids.append(t["_id"])
        for pid in t.get("project_ids", []):
            project_ids.add(pid)

    all_team_ids = list(set(team_ids + pm_team_ids))

    if all_team_ids:
        # Projects where team_ids overlap
        async for p in db.projects.find({"team_ids": {"$in": all_team_ids}}, {"_id": 1}):
            project_ids.add(p["_id"])
        # project_ids stored on team docs
        async for t in db.teams.find({"_id": {"$in": all_team_ids}}, {"project_ids": 1}):
            for pid in t.get("project_ids", []):
                project_ids.add(pid)

    return list(project_ids)


async def get_pm_member_ids(db, user: dict) -> list:
    """
    All user ObjectIds a PM can manage:
      • members of teams where they are the pm_id
      • members of teams they are a member of (team_ids)
      • direct member_ids on any project the PM can access
    """
    user_id  = user["_id"]
    team_ids = [t if isinstance(t, ObjectId) else ObjectId(t) for t in user.get("team_ids", [])]

    pm_team_ids: list = []
    async for t in db.teams.find({"pm_id": user_id, "is_active": {"$ne": False}}, {"_id": 1}):
        pm_team_ids.append(t["_id"])

    all_team_ids = list(set(team_ids + pm_team_ids))

    member_ids: set = {user_id}

    # Members from teams
    if all_team_ids:
        async for team in db.teams.find({"_id": {"$in": all_team_ids}}, {"member_ids": 1, "lead_id": 1}):
            for mid in team.get("member_ids", []):
                member_ids.add(mid)
            if team.get("lead_id"):
                member_ids.add(team["lead_id"])

    # Direct members on projects the PM can access (catches project-only members)
    pm_project_ids = await get_pm_project_ids(db, user)
    if pm_project_ids:
        async for p in db.projects.find({"_id": {"$in": pm_project_ids}}, {"member_ids": 1}):
            for mid in p.get("member_ids", []):
                member_ids.add(mid)

    return list(member_ids)


# ─── Access guards (raise 403 on failure) ────────────────────────────────────

async def assert_project_access(db, project: dict, user: dict):
    """
    Raise HTTP 403 if PM/team_lead tries to access a project outside their teams.
    """
    if is_exec(user):
        return  # full access

    if is_pm(user):
        allowed_ids = await get_pm_project_ids(db, user)
        if project["_id"] not in allowed_ids:
            raise HTTPException(status_code=403, detail="Access denied: project not in your teams.")
        return

    if not is_team_lead(user):
        # Employee: must be a direct member
        if user["_id"] not in project.get("member_ids", []):
            raise HTTPException(status_code=403, detail="Access denied to this project.")
        return

    # team_lead: project must overlap with their teams
    allowed_ids = await get_team_project_ids(db, user)
    if project["_id"] not in allowed_ids:
        raise HTTPException(status_code=403, detail="Access denied: project not in your team.")


async def assert_user_access(db, target_user: dict, current_user: dict):
    """
    Raise HTTP 403 if PM/team_lead tries to view a user outside their teams.
    """
    if is_exec(current_user):
        return

    if str(current_user["_id"]) == str(target_user["_id"]):
        return  # always can see yourself

    if is_pm(current_user):
        allowed_ids = await get_pm_member_ids(db, current_user)
        if target_user["_id"] not in allowed_ids:
            raise HTTPException(status_code=403, detail="Access denied: user not in your teams.")
        return

    if not is_team_lead(current_user):
        raise HTTPException(status_code=403, detail="Access denied.")

    allowed_ids = await get_team_member_ids(db, current_user)
    if target_user["_id"] not in allowed_ids:
        raise HTTPException(status_code=403, detail="Access denied: user not in your team.")


async def assert_report_access(db, report: dict, current_user: dict):
    """
    Raise HTTP 403 if PM/team_lead tries to access a report outside their teams.
    """
    if is_exec(current_user):
        return

    if report["user_id"] == current_user["_id"]:
        return  # own report

    if is_pm(current_user):
        allowed_ids = await get_pm_member_ids(db, current_user)
        if report["user_id"] not in allowed_ids:
            raise HTTPException(status_code=403, detail="Access denied: report not from your teams.")
        return

    if not is_team_lead(current_user):
        raise HTTPException(status_code=403, detail="Access denied.")

    allowed_ids = await get_team_member_ids(db, current_user)
    if report["user_id"] not in allowed_ids:
        raise HTTPException(status_code=403, detail="Access denied: report not from your team.")


async def assert_task_access(db, task: dict, current_user: dict):
    """
    Raise HTTP 403 if PM/team_lead tries to access a task outside their teams' projects.
    """
    if is_exec(current_user):
        return

    if is_pm(current_user):
        allowed_project_ids = await get_pm_project_ids(db, current_user)
        if task.get("project_id") not in allowed_project_ids:
            raise HTTPException(status_code=403, detail="Access denied: task not in your teams' projects.")
        return

    if not is_team_lead(current_user):
        # Employee: must be an assignee
        if current_user["_id"] not in task.get("assignee_ids", []):
            raise HTTPException(status_code=403, detail="Access denied.")
        return

    allowed_project_ids = await get_team_project_ids(db, current_user)
    if task.get("project_id") not in allowed_project_ids:
        raise HTTPException(status_code=403, detail="Access denied: task not in your team's projects.")
