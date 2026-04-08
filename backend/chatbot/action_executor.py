"""
ActionExecutor — perform write operations on behalf of the chatbot.

Each method returns {"success": bool, "message": str, "data": dict}.
Permissions are enforced inside each method before any DB write.
"""
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import re
import secrets
import string

from passlib.context import CryptContext
from utils.team_scope import get_team_project_ids, get_team_member_ids

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─── Permission tables ────────────────────────────────────────────────────────

ACTION_PERMISSIONS = {
    "create_team":        {"ceo", "coo", "pm", "team_lead"},
    "add_member":         {"ceo", "coo", "pm", "team_lead"},
    "remove_member":      {"ceo", "coo", "pm", "team_lead"},
    "create_project":     {"ceo", "coo", "pm", "team_lead"},
    "create_task":        {"ceo", "coo", "pm", "team_lead", "employee"},
    "update_task_status": {"ceo", "coo", "pm", "team_lead", "employee"},
    "update_progress":    {"ceo", "coo", "pm", "team_lead"},
    "assign_task":        {"ceo", "coo", "pm", "team_lead"},
    "create_user":        {"ceo", "coo", "admin", "pm", "team_lead"},
    "mark_blocked":       {"ceo", "coo", "pm", "team_lead", "employee"},
    "delete_user":        {"ceo", "coo", "admin", "pm", "team_lead"},
}

# Which roles a caller can deactivate
DELETABLE_ROLES: dict[str, set] = {
    "ceo":       {"ceo", "coo", "admin", "pm", "team_lead", "employee"},
    "coo":       {"ceo", "coo", "admin", "pm", "team_lead", "employee"},
    "admin":     {"pm", "team_lead", "employee"},
    "pm":        {"team_lead", "employee"},
    "team_lead": {"employee"},
}

CREATABLE_ROLES = {
    "ceo":       {"ceo", "coo", "admin", "pm", "team_lead", "employee"},
    "coo":       {"ceo", "coo", "admin", "pm", "team_lead", "employee"},
    "admin":     {"pm", "team_lead", "employee"},
    "pm":        {"team_lead", "employee"},
    "team_lead": {"employee"},
}

VALID_STATUSES = {"todo", "in_progress", "review", "done", "blocked"}


def _err(msg: str, **data) -> dict:
    return {"success": False, "message": msg, "data": data}


def _ok(msg: str, **data) -> dict:
    return {"success": True, "message": msg, "data": data}


