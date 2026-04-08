"""
Basecamp integration router.

OAuth 2 flow:
  1. GET  /basecamp/auth/url       → returns authorization URL
  2. POST /basecamp/auth/callback  → exchanges code for token, persists in DB
  3. GET  /basecamp/status         → check connection for current user
  4. DELETE /basecamp/disconnect   → remove stored tokens

Proxy endpoints (require connected account):
  GET    /basecamp/projects
  GET    /basecamp/projects/{id}
  GET    /basecamp/projects/{id}/todolists
  GET    /basecamp/projects/{id}/todolists/{lid}/todos
  POST   /basecamp/projects/{id}/todolists/{lid}/todos
  POST   /basecamp/projects/{id}/todos/{tid}/complete
  DELETE /basecamp/projects/{id}/todos/{tid}/complete
  GET    /basecamp/projects/{id}/messages
  POST   /basecamp/projects/{id}/messages
  GET    /basecamp/projects/{id}/schedule
  GET    /basecamp/people
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from database import get_db
from middleware.auth import get_current_user

router = APIRouter()

# ── Credentials ───────────────────────────────────────────────────────────────
_CLIENT_ID     = "4a389e0b4597fb7c6ea2867f7075bb67b4d92ed4"
_CLIENT_SECRET = "e1d94048127d28a66c7e4aaaaa3fc8664d9f2c30"
_REDIRECT_URI  = "http://localhost:3000/callback"
_AUTH_URL      = "https://launchpad.37signals.com/authorization/new"
_TOKEN_URL     = "https://launchpad.37signals.com/authorization/token"
_IDENTITY_URL  = "https://launchpad.37signals.com/authorization.json"
_API_BASE      = "https://3.basecampapi.com"
_USER_AGENT    = "Enterprise PM (noreply@company.com)"

# ── Shared HTTP helpers ───────────────────────────────────────────────────────

def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "User-Agent": _USER_AGENT,
        "Content-Type": "application/json",
    }


async def _bc_get(url: str, token: str):
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers=_headers(token))
        if r.status_code == 401:
            raise HTTPException(401, "Basecamp token expired. Please reconnect.")
        if r.status_code == 404:
            raise HTTPException(404, "Basecamp resource not found.")
        r.raise_for_status()
        if r.content:
            return r.json()
        return {}


async def _bc_post(url: str, token: str, payload: dict = None):
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, json=payload or {}, headers=_headers(token))
        r.raise_for_status()
        if r.content:
            return r.json()
        return {}


async def _bc_delete(url: str, token: str):
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.delete(url, headers=_headers(token))
        r.raise_for_status()


async def _get_token_doc(current_user: dict, db):
    doc = await db.basecamp_tokens.find_one({"user_id": current_user["_id"]})
    if not doc:
        raise HTTPException(401, "Basecamp not connected. Please connect your account first.")
    return doc


# ── OAuth ─────────────────────────────────────────────────────────────────────

@router.get("/auth/url")
async def get_auth_url(current_user=Depends(get_current_user)):
    """Return the Basecamp OAuth authorization URL."""
    url = (
        f"{_AUTH_URL}"
        f"?type=web_server"
        f"&client_id={_CLIENT_ID}"
        f"&redirect_uri={_REDIRECT_URI}"
    )
    return {"url": url}


class CallbackBody(BaseModel):
    code: str


@router.post("/auth/callback")
async def handle_callback(
    body: CallbackBody,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Exchange OAuth code for access token and persist."""
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(_TOKEN_URL, data={
            "type": "web_server",
            "client_id": _CLIENT_ID,
            "client_secret": _CLIENT_SECRET,
            "redirect_uri": _REDIRECT_URI,
            "code": body.code,
        })
        if r.status_code != 200:
            detail = r.json().get("error", "Token exchange failed")
            raise HTTPException(400, detail)
        token_data = r.json()

    access_token  = token_data.get("access_token", "")
    refresh_token = token_data.get("refresh_token", "")

    # Fetch identity + account list
    identity_data = await _bc_get(_IDENTITY_URL, access_token)
    accounts = identity_data.get("accounts", [])

    # Prefer Basecamp 4 (bc4), fall back to bc2, then first entry
    account = (
        next((a for a in accounts if a.get("product") == "bc4"), None)
        or next((a for a in accounts if a.get("product") == "bc2"), None)
        or (accounts[0] if accounts else None)
    )
    if not account:
        raise HTTPException(400, "No Basecamp account found for this authorization.")

    await db.basecamp_tokens.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {
            "user_id":      current_user["_id"],
            "access_token": access_token,
            "refresh_token": refresh_token,
            "account_id":   str(account["id"]),
            "account_name": account.get("name", ""),
            "account_href": account.get("href", ""),
            "identity":     identity_data.get("identity", {}),
            "accounts":     accounts,
            "connected_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {
        "status":       "connected",
        "account_name": account.get("name", ""),
        "account_id":   str(account["id"]),
        "identity":     identity_data.get("identity", {}),
    }


