#!/usr/bin/env python3
"""
Enterprise PM System — MCP Server
Exposes the full PM API as MCP tools so Claude (or any MCP client)
can manage projects, tasks, users, reports, analytics, and documents.

Setup:
  pip install -r requirements.txt
  copy .env.example .env         # fill in your values
  python server.py               # runs on stdio (for Claude Desktop / MCP clients)
"""

import os
import json
from typing import Optional

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

# ─── Config ──────────────────────────────────────────────────────────────────

API_URL: str = os.getenv("PM_API_URL", "http://localhost:8000/api/v1").rstrip("/")
_token: Optional[str] = os.getenv("PM_API_TOKEN")          # optional pre-set token

mcp = FastMCP(
    name="Enterprise PM System",
    instructions=(
        "You are connected to an Enterprise Project Management System. "
        "Use the available tools to query and manage projects, tasks, users, teams, "
        "daily reports, analytics, and the document hub. "
        "Call `login` first if no token is pre-configured."
    ),
)

# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def _headers() -> dict:
    return {"Authorization": f"Bearer {_token}"} if _token else {}


def _get(path: str, params: dict | None = None) -> dict:
    r = httpx.get(f"{API_URL}{path}", headers=_headers(), params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def _post(path: str, body: dict) -> dict:
    r = httpx.post(f"{API_URL}{path}", headers=_headers(), json=body, timeout=30)
    r.raise_for_status()
    return r.json()


def _put(path: str, body: dict) -> dict:
    r = httpx.put(f"{API_URL}{path}", headers=_headers(), json=body, timeout=30)
    r.raise_for_status()
    return r.json()


def _delete(path: str) -> dict:
    r = httpx.delete(f"{API_URL}{path}", headers=_headers(), timeout=30)
    r.raise_for_status()
    return r.json()


# ─── Auth ────────────────────────────────────────────────────────────────────

@mcp.tool()
def login(email: str, password: str) -> str:
    """
    Authenticate with the PM system using email and password.
    Stores the access token automatically for all subsequent tool calls.
    Returns the logged-in user's name and role.
    """
    global _token
    r = httpx.post(f"{API_URL}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    data = r.json()
    _token = data.get("access_token")
    user = data.get("user", {})
    return (
        f"Logged in as: {user.get('full_name')} "
        f"| Role: {user.get('primary_role')} "
        f"| Token stored for this session."
    )


# ─── Projects ────────────────────────────────────────────────────────────────

@mcp.tool()
def list_projects(
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> str:
    """
    List projects with optional filters.

    Args:
        status: Filter by status — active | completed | on_hold | cancelled
        search: Search by project name
        page: Page number (default 1)
        limit: Results per page (default 20)

    Returns a formatted list with project ID, name, status, and progress.
    """
    params: dict = {"page": page, "limit": limit}
    if status:
        params["status"] = status
    if search:
        params["search"] = search

    data = _get("/projects", params)
    projects = data.get("projects", [])
    total = data.get("total", 0)

    if not projects:
        return "No projects found."

    lines = [f"Found {total} project(s):\n"]
    for p in projects:
        lines.append(
            f"• [{p['id']}] {p['name']}"
            f"\n  Status: {p.get('status', 'N/A')}  |  Progress: {p.get('progress_pct', 0)}%"
            f"  |  PM: {p.get('pm_name', 'N/A')}"
        )
        if p.get("description"):
            lines.append(f"  Desc: {p['description'][:120]}")
    return "\n".join(lines)


@mcp.tool()
def get_project(project_id: str) -> str:
    """
    Get full details of a specific project, including task summary, team members,
    timeline, and recent activity.

    Args:
        project_id: The project's ID string
    """
    p = _get(f"/projects/{project_id}")
    result = {
        "id": p.get("id"),
        "name": p.get("name"),
        "description": p.get("description"),
        "status": p.get("status"),
        "priority": p.get("priority"),
        "progress_pct": p.get("progress_pct"),
        "start_date": p.get("start_date"),
        "end_date": p.get("end_date"),
        "pm_name": p.get("pm_name"),
        "members": [m.get("full_name") for m in p.get("members", [])],
        "task_summary": p.get("task_summary"),
        "tags": p.get("tags", []),
    }
    return json.dumps(result, indent=2, default=str)


@mcp.tool()
def create_project(
    name: str,
    description: str = "",
    status: str = "active",
    priority: str = "medium",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> str:
    """
    Create a new project.

    Args:
        name: Project name (required)
        description: Brief description
        status: active | completed | on_hold | cancelled  (default: active)
        priority: low | medium | high | critical  (default: medium)
        start_date: Start date in YYYY-MM-DD format
        end_date: End/deadline date in YYYY-MM-DD format
    """
    body: dict = {
        "name": name,
        "description": description,
        "status": status,
        "priority": priority,
    }
    if start_date:
        body["start_date"] = start_date
    if end_date:
        body["end_date"] = end_date

    data = _post("/projects", body)
    return f"Project created successfully. ID: {data.get('project_id')}"


@mcp.tool()
def update_project(
    project_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    progress_pct: Optional[int] = None,
) -> str:
    """
    Update an existing project's fields.

    Args:
        project_id: ID of the project to update
        name: New name
        description: New description
        status: active | completed | on_hold | cancelled
        priority: low | medium | high | critical
        progress_pct: Overall progress percentage (0–100)
    """
    body: dict = {}
    if name is not None:
        body["name"] = name
    if description is not None:
        body["description"] = description
    if status is not None:
        body["status"] = status
    if priority is not None:
        body["priority"] = priority
    if progress_pct is not None:
        body["progress_pct"] = progress_pct

    data = _put(f"/projects/{project_id}", body)
    return data.get("message", "Project updated.")


# ─── Tasks ───────────────────────────────────────────────────────────────────

@mcp.tool()
def list_tasks(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    priority: Optional[str] = None,
    page: int = 1,
    limit: int = 30,
) -> str:
    """
    List tasks with optional filters.

    Args:
        project_id: Filter by project ID
        status: todo | in_progress | in_review | done | blocked
        assigned_to: Filter by assignee user ID
        priority: low | medium | high | critical
        page: Page number
        limit: Results per page
    """
    params: dict = {"page": page, "limit": limit}
    if project_id:
        params["project_id"] = project_id
    if status:
        params["status"] = status
    if assigned_to:
        params["assigned_to"] = assigned_to
    if priority:
        params["priority"] = priority

    data = _get("/tasks", params)
    tasks = data.get("tasks", [])
    total = data.get("total", 0)

    if not tasks:
        return "No tasks found."

    lines = [f"Found {total} task(s):\n"]
    for t in tasks:
        lines.append(
            f"• [{t['id']}] {t['title']}"
            f"\n  Status: {t.get('status')}  |  Priority: {t.get('priority')}"
            f"  |  Assignee: {t.get('assignee_name', 'unassigned')}"
            f"  |  Project: {t.get('project_name', 'N/A')}"
        )
        if t.get("due_date"):
            lines.append(f"  Due: {t['due_date'][:10]}")
    return "\n".join(lines)


@mcp.tool()
def create_task(
    title: str,
    project_id: str,
    description: str = "",
    status: str = "todo",
    priority: str = "medium",
    assignee_id: Optional[str] = None,
    due_date: Optional[str] = None,
) -> str:
    """
    Create a new task inside a project.

    Args:
        title: Task title (required)
        project_id: ID of the parent project (required)
        description: Detailed task description
        status: todo | in_progress | in_review | done | blocked  (default: todo)
        priority: low | medium | high | critical  (default: medium)
        assignee_id: User ID to assign the task to
        due_date: Due date in YYYY-MM-DD format
    """
    body: dict = {
        "title": title,
        "project_id": project_id,
        "description": description,
        "status": status,
        "priority": priority,
    }
    if assignee_id:
        body["assignee_id"] = assignee_id
    if due_date:
        body["due_date"] = due_date

    data = _post("/tasks", body)
    return f"Task created successfully. ID: {data.get('task_id')}"


@mcp.tool()
def update_task(
    task_id: str,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    title: Optional[str] = None,
    assignee_id: Optional[str] = None,
    due_date: Optional[str] = None,
    progress_pct: Optional[int] = None,
) -> str:
    """
    Update a task — change its status, priority, assignee, due date, or progress.

    Args:
        task_id: ID of the task to update (required)
        status: todo | in_progress | in_review | done | blocked
        priority: low | medium | high | critical
        title: New task title
        assignee_id: New assignee user ID
        due_date: New due date (YYYY-MM-DD)
        progress_pct: Task progress percentage (0–100)
    """
    body: dict = {}
    if status is not None:
        body["status"] = status
    if priority is not None:
        body["priority"] = priority
    if title is not None:
        body["title"] = title
    if assignee_id is not None:
        body["assignee_id"] = assignee_id
    if due_date is not None:
        body["due_date"] = due_date
    if progress_pct is not None:
        body["progress_pct"] = progress_pct

    data = _put(f"/tasks/{task_id}", body)
    return data.get("message", "Task updated.")


# ─── Users ───────────────────────────────────────────────────────────────────

@mcp.tool()
def list_users(
    role: Optional[str] = None,
    search: Optional[str] = None,
    department_id: Optional[str] = None,
    page: int = 1,
    limit: int = 30,
) -> str:
    """
    List all users in the organization.

    Args:
        role: Filter by role — ceo | coo | pm | team_lead | employee
        search: Search by name or email
        department_id: Filter by department ID
        page: Page number
        limit: Results per page
    """
    params: dict = {"page": page, "limit": limit}
    if role:
        params["role"] = role
    if search:
        params["search"] = search
    if department_id:
        params["department_id"] = department_id

    data = _get("/users", params)
    users = data.get("users", [])
    total = data.get("total", 0)

    if not users:
        return "No users found."

    lines = [f"Found {total} user(s):\n"]
    for u in users:
        uid = u.get("user_id") or u.get("id")
        lines.append(
            f"• [{uid}] {u['full_name']}"
            f"\n  Role: {u.get('primary_role')}  |  Email: {u.get('email')}"
            f"  |  Dept: {u.get('department_name', 'N/A')}"
        )
    return "\n".join(lines)


# ─── Teams ───────────────────────────────────────────────────────────────────

@mcp.tool()
def list_teams(page: int = 1, limit: int = 20) -> str:
    """
    List all teams in the organization along with their members and team lead.
    """
    data = _get("/teams", {"page": page, "limit": limit})
    teams = data.get("teams", [])

    if not teams:
        return "No teams found."

    lines = []
    for t in teams:
        members = ", ".join(m.get("full_name", "") for m in t.get("members", []))
        lines.append(
            f"• [{t['id']}] {t['name']}"
            f"\n  Lead: {t.get('lead_name', 'N/A')}"
            f"  |  Members: {members or 'none'}"
        )
    return "\n".join(lines)


# ─── Reports ─────────────────────────────────────────────────────────────────

@mcp.tool()
def list_reports(
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> str:
    """
    List daily work reports submitted by team members.

    Args:
        user_id: Filter by a specific user's ID
        project_id: Filter by project ID
        date_from: Start date filter (YYYY-MM-DD)
        date_to: End date filter (YYYY-MM-DD)
        page: Page number
        limit: Results per page
    """
    params: dict = {"page": page, "limit": limit}
    if user_id:
        params["user_id"] = user_id
    if project_id:
        params["project_id"] = project_id
    if date_from:
        params["date_from"] = date_from
    if date_to:
        params["date_to"] = date_to

    data = _get("/reports", params)
    reports = data.get("reports", [])
    total = data.get("total", 0)

    if not reports:
        return "No reports found."

    lines = [f"Found {total} report(s):\n"]
    for r in reports:
        lines.append(
            f"• [{r['id']}] {r.get('date', 'N/A')}"
            f"  |  {r.get('user_name')}  |  {r.get('project_name', 'N/A')}"
        )
        if r.get("tasks_done"):
            lines.append(f"  Tasks done: {r['tasks_done'][:150]}")
        if r.get("blockers"):
            lines.append(f"  Blockers: {r['blockers'][:100]}")
    return "\n".join(lines)


@mcp.tool()
def submit_report(
    project_id: str,
    tasks_done: str,
    planned: str = "",
    blockers: str = "",
    progress_pct: int = 0,
) -> str:
    """
    Submit a daily work report for a project.

    Args:
        project_id: The project this report is for (required)
        tasks_done: Description of tasks completed today (required)
        planned: Tasks planned for tomorrow
        blockers: Any blockers or issues encountered
        progress_pct: Overall progress percentage today (0–100)
    """
    body = {
        "project_id": project_id,
        "tasks_done": tasks_done,
        "planned": planned,
        "blockers": blockers,
        "progress_pct": progress_pct,
    }
    data = _post("/reports", body)
    return f"Daily report submitted. ID: {data.get('report_id')}"


# ─── Analytics ───────────────────────────────────────────────────────────────

@mcp.tool()
def get_analytics(scope: str = "company") -> str:
    """
    Retrieve performance analytics.

    Args:
        scope: 'company' for org-wide analytics, or a project ID for project-level data.

    Returns JSON with metrics including task completion rates, team performance,
    report compliance, and project health.
    """
    if scope == "company":
        data = _get("/analytics/company")
    else:
        data = _get(f"/analytics/project/{scope}")
    return json.dumps(data, indent=2, default=str)


# ─── Documents / Sheets Hub ──────────────────────────────────────────────────

@mcp.tool()
def list_documents(
    doc_type: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> str:
    """
    List all documents in the Document Hub (Docs, Sheets, Slides, PDFs, etc.).

    Args:
        doc_type: Filter by type — docs | sheets | slides | pdf | other
        page: Page number
        limit: Results per page
    """
    params: dict = {"page": page, "limit": limit}
    if doc_type:
        params["sheet_type"] = doc_type

    data = _get("/sheets", params)
    docs = data.get("sheets", [])
    total = data.get("total", 0)

    if not docs:
        return "No documents found."

    lines = [f"Found {total} document(s):\n"]
    for d in docs:
        lines.append(
            f"• [{d['id']}] {d['name']}  [{d.get('sheet_type', 'other')}]"
            f"\n  Changes: {d.get('entry_count', 0)}"
            f"  |  URL: {d.get('url') or 'N/A'}"
        )
        if d.get("description"):
            lines.append(f"  {d['description'][:120]}")
    return "\n".join(lines)


@mcp.tool()
def add_document(
    name: str,
    url: str,
    doc_type: str = "docs",
    description: str = "",
    project_id: Optional[str] = None,
) -> str:
    """
    Add a document link to the Document Hub.

    Args:
        name: Document name (required)
        url: Full URL of the document (required)
        doc_type: docs | sheets | slides | pdf | other  (default: docs)
        description: Brief description of the document
        project_id: Optional project ID to link this document to
    """
    body: dict = {
        "name": name,
        "url": url,
        "sheet_type": doc_type,
        "description": description,
    }
    if project_id:
        body["project_id"] = project_id

    data = _post("/sheets", body)
    return f"Document added to hub. ID: {data.get('sheet_id')}"


@mcp.tool()
def get_document_changes(document_id: str) -> str:
    """
    Retrieve the full change history for a document in the Document Hub.

    Args:
        document_id: The document's ID
    """
    data = _get(f"/sheets/{document_id}")
    entries = data.get("entries", [])

    if not entries:
        return f"No changes logged yet for '{data.get('name', document_id)}'."

    lines = [f"Change history for: {data.get('name')}\n"]
    for e in sorted(entries, key=lambda x: x.get("created_at", ""), reverse=True):
        date = (e.get("created_at") or "")[:16].replace("T", " ")
        author = e.get("creator_name") or "Unknown"
        note = (e.get("data") or {}).get("note", "")
        lines.append(f"• {date}  |  {author}\n  {note}")
    return "\n".join(lines)


@mcp.tool()
def log_document_change(document_id: str, note: str) -> str:
    """
    Log a change note for a document in the Document Hub.

    Args:
        document_id: The document's ID (required)
        note: Description of what changed (required)
    """
    data = _post(f"/sheets/{document_id}/entries", {"data": {"note": note}})
    return f"Change logged successfully. Entry ID: {data.get('entry_id')}"


# ─── AI Chatbot ──────────────────────────────────────────────────────────────

@mcp.tool()
def ask_project_ai(message: str, session_id: Optional[str] = None) -> str:
    """
    Send a message to the project's built-in AI assistant (powered by AWS Bedrock / Groq).
    The AI has full context of projects, tasks, users, reports, and analytics.
    Use this to ask natural-language questions about the project data.

    Args:
        message: Your question or request for the AI
        session_id: Optional session ID to continue an existing conversation
    """
    body: dict = {"message": message}
    if session_id:
        body["session_id"] = session_id

    data = _post("/chatbot/message", body)
    return data.get("response") or data.get("message") or json.dumps(data, default=str)


# ─── Departments ─────────────────────────────────────────────────────────────

@mcp.tool()
def list_departments() -> str:
    """
    List all departments in the organization.
    """
    data = _get("/departments")
    depts = data if isinstance(data, list) else data.get("departments", [])

    if not depts:
        return "No departments found."

    lines = []
    for d in depts:
        lines.append(f"• [{d.get('id')}] {d.get('name')}  |  Head: {d.get('head_name', 'N/A')}")
    return "\n".join(lines)


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run()