def _parse_due_date(due_date_str: str | None) -> datetime | None:
    """Parse a due date string. Supports ISO format and simple relative phrases."""
    if not due_date_str:
        return None
    s = due_date_str.strip().lower()
    now = datetime.now(timezone.utc)

    relative_map = {
        "today":        timedelta(days=0),
        "tomorrow":     timedelta(days=1),
        "next week":    timedelta(weeks=1),
        "next month":   timedelta(days=30),
        "next quarter": timedelta(days=90),
        "in a week":    timedelta(weeks=1),
        "in a month":   timedelta(days=30),
        "in 2 weeks":   timedelta(weeks=2),
        "in 3 months":  timedelta(days=90),
    }
    for phrase, delta in relative_map.items():
        if phrase in s:
            return now + delta

    # Try ISO-like formats
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(due_date_str.strip(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


class ActionExecutor:
    def __init__(self, db, current_user: dict):
        self.db = db
        self.user = current_user
        self.role = current_user.get("primary_role", "employee")

    def _check_permission(self, action: str) -> dict | None:
        """Return an error dict if the caller lacks permission, else None."""
        allowed = ACTION_PERMISSIONS.get(action, set())
        if self.role not in allowed:
            return _err(
                f"Permission denied. Action '{action}' requires one of: {', '.join(sorted(allowed))}. "
                f"Your role is '{self.role}'."
            )
        return None

    async def _find_user_by_name(self, name: str) -> dict | None:
        return await self.db.users.find_one(
            {"full_name": {"$regex": name.strip(), "$options": "i"}, "is_active": True}
        )

    async def _find_team_by_name(self, name: str) -> dict | None:
        return await self.db.teams.find_one(
            {"name": {"$regex": name.strip(), "$options": "i"}}
        )

    async def _find_project_by_name(self, name: str) -> dict | None:
        return await self.db.projects.find_one(
            {"name": {"$regex": name.strip(), "$options": "i"}}
        )

    async def _find_task_by_title(self, title: str) -> dict | None:
        return await self.db.tasks.find_one(
            {"title": {"$regex": title.strip(), "$options": "i"}}
        )

    # ─── Action methods ───────────────────────────────────────────────────────

    async def create_team(
        self,
        name: str,
        department: str = "",
        lead_name: str = None,
        pm_name: str = None,
        member_names: list = None,
    ) -> dict:
        if member_names is None:
            member_names = []

        perm = self._check_permission("create_team")
        if perm:
            return perm

        if not name or not name.strip():
            return _err("Team name cannot be empty.")

        existing = await self.db.teams.find_one(
            {"name": {"$regex": f"^{re.escape(name.strip())}$", "$options": "i"}}
        )
        if existing:
            return _err(f"A team named '{name}' already exists.")

        # Team lead must set themselves as lead
        if self.role == "team_lead":
            lead_name = self.user.get("full_name", "")

        lead_id = None
        if lead_name:
            lead_user = await self._find_user_by_name(lead_name)
            if not lead_user:
                return _err(f"Could not find user matching '{lead_name}' to set as team lead.")
            lead_id = lead_user["_id"]
            # Enforce: team_lead can only set themselves as lead
            if self.role == "team_lead" and lead_id != self.user["_id"]:
                return _err("As a team lead, you can only create teams where you are the lead.")

        pm_id = None
        if pm_name:
            pm_user = await self._find_user_by_name(pm_name)
            if not pm_user:
                return _err(f"Could not find user matching '{pm_name}' to set as project manager.")
            pm_id = pm_user["_id"]

        # If team_lead, only allow members from their existing teams
        allowed_member_ids = None
        if self.role == "team_lead":
            allowed_member_ids = set(str(i) for i in await get_team_member_ids(self.db, self.user))

        member_ids = []
        for mname in member_names:
            u = await self._find_user_by_name(mname)
            if u and u["_id"] not in member_ids:
                if allowed_member_ids is not None and str(u["_id"]) not in allowed_member_ids:
                    return _err(f"You can only add members from your existing teams. '{u['full_name']}' is not in your teams.")
                member_ids.append(u["_id"])

        now = datetime.now(timezone.utc)
        doc = {
            "name": name.strip(),
            "department": department.strip(),
            "lead_id": lead_id,
            "pm_id": pm_id,
            "member_ids": member_ids,
            "project_ids": [],
            "created_by": self.user["_id"],
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db.teams.insert_one(doc)
        team_id = result.inserted_id

        # Update each member's team_ids
        if member_ids:
            await self.db.users.update_many(
                {"_id": {"$in": member_ids}},
                {"$addToSet": {"team_ids": team_id}},
            )
        if lead_id:
            await self.db.users.update_one(
                {"_id": lead_id},
                {"$addToSet": {"team_ids": team_id}},
            )
        if pm_id and pm_id not in member_ids and pm_id != lead_id:
            await self.db.users.update_one(
                {"_id": pm_id},
                {"$addToSet": {"team_ids": team_id}},
            )

        return _ok(
            f"Team '{name}' created successfully.",
            team_id=str(team_id),
            name=name.strip(),
            department=department.strip(),
            lead=lead_name or "none",
            pm=pm_name or "none",
            members_added=len(member_ids),
        )

    async def add_member(self, team_name: str, member_name: str) -> dict:
        perm = self._check_permission("add_member")
        if perm:
            return perm

        team = await self._find_team_by_name(team_name)
        if not team:
            return _err(f"No team found matching '{team_name}'.")

        # team_lead can only modify teams they belong to
        if self.role == "team_lead":
            my_team_ids = self.user.get("team_ids", [])
            if team["_id"] not in my_team_ids:
                return _err(f"You are not a lead of team '{team['name']}'.")

        user = await self._find_user_by_name(member_name)
        if not user:
            return _err(f"No active user found matching '{member_name}'.")

        await self.db.teams.update_one(
            {"_id": team["_id"]},
            {"$addToSet": {"member_ids": user["_id"]}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        )
        await self.db.users.update_one(
            {"_id": user["_id"]},
            {"$addToSet": {"team_ids": team["_id"]}},
        )
        return _ok(
            f"Added {user['full_name']} to team '{team['name']}'.",
            team=team["name"],
            user=user["full_name"],
        )

    async def remove_member(self, team_name: str, member_name: str) -> dict:
        perm = self._check_permission("remove_member")
        if perm:
            return perm

        team = await self._find_team_by_name(team_name)
        if not team:
            return _err(f"No team found matching '{team_name}'.")

        if self.role == "team_lead":
            my_team_ids = self.user.get("team_ids", [])
            if team["_id"] not in my_team_ids:
                return _err(f"You are not a lead of team '{team['name']}'.")

        user = await self._find_user_by_name(member_name)
        if not user:
            return _err(f"No active user found matching '{member_name}'.")

        await self.db.teams.update_one(
            {"_id": team["_id"]},
            {"$pull": {"member_ids": user["_id"]}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        )
        await self.db.users.update_one(
            {"_id": user["_id"]},
            {"$pull": {"team_ids": team["_id"]}},
        )
        return _ok(
            f"Removed {user['full_name']} from team '{team['name']}'.",
            team=team["name"],
            user=user["full_name"],
        )

    async def create_project(
        self,
        name: str,
        description: str = "",
        priority: str = "medium",
        due_date_str: str = None,
        member_names: list = None,
        repo_url: str = "",
        figma_url: str = "",
        team_names: list = None,
        tags: list = None,
        links: list = None,
    ) -> dict:
        if member_names is None:
            member_names = []
        if team_names is None:
            team_names = []
        if tags is None:
            tags = []
        if links is None:
            links = []

        perm = self._check_permission("create_project")
        if perm:
            return perm

        if not name or not name.strip():
            return _err("Project name cannot be empty.")

        existing = await self.db.projects.find_one(
            {"name": {"$regex": f"^{re.escape(name.strip())}$", "$options": "i"}}
        )
        if existing:
            return _err(f"A project named '{name}' already exists.")

        if priority not in {"low", "medium", "high", "critical"}:
            priority = "medium"

        due_date = _parse_due_date(due_date_str)

        member_ids = []
        for mname in member_names:
            u = await self._find_user_by_name(mname)
            if u and u["_id"] not in member_ids:
                member_ids.append(u["_id"])

        # Resolve team names → ObjectIds
        team_ids = []
        if self.role == "team_lead":
            team_ids = list(self.user.get("team_ids", []))
        for tname in team_names:
            t = await self._find_team_by_name(tname)
            if t and t["_id"] not in team_ids:
                team_ids.append(t["_id"])

        now = datetime.now(timezone.utc)
        doc = {
            "name": name.strip(),
            "description": description.strip(),
            "status": "active",
            "priority": priority,
            "progress_percentage": 0,
            "is_delayed": False,
            "delay_reason": "",
            "due_date": due_date,
            "start_date": now,
            "pm_id": self.user["_id"],
            "member_ids": member_ids,
            "team_ids": team_ids,
            "milestones": [],
            "tags": [t.strip() for t in tags if t.strip()],
            "repo_url": repo_url.strip(),
            "repo_token": "",
            "figma_url": figma_url.strip(),
            "links": links,
            "created_by": self.user["_id"],
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db.projects.insert_one(doc)
        project_id = result.inserted_id

        return _ok(
            f"Project '{name}' created successfully.",
            project_id=str(project_id),
            name=name.strip(),
            priority=priority,
            due_date=str(due_date) if due_date else None,
            members_added=len(member_ids),
            repo_url=repo_url.strip() or "none",
        )

    async def create_task(
        self,
        title: str,
        project_name: str,
        assignee_names: list = None,
        priority: str = "medium",
        due_date_str: str = None,
    ) -> dict:
        if assignee_names is None:
            assignee_names = []

        perm = self._check_permission("create_task")
        if perm:
            return perm

        if not title or not title.strip():
            return _err("Task title cannot be empty.")

        project = await self._find_project_by_name(project_name)
        if not project:
            return _err(f"No project found matching '{project_name}'.")

        # Role-based project access check
        if self.role == "team_lead":
            allowed_pids = await get_team_project_ids(self.db, self.user)
            if project["_id"] not in allowed_pids:
                return _err(f"You do not have access to project '{project['name']}'.")
        elif self.role == "employee":
            if self.user["_id"] not in project.get("member_ids", []):
                return _err(f"You are not a member of project '{project['name']}'.")

        if priority not in {"low", "medium", "high", "critical"}:
            priority = "medium"

        due_date = _parse_due_date(due_date_str)

        assignee_ids = []
        for aname in assignee_names:
            u = await self._find_user_by_name(aname)
            if u and u["_id"] not in assignee_ids:
                assignee_ids.append(u["_id"])

        now = datetime.now(timezone.utc)
        doc = {
            "title": title.strip(),
            "description": "",
            "status": "todo",
            "priority": priority,
            "project_id": project["_id"],
            "assignee_ids": assignee_ids,
            "is_blocked": False,
            "blocked_reason": "",
            "due_date": due_date,
            "created_by": self.user["_id"],
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db.tasks.insert_one(doc)
        task_id = result.inserted_id

        return _ok(
            f"Task '{title}' created in project '{project['name']}'.",
            task_id=str(task_id),
            title=title.strip(),
            project=project["name"],
            priority=priority,
            assignees=len(assignee_ids),
            due_date=str(due_date) if due_date else None,
        )

    async def update_task_status(self, task_title: str, new_status: str) -> dict:
        perm = self._check_permission("update_task_status")
        if perm:
            return perm

        new_status = new_status.lower().strip()
        if new_status not in VALID_STATUSES:
            return _err(
                f"Invalid status '{new_status}'. Valid values: {', '.join(sorted(VALID_STATUSES))}."
            )

        task = await self._find_task_by_title(task_title)
        if not task:
            return _err(f"No task found matching '{task_title}'.")

        # Employee: must be an assignee
        if self.role == "employee":
            if self.user["_id"] not in task.get("assignee_ids", []):
                return _err("You can only update status for tasks assigned to you.")

        old_status = task.get("status", "unknown")
        await self.db.tasks.update_one(
            {"_id": task["_id"]},
            {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc)}},
        )
        return _ok(
            f"Task '{task['title']}' status updated from '{old_status}' to '{new_status}'.",
            task=task["title"],
            old_status=old_status,
            new_status=new_status,
        )

    async def update_project_progress(self, project_name: str, progress: int) -> dict:
        perm = self._check_permission("update_progress")
        if perm:
            return perm

        if not isinstance(progress, int) or not (0 <= progress <= 100):
            return _err("Progress must be an integer between 0 and 100.")

        project = await self._find_project_by_name(project_name)
        if not project:
            return _err(f"No project found matching '{project_name}'.")

        # pm: must own the project
        if self.role == "pm":
            if project.get("pm_id") != self.user["_id"]:
                return _err(f"You are not the PM of project '{project['name']}'.")

        # team_lead: project must be in their teams
        if self.role == "team_lead":
            allowed_pids = await get_team_project_ids(self.db, self.user)
            if project["_id"] not in allowed_pids:
                return _err(f"Project '{project['name']}' is not in your teams.")

        old_progress = project.get("progress_percentage", 0)
        await self.db.projects.update_one(
            {"_id": project["_id"]},
            {"$set": {"progress_percentage": progress, "updated_at": datetime.now(timezone.utc)}},
        )
        return _ok(
            f"Project '{project['name']}' progress updated from {old_progress}% to {progress}%.",
            project=project["name"],
            old_progress=old_progress,
            new_progress=progress,
        )

    async def assign_task(self, task_title: str, user_name: str) -> dict:
        perm = self._check_permission("assign_task")
        if perm:
            return perm

        task = await self._find_task_by_title(task_title)
        if not task:
            return _err(f"No task found matching '{task_title}'.")

        user = await self._find_user_by_name(user_name)
        if not user:
            return _err(f"No active user found matching '{user_name}'.")

        await self.db.tasks.update_one(
            {"_id": task["_id"]},
            {
                "$addToSet": {"assignee_ids": user["_id"]},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )
        return _ok(
            f"Assigned task '{task['title']}' to {user['full_name']}.",
            task=task["title"],
            assigned_to=user["full_name"],
        )

    async def create_user_action(
        self,
        full_name: str,
        email: str,
        department: str,
        role_name: str,
    ) -> dict:
        perm = self._check_permission("create_user")
        if perm:
            return perm

        # Role hierarchy check
        allowed_roles = CREATABLE_ROLES.get(self.role, set())
        if role_name not in allowed_roles:
            return _err(
                f"Your role ('{self.role}') cannot create users with role '{role_name}'. "
                f"You can create: {', '.join(sorted(allowed_roles)) if allowed_roles else 'none'}."
            )

        if not email or not full_name:
            return _err("full_name and email are required.")

        existing = await self.db.users.find_one({"email": email.lower().strip()})
        if existing:
            return _err(f"A user with email '{email}' already exists.")

        # Generate a cryptographically random temporary password (16 chars, mixed)
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        temp_password = "".join(secrets.choice(alphabet) for _ in range(16))

        hashed = pwd_context.hash(temp_password)
        now = datetime.now(timezone.utc)
        doc = {
            "full_name": full_name.strip(),
            "email": email.lower().strip(),
            "password_hash": hashed,
            "department": department.strip(),
            "roles": [role_name],
            "primary_role": role_name,
            "team_ids": [],
            "is_active": True,
            "must_change_password": True,
            "created_by": self.user["_id"],
            "created_at": now,
            "updated_at": now,
            "last_seen": None,
        }
        result = await self.db.users.insert_one(doc)
        user_id = result.inserted_id

        return _ok(
            f"User '{full_name}' created with role '{role_name}'. "
            f"Share this temporary password with them — they must change it on first login: `{temp_password}`",
            user_id=str(user_id),
            full_name=full_name.strip(),
            email=email.lower().strip(),
            role=role_name,
            department=department.strip(),
            temp_password=temp_password,
        )

    async def mark_blocked(
        self,
        task_title: str,
        blocked: bool = True,
        reason: str = "",
    ) -> dict:
        perm = self._check_permission("mark_blocked")
        if perm:
            return perm

        task = await self._find_task_by_title(task_title)
        if not task:
            return _err(f"No task found matching '{task_title}'.")

        # Employee: must be an assignee
        if self.role == "employee":
            if self.user["_id"] not in task.get("assignee_ids", []):
                return _err("You can only update tasks assigned to you.")

        update: dict = {
            "is_blocked": blocked,
            "updated_at": datetime.now(timezone.utc),
        }
        if blocked:
            update["blocked_reason"] = reason.strip()
            update["status"] = "blocked"
        else:
            update["blocked_reason"] = ""
            # Revert to in_progress if it was blocked
            if task.get("status") == "blocked":
                update["status"] = "in_progress"

        await self.db.tasks.update_one({"_id": task["_id"]}, {"$set": update})

        action_word = "blocked" if blocked else "unblocked"
        msg = f"Task '{task['title']}' has been {action_word}."
        if blocked and reason:
            msg += f" Reason: {reason}"

        return _ok(
            msg,
            task=task["title"],
            is_blocked=blocked,
            reason=reason if blocked else "",
        )

    async def deactivate_user(self, user_name: str) -> dict:
        """
        Soft-delete a user by setting is_active = False.

        Safety rules:
        - Cannot delete yourself
        - Can only delete users whose primary_role is within your DELETABLE_ROLES
        - CEO / COO are protected — only another CEO/COO can deactivate them
        """
        perm = self._check_permission("delete_user")
        if perm:
            return perm

        target = await self.db.users.find_one(
            {"full_name": {"$regex": user_name.strip(), "$options": "i"}}
        )
        if not target:
            return _err(f"No user found matching '{user_name}'.")

        # Prevent self-deletion
        if str(target["_id"]) == str(self.user["_id"]):
            return _err("You cannot deactivate your own account.")

        target_role = target.get("primary_role", "employee")
        deletable = DELETABLE_ROLES.get(self.role, set())
        if target_role not in deletable:
            return _err(
                f"Your role ('{self.role}') cannot deactivate a '{target_role}' account. "
                f"You can only deactivate: {', '.join(sorted(deletable))}."
            )

        if not target.get("is_active", True):
            return _err(f"User '{target['full_name']}' is already inactive.")

        await self.db.users.update_one(
            {"_id": target["_id"]},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
        )

        return _ok(
            f"User '{target['full_name']}' has been deactivated.",
            user_id=str(target["_id"]),
            full_name=target["full_name"],
            role=target_role,
            email=target.get("email", ""),
        )

    async def submit_report(
        self,
        tasks_done: list = None,
        blockers: list = None,
        hours: float = 8.0,
        mood: str = "good",
        notes: str = "",
        project_name: str = "",
        tasks_planned: list = None,
    ) -> dict:
        if tasks_done is None:
            tasks_done = []
        if blockers is None:
            blockers = []
        if tasks_planned is None:
            tasks_planned = []
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        existing = await self.db.daily_reports.find_one({
            "user_id": self.user["_id"],
            "report_date": {"$gte": today},
        })
        if existing:
            return _err("You have already submitted a report for today.")

        # Resolve project
        project_id = None
        if project_name:
            proj = await self._find_project_by_name(project_name)
            if proj:
                project_id = proj["_id"]

        valid_moods = {"great", "good", "neutral", "stressed", "burned_out"}
        if mood not in valid_moods:
            mood = "good"

        now = datetime.now(timezone.utc)
        doc = {
            "user_id": self.user["_id"],
            "project_id": project_id,
            "report_date": today,
            "mood": mood,
            "unstructured_notes": notes,
            "structured_data": {
                "tasks_completed": tasks_done,
                "tasks_planned": tasks_planned,
                "blockers": blockers,
                "hours_worked": hours,
            },
            "is_reviewed": False,
            "reviewed_by": None,
            "review_comment": "",
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db.daily_reports.insert_one(doc)
        return _ok(
            "Daily report submitted.",
            report_id=str(result.inserted_id),
            date=today.strftime("%Y-%m-%d"),
            hours=hours,
            mood=mood,
            tasks_completed=len(tasks_done),
            project=project_name or "not specified",
        )

    async def edit_project(
        self,
        project_name: str,
        status: str = None,
        priority: str = None,
        progress: int = None,
        due_date_str: str = None,
        description: str = None,
        repo_url: str = None,
        figma_url: str = None,
        pm_name: str = None,
        add_member_names: list = None,
        remove_member_names: list = None,
    ) -> dict:
        perm = self._check_permission("update_progress")
        if perm:
            return perm
        project = await self._find_project_by_name(project_name)
        if not project:
            return _err(f"No project found matching '{project_name}'.")
        updates: dict = {"updated_at": datetime.now(timezone.utc)}
        if status and status in {"planning", "active", "on_hold", "completed", "cancelled"}:
            updates["status"] = status
            if status == "completed":
                updates["completed_at"] = datetime.now(timezone.utc)
                updates["progress_percentage"] = 100
        if priority and priority in {"low", "medium", "high", "critical"}:
            updates["priority"] = priority
        if progress is not None and 0 <= progress <= 100:
            updates["progress_percentage"] = progress
        due = _parse_due_date(due_date_str)
        if due:
            updates["due_date"] = due
        if description is not None:
            updates["description"] = description.strip()
        if repo_url is not None:
            updates["repo_url"] = repo_url.strip()
        if figma_url is not None:
            updates["figma_url"] = figma_url.strip()
        if pm_name:
            pm_user = await self._find_user_by_name(pm_name)
            if not pm_user:
                return _err(f"No user found matching '{pm_name}' for PM.")
            updates["pm_id"] = pm_user["_id"]
        if len(updates) == 1 and not add_member_names and not remove_member_names:
            return _err("No valid fields to update. Supported: status, priority, progress, due_date, description, repo_url, figma_url, pm, add-members, remove-members.")
        await self.db.projects.update_one({"_id": project["_id"]}, {"$set": updates})
        # Handle member add/remove separately
        if add_member_names:
            for mname in add_member_names:
                u = await self._find_user_by_name(mname)
                if u:
                    await self.db.projects.update_one(
                        {"_id": project["_id"]},
                        {"$addToSet": {"member_ids": u["_id"]}},
                    )
        if remove_member_names:
            for mname in remove_member_names:
                u = await self._find_user_by_name(mname)
                if u:
                    await self.db.projects.update_one(
                        {"_id": project["_id"]},
                        {"$pull": {"member_ids": u["_id"]}},
                    )
        return _ok(
            f"Project '{project['name']}' updated.",
            project=project["name"],
            updates={k: str(v) for k, v in updates.items() if k != "updated_at"},
            members_added=len(add_member_names or []),
            members_removed=len(remove_member_names or []),
        )

    async def cancel_project(self, project_name: str) -> dict:
        perm = self._check_permission("update_progress")
        if perm:
            return perm
        project = await self._find_project_by_name(project_name)
        if not project:
            return _err(f"No project found matching '{project_name}'.")
        await self.db.projects.update_one(
            {"_id": project["_id"]},
            {"$set": {"status": "cancelled", "updated_at": datetime.now(timezone.utc)}},
        )
        return _ok(f"Project '{project['name']}' has been cancelled.", project=project["name"])

    async def edit_team(
        self,
        team_name: str,
        new_name: str = None,
        department: str = None,
        lead_name: str = None,
        pm_name: str = None,
    ) -> dict:
        perm = self._check_permission("create_team")
        if perm:
            return perm
        team = await self._find_team_by_name(team_name)
        if not team:
            return _err(f"No team found matching '{team_name}'.")
        updates: dict = {"updated_at": datetime.now(timezone.utc)}
        if new_name:
            updates["name"] = new_name.strip()
        if department:
            updates["department"] = department.strip()
        if lead_name:
            lead = await self._find_user_by_name(lead_name)
            if not lead:
                return _err(f"No user found matching '{lead_name}'.")
            updates["lead_id"] = lead["_id"]
        if pm_name:
            pm = await self._find_user_by_name(pm_name)
            if not pm:
                return _err(f"No user found matching '{pm_name}'.")
            updates["pm_id"] = pm["_id"]
        if len(updates) == 1:
            return _err("No valid fields to update. Supported: name, department, lead, pm.")
        await self.db.teams.update_one({"_id": team["_id"]}, {"$set": updates})
        return _ok(
            f"Team '{team['name']}' updated.",
            team=team["name"],
            updates={k: str(v) for k, v in updates.items() if k != "updated_at"},
        )

    async def delete_team(self, team_name: str) -> dict:
        perm = self._check_permission("create_team")
        if perm:
            return perm
        team = await self._find_team_by_name(team_name)
        if not team:
            return _err(f"No team found matching '{team_name}'.")
        await self.db.teams.update_one(
            {"_id": team["_id"]},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
        )
        return _ok(f"Team '{team['name']}' has been deleted.", team=team["name"])

    async def edit_task(
        self,
        task_title: str,
        new_title: str = None,
        priority: str = None,
        due_date_str: str = None,
        assignee_names: list = None,
    ) -> dict:
        perm = self._check_permission("assign_task")
        if perm:
            return perm
        task = await self._find_task_by_title(task_title)
        if not task:
            return _err(f"No task found matching '{task_title}'.")
        updates: dict = {"updated_at": datetime.now(timezone.utc)}
        if new_title:
            updates["title"] = new_title.strip()
        if priority and priority in {"low", "medium", "high", "critical"}:
            updates["priority"] = priority
        due = _parse_due_date(due_date_str)
        if due:
            updates["due_date"] = due
        if assignee_names:
            ids = []
            for name in assignee_names:
                u = await self._find_user_by_name(name)
                if u:
                    ids.append(u["_id"])
            if ids:
                updates["assignee_ids"] = ids
        if len(updates) == 1:
            return _err("No valid fields to update. Supported: title, priority, due_date, assignees.")
        await self.db.tasks.update_one({"_id": task["_id"]}, {"$set": updates})
        return _ok(
            f"Task '{task['title']}' updated.",
            task=task["title"],
            updates={k: str(v) for k, v in updates.items() if k != "updated_at"},
        )

    async def add_project_member(self, project_name: str, user_name: str) -> dict:
        perm = self._check_permission("assign_task")
        if perm:
            return perm
        project = await self._find_project_by_name(project_name)
        if not project:
            return _err(f"No project found matching '{project_name}'.")
        user = await self._find_user_by_name(user_name)
        if not user:
            return _err(f"No user found matching '{user_name}'.")
        await self.db.projects.update_one(
            {"_id": project["_id"]},
            {"$addToSet": {"member_ids": user["_id"]}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        )
        return _ok(
            f"Added {user['full_name']} to project '{project['name']}'.",
            project=project["name"],
            user=user["full_name"],
        )

    async def log_hours(self, task_title: str, hours: float, note: str = "") -> dict:
        task = await self._find_task_by_title(task_title)
        if not task:
            return _err(f"No task found matching '{task_title}'.")
        if hours <= 0 or hours > 24:
            return _err("Hours must be between 0 and 24.")
        log_entry = {
            "user_id": self.user["_id"],
            "hours": hours,
            "note": note.strip(),
            "logged_at": datetime.now(timezone.utc),
        }
        await self.db.tasks.update_one(
            {"_id": task["_id"]},
            {
                "$push": {"hours_log": log_entry},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )
        return _ok(
            f"Logged {hours}h on task '{task['title']}'.",
            task=task["title"],
            hours=hours,
        )

    async def comment_task(self, task_title: str, comment: str) -> dict:
        if not comment or not comment.strip():
            return _err("Comment cannot be empty.")
        task = await self._find_task_by_title(task_title)
        if not task:
            return _err(f"No task found matching '{task_title}'.")
        comment_doc = {
            "user_id": self.user["_id"],
            "author": self.user.get("full_name", "Unknown"),
            "text": comment.strip(),
            "created_at": datetime.now(timezone.utc),
        }
        await self.db.tasks.update_one(
            {"_id": task["_id"]},
            {
                "$push": {"comments": comment_doc},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )
        return _ok(
            f"Comment added to task '{task['title']}'.",
            task=task["title"],
            comment=comment.strip(),
        )

    async def review_report(self, employee_name: str, comment: str = "") -> dict:
        allowed = {"ceo", "coo", "pm", "team_lead"}
        if self.role not in allowed:
            return _err(f"Only managers can review reports. Your role: '{self.role}'.")
        emp = await self._find_user_by_name(employee_name)
        if not emp:
            return _err(f"No user found matching '{employee_name}'.")
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        report = await self.db.daily_reports.find_one({
            "user_id": emp["_id"],
            "report_date": {"$gte": today},
        })
        if not report:
            return _err(f"{emp['full_name']} has not submitted a report today.")
        await self.db.daily_reports.update_one(
            {"_id": report["_id"]},
            {"$set": {
                "is_reviewed": True,
                "reviewed_by": self.user["_id"],
                "review_comment": comment.strip(),
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        return _ok(
            f"Report by {emp['full_name']} marked as reviewed.",
            employee=emp["full_name"],
            comment=comment.strip(),
        )

    async def mark_notifications_read(self) -> dict:
        result = await self.db.notifications.update_many(
            {"user_id": self.user["_id"], "is_read": False},
            {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc)}},
        )
        return _ok(
            f"Marked {result.modified_count} notification(s) as read.",
            count=result.modified_count,
        )

    async def update_user(
        self,
        user_name: str,
        full_name: str = None,
        department: str = None,
        phone: str = None,
    ) -> dict:
        # Users can update their own profile; managers can update others
        is_self = user_name.lower().strip() in (
            self.user.get("full_name", "").lower(),
            "me", "myself", "my profile",
        )
        if not is_self and self.role not in {"ceo", "coo", "pm"}:
            return _err(f"Only PM or above can update other users' profiles. Your role: '{self.role}'.")
        if is_self:
            target = self.user
        else:
            target = await self._find_user_by_name(user_name)
        if not target:
            return _err(f"No user found matching '{user_name}'.")
        updates: dict = {"updated_at": datetime.now(timezone.utc)}
        if full_name:
            updates["full_name"] = full_name.strip()
        if department:
            updates["department"] = department.strip()
        if phone:
            updates["phone"] = phone.strip()
        if len(updates) == 1:
            return _err("No valid fields to update. Supported: full_name, department, phone.")
        await self.db.users.update_one({"_id": target["_id"]}, {"$set": updates})
        return _ok(
            f"User '{target['full_name']}' updated.",
            user=target["full_name"],
            updates={k: v for k, v in updates.items() if k != "updated_at"},
        )

    async def change_password(self, old_password: str, new_password: str) -> dict:
        """Any user can change their own password."""
        if not old_password or not new_password:
            return _err("Both current and new password are required.")
        if len(new_password) < 8:
            return _err("New password must be at least 8 characters.")
        user = await self.db.users.find_one({"_id": self.user["_id"]})
        if not user:
            return _err("User session expired. Please log in again.")
        if not pwd_context.verify(old_password, user.get("hashed_password", "")):
            return _err("Current password is incorrect.")
        hashed = pwd_context.hash(new_password)
        await self.db.users.update_one(
            {"_id": self.user["_id"]},
            {"$set": {"hashed_password": hashed, "updated_at": datetime.now(timezone.utc)}},
        )
        return _ok("Password changed successfully. Please use your new password next time you log in.")

    async def delete_report(self, date_str: str = None) -> dict:
        """Delete the current user's own daily report (today by default)."""
        if date_str and date_str.strip():
            target_date = _parse_due_date(date_str)
        else:
            target_date = None
        if not target_date:
            target_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        next_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        report = await self.db.daily_reports.find_one({
            "user_id": self.user["_id"],
            "report_date": {"$gte": target_date.replace(hour=0, minute=0, second=0, microsecond=0), "$lt": next_day},
        })
        if not report:
            return _err(f"No report found for {target_date.strftime('%Y-%m-%d')}.")
        await self.db.daily_reports.delete_one({"_id": report["_id"]})
        return _ok(
            f"Report for {target_date.strftime('%Y-%m-%d')} deleted.",
            date=target_date.strftime("%Y-%m-%d"),
        )

    async def activate_user(self, user_name: str) -> dict:
        """Reactivate a deactivated user account."""
        allowed = {"ceo", "coo", "pm", "team_lead"}
        if self.role not in allowed:
            return _err(f"Only managers can activate users. Your role: '{self.role}'.")
        target = await self.db.users.find_one(
            {"full_name": {"$regex": user_name.strip(), "$options": "i"}}
        )
        if not target:
            return _err(f"No user found matching '{user_name}'.")
        if target.get("is_active", True):
            return _err(f"User '{target['full_name']}' is already active.")
        await self.db.users.update_one(
            {"_id": target["_id"]},
            {"$set": {"is_active": True, "updated_at": datetime.now(timezone.utc)}},
        )
        return _ok(
            f"User '{target['full_name']}' has been reactivated.",
            user=target["full_name"],
            email=target.get("email", ""),
            role=target.get("primary_role", ""),
        )

    async def remove_project_member(self, project_name: str, user_name: str) -> dict:
        """Remove a user from a project's member list."""
        perm = self._check_permission("assign_task")
        if perm:
            return perm
        project = await self._find_project_by_name(project_name)
        if not project:
            return _err(f"No project found matching '{project_name}'.")
        user = await self._find_user_by_name(user_name)
        if not user:
            return _err(f"No user found matching '{user_name}'.")
        if user["_id"] not in project.get("member_ids", []):
            return _err(f"{user['full_name']} is not a member of '{project['name']}'.")
        await self.db.projects.update_one(
            {"_id": project["_id"]},
            {"$pull": {"member_ids": user["_id"]}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        )
        return _ok(
            f"Removed {user['full_name']} from project '{project['name']}'.",
            project=project["name"],
            user=user["full_name"],
        )
