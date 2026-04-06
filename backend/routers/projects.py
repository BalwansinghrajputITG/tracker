from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional
import os
import copy
import uuid as _uuid_mod

from database import get_db
from middleware.auth import get_current_user
from middleware.rbac import require_pm_or_above, require_ceo_coo, require_manager
from services.notification_service import notify_users
from utils.team_scope import (
    is_exec, is_pm, is_team_lead,
    get_team_project_ids,
    get_team_member_ids,
    get_pm_project_ids,
    assert_project_access,
)
from utils.repo import parse_repo_url, fetch_commits as _fetch_commits_util, fetch_contributor_stats
from utils.token_encrypt import encrypt_token, decrypt_token

router = APIRouter()

# ─── Default phase stages ─────────────────────────────────────────────────────

PHASE_STAGES: dict = {
    "planning": [
        {"id": "requirements",    "name": "Requirements Gathering",  "description": "Define project scope, goals and requirements",           "completed": False, "completed_at": None, "completed_by": None},
        {"id": "resource_plan",   "name": "Resource Planning",       "description": "Allocate team members, tools and budget",                "completed": False, "completed_at": None, "completed_by": None},
        {"id": "risk_assessment", "name": "Risk Assessment",         "description": "Identify risks and plan mitigation strategies",          "completed": False, "completed_at": None, "completed_by": None},
        {"id": "timeline",        "name": "Timeline & Milestones",   "description": "Define project schedule and key milestones",             "completed": False, "completed_at": None, "completed_by": None},
        {"id": "kickoff",         "name": "Project Kickoff",         "description": "Official project launch meeting with all stakeholders",  "completed": False, "completed_at": None, "completed_by": None},
    ],
    "active": [
        {"id": "design",          "name": "Design & Architecture",   "description": "System design, UI/UX and technical architecture",        "completed": False, "completed_at": None, "completed_by": None},
        {"id": "development",     "name": "Development",             "description": "Core feature implementation and coding",                 "completed": False, "completed_at": None, "completed_by": None},
        {"id": "code_review",     "name": "Code Review",             "description": "Peer review and quality assurance",                      "completed": False, "completed_at": None, "completed_by": None},
        {"id": "testing",         "name": "Testing & QA",            "description": "Functional, regression and integration testing",         "completed": False, "completed_at": None, "completed_by": None},
        {"id": "staging",         "name": "Staging Deployment",      "description": "Deploy to staging environment and validate",             "completed": False, "completed_at": None, "completed_by": None},
        {"id": "production",      "name": "Production Release",      "description": "Go live in production environment",                      "completed": False, "completed_at": None, "completed_by": None},
    ],
    "on_hold": [
        {"id": "blockers",        "name": "Identify Blockers",       "description": "Document and communicate all reasons for hold",          "completed": False, "completed_at": None, "completed_by": None},
        {"id": "stakeholder",     "name": "Stakeholder Review",      "description": "Review hold situation with key stakeholders",            "completed": False, "completed_at": None, "completed_by": None},
        {"id": "impact",          "name": "Impact Assessment",       "description": "Assess impact on timeline and resources",                "completed": False, "completed_at": None, "completed_by": None},
        {"id": "resume_plan",     "name": "Resume Plan",             "description": "Create a concrete plan to resume the project",          "completed": False, "completed_at": None, "completed_by": None},
    ],
    "completed": [
        {"id": "documentation",   "name": "Documentation",           "description": "Finalize all project and technical documentation",       "completed": False, "completed_at": None, "completed_by": None},
        {"id": "handover",        "name": "Client Handover",         "description": "Deliver final product to client or stakeholders",        "completed": False, "completed_at": None, "completed_by": None},
        {"id": "retrospective",   "name": "Retrospective",           "description": "Team post-mortem and lessons learned session",           "completed": False, "completed_at": None, "completed_by": None},
        {"id": "archive",         "name": "Project Archive",         "description": "Archive project assets, code and data",                 "completed": False, "completed_at": None, "completed_by": None},
    ],
    "cancelled": [
        {"id": "notify_team",     "name": "Notify Team",             "description": "Inform all team members and stakeholders",               "completed": False, "completed_at": None, "completed_by": None},
        {"id": "resource_rel",    "name": "Resource Release",        "description": "Release allocated resources back to the pool",           "completed": False, "completed_at": None, "completed_by": None},
        {"id": "cancel_docs",     "name": "Cancellation Docs",       "description": "Document cancellation reason and lessons learned",       "completed": False, "completed_at": None, "completed_by": None},
    ],
}


