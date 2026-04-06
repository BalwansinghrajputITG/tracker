# Enterprise Internal Project Management System
## Complete Architecture & Feature Reference

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Database Schema](#4-database-schema)
5. [Backend API — All Routers & Endpoints](#5-backend-api--all-routers--endpoints)
6. [Services & Utilities](#6-services--utilities)
7. [Middleware & Security](#7-middleware--security)
8. [Chatbot System](#8-chatbot-system)
9. [Frontend Pages & Routing](#9-frontend-pages--routing)
10. [Redux Store](#10-redux-store)
11. [Key Frontend Components](#11-key-frontend-components)
12. [Core Data Flows](#12-core-data-flows)
13. [Role-Based Access Control](#13-role-based-access-control)
14. [Real-Time Architecture](#14-real-time-architecture)
15. [External Integrations](#15-external-integrations)
16. [Performance & Analytics Engine](#16-performance--analytics-engine)

---

## 1. System Overview

A full-stack enterprise internal project-management platform that supports:

- **Multi-role user hierarchy** — CEO, COO, Project Manager (PM), Team Lead (TL), Employee
- **Project lifecycle management** — create, assign, track, archive
- **Task management** — subtasks, priority, status, assignment, deadlines
- **Time tracking** — daily hour logs per user per project
- **Daily report system** — structured employee reports with compliance scoring
- **GitHub/GitLab commit tracking** — per-project repository, per-user attribution
- **Google Drive doc tracking** — Sheets/Docs/Slides edit-count via Drive v3 API
- **AI chatbot** — AWS Bedrock (Nova Pro) + Groq (llama-3.3-70b) fallback, RAG-style context
- **Real-time notifications** — WebSocket push
- **Analytics & performance scoring** — 5-signal 100-point performance mode
- **Announcement system** — org-wide and project-scoped announcements

---

## 2. Technology Stack

### Backend
| Layer | Technology |
|---|---|
| Runtime | Python 3.11+ |
| Framework | FastAPI (async) |
| Database driver | Motor (async MongoDB) |
| Database | MongoDB Atlas (or local) |
| Auth | JWT HS256 — `python-jose` |
| Password hashing | `bcrypt` via `passlib` |
| HTTP client | `httpx` (async) |
| WebSockets | FastAPI native WebSocket |
| LLM primary | AWS Bedrock — `amazon.nova-pro-v1:0` |
| LLM fallback | Groq — `llama-3.3-70b-versatile` |
| Token encryption | `cryptography` Fernet (symmetric) |
| Environment | `python-dotenv` |

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18 |
| Language | TypeScript |
| State management | Redux Toolkit + Redux-Saga |
| Routing | React Router v6 |
| HTTP client | Axios |
| Icons | Lucide React |
| Build tool | Vite |
| Styling | Plain CSS modules / inline styles |

### Infrastructure
| Service | Purpose |
|---|---|
| MongoDB | Primary data store |
| AWS Bedrock | Primary LLM for chatbot |
| Groq API | Fallback LLM |
| Google Drive API v3 | Doc/Sheets edit tracking |
| GitHub API v3 / GitLab API v4 | Commit tracking |

---

## 3. Directory Structure

```
project/
├── backend/
│   ├── main.py                    # FastAPI app factory, CORS, router registration
│   ├── database.py                # Motor client, `db` singleton
│   ├── auth.py                    # JWT creation / verification
│   ├── config.py                  # Pydantic settings (env vars)
│   ├── routers/
│   │   ├── auth.py                # Login, register, password change
│   │   ├── users.py               # User CRUD, profile, team listing
│   │   ├── projects.py            # Project CRUD + tracking-docs endpoints
│   │   ├── tasks.py               # Task CRUD, subtasks, assignment
│   │   ├── time_logs.py           # Daily hour log entries
│   │   ├── reports.py             # Daily reports, compliance
│   │   ├── analytics.py           # Performance analytics (list + detail)
│   │   ├── notifications.py       # Notification list, mark-read
│   │   ├── announcements.py       # Org/project announcements
│   │   ├── chatbot.py             # AI chatbot sessions + messages
│   │   └── websocket.py           # WebSocket connection manager endpoint
│   └── utils/
│       ├── gdrive.py              # Google Drive v3 helpers
│       ├── repo.py                # GitHub/GitLab commit fetching
│       ├── token_encrypt.py       # Fernet encrypt/decrypt for repo tokens
│       └── team_scope.py          # Role-based data scoping helpers
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx               # React entry point
│   │   ├── App.tsx                # Root router, protected routes
│   │   ├── store/
│   │   │   ├── index.ts           # Redux store configuration
│   │   │   ├── slices/            # Redux Toolkit slices
│   │   │   └── sagas/             # Redux-Saga side effects
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── ProjectsPage.tsx
│   │   │   ├── ProjectDetailPage.tsx
│   │   │   ├── TasksPage.tsx
│   │   │   ├── TimeLogsPage.tsx
│   │   │   ├── ReportsPage.tsx
│   │   │   ├── AnalyticsPage.tsx
│   │   │   ├── ChatbotPage.tsx
│   │   │   ├── AnnouncementsPage.tsx
│   │   │   ├── NotificationsPage.tsx
│   │   │   ├── ProfilePage.tsx
│   │   │   └── UsersPage.tsx
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── [feature components]
│   │   ├── api/
│   │   │   └── axios.ts           # Axios instance, base URL, interceptors
│   │   └── types/
│   │       └── index.ts           # Shared TypeScript interfaces
│   ├── package.json
│   └── vite.config.ts
│
├── database/                      # MongoDB seed / migration scripts
├── infrastructure/                # Docker / deployment configs
├── ARCHITECTURE.md                # This file
└── README.md
```

---

## 4. Database Schema

MongoDB is used with the following collections:

### 4.1 `users`
```json
{
  "_id": "ObjectId",
  "name": "string",
  "email": "string (unique)",
  "password": "string (bcrypt hash)",
  "primary_role": "ceo | coo | pm | tl | employee",
  "department": "string",
  "position": "string",
  "phone": "string",
  "avatar_url": "string",
  "is_active": "boolean",
  "github_url": "string (personal, legacy — no longer used for commit tracking)",
  "personal_links": ["string"],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.2 `projects`
```json
{
  "_id": "ObjectId",
  "name": "string",
  "description": "string",
  "status": "active | on_hold | completed | archived",
  "priority": "low | medium | high | critical",
  "start_date": "datetime",
  "end_date": "datetime",
  "pm_id": "ObjectId (ref users)",
  "tl_id": "ObjectId (ref users)",
  "member_ids": ["ObjectId (ref users)"],
  "repo_url": "string (GitHub/GitLab repository URL)",
  "repo_token": "string (Fernet-encrypted PAT)",
  "tracking_docs": [
    {
      "id": "string (uuid4)",
      "url": "string (Google Sheets/Docs URL)",
      "title": "string",
      "doc_type": "sheets | docs | slides | other",
      "file_id": "string (extracted Drive file ID)",
      "api_key": "string (Google API key — stored, masked in list responses)",
      "added_at": "datetime"
    }
  ],
  "created_by": "ObjectId (ref users)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.3 `tasks`
```json
{
  "_id": "ObjectId",
  "title": "string",
  "description": "string",
  "project_id": "ObjectId (ref projects)",
  "assigned_to": "ObjectId (ref users)",
  "created_by": "ObjectId (ref users)",
  "status": "todo | in_progress | review | done",
  "priority": "low | medium | high | critical",
  "due_date": "datetime",
  "completed_at": "datetime",
  "subtasks": [
    {
      "id": "string",
      "title": "string",
      "completed": "boolean"
    }
  ],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.4 `time_logs`
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "project_id": "ObjectId (ref projects)",
  "date": "datetime (date only)",
  "hours": "float",
  "description": "string",
  "created_at": "datetime"
}
```

### 4.5 `reports`
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "project_id": "ObjectId (ref projects)",
  "date": "datetime",
  "content": "string",
  "tasks_completed": ["string"],
  "blockers": "string",
  "plan_for_tomorrow": "string",
  "status": "submitted | approved | needs_revision",
  "reviewed_by": "ObjectId (ref users)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.6 `notifications`
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "title": "string",
  "message": "string",
  "type": "task | project | report | announcement | system",
  "is_read": "boolean",
  "related_id": "string (optional — ID of related entity)",
  "created_at": "datetime"
}
```

### 4.7 `announcements`
```json
{
  "_id": "ObjectId",
  "title": "string",
  "content": "string",
  "scope": "org | project",
  "project_id": "ObjectId (optional — ref projects)",
  "created_by": "ObjectId (ref users)",
  "priority": "low | normal | high | urgent",
  "is_pinned": "boolean",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.8 `chat_sessions`
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "title": "string",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.9 `chat_messages`
```json
{
  "_id": "ObjectId",
  "session_id": "ObjectId (ref chat_sessions)",
  "user_id": "ObjectId (ref users)",
  "role": "user | assistant",
  "content": "string",
  "created_at": "datetime"
}
```

---

## 5. Backend API — All Routers & Endpoints

Base URL: `http://localhost:8000`

All endpoints except `POST /auth/login` and `POST /auth/register` require `Authorization: Bearer <JWT>` header.

---

### 5.1 Auth Router — `/auth`

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/auth/register` | Create new user account | Public |
| POST | `/auth/login` | Login, returns JWT + user object | Public |
| POST | `/auth/change-password` | Change own password (requires old password) | Any |

**POST `/auth/login`** — Request body:
```json
{ "email": "string", "password": "string" }
```
Response:
```json
{ "access_token": "string", "token_type": "bearer", "user": { ...user_object } }
```

---

### 5.2 Users Router — `/users`

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/users/me` | Get current user profile | Any |
| PUT | `/users/me` | Update own profile | Any |
| GET | `/users/` | List all users (filtered by role/department) | TL+ |
| GET | `/users/{user_id}` | Get user by ID | TL+ |
| PUT | `/users/{user_id}` | Update user (admin only) | COO+ |
| DELETE | `/users/{user_id}` | Deactivate user | CEO |
| GET | `/users/team` | Get users in requester's scope | TL+ |

---

### 5.3 Projects Router — `/projects`

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/projects/` | Create project | PM+ |
| GET | `/projects/` | List projects (scoped by role) | Any |
| GET | `/projects/{project_id}` | Get project details | Member |
| PUT | `/projects/{project_id}` | Update project | PM of project / COO+ |
| DELETE | `/projects/{project_id}` | Delete project | COO+ |
| POST | `/projects/{project_id}/members` | Add member to project | PM of project / COO+ |
| DELETE | `/projects/{project_id}/members/{user_id}` | Remove member | PM of project / COO+ |
| POST | `/projects/{project_id}/tracking-docs` | Add Google Doc/Sheet to track | PM of project / COO+ |
| GET | `/projects/{project_id}/tracking-docs` | List tracking docs (api_key masked) | Member |
| DELETE | `/projects/{project_id}/tracking-docs/{doc_id}` | Remove tracking doc | PM of project / COO+ |
| GET | `/projects/{project_id}/tracking-docs/live` | Fetch live Drive stats for all docs | PM of project / COO+ |

**POST `/projects/{project_id}/tracking-docs`** — Request body:
```json
{
  "url": "https://docs.google.com/spreadsheets/d/FILE_ID/edit",
  "title": "Sprint Tracker",
  "api_key": "AIza..."
}
```
Response includes extracted `file_id` and detected `doc_type`.

**GET `/projects/{project_id}/tracking-docs/live`** — Response per doc:
```json
{
  "doc_id": "string",
  "title": "string",
  "doc_type": "sheets",
  "url": "string",
  "drive_stats": {
    "name": "Sprint Tracker",
    "version": 142,
    "modified_time": "2026-04-02T10:30:00Z",
    "last_modifier": "Jane Smith",
    "error": null
  }
}
```

---

### 5.4 Tasks Router — `/tasks`

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/tasks/` | Create task | TL+ |
| GET | `/tasks/` | List tasks (project_id filter, role-scoped) | Member |
| GET | `/tasks/{task_id}` | Get task details | Member |
| PUT | `/tasks/{task_id}` | Update task | Assignee / TL+ |
| DELETE | `/tasks/{task_id}` | Delete task | TL+ |
| POST | `/tasks/{task_id}/subtasks` | Add subtask | TL+ |
| PUT | `/tasks/{task_id}/subtasks/{subtask_id}` | Update subtask | Assignee / TL+ |
| DELETE | `/tasks/{task_id}/subtasks/{subtask_id}` | Remove subtask | TL+ |

---

### 5.5 Time Logs Router — `/time-logs`

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/time-logs/` | Log hours for a project on a date | Any |
| GET | `/time-logs/` | List logs (user_id / project_id / date filters) | Any (scoped) |
| PUT | `/time-logs/{log_id}` | Edit a log entry | Owner / TL+ |
| DELETE | `/time-logs/{log_id}` | Delete a log entry | Owner / COO+ |
| GET | `/time-logs/summary` | Aggregated hours by user/project/date range | TL+ |

---

### 5.6 Reports Router — `/reports`

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/reports/` | Submit daily report | Any |
| GET | `/reports/` | List reports (date/project/user filters, scoped) | Any |
| GET | `/reports/{report_id}` | Get report detail | Any (scoped) |
| PUT | `/reports/{report_id}` | Edit own report | Owner |
| PUT | `/reports/{report_id}/review` | Approve / request revision | TL+ |
| GET | `/reports/compliance` | Compliance rates per user / project | TL+ |

---

### 5.7 Analytics Router — `/analytics`

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/analytics/employees` | Performance list for all visible employees | TL+ |
| GET | `/analytics/employees/{user_id}` | Detailed analytics for one employee | TL+ |
| GET | `/analytics/projects` | Project-level analytics summary | PM+ |
| GET | `/analytics/projects/{project_id}` | Detailed project analytics | PM+ |

**GET `/analytics/employees`** — Response:
```json
[
  {
    "user_id": "string",
    "name": "string",
    "email": "string",
    "department": "string",
    "primary_role": "string",
    "avg_hours_per_day": 7.2,
    "task_completion_rate": 82,
    "report_compliance": 0.9,
    "performance_mode": {
      "score": 78,
      "label": "Good",
      "color": "#22c55e",
      "breakdown": {
        "hours": 22,
        "tasks": 16,
        "compliance": 13,
        "commits": 15,
        "docs": 12
      }
    }
  }
]
```

**GET `/analytics/employees/{user_id}`** — Includes:
- All list fields
- `github_commits.repos` — per-project commit detail
- `tracking_docs_stats` — per-doc Drive stats (PM/exec roles only)
- Full `time_logs`, `reports`, `tasks` history

---

### 5.8 Notifications Router — `/notifications`

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/notifications/` | List notifications for current user | Any |
| PUT | `/notifications/{notif_id}/read` | Mark one notification as read | Any |
| PUT | `/notifications/read-all` | Mark all as read | Any |
| DELETE | `/notifications/{notif_id}` | Delete notification | Any |

---

### 5.9 Announcements Router — `/announcements`

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/announcements/` | Create announcement | TL+ |
| GET | `/announcements/` | List announcements (scope/project filter) | Any |
| GET | `/announcements/{ann_id}` | Get announcement | Any |
| PUT | `/announcements/{ann_id}` | Update announcement | Creator / COO+ |
| DELETE | `/announcements/{ann_id}` | Delete announcement | Creator / COO+ |

---

### 5.10 Chatbot Router — `/chatbot`

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/chatbot/sessions` | List user's chat sessions | Any |
| POST | `/chatbot/sessions` | Create new session | Any |
| DELETE | `/chatbot/sessions/{session_id}` | Delete session + messages | Any |
| GET | `/chatbot/sessions/{session_id}/messages` | Get message history | Any |
| POST | `/chatbot/sessions/{session_id}/messages` | Send message, get AI reply | Any |

---

### 5.11 WebSocket — `/ws`

| Path | Description |
|---|---|
| `GET /ws/{user_id}` | WebSocket connection for real-time notifications |

The server sends JSON frames: `{ "type": "notification", "data": { ...notification } }`

---

## 6. Services & Utilities

### 6.1 `utils/repo.py` — GitHub/GitLab Commit Fetching

```python
async def fetch_commits(
    repo_url: str,
    project_token: str = "",
    per_page: int = 100,
    author_email: str = ""
) -> dict
```

- Detects GitHub vs GitLab from URL
- For GitHub: `GET /repos/{owner}/{repo}/commits?per_page=N&author={email}`
- For GitLab: `GET /projects/{encoded_path}/repository/commits?per_page=N&author_email={email}`
- Returns: `{ commits: [...], total_commits: int, error: str | None }`
- Token passed as `Authorization: token {pat}` (GitHub) or `PRIVATE-TOKEN: {pat}` (GitLab)

### 6.2 `utils/gdrive.py` — Google Drive Tracking

```python
def extract_file_id(url: str) -> str | None
def detect_doc_type(url: str) -> str  # "sheets" | "docs" | "slides" | "other"
async def fetch_gdrive_stats(file_id: str, api_key: str) -> dict
```

`fetch_gdrive_stats` calls:
```
GET https://www.googleapis.com/drive/v3/files/{file_id}
    ?fields=name,version,modifiedTime,lastModifyingUser,mimeType
    &key={api_key}
```

The `version` field is an integer that increments on every save — used as edit-count proxy.

Returns: `{ name, version, modified_time, last_modifier, mime_type, error }`

### 6.3 `utils/token_encrypt.py` — Fernet Encryption

```python
def encrypt_token(plain: str) -> str
def decrypt_token(cipher: str) -> str
```

Uses a Fernet key from `FERNET_KEY` environment variable. Repository PATs are stored encrypted in MongoDB and decrypted at query time.

### 6.4 `utils/team_scope.py` — Role-Based Data Scoping

Helper functions that build MongoDB query filters based on the current user's role:
- CEO/COO: see all users/projects
- PM: see own projects + members
- TL: see own team + assigned projects
- Employee: see only own data

### 6.5 `database.py`

```python
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(settings.MONGODB_URL)
db = client[settings.DB_NAME]
```

Single `db` instance imported throughout all routers.

### 6.6 `auth.py`

```python
def create_access_token(data: dict, expires_delta: timedelta) -> str
def verify_token(token: str) -> dict  # raises HTTPException on invalid
async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict
```

JWT payload contains: `{ "sub": user_id_str, "role": primary_role, "exp": timestamp }`

---

## 7. Middleware & Security

### 7.1 CORS

Configured in `main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 7.2 Authentication Flow

1. Client sends `POST /auth/login` → receives JWT
2. JWT stored in `localStorage` on frontend
3. Axios interceptor attaches `Authorization: Bearer <token>` to every request
4. FastAPI `Depends(get_current_user)` verifies JWT on every protected route
5. Current user dict injected into route handlers via dependency injection

### 7.3 Role Enforcement

Each router checks `current_user["primary_role"]` against allowed roles:
```python
if current_user["primary_role"] not in ("ceo", "coo", "pm"):
    raise HTTPException(status_code=403, detail="Insufficient permissions")
```

Higher roles always have access to lower-role endpoints.

### 7.4 Password Security

- Passwords hashed with bcrypt (12 rounds) at registration
- `passlib.context.CryptContext` for hash + verify
- Plain passwords never stored or logged

---

## 8. Chatbot System

### 8.1 Pipeline

```
User message
    │
    ▼
Context builder
    ├── Last N messages from session (MongoDB)
    ├── User's projects (names, status, members)
    ├── User's recent tasks (title, status)
    ├── User's recent reports
    └── User's team info (if TL+)
    │
    ▼
System prompt construction
    │
    ▼
AWS Bedrock (amazon.nova-pro-v1:0)
    │  [on failure/timeout]
    ▼
Groq (llama-3.3-70b-versatile) ← fallback
    │
    ▼
AI response stored in chat_messages
    │
    ▼
Response returned to client
```

### 8.2 Context Injection

The system prompt is dynamically populated with:
- The user's name, role, department
- Their current active projects (names, deadlines)
- Their pending tasks (title, due date, priority)
- Their last 3–5 reports summary
- Team members (if TL+)

This gives the chatbot awareness of the user's actual workload without explicit retrieval.

### 8.3 Model Config

| Provider | Model ID | Max tokens | Temperature |
|---|---|---|---|
| AWS Bedrock | amazon.nova-pro-v1:0 | 2048 | 0.7 |
| Groq | llama-3.3-70b-versatile | 2048 | 0.7 |

Fallback is automatic — if Bedrock raises any exception, Groq is tried immediately.

---

## 9. Frontend Pages & Routing

### 9.1 Route Map

```
/                     → redirect to /dashboard (if auth) or /login
/login                → LoginPage
/dashboard            → DashboardPage      (protected)
/projects             → ProjectsPage       (protected)
/projects/:id         → ProjectDetailPage  (protected)
/tasks                → TasksPage          (protected)
/time-logs            → TimeLogsPage       (protected)
/reports              → ReportsPage        (protected)
/analytics            → AnalyticsPage      (protected, TL+)
/chatbot              → ChatbotPage        (protected)
/announcements        → AnnouncementsPage  (protected)
/notifications        → NotificationsPage  (protected)
/profile              → ProfilePage        (protected)
/users                → UsersPage          (protected, COO+)
```

### 9.2 Page Summaries

**LoginPage** — Email/password form, calls `POST /auth/login`, stores token, dispatches Redux login action, redirects to dashboard.

**DashboardPage** — Summary widgets: active projects count, pending tasks, unread notifications, recent announcements, today's hours logged.

**ProjectsPage** — Grid/list of projects with status badges, priority indicators, member avatars. Filter by status. Create project modal (PM+).

**ProjectDetailPage** — Tabbed interface:
- **Overview** — project info, dates, members list
- **Tasks** — Kanban board or list, add/edit/delete tasks
- **Time Logs** — hour log table for project, add entry
- **Reports** — daily reports submitted for this project
- **Members** — manage team members (PM+)
- **Settings** — edit project details, repo URL, repo token (PM+)
- **Tracking** — Google Docs/Sheets tracker, add/remove docs, view live Drive stats (PM+ only)

**TasksPage** — All tasks across all visible projects. Filter by project, status, priority, assignee. Quick status update inline.

**TimeLogsPage** — Calendar or list view of hour logs. Add/edit/delete entries. Summary totals.

**ReportsPage** — Daily report form (submit new) + history list. TL+ can approve/request revision.

**AnalyticsPage** — Employee performance list with performance mode scores, radar/bar breakdowns. Click employee for detail modal with per-project commits, tracking docs stats, compliance trend.

**ChatbotPage** — Left sidebar: session list, new session button. Main area: message thread with markdown rendering. Input box at bottom.

**AnnouncementsPage** — Org-wide + project announcements. Pinned at top. TL+ can create.

**NotificationsPage** — Chronological notification list with read/unread state. Mark all read button.

**ProfilePage** — View/edit own profile fields. Change password section.

**UsersPage** — Full user list (COO+ only). Create user, edit roles, deactivate.

---

## 10. Redux Store

### 10.1 Store Shape

```typescript
{
  auth: {
    user: User | null,
    token: string | null,
    loading: boolean,
    error: string | null
  },
  projects: {
    list: Project[],
    current: Project | null,
    loading: boolean,
    error: string | null
  },
  tasks: {
    list: Task[],
    loading: boolean,
    error: string | null
  },
  timeLogs: {
    list: TimeLog[],
    loading: boolean,
    error: string | null
  },
  reports: {
    list: Report[],
    loading: boolean,
    error: string | null
  },
  notifications: {
    list: Notification[],
    unreadCount: number,
    loading: boolean
  },
  announcements: {
    list: Announcement[],
    loading: boolean
  },
  analytics: {
    employees: EmployeeAnalytics[],
    selectedEmployee: EmployeeDetail | null,
    loading: boolean,
    error: string | null
  },
  chatbot: {
    sessions: ChatSession[],
    currentSession: string | null,
    messages: ChatMessage[],
    loading: boolean,
    sending: boolean
  },
  users: {
    list: User[],
    loading: boolean
  }
}
```

### 10.2 Sagas

Each feature has a saga that watches for actions and handles async API calls:
- `authSaga` — login, logout, token refresh
- `projectsSaga` — CRUD, member management, tracking docs
- `tasksSaga` — CRUD, subtask updates
- `timeLogsSaga` — CRUD, summary fetch
- `reportsSaga` — submit, review, compliance fetch
- `analyticsSaga` — list fetch, detail fetch
- `notificationsSaga` — list, mark read, WebSocket integration
- `chatbotSaga` — session management, message send/receive

---

## 11. Key Frontend Components

### Layout & Navigation
- **`Layout.tsx`** — Shell with sidebar + main content area, notification bell, WebSocket setup
- **`Sidebar.tsx`** — Navigation links, role-filtered menu items, active state
- **`ProtectedRoute.tsx`** — Checks auth state, redirects to login if unauthenticated

### Project Components
- **`ProjectCard.tsx`** — Card view with status badge, priority color, member count, deadline
- **`MembersPanel.tsx`** — Member list with add/remove (portal modal)
- **`TrackingDocsPanel.tsx`** — Add/list/remove Drive docs, live stats refresh button

### Task Components
- **`TaskBoard.tsx`** — Kanban columns (todo/in_progress/review/done)
- **`TaskCard.tsx`** — Draggable card with assignee avatar, priority badge, due date
- **`TaskModal.tsx`** — Create/edit task form with subtasks

### Analytics Components
- **`PerformanceMeter.tsx`** — Circular score display with label and color
- **`BreakdownBars.tsx`** — 5 horizontal bars (hours/tasks/compliance/commits/docs)
- **`CommitCard.tsx`** — Per-project commit count and recent commits list
- **`TrackingDocsCard.tsx`** — Per-doc edit count, last modifier, modified date (PM view)

### Chatbot Components
- **`SessionList.tsx`** — Sidebar session list with delete button
- **`MessageThread.tsx`** — Scrollable message history with user/assistant bubbles
- **`ChatInput.tsx`** — Textarea with send button, Enter to submit

---

## 12. Core Data Flows

### 12.1 Authentication Flow

```
User fills login form
    → dispatch(loginRequest({ email, password }))
    → authSaga intercepts
    → POST /auth/login
    → on success: store token in localStorage
                  dispatch(loginSuccess({ user, token }))
                  redirect to /dashboard
    → on failure: dispatch(loginFailure(error))
```

### 12.2 Project Creation Flow

```
PM clicks "Create Project"
    → modal opens with form
    → fills name, description, dates, optional repo_url + repo_token
    → dispatch(createProjectRequest(data))
    → saga: POST /projects/
    → backend: encrypt repo_token with Fernet
               insert into db.projects
               create notification for relevant stakeholders
               push via WebSocket
    → saga: dispatch(createProjectSuccess(project))
    → project list updates
```

### 12.3 Report Submission Flow

```
Employee submits daily report
    → POST /reports/ with content + project_id
    → backend: insert into db.reports
               compute daily compliance update
               create notification for TL/PM
               WebSocket push
    → frontend: report added to list, compliance score refreshes
```

### 12.4 Real-Time Notification Flow

```
Backend event occurs (task assigned, report reviewed, etc.)
    → ws_manager.send(user_id, notification_payload)
    → WebSocket frame sent to connected client
    → Layout.tsx WebSocket listener receives frame
    → dispatch(addNotification(notification))
    → unreadCount increments
    → bell badge updates
```

### 12.5 GitHub Commit Tracking Flow (Per-Project)

```
Analytics detail view for employee
    → GET /analytics/employees/{user_id}
    → backend:
        query db.projects WHERE member_ids contains user_id AND repo_url exists
        for each project:
            decrypt repo_token
            GET GitHub/GitLab API with author_email filter
            count commits, get recent 5
        return per-project array
    → frontend: CommitCard per project
                total commits summed
                performance score updated with commits signal
```

### 12.6 Google Drive Tracking Flow

```
PM adds tracking doc
    → POST /projects/{id}/tracking-docs { url, title, api_key }
    → backend: extract_file_id(url)
               detect_doc_type(url)
               store in project.tracking_docs array
    
PM views live stats
    → GET /projects/{id}/tracking-docs/live
    → backend:
        for each tracking_doc:
            fetch_gdrive_stats(file_id, api_key)
            return version (edit count), modified_time, last_modifier
    
Analytics detail for PM
    → backend:
        query db.projects WHERE pm_id == user_id
        for each project's tracking_docs:
            fetch live Drive stats
            compute edits_per_day from version / days_since_added
        aggregate into tracking_docs_results
        feed docs_edits_per_day into _perf_mode()
```

### 12.7 Chatbot Message Flow

```
User sends message
    → POST /chatbot/sessions/{id}/messages { content }
    → backend:
        load last 10 messages from db.chat_messages
        build context: user projects, tasks, reports
        construct system prompt with context
        try AWS Bedrock invoke
            on failure: try Groq
        store user message + AI reply in db.chat_messages
    → return { role: "assistant", content: "..." }
    → frontend: append to message thread, scroll to bottom
```

---

## 13. Role-Based Access Control

### Role Hierarchy (highest → lowest)

```
CEO > COO > PM > TL > Employee
```

### RBAC Matrix

| Feature | Employee | TL | PM | COO | CEO |
|---|---|---|---|---|---|
| View own profile | ✓ | ✓ | ✓ | ✓ | ✓ |
| Submit reports | ✓ | ✓ | ✓ | ✓ | ✓ |
| Log hours | ✓ | ✓ | ✓ | ✓ | ✓ |
| Use chatbot | ✓ | ✓ | ✓ | ✓ | ✓ |
| View team analytics | | ✓ | ✓ | ✓ | ✓ |
| Review reports | | ✓ | ✓ | ✓ | ✓ |
| Create tasks | | ✓ | ✓ | ✓ | ✓ |
| Create announcements | | ✓ | ✓ | ✓ | ✓ |
| Create projects | | | ✓ | ✓ | ✓ |
| Manage project members | | | ✓ | ✓ | ✓ |
| Add tracking docs | | | ✓ | ✓ | ✓ |
| View tracking docs (own projects) | | | ✓ | ✓ | ✓ |
| View all users list | | | | ✓ | ✓ |
| Create/edit users | | | | ✓ | ✓ |
| Delete projects | | | | ✓ | ✓ |
| Deactivate users | | | | | ✓ |

### Project-Level Scoping

Even within a role, data is scoped:
- **Employee**: only sees projects they are `member_ids` of
- **TL**: sees projects where they are `tl_id` or a member
- **PM**: sees projects where they are `pm_id`
- **COO/CEO**: sees all projects

---

## 14. Real-Time Architecture

### WebSocket Connection

```
Frontend (Layout.tsx)
    → new WebSocket("ws://localhost:8000/ws/{user_id}?token={jwt}")
    → connection maintained for session lifetime
    → reconnect on disconnect (exponential backoff)

Backend (routers/websocket.py)
    → WebSocket endpoint /ws/{user_id}
    → ws_manager.connect(user_id, websocket)
    → waits for disconnect
    → ws_manager.disconnect(user_id)
```

### WebSocket Manager

```python
class WebSocketManager:
    connections: dict[str, WebSocket]  # user_id → websocket

    async def connect(user_id, ws)
    def disconnect(user_id)
    async def send(user_id, data: dict)   # sends JSON frame
    async def broadcast(data: dict)       # sends to all connected users
```

### Notification Trigger Points

Notifications are created and pushed from:
- Task assignment → notify assignee
- Task status change → notify project PM/TL
- Report reviewed → notify report author
- Project member added → notify new member
- Announcement created → notify all relevant users
- Project deadline approaching → notify PM (scheduled check)

---

## 15. External Integrations

### 15.1 GitHub API v3

- Endpoint: `https://api.github.com/repos/{owner}/{repo}/commits`
- Auth: `Authorization: token {personal_access_token}`
- Filter: `?author={email}&per_page=100`
- Rate limit: 5,000 requests/hour (authenticated)
- PAT stored encrypted in `project.repo_token`

### 15.2 GitLab API v4

- Endpoint: `https://gitlab.com/api/v4/projects/{encoded_path}/repository/commits`
- Auth: `PRIVATE-TOKEN: {personal_access_token}`
- Filter: `?author_email={email}&per_page=100`
- Self-hosted GitLab: URL auto-detected from `repo_url`

### 15.3 Google Drive API v3

- Endpoint: `https://www.googleapis.com/drive/v3/files/{fileId}`
- Auth: `?key={api_key}` (API key, not OAuth)
- Prerequisite: File must be shared "Anyone with the link can view"
- Prerequisite: API key must have "Drive API" enabled in Google Cloud Console
- `version` field = total number of saves (used as edit-count proxy)
- `lastModifyingUser.displayName` = last editor name

### 15.4 AWS Bedrock

- Model: `amazon.nova-pro-v1:0`
- Region: configured via `AWS_DEFAULT_REGION` env var
- Auth: `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` env vars
- SDK: `boto3`

### 15.5 Groq

- Model: `llama-3.3-70b-versatile`
- Auth: `GROQ_API_KEY` env var
- SDK: `groq` Python package
- Role: Fallback when Bedrock fails

---

## 16. Performance & Analytics Engine

### 16.1 Performance Score Formula

The `_perf_mode()` function computes a 100-point score from 5 signals:

```
Total Score = hours_score + task_score + compliance_score + commit_score + docs_score
```

| Signal | Max Points | Formula |
|---|---|---|
| Hours | 25 | `min(25, (avg_hours / 8.0) * 25)` |
| Tasks | 20 | `min(20, task_completion_rate * 0.20)` |
| Compliance | 15 | `min(15, report_compliance_rate * 15)` |
| Commits | 20 | `min(20, (commits_per_day / 2.0) * 20)` OR `projects_with_repo * 6` |
| Docs | 20 | `min(20, (docs_edits_per_day / 5.0) * 20)` OR `tracking_docs_count * 5` |

### 16.2 Score Labels

| Score Range | Label | Color |
|---|---|---|
| 85–100 | Excellent | #22c55e (green) |
| 70–84 | Good | #84cc16 (lime) |
| 55–69 | Average | #eab308 (yellow) |
| 40–54 | Below Average | #f97316 (orange) |
| 0–39 | Needs Improvement | #ef4444 (red) |

### 16.3 List View vs Detail View

**List view** (`GET /analytics/employees`) — optimized for speed:
- Computes hours, task rate, compliance from batch MongoDB aggregations
- Commit signal: counts projects-with-repo per user (single DB query, no GitHub API)
- Docs signal: counts tracking_docs in PM's projects (single DB query, no Drive API)

**Detail view** (`GET /analytics/employees/{user_id}`) — full accuracy:
- Makes live GitHub/GitLab API calls per project the user is a member of
- Makes live Google Drive API calls for each tracking doc in PM's projects
- Returns granular per-project and per-doc breakdowns

### 16.4 Commit Attribution Logic

Commits are attributed **per project**, not globally:
1. Find all projects where `member_ids` contains the user AND `repo_url` is set
2. For each project: call GitHub/GitLab API with `author_email=user.email`
3. Results show per-project commit counts — accurate to the user's email on that repo
4. Total commits = sum across all projects

### 16.5 Doc Edit Attribution Logic

Edit tracking uses the Drive v3 `version` field:
1. PM creates a project and adds tracking docs (Sheets/Docs/Slides)
2. Each doc has a stored `api_key` (Drive API key)
3. Analytics calls `fetch_gdrive_stats` per doc
4. `version` gives total edits since file creation
5. `edits_per_day = version / max(days_since_added, 1)`
6. `last_modifier` field shows who last edited (Drive API)
7. These metrics feed the `docs` signal in the PM's performance score

---

*Last updated: 2026-04-03*
*Reflects codebase state including: tracking docs, per-project commit attribution, 5-signal performance scoring*