@router.get("/status")
async def get_status(current_user=Depends(get_current_user), db=Depends(get_db)):
    doc = await db.basecamp_tokens.find_one({"user_id": current_user["_id"]})
    if not doc:
        return {"connected": False}
    return {
        "connected":    True,
        "account_id":   doc.get("account_id", ""),
        "account_name": doc.get("account_name", ""),
        "identity":     doc.get("identity", {}),
        "accounts":     doc.get("accounts", []),
        "connected_at": doc.get("connected_at"),
    }


@router.delete("/disconnect")
async def disconnect(current_user=Depends(get_current_user), db=Depends(get_db)):
    await db.basecamp_tokens.delete_one({"user_id": current_user["_id"]})
    return {"status": "disconnected"}


# ── Projects ──────────────────────────────────────────────────────────────────

@router.get("/projects")
async def list_projects(current_user=Depends(get_current_user), db=Depends(get_db)):
    doc = await _get_token_doc(current_user, db)
    data = await _bc_get(f"{_API_BASE}/{doc['account_id']}/projects.json", doc["access_token"])
    return {"projects": data if isinstance(data, list) else []}


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""


@router.post("/projects", status_code=201)
async def create_project(
    body: ProjectCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    payload: dict = {"name": body.name.strip()}
    if body.description:
        payload["description"] = body.description.strip()
    data = await _bc_post(
        f"{_API_BASE}/{doc['account_id']}/projects.json",
        doc["access_token"],
        payload,
    )
    return data


@router.get("/projects/{project_id}")
async def get_project(
    project_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/projects/{project_id}.json",
        doc["access_token"],
    )
    return data


# ── Todos ─────────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/todolists")
async def list_todo_lists(
    project_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    todoset = await _get_dock_tool(project_id, "todoset", token, doc["account_id"])
    if not todoset:
        return {"todolists": []}
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/todosets/{todoset['id']}/todolists.json",
        token,
    )
    return {"todolists": data if isinstance(data, list) else []}


@router.get("/projects/{project_id}/todolists/{list_id}/todos")
async def list_todos(
    project_id: int,
    list_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/todolists/{list_id}/todos.json",
        doc["access_token"],
    )
    return {"todos": data if isinstance(data, list) else []}


class TodoCreate(BaseModel):
    content: str
    description: str = ""
    due_on: Optional[str] = None
    assignee_ids: list[int] = []


@router.post("/projects/{project_id}/todolists/{list_id}/todos")
async def create_todo(
    project_id: int,
    list_id: int,
    body: TodoCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    payload: dict = {"content": body.content, "description": body.description}
    if body.due_on:
        payload["due_on"] = body.due_on
    if body.assignee_ids:
        payload["assignee_ids"] = body.assignee_ids
    data = await _bc_post(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/todolists/{list_id}/todos.json",
        doc["access_token"],
        payload,
    )
    return data


@router.post("/projects/{project_id}/todos/{todo_id}/complete")
async def complete_todo(
    project_id: int,
    todo_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    await _bc_post(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/todos/{todo_id}/completion.json",
        doc["access_token"],
    )
    return {"status": "completed"}


@router.delete("/projects/{project_id}/todos/{todo_id}/complete")
async def uncomplete_todo(
    project_id: int,
    todo_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    await _bc_delete(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/todos/{todo_id}/completion.json",
        doc["access_token"],
    )
    return {"status": "uncompleted"}


# ── Messages ──────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/messages")
async def list_messages(
    project_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    project = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/projects/{project_id}.json", token
    )
    board = next(
        (d for d in project.get("dock", []) if d.get("name") == "message_board"),
        None,
    )
    if not board:
        return {"messages": []}
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/message_boards/{board['id']}/messages.json",
        token,
    )
    return {"messages": data if isinstance(data, list) else []}


class MessageCreate(BaseModel):
    subject: str
    content: str
    category_id: Optional[int] = None


@router.post("/projects/{project_id}/messages")
async def create_message(
    project_id: int,
    body: MessageCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    project = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/projects/{project_id}.json", token
    )
    board = next(
        (d for d in project.get("dock", []) if d.get("name") == "message_board"),
        None,
    )
    if not board:
        raise HTTPException(404, "This project has no message board.")
    payload: dict = {"subject": body.subject, "content": body.content}
    if body.category_id:
        payload["category_id"] = body.category_id
    data = await _bc_post(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/message_boards/{board['id']}/messages.json",
        token,
        payload,
    )
    return data


# ── Schedule ──────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/schedule")
async def list_schedule(
    project_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    project = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/projects/{project_id}.json", token
    )
    schedule = next(
        (d for d in project.get("dock", []) if d.get("name") == "schedule"),
        None,
    )
    if not schedule:
        return {"entries": []}
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/schedules/{schedule['id']}/entries.json",
        token,
    )
    return {"entries": data if isinstance(data, list) else []}


# ── People ────────────────────────────────────────────────────────────────────

@router.get("/people")
async def list_people(current_user=Depends(get_current_user), db=Depends(get_db)):
    doc = await _get_token_doc(current_user, db)
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/people.json",
        doc["access_token"],
    )
    return {"people": data if isinstance(data, list) else []}


@router.get("/projects/{project_id}/people")
async def list_project_people(
    project_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """People assigned to a specific project."""
    doc = await _get_token_doc(current_user, db)
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/projects/{project_id}/people.json",
        doc["access_token"],
    )
    return {"people": data if isinstance(data, list) else []}


# ── Campfire (Project Chat) ───────────────────────────────────────────────────

async def _get_dock_tool(project_id: int, tool_name: str, token: str, account_id: str):
    """Fetch a project and return the dock entry for the given tool name."""
    project = await _bc_get(f"{_API_BASE}/{account_id}/projects/{project_id}.json", token)
    tool = next((d for d in project.get("dock", []) if d.get("name") == tool_name), None)
    return tool


@router.get("/projects/{project_id}/campfire/lines")
async def list_campfire_lines(
    project_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    chat = await _get_dock_tool(project_id, "chat", token, doc["account_id"])
    if not chat:
        return {"lines": []}
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/chats/{chat['id']}/lines.json",
        token,
    )
    return {"lines": data if isinstance(data, list) else []}


class CampfireLineCreate(BaseModel):
    content: str


@router.post("/projects/{project_id}/campfire/lines")
async def post_campfire_line(
    project_id: int,
    body: CampfireLineCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    chat = await _get_dock_tool(project_id, "chat", token, doc["account_id"])
    if not chat:
        raise HTTPException(404, "This project has no Campfire chat.")
    data = await _bc_post(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/chats/{chat['id']}/lines.json",
        token,
        {"content": body.content},
    )
    return data


# ── Documents ─────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/documents")
async def list_documents(
    project_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    vault = await _get_dock_tool(project_id, "vault", token, doc["account_id"])
    if not vault:
        return {"documents": []}
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/vaults/{vault['id']}/documents.json",
        token,
    )
    return {"documents": data if isinstance(data, list) else []}


@router.get("/projects/{project_id}/documents/{doc_id}")
async def get_document(
    project_id: int,
    doc_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    token_doc = await _get_token_doc(current_user, db)
    data = await _bc_get(
        f"{_API_BASE}/{token_doc['account_id']}/buckets/{project_id}/documents/{doc_id}.json",
        token_doc["access_token"],
    )
    return data


class DocumentCreate(BaseModel):
    title: str
    content: str  # HTML allowed


@router.post("/projects/{project_id}/documents")
async def create_document(
    project_id: int,
    body: DocumentCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    token_doc = await _get_token_doc(current_user, db)
    token = token_doc["access_token"]
    vault = await _get_dock_tool(project_id, "vault", token, token_doc["account_id"])
    if not vault:
        raise HTTPException(404, "This project has no vault.")
    data = await _bc_post(
        f"{_API_BASE}/{token_doc['account_id']}/buckets/{project_id}/vaults/{vault['id']}/documents.json",
        token,
        {"title": body.title, "content": body.content},
    )
    return data


# ── Uploads / Vault Files ─────────────────────────────────────────────────────

@router.get("/projects/{project_id}/uploads")
async def list_uploads(
    project_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    vault = await _get_dock_tool(project_id, "vault", token, doc["account_id"])
    if not vault:
        return {"uploads": []}
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/vaults/{vault['id']}/uploads.json",
        token,
    )
    return {"uploads": data if isinstance(data, list) else []}


# ── Comments ──────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/recordings/{recording_id}/comments")
async def list_comments(
    project_id: int,
    recording_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/recordings/{recording_id}/comments.json",
        doc["access_token"],
    )
    return {"comments": data if isinstance(data, list) else []}


class CommentCreate(BaseModel):
    content: str


@router.post("/projects/{project_id}/recordings/{recording_id}/comments")
async def create_comment(
    project_id: int,
    recording_id: int,
    body: CommentCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    data = await _bc_post(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/recordings/{recording_id}/comments.json",
        doc["access_token"],
        {"content": body.content},
    )
    return data


# ── Schedule Entry Creation ───────────────────────────────────────────────────

class ScheduleEntryCreate(BaseModel):
    summary: str
    starts_at: str   # ISO 8601 datetime
    ends_at: str     # ISO 8601 datetime
    all_day: bool = False
    description: str = ""
    participant_ids: list[int] = []


@router.post("/projects/{project_id}/schedule/entries")
async def create_schedule_entry(
    project_id: int,
    body: ScheduleEntryCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    schedule = await _get_dock_tool(project_id, "schedule", token, doc["account_id"])
    if not schedule:
        raise HTTPException(404, "This project has no schedule.")
    payload: dict = {
        "summary": body.summary,
        "starts_at": body.starts_at,
        "ends_at": body.ends_at,
        "all_day": body.all_day,
    }
    if body.description:
        payload["description"] = body.description
    if body.participant_ids:
        payload["participant_ids"] = body.participant_ids
    data = await _bc_post(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/schedules/{schedule['id']}/entries.json",
        token,
        payload,
    )
    return data


# ── Questionnaires / Automatic Check-ins ──────────────────────────────────────

@router.get("/projects/{project_id}/questionnaires")
async def list_questionnaires(
    project_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    q_tool = await _get_dock_tool(project_id, "questionnaire", token, doc["account_id"])
    if not q_tool:
        return {"questions": []}
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/questionnaires/{q_tool['id']}/questions.json",
        token,
    )
    return {"questions": data if isinstance(data, list) else []}


@router.get("/projects/{project_id}/questionnaires/{question_id}/answers")
async def list_question_answers(
    project_id: int,
    question_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc = await _get_token_doc(current_user, db)
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/questions/{question_id}/answers.json",
        doc["access_token"],
    )
    return {"answers": data if isinstance(data, list) else []}


# ── Card Tables (Kanban) ───────────────────────────────────────────────────────

@router.get("/projects/{project_id}/card_tables")
async def list_card_tables(
    project_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Returns columns and cards for the project's kanban board."""
    doc = await _get_token_doc(current_user, db)
    token = doc["access_token"]
    project = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/projects/{project_id}.json", token
    )
    kanban = next(
        (d for d in project.get("dock", []) if d.get("name") == "kanban_board"),
        None,
    )
    if not kanban:
        return {"columns": []}
    data = await _bc_get(
        f"{_API_BASE}/{doc['account_id']}/buckets/{project_id}/card_tables/{kanban['id']}.json",
        token,
    )
    # card_table has a "lists" key (columns)
    columns = data.get("lists", [])
    return {"columns": columns, "card_table_id": kanban["id"]}