def serialize(doc):
    if doc:
        doc["id"] = str(doc.pop("_id"))
        repo_token = doc.pop("repo_token", "")
        doc["has_repo_token"] = bool(repo_token)   # tell frontend whether a token is set
        for k, v in list(doc.items()):
            if isinstance(v, ObjectId):
                doc[k] = str(v)
            elif isinstance(v, datetime):
                doc[k] = v.isoformat()
            elif isinstance(v, list):
                doc[k] = [str(i) if isinstance(i, ObjectId) else i for i in v]
    return doc


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    priority: str = "medium"
    repo_url: str
    repo_token: str = ""          # personal access token for private repos
    figma_url: str = ""
    team_ids: list[str] = []
    member_ids: list[str] = []
    start_date: datetime
    due_date: datetime
    tags: list[str] = []
    links: list[dict] = []
    tools: list[dict] = []
    initial_phase_stages: Optional[dict] = None  # phase -> [{name, description, due_date}]


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    progress_percentage: Optional[int] = None
    due_date: Optional[datetime] = None
    is_delayed: Optional[bool] = None
    delay_reason: Optional[str] = None
    repo_url: Optional[str] = None
    repo_token: Optional[str] = None
    figma_url: Optional[str] = None
    pm_id: Optional[str] = None
    member_ids: Optional[list[str]] = None
    links: Optional[list[dict]] = None
    tools: Optional[list[dict]] = None

    @field_validator("due_date", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        """Treat empty string as None so datetime parsing doesn't fail."""
        if v == "" or v is None:
            return None
        return v


@router.get("")
async def list_projects(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    is_delayed: Optional[bool] = None,
    team_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    query = {}

    if is_exec(current_user):
        pass  # see all

    elif is_pm(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        query["_id"] = {"$in": pm_pids}

    elif is_team_lead(current_user):
        # Only projects that belong to the team_lead's teams
        allowed_ids = await get_team_project_ids(db, current_user)
        query["_id"] = {"$in": allowed_ids}

    else:
        # Employee: only projects they are a direct member of
        query["member_ids"] = current_user["_id"]

    if team_id:
        query["team_ids"] = ObjectId(team_id)
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if is_delayed is not None:
        query["is_delayed"] = is_delayed

    skip = (page - 1) * limit
    cursor = db.projects.find(query, {"phase_stages": 0}).skip(skip).limit(limit).sort("created_at", -1)
    projects = [serialize(p) async for p in cursor]
    total = await db.projects.count_documents(query)

    return {"projects": projects, "total": total, "page": page, "limit": limit}


def _build_initial_phase_stages(initial: Optional[dict]) -> dict:
    """Convert initial_phase_stages payload to stored stage documents."""
    import uuid as _uuid
    if not initial:
        return {}
    result: dict = {}
    for phase, stage_list in initial.items():
        if phase not in VALID_PHASES:
            continue
        built = []
        for s in (stage_list or []):
            stage = {
                "id": str(_uuid.uuid4())[:12],
                "name": str(s.get("name", "")).strip(),
                "description": str(s.get("description", "")).strip(),
                "due_date": s.get("due_date"),  # already serialised string or None
                "completed": False,
                "completed_at": None,
                "completed_by": None,
            }
            if stage["name"]:
                built.append(stage)
        if built:
            result[phase] = built
    return result


@router.post("", status_code=201)
async def create_project(
    body: ProjectCreate,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    # team_lead: auto-attach their own teams and restrict member selection to their team
    if is_team_lead(current_user) and not is_exec(current_user) and not is_pm(current_user):
        lead_team_ids = current_user.get("team_ids", [])
        # Merge caller's teams into the project team list
        extra = [str(t) for t in lead_team_ids if str(t) not in body.team_ids]
        body = body.model_copy(update={"team_ids": body.team_ids + extra})

        # Validate every requested member is within the team_lead's own teams
        if body.member_ids:
            allowed_member_ids = await get_team_member_ids(db, current_user)
            allowed_str = {str(i) for i in allowed_member_ids}
            bad = [m for m in body.member_ids if m not in allowed_str]
            if bad:
                raise HTTPException(
                    status_code=403,
                    detail="You can only add members from your own team.",
                )

    doc = {
        **body.model_dump(exclude={"initial_phase_stages"}),
        "pm_id": current_user["_id"],
        "repo_url": body.repo_url.strip(),
        "repo_token": encrypt_token(body.repo_token.strip()),
        "figma_url": body.figma_url.strip(),
        "team_ids": [ObjectId(t) for t in body.team_ids],
        "member_ids": [ObjectId(m) for m in body.member_ids],
        "status": "planning",
        "phase_stages": (_ps := _build_initial_phase_stages(body.initial_phase_stages)),
        "progress_percentage": _calc_progress(_ps),
        "milestones": [],
        "is_delayed": False,
        "delay_reason": None,
        "completed_at": None,
        "budget": {"allocated": 0, "spent": 0, "currency": "USD"},
        "created_by": current_user["_id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.projects.insert_one(doc)
    project_id = str(result.inserted_id)

    if body.member_ids:
        await notify_users(
            db=db,
            user_ids=body.member_ids,
            notification_type="project_update",
            title=f"You've been added to project: {body.name}",
            body=f"Project {body.name} starts {body.start_date.date()}",
            reference_id=project_id,
            reference_type="project",
        )

    return {"project_id": project_id, "message": "Project created"}


@router.get("/delayed")
async def get_delayed_projects(
    current_user=Depends(require_ceo_coo),
    db=Depends(get_db),
):
    cursor = db.projects.find({"is_delayed": True, "status": {"$nin": ["completed", "cancelled"]}})
    projects = [serialize(p) async for p in cursor]
    return {"delayed_projects": projects, "count": len(projects)}


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Enforce team-scoped read access
    await assert_project_access(db, project, current_user)

    return serialize(project)


@router.get("/{project_id}/detail")
async def get_project_detail(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Full project detail: members, teams, tasks, PM — all populated."""
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await assert_project_access(db, project, current_user)

    base = serialize(dict(project))   # gives us has_repo_token, str ids, etc.

    # PM
    pm_doc = await db.users.find_one({"_id": project.get("pm_id")}, {"full_name": 1, "email": 1, "primary_role": 1})
    base["pm"] = {
        "id": str(pm_doc["_id"]), "name": pm_doc["full_name"],
        "email": pm_doc.get("email", ""), "role": pm_doc.get("primary_role", ""),
    } if pm_doc else None

    # Members
    member_docs = await db.users.find(
        {"_id": {"$in": project.get("member_ids", [])}},
        {"full_name": 1, "email": 1, "primary_role": 1, "department": 1},
    ).to_list(100)
    base["members"] = [
        {"id": str(m["_id"]), "name": m["full_name"], "email": m.get("email", ""),
         "role": m.get("primary_role", ""), "department": m.get("department", "")}
        for m in member_docs
    ]

    # Teams
    team_docs = await db.teams.find(
        {"_id": {"$in": project.get("team_ids", [])}},
        {"name": 1, "department": 1},
    ).to_list(20)
    base["teams"] = [{"id": str(t["_id"]), "name": t["name"], "department": t.get("department", "")} for t in team_docs]

    # Tasks — fetch all tasks then batch-resolve assignees in a single query
    task_docs = await db.tasks.find(
        {"project_id": project["_id"]},
        {"title": 1, "status": 1, "priority": 1, "due_date": 1, "assignee_ids": 1, "is_blocked": 1, "description": 1},
    ).sort("due_date", 1).to_list(100)

    # Collect all unique assignee IDs across all tasks, fetch them once
    all_assignee_ids = list({oid for t in task_docs for oid in t.get("assignee_ids", [])})
    assignee_map: dict = {}
    if all_assignee_ids:
        async for u in db.users.find({"_id": {"$in": all_assignee_ids}}, {"full_name": 1}):
            assignee_map[u["_id"]] = u["full_name"]

    tasks_out = [
        {
            "id": str(t["_id"]),
            "title": t["title"],
            "status": t.get("status", "todo"),
            "priority": t.get("priority", "medium"),
            "due_date": t["due_date"].isoformat() if t.get("due_date") else None,
            "is_blocked": t.get("is_blocked", False),
            "assignees": [
                {"id": str(oid), "name": assignee_map.get(oid, "Unknown")}
                for oid in t.get("assignee_ids", [])
            ],
        }
        for t in task_docs
    ]
    base["tasks"] = tasks_out
    base["figma_url"] = project.get("figma_url", "")
    base["links"] = project.get("links", [])

    return base


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Step 1: Must have read access (team member / own project)
    await assert_project_access(db, project, current_user)

    # Step 2: Write access — exec, PM owner, or team_lead associated with this project
    is_owner = str(project.get("pm_id", "")) == str(current_user["_id"])
    if not is_exec(current_user) and not is_owner:
        if not is_team_lead(current_user):
            raise HTTPException(status_code=403, detail="Only the project manager can update this project.")
        # team_lead: must have project in their team scope (already verified by assert_project_access above)
        # Also restrict: team_lead cannot reassign pm_id or change team_ids
        body = body.model_copy(update={"pm_id": None})

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "repo_token" in updates and updates["repo_token"]:
        updates["repo_token"] = encrypt_token(updates["repo_token"])
    updates["updated_at"] = datetime.now(timezone.utc)

    if updates.get("status") == "completed":
        updates["completed_at"] = datetime.now(timezone.utc)
        updates["progress_percentage"] = 100


    # Convert pm_id string → ObjectId
    if "pm_id" in updates:
        updates["pm_id"] = ObjectId(updates["pm_id"])

    # Convert member_ids list[str] → list[ObjectId]
    if "member_ids" in updates:
        new_member_oids = [ObjectId(m) for m in updates["member_ids"]]
        updates["member_ids"] = new_member_oids
        # Notify newly added members
        old_member_ids = {str(m) for m in project.get("member_ids", [])}
        new_members = [m for m in updates["member_ids"] if str(m) not in old_member_ids]
        if new_members:
            await notify_users(
                db=db,
                user_ids=new_members,
                notification_type="project_update",
                title=f"You've been added to project: {project['name']}",
                body=f"You are now a member of project {project['name']}",
                reference_id=project_id,
                reference_type="project",
            )

    await db.projects.update_one({"_id": ObjectId(project_id)}, {"$set": updates})
    return {"message": "Project updated"}


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await assert_project_access(db, project, current_user)

    is_owner = str(project.get("pm_id", "")) == str(current_user["_id"])
    if not is_exec(current_user) and not is_owner:
        if not is_team_lead(current_user):
            raise HTTPException(status_code=403, detail="Only the project manager or exec can delete this project.")
        # team_lead can cancel — scope already verified by assert_project_access

    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"status": "cancelled", "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Project cancelled"}


@router.post("/{project_id}/members/{user_id}")
async def add_project_member(
    project_id: str,
    user_id: str,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await assert_project_access(db, project, current_user)

    # team_lead: new member must also be within their team scope
    if is_team_lead(current_user) and not is_exec(current_user) and not is_pm(current_user):
        allowed_ids = await get_team_member_ids(db, current_user)
        if ObjectId(user_id) not in allowed_ids:
            raise HTTPException(status_code=403, detail="You can only add members from your own team.")

    user_oid = ObjectId(user_id)
    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$addToSet": {"member_ids": user_oid}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Member added to project"}


@router.delete("/{project_id}/members/{user_id}")
async def remove_project_member(
    project_id: str,
    user_id: str,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await assert_project_access(db, project, current_user)

    # Prevent removing the PM
    if str(project.get("pm_id", "")) == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove the project manager from the project.")

    user_oid = ObjectId(user_id)
    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$pull": {"member_ids": user_oid}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Member removed from project"}


# ─── Git commits helpers ──────────────────────────────────────────────────────
# Logic lives in utils/repo.py; thin wrappers kept here for clarity.

def _parse_repo_url(url: str) -> tuple[str, str, str]:
    return parse_repo_url(url)


async def _fetch_commits(repo_url: str, project_token: str = "") -> dict:
    return await _fetch_commits_util(repo_url, project_token=project_token)


@router.get("/{project_id}/commits")
async def get_project_commits(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await assert_project_access(db, project, current_user)

    repo_url = project.get("repo_url", "")
    if not repo_url:
        return {"commits": [], "total": 0, "error": "No repository URL set for this project."}

    repo_token = decrypt_token(project.get("repo_token", ""))
    return await _fetch_commits(repo_url, project_token=repo_token)


@router.get("/{project_id}/contributor-stats")
async def get_project_contributor_stats(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Per-contributor commit count + lines added/deleted."""
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await assert_project_access(db, project, current_user)

    repo_url = project.get("repo_url", "")
    if not repo_url:
        return {"contributors": [], "error": "No repository URL set for this project."}

    repo_token = decrypt_token(project.get("repo_token", ""))
    return await fetch_contributor_stats(repo_url, project_token=repo_token)


# ─── Phase stage management ───────────────────────────────────────────────────

VALID_PHASES = {"planning", "active", "on_hold", "completed", "cancelled"}


def _manager_check(current_user: dict):
    roles = set(current_user.get("roles", []))
    if not roles.intersection({"ceo", "coo", "pm", "team_lead"}):
        raise HTTPException(status_code=403, detail="Only managers can manage project stages")


def _calc_progress(phase_stages: dict) -> int:
    """Calculate overall project progress % from all stages across all phases."""
    all_stages = [s for phase_list in phase_stages.values() for s in phase_list]
    if not all_stages:
        return 0
    done = sum(1 for s in all_stages if s.get("completed", False))
    return round((done / len(all_stages)) * 100)


class StageCreate(BaseModel):
    phase: str
    name: str
    description: str = ""
    due_date: Optional[datetime] = None


class StageToggle(BaseModel):
    phase: str
    stage_id: str
    completed: bool


@router.post("/{project_id}/stages", status_code=201)
async def add_stage(
    project_id: str,
    body: StageCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Add a custom stage to a phase. PM / TL only."""
    _manager_check(current_user)
    if body.phase not in VALID_PHASES:
        raise HTTPException(status_code=400, detail=f"Invalid phase '{body.phase}'")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Stage name is required")

    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await assert_project_access(db, project, current_user)

    import uuid
    stage = {
        "id": str(uuid.uuid4())[:12],
        "name": body.name.strip(),
        "description": body.description.strip(),
        "due_date": body.due_date.isoformat() if body.due_date else None,
        "completed": False,
        "completed_at": None,
        "completed_by": None,
    }

    # Build updated phase_stages in memory to calculate new progress
    phase_stages = dict(project.get("phase_stages") or {})
    phase_stages[body.phase] = list(phase_stages.get(body.phase, [])) + [stage]
    new_progress = _calc_progress(phase_stages)

    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {
            f"phase_stages.{body.phase}": phase_stages[body.phase],
            "progress_percentage": new_progress,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return {"message": "Stage added", "stage": stage, "progress_percentage": new_progress}


@router.patch("/{project_id}/stages")
async def toggle_stage(
    project_id: str,
    body: StageToggle,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Toggle a phase stage's completion. Any project member can toggle stages."""
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await assert_project_access(db, project, current_user)

    phase_stages = dict(project.get("phase_stages") or {})
    stages = list(phase_stages.get(body.phase, []))
    stage_idx = next((i for i, s in enumerate(stages) if s["id"] == body.stage_id), None)
    if stage_idx is None:
        raise HTTPException(status_code=404, detail="Stage not found")

    stages[stage_idx]["completed"]    = body.completed
    stages[stage_idx]["completed_at"] = datetime.now(timezone.utc).isoformat() if body.completed else None
    stages[stage_idx]["completed_by"] = str(current_user["_id"]) if body.completed else None
    phase_stages[body.phase] = stages

    new_progress = _calc_progress(phase_stages)

    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {
            f"phase_stages.{body.phase}": stages,
            "progress_percentage": new_progress,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return {"message": "Stage updated", "completed": body.completed, "progress_percentage": new_progress}


@router.delete("/{project_id}/stages/{stage_id}")
async def delete_stage(
    project_id: str,
    stage_id: str,
    phase: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Remove a stage and recalculate project progress. PM / TL only."""
    _manager_check(current_user)
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await assert_project_access(db, project, current_user)

    phase_stages = dict(project.get("phase_stages") or {})
    updated = [s for s in phase_stages.get(phase, []) if s["id"] != stage_id]
    phase_stages[phase] = updated
    new_progress = _calc_progress(phase_stages)

    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {
            f"phase_stages.{phase}": updated,
            "progress_percentage": new_progress,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return {"message": "Stage deleted", "progress_percentage": new_progress}


class StageUpdate(BaseModel):
    phase: str
    stage_id: str
    name: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    clear_due_date: bool = False  # explicitly remove due_date


@router.put("/{project_id}/stages")
async def update_stage(
    project_id: str,
    body: StageUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Update a stage's name, description, or due_date. PM / TL only."""
    _manager_check(current_user)
    if body.phase not in VALID_PHASES:
        raise HTTPException(status_code=400, detail=f"Invalid phase '{body.phase}'")

    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await assert_project_access(db, project, current_user)

    phase_stages = dict(project.get("phase_stages") or {})
    stages = list(phase_stages.get(body.phase, []))
    idx = next((i for i, s in enumerate(stages) if s["id"] == body.stage_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Stage not found")

    if body.name is not None:
        stages[idx]["name"] = body.name.strip()
    if body.description is not None:
        stages[idx]["description"] = body.description.strip()
    if body.clear_due_date:
        stages[idx]["due_date"] = None
    elif body.due_date is not None:
        stages[idx]["due_date"] = body.due_date.isoformat()

    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {
            f"phase_stages.{body.phase}": stages,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return {"message": "Stage updated", "stage": stages[idx]}


class BulkToggle(BaseModel):
    phase: str
    completed: bool  # True = mark all done, False = reset all


@router.patch("/{project_id}/stages/bulk")
async def bulk_toggle_stages(
    project_id: str,
    body: BulkToggle,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Mark all stages in a phase as complete or incomplete. Any project member can bulk-toggle."""
    if body.phase not in VALID_PHASES:
        raise HTTPException(status_code=400, detail=f"Invalid phase '{body.phase}'")

    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await assert_project_access(db, project, current_user)

    phase_stages = dict(project.get("phase_stages") or {})
    stages = list(phase_stages.get(body.phase, []))
    now_iso = datetime.now(timezone.utc).isoformat()
    for s in stages:
        s["completed"]    = body.completed
        s["completed_at"] = now_iso if body.completed else None
        s["completed_by"] = str(current_user["_id"]) if body.completed else None
    phase_stages[body.phase] = stages
    new_progress = _calc_progress(phase_stages)

    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {
            f"phase_stages.{body.phase}": stages,
            "progress_percentage": new_progress,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return {"message": "Bulk toggle done", "completed": body.completed, "progress_percentage": new_progress}


# ─── Tracking Docs (PM-managed Sheets / Docs for performance tracking) ────────

class TrackingDocAdd(BaseModel):
    url: str
    title: str = ""
    api_key: str = ""   # Google Drive API key (stored per-doc, never returned in lists)


@router.post("/{project_id}/tracking-docs")
async def add_tracking_doc(
    project_id: str,
    body: TrackingDocAdd,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """PM (or exec) adds a Google Sheets / Docs link to track for this project."""
    from utils.gdrive import extract_file_id, detect_doc_type
    _manager_check(current_user)

    project = await db.projects.find_one({"_id": ObjectId(project_id)}, {"pm_id": 1, "tracking_docs": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await assert_project_access(db, project, current_user)

    file_id = extract_file_id(body.url)
    if not file_id:
        raise HTTPException(status_code=400, detail="Could not parse a Google Drive file ID from that URL")

    doc = {
        "id":        str(_uuid_mod.uuid4())[:12],
        "url":       body.url.strip(),
        "title":     body.title.strip() or body.url.strip(),
        "doc_type":  detect_doc_type(body.url),
        "file_id":   file_id,
        "api_key":   body.api_key.strip(),
        "added_by":  str(current_user["_id"]),
        "added_at":  datetime.now(timezone.utc).isoformat(),
    }
    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$push": {"tracking_docs": doc}},
    )
    safe = {k: v for k, v in doc.items() if k != "api_key"}
    safe["has_api_key"] = bool(doc["api_key"])
    return safe


@router.get("/{project_id}/tracking-docs")
async def list_tracking_docs(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Return tracking docs without exposing API keys."""
    _manager_check(current_user)
    project = await db.projects.find_one({"_id": ObjectId(project_id)}, {"tracking_docs": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    docs = project.get("tracking_docs") or []
    safe = [{k: v for k, v in d.items() if k != "api_key"} | {"has_api_key": bool(d.get("api_key"))} for d in docs]
    return {"tracking_docs": safe}


@router.delete("/{project_id}/tracking-docs/{doc_id}")
async def delete_tracking_doc(
    project_id: str,
    doc_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    _manager_check(current_user)
    project = await db.projects.find_one({"_id": ObjectId(project_id)}, {"pm_id": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await assert_project_access(db, project, current_user)
    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$pull": {"tracking_docs": {"id": doc_id}}},
    )
    return {"message": "Tracking doc removed"}


@router.get("/{project_id}/tracking-docs/live")
async def live_tracking_docs(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Fetch live edit stats for all tracking docs in this project via Drive API."""
    from utils.gdrive import fetch_gdrive_stats
    _manager_check(current_user)
    project = await db.projects.find_one({"_id": ObjectId(project_id)}, {"tracking_docs": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    docs = project.get("tracking_docs") or []
    results = []
    for d in docs:
        file_id = d.get("file_id", "")
        api_key = d.get("api_key", "")
        stats = await fetch_gdrive_stats(file_id, api_key) if file_id else {"error": "No file ID"}
        results.append({
            "id":           d["id"],
            "title":        d.get("title", ""),
            "url":          d.get("url", ""),
            "doc_type":     d.get("doc_type", "other"),
            "has_api_key":  bool(api_key),
            "stats":        stats,
        })
    return {"docs": results}
