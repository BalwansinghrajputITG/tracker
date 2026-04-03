"""
Builds rich context from the database to inject into Groq prompts.
Integrates PageIndex-style hierarchical document indexing for report RAG.
"""
import asyncio
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
import json
import logging

from utils.repo import fetch_commits
from utils.token_encrypt import decrypt_token

logger = logging.getLogger(__name__)


class ContextBuilder:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    @staticmethod
    def _ser(doc: dict) -> dict:
        """Serialize a MongoDB document: ObjectId → str, datetime → ISO string."""
        from bson import ObjectId
        from datetime import datetime
        out = {}
        for k, v in doc.items():
            if isinstance(v, ObjectId):
                out[k] = str(v)
            elif isinstance(v, datetime):
                out[k] = v.isoformat()
            elif isinstance(v, list):
                out[k] = [
                    str(i) if isinstance(i, ObjectId) else
                    i.isoformat() if isinstance(i, datetime) else i
                    for i in v
                ]
            else:
                out[k] = v
        return out

    async def build_context_for_command(self, command: str, args: list[str], user: dict) -> str:
        """Route command to the appropriate context builder."""
        builders = {
            "delayed":   self._delayed_projects_context,
            "reports":   self._reports_context,
            "project":   self._project_context,
            "team":      self._team_context,
            "employees": self._employees_list_context,
            "employee":  self._employee_context,
            "blockers":  self._blockers_context,
            "stats":     self._stats_context,
            "tasks":     self._tasks_context,
            "help":      self._help_context,
            "dashboard":           self._dashboard_context,
            "notifications":       self._notifications_context,
            "commits":             self._commits_context,
            "missing-reports":     self._missing_reports_context,
            "analytics":           self._analytics_context,
            "contributor-stats":   self._contributor_stats_context,
        }
        builder = builders.get(command, self._general_context)
        return await builder(args, user)

    async def _delayed_projects_context(self, args, user) -> str:
        from utils.team_scope import get_team_project_ids
        role = user.get("primary_role", "employee")
        query: dict = {"is_delayed": True, "status": {"$nin": ["completed", "cancelled"]}}
        if role == "team_lead":
            project_ids = await get_team_project_ids(self.db, user)
            query["_id"] = {"$in": project_ids}
        elif role == "pm":
            query["pm_id"] = user["_id"]

        cursor = self.db.projects.find(
            query,
            {"name": 1, "delay_reason": 1, "due_date": 1, "progress_percentage": 1, "pm_id": 1}
        ).limit(20)
        projects = []
        async for p in cursor:
            pm = await self.db.users.find_one({"_id": p.get("pm_id")}, {"full_name": 1})
            projects.append({
                "name": p["name"],
                "pm": pm["full_name"] if pm else "Unknown",
                "due_date": str(p.get("due_date", "N/A")),
                "progress": f"{p.get('progress_percentage', 0)}%",
                "delay_reason": p.get("delay_reason", "Not specified"),
            })
        return f"DELAYED PROJECTS DATA:\n{json.dumps(projects, indent=2, default=str)}"

    async def _reports_context(self, args, user) -> str:
        from utils.team_scope import get_team_member_ids
        role = user.get("primary_role", "employee")
        query: dict = {}

        # Role-based scoping
        if role == "employee":
            query["user_id"] = user["_id"]
        elif role == "team_lead":
            member_ids = await get_team_member_ids(self.db, user)
            query["user_id"] = {"$in": member_ids}
        # exec/pm see all by default

        # Optional employee name filter from args
        if args:
            search = args[0]
            emp = await self.db.users.find_one(
                {"full_name": {"$regex": search, "$options": "i"}},
                {"_id": 1, "full_name": 1}
            )
            if emp:
                query["user_id"] = emp["_id"]

        # Default: last 7 days
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        query["report_date"] = {"$gte": week_ago}

        cursor = self.db.daily_reports.find(query).sort("report_date", -1).limit(10)
        reports = []
        async for r in cursor:
            emp = await self.db.users.find_one({"_id": r["user_id"]}, {"full_name": 1})
            structured = r.get("structured_data", {})
            reports.append({
                "employee": emp["full_name"] if emp else str(r["user_id"]),
                "date": str(r.get("report_date", "")),
                "hours_worked": structured.get("hours_worked", 0),
                "tasks_completed": len(structured.get("tasks_completed", [])),
                "blockers": structured.get("blockers", []),
                "mood": r.get("mood", ""),
                "notes": r.get("unstructured_notes", "")[:200],
            })

        return f"DAILY REPORTS DATA:\n{json.dumps(reports, indent=2, default=str)}"

    async def _project_context(self, args, user) -> str:
        from utils.team_scope import get_team_project_ids
        role = user.get("primary_role", "employee")

        # No specific project — list all accessible projects
        if not args:
            query: dict = {}
            if role == "pm":
                query["pm_id"] = user["_id"]
            elif role == "team_lead":
                project_ids = await get_team_project_ids(self.db, user)
                query["_id"] = {"$in": project_ids}
            elif role == "employee":
                query["member_ids"] = user["_id"]

            cursor = self.db.projects.find(query, {
                "name": 1, "status": 1, "priority": 1, "progress_percentage": 1,
                "is_delayed": 1, "due_date": 1, "pm_id": 1, "member_ids": 1,
            }).sort("due_date", 1).limit(30)

            projects = []
            async for p in cursor:
                pm = await self.db.users.find_one({"_id": p.get("pm_id")}, {"full_name": 1})
                projects.append({
                    "name": p["name"],
                    "status": p.get("status", "unknown"),
                    "priority": p.get("priority", "medium"),
                    "progress": f"{p.get('progress_percentage', 0)}%",
                    "is_delayed": p.get("is_delayed", False),
                    "due_date": str(p.get("due_date", "N/A")),
                    "pm": pm["full_name"] if pm else "Unassigned",
                    "members": len(p.get("member_ids", [])),
                })

            total = await self.db.projects.count_documents(query)
            result = {"total": total, "showing": len(projects), "projects": projects}
            return f"ALL PROJECTS DATA:\n{json.dumps(result, indent=2, default=str)}"

        # Specific project by name
        project = await self.db.projects.find_one(
            {"name": {"$regex": args[0], "$options": "i"}}
        )
        if not project:
            return f"No project found matching '{args[0]}'."

        # PM
        pm = await self.db.users.find_one({"_id": project.get("pm_id")}, {"full_name": 1, "email": 1})

        # Members — resolve ObjectId list to names
        member_docs = await self.db.users.find(
            {"_id": {"$in": project.get("member_ids", [])}},
            {"full_name": 1, "email": 1, "primary_role": 1, "department": 1},
        ).to_list(100)
        members_list = [
            {
                "name": m["full_name"],
                "email": m.get("email", ""),
                "role": m.get("primary_role", ""),
                "department": m.get("department", ""),
            }
            for m in member_docs
        ]

        # Teams attached to this project
        team_docs = await self.db.teams.find(
            {"_id": {"$in": project.get("team_ids", [])}},
            {"name": 1, "department": 1},
        ).to_list(20)
        teams_list = [{"name": t["name"], "department": t.get("department", "")} for t in team_docs]

        # Tasks — full list with assignees
        task_docs = await self.db.tasks.find(
            {"project_id": project["_id"]},
            {"title": 1, "status": 1, "priority": 1, "due_date": 1, "assignee_ids": 1, "is_blocked": 1},
        ).sort("due_date", 1).to_list(50)

        tasks_list = []
        for t in task_docs:
            assignee_docs = await self.db.users.find(
                {"_id": {"$in": t.get("assignee_ids", [])}},
                {"full_name": 1},
            ).to_list(10)
            tasks_list.append({
                "title": t["title"],
                "status": t.get("status", "todo"),
                "priority": t.get("priority", "medium"),
                "due_date": str(t.get("due_date", "")),
                "assignees": [a["full_name"] for a in assignee_docs],
                "is_blocked": t.get("is_blocked", False),
            })

        # Task breakdown by status
        task_pipeline = [
            {"$match": {"project_id": project["_id"]}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        task_stats = await self.db.tasks.aggregate(task_pipeline).to_list(10)

        # Repository + commits
        repo_url = project.get("repo_url", "")
        _stored_token = project.get("repo_token", "")
        repo_token = decrypt_token(_stored_token)
        repo_info: dict = {"url": repo_url, "has_token": bool(_stored_token), "commit_count": 0, "recent_commits": [], "error": None}
        if repo_url:
            try:
                commit_result = await fetch_commits(repo_url, project_token=repo_token)
                repo_info["commit_count"] = commit_result["total"]
                repo_info["recent_commits"] = [
                    {"sha": c["sha"], "author": c["author"], "message": c["message"], "date": c["date"]}
                    for c in commit_result["commits"][:10]
                ]
                repo_info["error"] = commit_result.get("error")
            except Exception as exc:
                logger.warning("context_builder: commit fetch failed for %s: %s", repo_url, exc)
                repo_info["error"] = str(exc)

        data = {
            "name": project["name"],
            "description": project.get("description", ""),
            "status": project["status"],
            "priority": project.get("priority", "medium"),
            "progress": f"{project.get('progress_percentage', 0)}%",
            "is_delayed": project.get("is_delayed", False),
            "delay_reason": project.get("delay_reason", ""),
            "start_date": str(project.get("start_date", "")),
            "due_date": str(project.get("due_date", "")),
            "completed_at": str(project.get("completed_at", "")) if project.get("completed_at") else None,
            "pm": {"name": pm["full_name"], "email": pm.get("email", "")} if pm else "Unassigned",
            "repository": repo_info,
            "teams": teams_list,
            "member_count": len(members_list),
            "members": members_list,
            "task_summary": {t["_id"]: t["count"] for t in task_stats},
            "tasks": tasks_list,
            "milestones": project.get("milestones", []),
            "tags": project.get("tags", []),
            "budget": project.get("budget", {}),
            "figma_url": project.get("figma_url", ""),
            "links": project.get("links", []),
        }
        return f"PROJECT DATA:\n{json.dumps(data, indent=2, default=str)}"

    async def _team_context(self, args, user) -> str:
        role = user.get("primary_role", "employee")
        # No specific team — list accessible teams
        if not args:
            team_query: dict = {"is_active": {"$ne": False}}
            if role not in ("ceo", "coo", "pm"):
                # team_lead and employees only see their own teams
                team_ids = user.get("team_ids", [])
                team_query["_id"] = {"$in": team_ids}

            cursor = self.db.teams.find(team_query, {
                "name": 1, "department": 1, "member_ids": 1,
                "project_ids": 1, "lead_id": 1,
            }).sort("name", 1)
            teams = []
            async for t in cursor:
                lead = await self.db.users.find_one({"_id": t.get("lead_id")}, {"full_name": 1})
                teams.append({
                    "name": t["name"],
                    "department": t.get("department", ""),
                    "lead": lead["full_name"] if lead else "Unassigned",
                    "members": len(t.get("member_ids", [])),
                    "projects": len(t.get("project_ids", [])),
                })
            total = len(teams)
            result = {"total_teams": total, "teams": teams}
            return f"ALL TEAMS DATA:\n{json.dumps(result, indent=2, default=str)}"

        # Specific team by name
        team = await self.db.teams.find_one({"name": {"$regex": args[0], "$options": "i"}})
        if not team:
            return f"No team found matching '{args[0]}'."

        # Lead, PM
        lead = await self.db.users.find_one({"_id": team.get("lead_id")}, {"full_name": 1, "email": 1})
        pm   = await self.db.users.find_one({"_id": team.get("pm_id")},   {"full_name": 1, "email": 1})

        # Members — full profiles
        member_docs = await self.db.users.find(
            {"_id": {"$in": team.get("member_ids", [])}},
            {"full_name": 1, "email": 1, "primary_role": 1, "department": 1, "is_active": 1},
        ).to_list(100)
        members_list = [
            {
                "name": m["full_name"],
                "email": m.get("email", ""),
                "role": m.get("primary_role", ""),
                "department": m.get("department", ""),
                "active": m.get("is_active", True),
            }
            for m in member_docs
        ]

        # Projects this team is attached to (include repo + commit count)
        project_docs = await self.db.projects.find(
            {"_id": {"$in": team.get("project_ids", [])}},
            {"name": 1, "status": 1, "priority": 1, "progress_percentage": 1,
             "due_date": 1, "is_delayed": 1, "repo_url": 1, "repo_token": 1},
        ).to_list(20)

        # Fetch commit counts for all projects concurrently (cap at 10 projects)
        async def _project_with_commits(p: dict) -> dict:
            repo_url = p.get("repo_url", "")
            _stored_tok = p.get("repo_token", "")
            repo_token = decrypt_token(_stored_tok)
            commit_count = 0
            repo_error = None
            if repo_url:
                try:
                    result = await fetch_commits(repo_url, project_token=repo_token)
                    commit_count = result["total"]
                    repo_error = result.get("error")
                except Exception as exc:
                    repo_error = str(exc)
            return {
                "name": p["name"],
                "status": p.get("status", ""),
                "priority": p.get("priority", ""),
                "progress": f"{p.get('progress_percentage', 0)}%",
                "due_date": str(p.get("due_date", "")),
                "is_delayed": p.get("is_delayed", False),
                "repository": {
                    "url": repo_url,
                    "has_token": bool(_stored_tok),
                    "commit_count": commit_count,
                    "error": repo_error,
                },
            }

        projects_list = await asyncio.gather(*[_project_with_commits(p) for p in project_docs[:10]])
        projects_list = list(projects_list)

        # Open tasks assigned to any team member
        open_tasks = await self.db.tasks.count_documents({
            "assignee_ids": {"$in": team.get("member_ids", [])},
            "status": {"$nin": ["done", "cancelled"]},
        })

        data = {
            "name": team["name"],
            "description": team.get("description", ""),
            "department": team.get("department", ""),
            "lead": {"name": lead["full_name"], "email": lead.get("email", "")} if lead else "Unassigned",
            "project_manager": {"name": pm["full_name"], "email": pm.get("email", "")} if pm else "Unassigned",
            "member_count": len(members_list),
            "members": members_list,
            "project_count": len(projects_list),
            "projects": projects_list,
            "open_tasks_across_team": open_tasks,
            "created_at": str(team.get("created_at", "")),
        }
        return f"TEAM DATA:\n{json.dumps(data, indent=2, default=str)}"

    async def _employee_context(self, args, user) -> str:
        if not args:
            return "Please specify an employee name."
        emp = await self.db.users.find_one(
            {"full_name": {"$regex": args[0], "$options": "i"}, "is_active": True},
        )
        if not emp:
            return f"Employee '{args[0]}' not found."

        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        recent_reports = await self.db.daily_reports.find(
            {"user_id": emp["_id"], "report_date": {"$gte": week_ago}}
        ).to_list(7)

        task_count = await self.db.tasks.count_documents({
            "assignee_ids": emp["_id"],
            "status": {"$ne": "done"},
        })

        # ── Commits filtered to this employee only ────────────────────────────
        emp_email = (emp.get("email") or "").lower().strip()
        emp_name  = (emp.get("full_name") or "").lower().strip()

        # Find every project this employee is a member of that has a repo
        project_docs = await self.db.projects.find(
            {"member_ids": emp["_id"], "repo_url": {"$exists": True, "$ne": ""}},
            {"repo_url": 1, "repo_token": 1, "name": 1},
        ).to_list(50)

        import asyncio as _asyncio
        repos_checked: set = set()
        emp_commits: list = []

        async def _collect(repo_url: str, repo_token: str, project_name: str):
            if not repo_url or repo_url in repos_checked:
                return
            repos_checked.add(repo_url)
            try:
                result = await fetch_commits(
                    repo_url,
                    project_token=repo_token,
                    per_page=100,
                    author_email=emp_email,
                )
                for c in result.get("commits", []):
                    commit_email  = (c.get("email")  or "").lower().strip()
                    commit_author = (c.get("author") or "").lower().strip()
                    email_match = emp_email and commit_email == emp_email
                    name_match  = emp_name  and commit_author == emp_name
                    if email_match or name_match:
                        emp_commits.append({
                            "project": project_name,
                            "sha":     c.get("sha", ""),
                            "message": (c.get("message") or "").split("\n")[0][:80],
                            "date":    c.get("date", ""),
                        })
            except Exception:
                pass

        await _asyncio.gather(*[
            _collect(p.get("repo_url", ""), decrypt_token(p.get("repo_token", "")), p.get("name", ""))
            for p in project_docs
        ])

        emp_commits.sort(key=lambda c: c.get("date", ""), reverse=True)

        data = {
            "name": emp["full_name"],
            "email": emp.get("email", ""),
            "department": emp.get("department", ""),
            "roles": emp.get("roles", []),
            "reports_last_7_days": len(recent_reports),
            "open_tasks": task_count,
            "avg_hours_per_day": round(
                sum(r.get("structured_data", {}).get("hours_worked", 0) for r in recent_reports) / max(len(recent_reports), 1),
                1
            ),
            "total_commits": len(emp_commits),
            "recent_commits": emp_commits[:10],
        }
        return f"EMPLOYEE DATA:\n{json.dumps(data, indent=2, default=str)}"

    async def _blockers_context(self, args, user) -> str:
        from utils.team_scope import get_team_project_ids
        role = user.get("primary_role", "employee")
        query: dict = {"is_blocked": True, "status": {"$ne": "done"}}
        if role == "team_lead":
            project_ids = await get_team_project_ids(self.db, user)
            query["project_id"] = {"$in": project_ids}
        elif role == "pm":
            pm_projects = await self.db.projects.find({"pm_id": user["_id"]}, {"_id": 1}).to_list(100)
            query["project_id"] = {"$in": [p["_id"] for p in pm_projects]}
        elif role == "employee":
            query["assignee_ids"] = user["_id"]

        cursor = self.db.tasks.find(
            query,
            {"title": 1, "blocked_reason": 1, "project_id": 1, "assignee_ids": 1}
        ).limit(20)
        blockers = []
        async for t in cursor:
            project = await self.db.projects.find_one({"_id": t.get("project_id")}, {"name": 1})
            blockers.append({
                "task": t["title"],
                "project": project["name"] if project else "Unknown",
                "reason": t.get("blocked_reason", ""),
            })
        return f"ACTIVE BLOCKERS:\n{json.dumps(blockers, indent=2, default=str)}"

    async def _stats_context(self, args, user) -> str:
        from utils.team_scope import get_team_project_ids, get_team_member_ids
        role = user.get("primary_role", "employee")
        now = datetime.now(timezone.utc)
        month_ago = now - timedelta(days=30)

        if role == "team_lead":
            project_ids = await get_team_project_ids(self.db, user)
            member_ids = await get_team_member_ids(self.db, user)
            total_projects = len(project_ids)
            active_projects = await self.db.projects.count_documents({"_id": {"$in": project_ids}, "status": "active"})
            delayed = await self.db.projects.count_documents({"_id": {"$in": project_ids}, "is_delayed": True, "status": "active"})
            reports_month = await self.db.daily_reports.count_documents({
                "user_id": {"$in": member_ids},
                "report_date": {"$gte": month_ago},
            })
            data = {
                "scope": "your teams",
                "team_projects": total_projects,
                "active_projects": active_projects,
                "delayed_projects": delayed,
                "delay_rate": f"{round(delayed/active_projects*100, 1) if active_projects else 0}%",
                "team_members": len(member_ids),
                "reports_last_30_days": reports_month,
                "avg_reports_per_member": round(reports_month / max(len(member_ids), 1), 1),
            }
        else:
            proj_query: dict = {} if role in ("ceo", "coo") else {"pm_id": user["_id"]}
            total_projects = await self.db.projects.count_documents(proj_query)
            active_projects = await self.db.projects.count_documents({**proj_query, "status": "active"})
            delayed = await self.db.projects.count_documents({**proj_query, "is_delayed": True, "status": "active"})
            reports_month = await self.db.daily_reports.count_documents({"report_date": {"$gte": month_ago}})
            employees = await self.db.users.count_documents({"is_active": True, "roles": "employee"})
            data = {
                "scope": "company-wide" if role in ("ceo", "coo") else "your projects",
                "total_projects": total_projects,
                "active_projects": active_projects,
                "delayed_projects": delayed,
                "delay_rate": f"{round(delayed/active_projects*100, 1) if active_projects else 0}%",
                "reports_last_30_days": reports_month,
                "total_employees": employees,
                "avg_reports_per_employee": round(reports_month / max(employees, 1), 1),
            }
        return f"COMPANY STATS:\n{json.dumps(data, indent=2, default=str)}"

    async def _tasks_context(self, args, user) -> str:
        query: dict = {"status": {"$ne": "done"}}

        # Filter by project name if provided
        if args:
            # Try treating first arg as a status keyword
            status_map = {
                "todo": "todo", "in_progress": "in_progress", "in progress": "in_progress",
                "review": "review", "blocked": "blocked", "done": "done",
            }
            arg_lower = args[0].lower()
            if arg_lower in status_map:
                query = {"status": status_map[arg_lower]}
            else:
                # Treat as project name
                project = await self.db.projects.find_one(
                    {"name": {"$regex": args[0], "$options": "i"}}, {"_id": 1, "name": 1}
                )
                if project:
                    query["project_id"] = project["_id"]

        # Role-based scoping
        role = user.get("primary_role", "employee")
        if role == "team_lead":
            from utils.team_scope import get_team_project_ids
            project_ids = await get_team_project_ids(self.db, user)
            # Merge with any existing project_id filter
            if "project_id" not in query:
                query["project_id"] = {"$in": project_ids}
        elif role not in ("ceo", "coo", "pm"):
            query["assignee_ids"] = user["_id"]

        cursor = self.db.tasks.find(query, {
            "title": 1, "status": 1, "priority": 1, "due_date": 1,
            "project_id": 1, "assignee_ids": 1, "is_blocked": 1, "blocked_reason": 1,
        }).sort("due_date", 1).limit(25)

        tasks = []
        async for t in cursor:
            project = await self.db.projects.find_one({"_id": t.get("project_id")}, {"name": 1})
            assignees = await self.db.users.find(
                {"_id": {"$in": t.get("assignee_ids", [])}}, {"full_name": 1}
            ).to_list(5)
            tasks.append({
                "title": t["title"],
                "status": t["status"],
                "priority": t.get("priority", "medium"),
                "project": project["name"] if project else "Unknown",
                "assignees": [a["full_name"] for a in assignees],
                "due_date": str(t.get("due_date", "N/A")),
                "is_blocked": t.get("is_blocked", False),
                "blocked_reason": t.get("blocked_reason", "") if t.get("is_blocked") else None,
            })

        total = await self.db.tasks.count_documents(query)
        result = {
            "showing": len(tasks),
            "total_matching": total,
            "tasks": tasks,
        }
        return f"TASKS DATA:\n{json.dumps(result, indent=2, default=str)}"

    async def _employees_list_context(self, args, user) -> str:
        """Return a full list of all active employees with key details."""
        role = user.get("primary_role", "employee")

        # Role-based scoping
        query: dict = {"is_active": True}
        if role == "team_lead":
            from utils.team_scope import get_team_member_ids
            member_ids = await get_team_member_ids(self.db, user)
            query["_id"] = {"$in": member_ids}
        elif role not in ("ceo", "coo", "pm"):
            # Employees only see their direct colleagues in the same teams
            team_ids = user.get("team_ids", [])
            if team_ids:
                query["team_ids"] = {"$in": team_ids}
            else:
                query["_id"] = user["_id"]

        # Filter by department if provided
        if args:
            query["department"] = {"$regex": args[0], "$options": "i"}

        cursor = self.db.users.find(query, {
            "full_name": 1, "email": 1, "department": 1,
            "primary_role": 1, "roles": 1, "is_active": 1, "last_seen": 1,
        }).sort("full_name", 1)

        employees = []
        async for u in cursor:
            open_tasks = await self.db.tasks.count_documents({
                "assignee_ids": u["_id"],
                "status": {"$ne": "done"},
            })
            week_ago = datetime.now(timezone.utc) - timedelta(days=7)
            reports_this_week = await self.db.daily_reports.count_documents({
                "user_id": u["_id"],
                "report_date": {"$gte": week_ago},
            })
            employees.append({
                "name": u["full_name"],
                "email": u.get("email", ""),
                "department": u.get("department", ""),
                "role": u.get("primary_role", ""),
                "open_tasks": open_tasks,
                "reports_this_week": reports_this_week,
                "last_seen": str(u.get("last_seen", "N/A")),
            })

        total = len(employees)
        dept_counts: dict = {}
        for e in employees:
            dept = e["department"] or "Unknown"
            dept_counts[dept] = dept_counts.get(dept, 0) + 1

        result = {
            "total_employees": total,
            "by_department": dept_counts,
            "employees": employees,
        }
        return f"ALL EMPLOYEES DATA:\n{json.dumps(result, indent=2, default=str)}"

    async def _help_context(self, args, user) -> str:
        return (
            "AVAILABLE COMMANDS:\n\n"
            "── READ / VIEW ──\n"
            "/project [name]              - All projects or details of a specific one (with links, figma, repo, members, tasks)\n"
            "/tasks [project|status]      - Task list with optional filter\n"
            "/team [name]                 - All teams or details of a specific team\n"
            "/employee [name]             - Employee profile, tasks, reports\n"
            "/employees                   - List all employees\n"
            "/delayed                     - All delayed/overdue projects\n"
            "/blockers                    - All active task blockers\n"
            "/reports [employee]          - Daily reports (last 7 days)\n"
            "/stats                       - Company-wide KPIs\n"
            "/analytics                   - Full company analytics (projects, tasks, departments, compliance)\n"
            "/contributor-stats <project> - GitHub/GitLab contributor stats for a project\n"
            "/commits <project>           - Repository commit info\n"
            "/dashboard                   - Your role-based dashboard snapshot\n"
            "/notifications               - Your notifications\n"
            "/missing-reports             - Employees who haven't reported today\n"
            "/message [name] [text]       - Send direct message\n\n"
            "── PROJECTS ──\n"
            "/create-project <name> [--desc text] [--priority p] [--due date] [--repo url] [--figma url] [--members n1,n2] [--teams t1,t2] [--tags t1,t2]\n"
            "/edit-project <name> [--status s] [--priority p] [--progress n] [--due date] [--desc text] [--repo url] [--figma url] [--pm name] [--add-members n1,n2] [--remove-members n1,n2]\n"
            "/cancel-project <name>       - Cancel a project\n"
            "/update-progress <name> <%>  - Set project progress\n"
            "/add-project-member <project> <user>\n"
            "/remove-project-member <project> <user>\n\n"
            "── TASKS ──\n"
            "/create-task <title> [project] [--priority p] [--due date] [--assignees a,b]\n"
            "/update-task <title> <status>  - Update task status\n"
            "/edit-task <title> [--title t] [--priority p] [--due date] [--assignees a,b]\n"
            "/assign-task <title> <user>\n"
            "/mark-blocked <task> [reason]\n"
            "/mark-unblocked <task>\n"
            "/log-hours <task> <hours>\n"
            "/comment-task <task> -- <comment>\n\n"
            "── TEAMS ──\n"
            "/create-team <name> [--lead name] [--pm name] [--members n1,n2]\n"
            "/edit-team <name> [--name n] [--dept d] [--lead name] [--pm name]\n"
            "/delete-team <name>\n"
            "/add-member <team> <user>\n"
            "/remove-member <team> <user>\n\n"
            "── USERS ──\n"
            "/create-user <name> <email> <password> <department> <role>\n"
            "/update-user <name> [--name n] [--dept d] [--phone p]\n"
            "/delete-user <name>          - Deactivate user\n"
            "/activate-user <name>        - Reactivate deactivated user\n\n"
            "── REPORTS ──\n"
            "/submit-report [hours] [--project name] [--tasks t1,t2] [--planned t1,t2] [--blockers b] [--mood good] [--notes text]\n"
            "/review-report <employee> [-- comment]\n"
            "/delete-report [date]        - Delete your own report\n\n"
            "── ACCOUNT ──\n"
            "/change-password <old> <new>\n"
            "/mark-read                   - Mark all notifications as read\n\n"
            "Use natural language too: 'Show me delayed projects', 'Who hasn't reported today?', 'What tasks are blocked?'"
        )

    async def _dashboard_context(self, args, user) -> str:
        role = user.get("primary_role", "employee")
        now = datetime.now(timezone.utc)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)

        if role in ("ceo", "coo"):
            total_projects = await self.db.projects.count_documents({})
            active_projects = await self.db.projects.count_documents({"status": "active"})
            delayed = await self.db.projects.count_documents({"is_delayed": True, "status": "active"})
            total_employees = await self.db.users.count_documents({"is_active": True})
            reports_today = await self.db.daily_reports.count_documents({"report_date": {"$gte": today}})
            blocked_tasks = await self.db.tasks.count_documents({"is_blocked": True, "status": {"$ne": "done"}})
            data = {
                "role": role,
                "total_projects": total_projects,
                "active_projects": active_projects,
                "delayed_projects": delayed,
                "total_employees": total_employees,
                "reports_submitted_today": reports_today,
                "blocked_tasks": blocked_tasks,
            }
        elif role == "pm":
            my_projects = await self.db.projects.count_documents({"pm_id": user["_id"]})
            active = await self.db.projects.count_documents({"pm_id": user["_id"], "status": "active"})
            delayed = await self.db.projects.count_documents({"pm_id": user["_id"], "is_delayed": True})
            reports_today = await self.db.daily_reports.count_documents({"report_date": {"$gte": today}})
            data = {
                "role": role,
                "my_projects": my_projects,
                "active_projects": active,
                "delayed_projects": delayed,
                "reports_submitted_today": reports_today,
            }
        elif role == "team_lead":
            from utils.team_scope import get_team_project_ids, get_team_member_ids
            project_ids = await get_team_project_ids(self.db, user)
            member_ids = await get_team_member_ids(self.db, user)
            reports_today = await self.db.daily_reports.count_documents({
                "user_id": {"$in": member_ids},
                "report_date": {"$gte": today},
            })
            blocked = await self.db.tasks.count_documents({
                "project_id": {"$in": project_ids},
                "is_blocked": True,
            })
            data = {
                "role": role,
                "team_projects": len(project_ids),
                "team_members": len(member_ids),
                "reports_submitted_today": reports_today,
                "blocked_tasks": blocked,
            }
        else:
            my_tasks = await self.db.tasks.count_documents({"assignee_ids": user["_id"], "status": {"$ne": "done"}})
            submitted_today = await self.db.daily_reports.find_one({
                "user_id": user["_id"],
                "report_date": {"$gte": today},
            })
            notifs = await self.db.notifications.count_documents({"user_id": user["_id"], "is_read": False})
            data = {
                "role": role,
                "open_tasks": my_tasks,
                "report_submitted_today": submitted_today is not None,
                "unread_notifications": notifs,
            }
        return f"DASHBOARD DATA:\n{json.dumps(data, indent=2, default=str)}"

    async def _notifications_context(self, args, user) -> str:
        cursor = self.db.notifications.find(
            {"user_id": user["_id"]},
        ).sort("created_at", -1).limit(20)
        notifs = []
        async for n in cursor:
            notifs.append({
                "title": n.get("title", ""),
                "body": n.get("body", ""),
                "type": n.get("notification_type", ""),
                "is_read": n.get("is_read", False),
                "created_at": str(n.get("created_at", "")),
            })
        unread = sum(1 for n in notifs if not n["is_read"])
        result = {"total": len(notifs), "unread": unread, "notifications": notifs}
        return f"NOTIFICATIONS DATA:\n{json.dumps(result, indent=2, default=str)}"

    async def _commits_context(self, args, user) -> str:
        """
        /commits <project> [--author <name>]
        Fetches real commits from the project's repo.
        If --author is given, only that contributor's commits are returned.
        """
        if not args:
            return "Please specify a project name: /commits <project name>"

        # Parse optional --author flag
        author_filter = ""
        clean_args = []
        i = 0
        while i < len(args):
            if args[i] == "--author" and i + 1 < len(args):
                author_filter = args[i + 1].lower().strip()
                i += 2
            else:
                clean_args.append(args[i])
                i += 1

        project_name_query = " ".join(clean_args)
        project = await self.db.projects.find_one(
            {"name": {"$regex": project_name_query, "$options": "i"}}
        )
        if not project:
            return f"No project found matching '{project_name_query}'."

        repo_url   = project.get("repo_url", "")
        repo_token = decrypt_token(project.get("repo_token", ""))
        if not repo_url:
            return f"Project '{project['name']}' has no repository configured."

        # If an author name was given, look up their email for accurate filtering
        author_email = ""
        if author_filter:
            emp = await self.db.users.find_one(
                {"full_name": {"$regex": author_filter, "$options": "i"}, "is_active": True},
                {"full_name": 1, "email": 1},
            )
            if emp:
                author_email = (emp.get("email") or "").lower().strip()
                author_filter = (emp.get("full_name") or author_filter).lower().strip()

        try:
            result = await fetch_commits(
                repo_url,
                project_token=repo_token,
                per_page=100,
                author_email=author_email,
            )
        except Exception as exc:
            return f"Failed to fetch commits for '{project['name']}': {exc}"

        commits = result.get("commits", [])

        # Apply strict local filter when an author was requested
        if author_filter:
            filtered = []
            for c in commits:
                c_email  = (c.get("email")  or "").lower().strip()
                c_author = (c.get("author") or "").lower().strip()
                if (author_email and c_email == author_email) or (author_filter and c_author == author_filter):
                    filtered.append(c)
            commits = filtered

        recent = [
            {
                "sha":     c.get("sha", ""),
                "author":  c.get("author", ""),
                "message": (c.get("message") or "").split("\n")[0][:80],
                "date":    c.get("date", ""),
            }
            for c in commits[:20]
        ]

        data = {
            "project":       project["name"],
            "repo_url":      repo_url,
            "total_commits": len(commits),
            "filtered_by":   author_filter or "all contributors",
            "commits":       recent,
        }
        return f"COMMITS DATA:\n{json.dumps(data, indent=2, default=str)}"

    async def _missing_reports_context(self, args, user) -> str:
        role = user.get("primary_role", "employee")
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        query: dict = {"is_active": True, "primary_role": {"$in": ["employee", "team_lead"]}}
        if role == "team_lead":
            from utils.team_scope import get_team_member_ids
            member_ids = await get_team_member_ids(self.db, user)
            query["_id"] = {"$in": member_ids}
        all_employees = await self.db.users.find(query, {"full_name": 1, "department": 1}).to_list(200)
        submitted_ids = set()
        cursor = self.db.daily_reports.find({"report_date": {"$gte": today}}, {"user_id": 1})
        async for r in cursor:
            submitted_ids.add(str(r["user_id"]))
        missing = [
            {"name": e["full_name"], "department": e.get("department", "")}
            for e in all_employees
            if str(e["_id"]) not in submitted_ids
        ]
        result = {
            "date": today.strftime("%Y-%m-%d"),
            "total_employees": len(all_employees),
            "submitted": len(all_employees) - len(missing),
            "missing_count": len(missing),
            "missing": missing,
        }
        return f"MISSING REPORTS:\n{json.dumps(result, indent=2, default=str)}"

    async def get_structured_data(self, command: str, args: list[str], user: dict) -> dict | None:
        """
        Return raw entity records for the frontend interactive card UI.
        Returns {"type": str, "items": [...]} or None.
        """
        role = user.get("primary_role", "employee")

        # ── Projects ──────────────────────────────────────────────────────────────
        if command in ("project", "delayed"):
            from utils.team_scope import get_team_project_ids
            if command == "delayed":
                query: dict = {"is_delayed": True, "status": {"$nin": ["completed", "cancelled"]}}
                if role == "team_lead":
                    project_ids = await get_team_project_ids(self.db, user)
                    query["_id"] = {"$in": project_ids}
                elif role == "pm":
                    query["pm_id"] = user["_id"]
            else:
                query = {}
                if role == "pm":
                    query["pm_id"] = user["_id"]
                elif role == "team_lead":
                    project_ids = await get_team_project_ids(self.db, user)
                    query["_id"] = {"$in": project_ids}
                elif role == "employee":
                    query["member_ids"] = user["_id"]

            if args and command == "project":
                doc = await self.db.projects.find_one({"name": {"$regex": args[0], "$options": "i"}})
                if not doc:
                    return None
                doc["id"] = str(doc.pop("_id"))
                pm = await self.db.users.find_one({"_id": doc.get("pm_id")}, {"full_name": 1})
                doc["pm_name"] = pm["full_name"] if pm else "Unassigned"
                return {"type": "projects", "items": [self._ser(doc)]}

            cursor = self.db.projects.find(query).sort("due_date", 1).limit(20)
            items = []
            async for p in cursor:
                p["id"] = str(p.pop("_id"))
                pm = await self.db.users.find_one({"_id": p.get("pm_id")}, {"full_name": 1})
                p["pm_name"] = pm["full_name"] if pm else "Unassigned"
                items.append(self._ser(p))
            return {"type": "projects", "items": items} if items else None

        # ── Employees ─────────────────────────────────────────────────────────────
        if command in ("employees", "employee"):
            if args:
                doc = await self.db.users.find_one(
                    {"full_name": {"$regex": args[0], "$options": "i"}, "is_active": True},
                    {"password_hash": 0, "hashed_password": 0}
                )
                if not doc:
                    return None
                doc["id"] = str(doc.pop("_id"))
                return {"type": "users", "items": [self._ser(doc)]}

            query = {"is_active": True}
            if role == "team_lead":
                from utils.team_scope import get_team_member_ids
                allowed_ids = await get_team_member_ids(self.db, user)
                query["_id"] = {"$in": allowed_ids}

            cursor = self.db.users.find(query, {"password_hash": 0, "hashed_password": 0}).sort("full_name", 1).limit(50)
            items = []
            async for u in cursor:
                u["id"] = str(u.pop("_id"))
                items.append(self._ser(u))
            return {"type": "users", "items": items} if items else None

        # ── Teams ─────────────────────────────────────────────────────────────────
        if command == "team":
            if args:
                doc = await self.db.teams.find_one({"name": {"$regex": args[0], "$options": "i"}})
                if not doc:
                    return None
                doc["id"] = str(doc.pop("_id"))
                lead = await self.db.users.find_one({"_id": doc.get("lead_id")}, {"full_name": 1})
                doc["lead_name"] = lead["full_name"] if lead else "Unassigned"
                return {"type": "teams", "items": [self._ser(doc)]}

            team_q: dict = {"is_active": {"$ne": False}}
            if role not in ("ceo", "coo", "pm"):
                team_ids = user.get("team_ids", [])
                team_q["_id"] = {"$in": team_ids}
            cursor = self.db.teams.find(team_q).sort("name", 1)
            items = []
            async for t in cursor:
                t["id"] = str(t.pop("_id"))
                lead = await self.db.users.find_one({"_id": t.get("lead_id")}, {"full_name": 1})
                t["lead_name"] = lead["full_name"] if lead else "Unassigned"
                items.append(self._ser(t))
            return {"type": "teams", "items": items} if items else None

        # ── Reports ───────────────────────────────────────────────────────────────
        if command == "reports":
            query: dict = {}
            if role == "employee":
                query["user_id"] = user["_id"]
            elif role == "team_lead":
                from utils.team_scope import get_team_member_ids
                member_ids = await get_team_member_ids(self.db, user)
                query["user_id"] = {"$in": member_ids}

            if args:
                emp = await self.db.users.find_one(
                    {"full_name": {"$regex": args[0], "$options": "i"}}, {"_id": 1}
                )
                if emp:
                    query["user_id"] = emp["_id"]

            week_ago = datetime.now(timezone.utc) - timedelta(days=7)
            query["report_date"] = {"$gte": week_ago}

            cursor = self.db.daily_reports.find(query).sort("report_date", -1).limit(20)
            items = []
            async for r in cursor:
                r["id"] = str(r.pop("_id"))
                proj = await self.db.projects.find_one({"_id": r.get("project_id")}, {"name": 1})
                emp = await self.db.users.find_one({"_id": r.get("user_id")}, {"full_name": 1})
                r["project_name"] = proj["name"] if proj else "Unknown"
                r["employee_name"] = emp["full_name"] if emp else "Unknown"
                items.append(self._ser(r))
            return {"type": "reports", "items": items} if items else None

        # ── New read commands (no card needed) ───────────────────────────────────
        if command in ("dashboard", "notifications", "commits", "missing-reports",
                       "analytics", "contributor-stats", "stats", "blockers"):
            return None

        # ── Tasks ─────────────────────────────────────────────────────────────────
        if command == "tasks":
            query: dict = {"status": {"$ne": "done"}}
            if args:
                from bson import ObjectId
                arg_lower = args[0].lower()
                status_map = {"todo": "todo", "in_progress": "in_progress", "review": "review", "blocked": "blocked"}
                if arg_lower in status_map:
                    query = {"status": status_map[arg_lower]}
                else:
                    proj = await self.db.projects.find_one({"name": {"$regex": args[0], "$options": "i"}}, {"_id": 1})
                    if proj:
                        query["project_id"] = proj["_id"]

            if role not in ("ceo", "coo", "pm", "team_lead"):
                query["assignee_ids"] = user["_id"]

            cursor = self.db.tasks.find(query).sort("due_date", 1).limit(25)
            items = []
            async for t in cursor:
                t["id"] = str(t.pop("_id"))
                proj = await self.db.projects.find_one({"_id": t.get("project_id")}, {"name": 1})
                assignees = await self.db.users.find(
                    {"_id": {"$in": t.get("assignee_ids", [])}}, {"full_name": 1}
                ).to_list(5)
                t["project_name"] = proj["name"] if proj else "Unknown"
                t["assignee_names"] = [a["full_name"] for a in assignees]
                items.append(self._ser(t))
            return {"type": "tasks", "items": items} if items else None

        return None

    async def _analytics_context(self, args, user) -> str:
        """Company-wide analytics: project health, task metrics, department breakdown."""
        role = user.get("primary_role", "employee")
        if role not in ("ceo", "coo", "pm", "team_lead"):
            return "Analytics are available to managers only."

        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)

        # Project metrics
        total_projects = await self.db.projects.count_documents({})
        active_projects = await self.db.projects.count_documents({"status": "active"})
        completed_projects = await self.db.projects.count_documents({"status": "completed"})
        delayed_projects = await self.db.projects.count_documents({"is_delayed": True, "status": "active"})
        completion_rate = round(completed_projects / max(total_projects, 1) * 100, 1)

        # Task metrics
        total_tasks = await self.db.tasks.count_documents({})
        done_tasks = await self.db.tasks.count_documents({"status": "done"})
        blocked_tasks = await self.db.tasks.count_documents({"is_blocked": True, "status": {"$ne": "done"}})
        overdue_tasks = await self.db.tasks.count_documents({
            "status": {"$ne": "done"},
            "due_date": {"$lt": now},
        })
        task_completion_rate = round(done_tasks / max(total_tasks, 1) * 100, 1)

        # Report compliance (last 30 days)
        total_employees = await self.db.users.count_documents({"is_active": True, "primary_role": "employee"})
        reports_last_30d = await self.db.daily_reports.count_documents({"report_date": {"$gte": thirty_days_ago}})
        expected_reports = total_employees * 30
        compliance_rate = round(reports_last_30d / max(expected_reports, 1) * 100, 1)

        # Department breakdown
        dept_pipeline = [
            {"$match": {"is_active": True}},
            {"$group": {"_id": "$department", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        dept_breakdown = {d["_id"] or "Unknown": d["count"] async for d in self.db.users.aggregate(dept_pipeline)}

        # Project progress distribution
        avg_progress_pipeline = [
            {"$match": {"status": "active"}},
            {"$group": {"_id": None, "avg_progress": {"$avg": "$progress_percentage"}}},
        ]
        progress_result = await self.db.projects.aggregate(avg_progress_pipeline).to_list(1)
        avg_progress = round(progress_result[0]["avg_progress"], 1) if progress_result else 0

        data = {
            "generated_at": now.strftime("%Y-%m-%d %H:%M UTC"),
            "projects": {
                "total": total_projects,
                "active": active_projects,
                "completed": completed_projects,
                "delayed": delayed_projects,
                "completion_rate": f"{completion_rate}%",
                "avg_active_progress": f"{avg_progress}%",
                "delay_rate": f"{round(delayed_projects / max(active_projects, 1) * 100, 1)}%",
            },
            "tasks": {
                "total": total_tasks,
                "done": done_tasks,
                "blocked": blocked_tasks,
                "overdue": overdue_tasks,
                "completion_rate": f"{task_completion_rate}%",
            },
            "employees": {
                "total_active": await self.db.users.count_documents({"is_active": True}),
                "by_department": dept_breakdown,
            },
            "reports": {
                "last_30_days": reports_last_30d,
                "compliance_rate": f"{compliance_rate}%",
            },
        }
        return f"COMPANY ANALYTICS:\n{json.dumps(data, indent=2, default=str)}"

    async def _contributor_stats_context(self, args, user) -> str:
        """Fetch contributor stats from the repository of a named project."""
        from utils.repo import fetch_contributor_stats
        if not args:
            return "Please specify a project name: /contributor-stats <project name>"
        project = await self.db.projects.find_one(
            {"name": {"$regex": args[0], "$options": "i"}}
        )
        if not project:
            return f"No project found matching '{args[0]}'."
        repo_url = project.get("repo_url", "")
        if not repo_url:
            return f"Project '{project['name']}' has no repository configured."
        try:
            result = await fetch_contributor_stats(repo_url, project_token=decrypt_token(project.get("repo_token", "")))
            contributors = result.get("contributors", [])
            data = {
                "project": project["name"],
                "repo_url": repo_url,
                "contributor_count": len(contributors),
                "contributors": [
                    {
                        "author": c["author"],
                        "email": c.get("email", ""),
                        "commits": c["commits"],
                        "additions": c.get("additions", 0),
                        "deletions": c.get("deletions", 0),
                        "lines": c.get("lines", 0),
                    }
                    for c in contributors[:20]
                ],
            }
        except Exception as exc:
            data = {"project": project["name"], "repo_url": repo_url, "error": str(exc)}
        return f"CONTRIBUTOR STATS:\n{json.dumps(data, indent=2, default=str)}"

    async def _general_context(self, args, user) -> str:
        """Fallback: fetch a live snapshot so the LLM always has real data."""
        from utils.team_scope import get_team_project_ids
        role = user.get("primary_role", "employee")

        # Build role-scoped project query
        proj_query: dict = {}
        if role == "pm":
            proj_query["pm_id"] = user["_id"]
        elif role == "team_lead":
            project_ids = await get_team_project_ids(self.db, user)
            proj_query["_id"] = {"$in": project_ids}
        elif role == "employee":
            proj_query["member_ids"] = user["_id"]

        total_proj = await self.db.projects.count_documents(proj_query)
        active_proj = await self.db.projects.count_documents({**proj_query, "status": "active"})
        delayed_proj = await self.db.projects.count_documents({**proj_query, "is_delayed": True})

        # Recent projects list
        cursor = self.db.projects.find(proj_query, {
            "name": 1, "status": 1, "progress_percentage": 1,
            "is_delayed": 1, "due_date": 1, "priority": 1,
        }).sort("due_date", 1).limit(10)
        projects = []
        async for p in cursor:
            projects.append({
                "name": p["name"],
                "status": p.get("status", "unknown"),
                "progress": f"{p.get('progress_percentage', 0)}%",
                "is_delayed": p.get("is_delayed", False),
                "due_date": str(p.get("due_date", "N/A")),
                "priority": p.get("priority", "medium"),
            })

        # Open tasks — scoped by role
        task_query: dict = {"status": {"$ne": "done"}}
        if role == "team_lead":
            if proj_query.get("_id"):
                task_query["project_id"] = proj_query["_id"]
        elif role not in ("ceo", "coo", "pm"):
            task_query["assignee_ids"] = user["_id"]
        open_tasks = await self.db.tasks.count_documents(task_query)
        blocked_tasks = await self.db.tasks.count_documents({**task_query, "is_blocked": True})

        snapshot: dict = {
            "role": role,
            "user": user.get("full_name", ""),
            "projects": {
                "total": total_proj,
                "active": active_proj,
                "delayed": delayed_proj,
                "list": projects,
            },
            "tasks": {
                "open": open_tasks,
                "blocked": blocked_tasks,
            },
        }

        # Team lead: also include team member count + today's report count
        if role == "team_lead":
            from utils.team_scope import get_team_member_ids
            member_ids = await get_team_member_ids(self.db, user)
            today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            reports_today = await self.db.daily_reports.count_documents({
                "user_id": {"$in": member_ids},
                "report_date": {"$gte": today},
            })
            snapshot["team"] = {
                "member_count": len(member_ids),
                "reports_submitted_today": reports_today,
                "team_names": [str(t) for t in user.get("team_ids", [])],
            }

        return f"LIVE SYSTEM SNAPSHOT:\n{json.dumps(snapshot, indent=2, default=str)}"
