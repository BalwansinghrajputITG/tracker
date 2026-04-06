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
17. [MCP Server](#17-mcp-server)
18. [Infrastructure & DevOps](#18-infrastructure--devops)

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
- **AI chatbot** — AWS Bedrock (Nova Pro) + Groq (llama-3.3-70b) fallback, RAG-style context with slash commands
- **Real-time notifications & chat** — WebSocket push, team/project/DM channels
- **Comprehensive analytics** — company-wide, department, and employee-level metrics with productivity scoring
- **MCP server** — 19 Claude-compatible tools exposing full PM system via Model Context Protocol
- **Team & department management** — org hierarchy, PM/TL assignment, scoped access
- **Document management (Personal Hub)** — Google Drive-linked documents, collaboration tracking
- **Digital marketing module** — campaign management and marketing analytics
- **Announcement system** — org-wide and project-scoped announcements

---

## 2. Technology Stack

### Backend
| Layer | Technology |
|---|---|
| Runtime | Python 3.11+ |
| Framework | FastAPI (async) |
| ASGI server | Uvicorn + Gunicorn (4 workers) |
| Database driver | Motor (async MongoDB) |
| Database | MongoDB Atlas (or local) |
| Cache / Session | Redis 7.4 |
| Auth | JWT HS256 — `python-jose` |
| Password hashing | `bcrypt` via `passlib` |
| HTTP client | `httpx` (async) |
| WebSockets | FastAPI native WebSocket |
| LLM primary | AWS Bedrock — `amazon.nova-pro-v1:0` |
| LLM fallback | Groq — `llama-3.3-70b-versatile` |
| Token encryption | `cryptography` Fernet (symmetric) |
| Validation | Pydantic v2.9.0 + pydantic-settings |
| Email | fastapi-mail (SMTP) |
| Environment | `python-dotenv` |

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18.3.1 |
| Language | TypeScript 4.9.5 |
| State management | Redux Toolkit 2.3.0 + Redux-Saga 1.3.0 |
| Routing | React Router v6 |
| HTTP client | Axios |
| Icons | Lucide React |
| Charts | Recharts |
| Animations | GSAP 3.14.2 |
| Build tool | React Scripts (Create React App) |
| Styling | Tailwind CSS 3.4.13 |
| Markdown | react-markdown + remark-gfm |
| Utilities | uuid |

### Infrastructure
| Service | Purpose |
|---|---|
| MongoDB Atlas | Primary data store |
| Redis | Caching, session management |
| AWS Bedrock | Primary LLM for chatbot |
| Groq API | Fallback LLM |
| Google Drive API v3 | Doc/Sheets edit tracking |
| GitHub API v3 / GitLab API v4 | Commit tracking |
| Docker + Docker Compose | Containerization |
| Nginx | Reverse proxy, static file serving |
| ngrok | Development tunneling |

---

## 3. Directory Structure

```
project/
├── backend/
│   ├── main.py                    # FastAPI app factory, CORS, middleware, router registration
│   ├── database.py                # Motor client + Redis client, singletons
│   ├── auth.py                    # JWT creation / verification
│   ├── config.py                  # Pydantic settings (env vars)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   ├── routers/
│   │   ├── auth.py                # Login, register, password change, token refresh
│   │   ├── users.py               # User CRUD, profile, team listing
│   │   ├── projects.py            # Project CRUD + tracking-docs endpoints
│   │   ├── tasks.py               # Task CRUD, subtasks, assignment
│   │   ├── time_logs.py           # Daily hour log entries
│   │   ├── reports.py             # Daily reports, compliance
│   │   ├── analytics.py           # Comprehensive analytics (company/projects/employees)
│   │   ├── notifications.py       # Notification list, mark-read
│   │   ├── announcements.py       # Org/project announcements
│   │   ├── chatbot.py             # AI chatbot sessions + messages
│   │   ├── chat.py                # Real-time messaging (rooms, messages)
│   │   ├── teams.py               # Team management (create, members, assignments)
│   │   ├── departments.py         # Department management
│   │   ├── documents.py           # Personal hub documents
│   │   ├── marketing.py           # Digital marketing campaigns and analytics
│   │   └── websocket.py           # WebSocket connection manager endpoint
│   ├── middleware/
│   │   ├── auth_middleware.py     # JWT verification middleware
│   │   ├── rbac.py                # Role-based access control
│   │   └── rate_limit.py          # Rate limiting (500 req/sec per IP)
│   ├── models/                    # Pydantic request/response schemas
│   ├── services/
│   │   └── notifications.py       # Notification creation and dispatch service
│   ├── ws_manager/
│   │   └── manager.py             # WebSocket connection registry
│   └── utils/
│       ├── gdrive.py              # Google Drive v3 helpers
│       ├── repo.py                # GitHub/GitLab commit fetching
│       ├── token_encrypt.py       # Fernet encrypt/decrypt for repo tokens
│       ├── team_scope.py          # Role-based data scoping helpers
│       └── object_id.py           # ObjectId conversion utilities
│
├── frontend/
│   ├── src/
│   │   ├── index.tsx              # React entry point
│   │   ├── App.tsx                # Root router, protected routes
│   │   ├── index.css              # Tailwind CSS directives
│   │   ├── store/
│   │   │   ├── index.ts           # Redux store configuration
│   │   │   ├── rootReducer.ts     # Combined reducers
│   │   │   ├── slices/            # Redux Toolkit slices
│   │   │   │   ├── authSlice.ts
│   │   │   │   ├── projectsSlice.ts
│   │   │   │   ├── tasksSlice.ts
│   │   │   │   ├── reportsSlice.ts
│   │   │   │   ├── analyticsSlice.ts
│   │   │   │   ├── notificationsSlice.ts
│   │   │   │   ├── chatSlice.ts
│   │   │   │   ├── teamsSlice.ts
│   │   │   │   └── themeSlice.ts
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
│   │   │   ├── ChatPage.tsx
│   │   │   ├── AnnouncementsPage.tsx
│   │   │   ├── NotificationsPage.tsx
│   │   │   ├── ProfilePage.tsx
│   │   │   ├── UsersPage.tsx
│   │   │   ├── TeamsPage.tsx
│   │   │   ├── DepartmentsPage.tsx
│   │   │   └── PersonalHubPage.tsx
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   ├── chat/              # Real-time chat components
│   │   │   ├── chatbot/           # AI chatbot UI components
│   │   │   ├── dashboards/        # Role-based dashboard components
│   │   │   │   ├── CEODashboard.tsx
│   │   │   │   ├── COODashboard.tsx
│   │   │   │   ├── PMDashboard.tsx
│   │   │   │   ├── TeamLeadDashboard.tsx
│   │   │   │   └── EmployeeDashboard.tsx
│   │   │   └── common/            # Shared UI: CursorEffect, modals, badges
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── utils/                 # Frontend utilities
│   │   └── api/
│   │       └── axios.ts           # Axios instance, base URL, interceptors
│   ├── package.json
│   └── Dockerfile
│
├── mcp_server/                    # Model Context Protocol server
│   ├── server.py                  # FastMCP implementation (19 tools)
│   ├── requirements.txt
│   ├── .env.example
│   └── claude_desktop_config.json
│
├── database/
│   └── seed.py                    # MongoDB seed / demo data script
│
├── infrastructure/
│   ├── docker/
│   │   ├── docker-compose.yml     # Multi-container orchestration with resource limits
│   │   └── .env.example
│   └── nginx/
│       └── nginx.conf             # Reverse proxy + static file serving
│
├── .claude/
│   └── settings.local.json        # Claude Code permissions config
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
  "team_ids": ["ObjectId (ref teams)"],
  "is_active": "boolean",
  "github_url": "string",
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
  "status": "active | on_hold | completed | cancelled | archived",
  "priority": "low | medium | high | critical",
  "start_date": "datetime",
  "end_date": "datetime",
  "pm_id": "ObjectId (ref users)",
  "tl_id": "ObjectId (ref users)",
  "team_ids": ["ObjectId (ref teams)"],
  "member_ids": ["ObjectId (ref users)"],
  "is_delayed": "boolean",
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
  "status": "to_do | in_progress | done | blocked",
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

### 4.5 `daily_reports`
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "project_id": "ObjectId (ref projects)",
  "report_date": "datetime",
  "hours_worked": "float",
  "tasks_completed": ["string"],
  "blockers": "string",
  "progress_update": "string",
  "plan_for_tomorrow": "string",
  "status": "submitted | approved | needs_revision",
  "reviewed_by": "ObjectId (ref users)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.6 `teams`
```json
{
  "_id": "ObjectId",
  "name": "string",
  "description": "string",
  "lead_id": "ObjectId (ref users)",
  "member_ids": ["ObjectId (ref users)"],
  "project_ids": ["ObjectId (ref projects)"],
  "department": "string",
  "created_by": "ObjectId (ref users)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.7 `departments`
```json
{
  "_id": "ObjectId",
  "name": "string (unique)",
  "description": "string",
  "pm_id": "ObjectId (ref users)",
  "tl_id": "ObjectId (ref users)",
  "member_ids": ["ObjectId (ref users)"],
  "created_by": "ObjectId (ref users)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.8 `notifications`
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

### 4.9 `announcements`
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

### 4.10 `chat_rooms`
```json
{
  "_id": "ObjectId",
  "type": "direct | team | project",
  "name": "string",
  "participants": ["ObjectId (ref users)"],
  "team_id": "ObjectId (optional — ref teams)",
  "project_id": "ObjectId (optional — ref projects)",
  "created_at": "datetime"
}
```

### 4.11 `chat_messages`
```json
{
  "_id": "ObjectId",
  "room_id": "ObjectId (ref chat_rooms)",
  "sender_id": "ObjectId (ref users)",
  "content": "string",
  "sent_at": "datetime"
}
```

### 4.12 `chatbot_sessions`
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "title": "string",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.13 `chatbot_messages`
```json
{
  "_id": "ObjectId",
  "session_id": "ObjectId (ref chatbot_sessions)",
  "user_id": "ObjectId (ref users)",
  "role": "user | assistant",
  "content": "string",
  "created_at": "datetime"
}
```

### 4.14 `documents`
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "title": "string",
  "url": "string (Google Drive URL)",
  "doc_type": "sheets | docs | slides | other",
  "file_id": "string (extracted Drive file ID)",
  "api_key": "string",
  "edit_count": "integer",
  "last_modifier": "string",
  "last_modified": "datetime",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

---

## 5. Backend API — All Routers & Endpoints

Base URL: `http://localhost:8004`

All endpoints except `POST /auth/login` and `POST /auth/register` require `Authorization: Bearer <JWT>` header.

---

### 5.1 Auth Router — `/auth`

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/auth/register` | Create new user account | Public |
| POST | `/auth/login` | Login, returns JWT + user object | Public |
| POST | `/auth/refresh` | Refresh access token using refresh token | Any |
| POST | `/auth/change-password` | Change own password (requires old password) | Any |

**POST `/auth/login`** — Request body:
```json
{ "email": "string", "password": "string" }
```
Response:
```json
{
  "access_token": "string",
  "refresh_token": "string",
  "token_type": "bearer",
  "user": { "...user_object" }
}
```

---

### 5.2 Users Router — `/users`

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/users/me` | Get current user profile | Any |
| PUT | `/users/me` | Update own profile | Any |
| GET | `/users/` | List all users (filtered by role/department) | TL+ |
| GET | `/users/{user_id}` | Get user by ID | TL+ |
| PUT | `/users/{user_id}` | Update user | COO+ |
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
| GET | `/analytics/company` | Company-wide metrics (projects, tasks, reports, productivity) | COO+ |
| GET | `/analytics/projects` | All projects with delay status, completion rates | PM+ |
| GET | `/analytics/project/{project_id}` | Deep-dive project analytics (milestones, task breakdown) | PM+ |
| GET | `/analytics/project/{project_id}/suggestions` | AI-powered improvement suggestions | PM+ |
| GET | `/analytics/employees` | Employee performance list (role-scoped) | TL+ |
| GET | `/analytics/employee/{user_id}` | Individual employee data and report history | TL+ |
| GET | `/analytics/productivity` | Productivity scores per user/department | TL+ |

**GET `/analytics/company`** — Response includes:
```json
{
  "projects": {
    "total": 42,
    "active": 18,
    "delayed": 5,
    "completed": 17,
    "on_hold": 2
  },
  "tasks": {
    "total": 310,
    "completed": 215,
    "overdue": 12,
    "completion_rate": 69.4
  },
  "reports": {
    "total_submitted": 850,
    "compliance_rate": 0.87,
    "daily_trend": [{ "date": "2026-04-05", "count": 34 }]
  },
  "productivity_score": 74
}
```

**GET `/analytics/employees`** — Response per employee:
```json
{
  "user_id": "string",
  "name": "string",
  "email": "string",
  "department": "string",
  "primary_role": "string",
  "avg_hours_per_day": 7.2,
  "task_completion_rate": 82,
  "report_compliance": 0.9,
  "on_time_delivery_rate": 0.88,
  "productivity_score": 78,
  "performance_mode": {
    "score": 78,
    "label": "Good",
    "color": "#22c55e",
    "breakdown": {
      "compliance": 27,
      "on_time": 31,
      "task_completion": 20
    }
  }
}
```

---

### 5.8 Teams Router — `/teams`

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/teams/` | Create a new team | PM+ |
| GET | `/teams/` | List teams (scoped by role) | Any |
| GET | `/teams/{team_id}` | Get team details | Member |
| PUT | `/teams/{team_id}` | Update team info | Lead / COO+ |
| DELETE | `/teams/{team_id}` | Delete team | COO+ |
| POST | `/teams/{team_id}/members` | Add member to team | Lead / PM+ |
| DELETE | `/teams/{team_id}/members/{user_id}` | Remove member | Lead / PM+ |

---

### 5.9 Departments Router — `/departments`

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/departments/` | Create department | COO+ |
| GET | `/departments/` | List departments | Any |
| GET | `/departments/{dept_id}` | Get department details | Any |
| PUT | `/departments/{dept_id}` | Update department | COO+ |
| DELETE | `/departments/{dept_id}` | Delete department | CEO |
| POST | `/departments/{dept_id}/members` | Add member to department | COO+ |
| DELETE | `/departments/{dept_id}/members/{user_id}` | Remove member | COO+ |

---

### 5.10 Chat Router — `/chat`

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/chat/rooms` | List user's chat rooms | Any |
| POST | `/chat/rooms` | Create chat room (direct/team/project) | Any |
| GET | `/chat/rooms/{room_id}/messages` | Get message history | Member |
| POST | `/chat/rooms/{room_id}/messages` | Send a message | Member |

**WebSocket** — `ws://localhost:8004/ws/chat/{room_id}?token={jwt}`
Sends/receives: `{ "type": "message", "data": { ...message } }` and `{ "type": "typing", "user_id": "..." }`

---

### 5.11 Documents Router — `/documents`

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/documents/` | List user's documents (Personal Hub) | Any |
| POST | `/documents/` | Add a document (Drive link) | Any |
| GET | `/documents/{doc_id}` | Get document details + live Drive stats | Any |
| PUT | `/documents/{doc_id}` | Update document metadata | Owner |
| DELETE | `/documents/{doc_id}` | Remove document | Owner |
| POST | `/documents/{doc_id}/changes` | Log a manual change entry | Owner |
| GET | `/documents/{doc_id}/changes` | Get change history | Owner |

---

### 5.12 Notifications Router — `/notifications`

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/notifications/` | List notifications for current user | Any |
| PUT | `/notifications/{notif_id}/read` | Mark one notification as read | Any |
| PUT | `/notifications/read-all` | Mark all as read | Any |
| DELETE | `/notifications/{notif_id}` | Delete notification | Any |

---

### 5.13 Announcements Router — `/announcements`

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/announcements/` | Create announcement | TL+ |
| GET | `/announcements/` | List announcements (scope/project filter) | Any |
| GET | `/announcements/{ann_id}` | Get announcement | Any |
| PUT | `/announcements/{ann_id}` | Update announcement | Creator / COO+ |
| DELETE | `/announcements/{ann_id}` | Delete announcement | Creator / COO+ |

---

### 5.14 Chatbot Router — `/chatbot`

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/chatbot/sessions` | List user's chat sessions | Any |
| POST | `/chatbot/sessions` | Create new session | Any |
| DELETE | `/chatbot/sessions/{session_id}` | Delete session + messages | Any |
| GET | `/chatbot/sessions/{session_id}/messages` | Get message history | Any |
| POST | `/chatbot/sessions/{session_id}/messages` | Send message, get AI reply | Any |

---

### 5.15 WebSocket — `/ws`

| Path | Description |
|---|---|
| `GET /ws/{user_id}` | Notification push stream for current user |
| `GET /ws/chat/{room_id}` | Chat room real-time messaging |

Notification frame: `{ "type": "notification", "data": { ...notification } }`

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

Returns: `{ name, version, modified_time, last_modifier, mime_type, error }`

### 6.3 `utils/token_encrypt.py` — Fernet Encryption

```python
def encrypt_token(plain: str) -> str
def decrypt_token(cipher: str) -> str
```

Uses a Fernet key from `FERNET_KEY` environment variable. Repository PATs are stored encrypted in MongoDB and decrypted at query time.

### 6.4 `utils/team_scope.py` — Role-Based Data Scoping

Helper functions that build MongoDB query filters based on the current user's role:
- CEO/COO: see all users/projects/departments
- PM: see own projects + members
- TL: see own team + assigned projects
- Employee: see only own data

### 6.5 `utils/object_id.py` — ObjectId Utilities

Helpers for converting between MongoDB ObjectId and string representations in responses and queries.

### 6.6 `database.py`

```python
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis

client = AsyncIOMotorClient(settings.MONGODB_URL)
db = client[settings.DB_NAME]

redis_client = redis.from_url(settings.REDIS_URL)
```

Both `db` and `redis_client` singletons imported throughout all routers.

### 6.7 `services/notifications.py`

Centralised service for creating and dispatching notifications:
- Inserts notification document into `db.notifications`
- Calls `ws_manager.send(user_id, payload)` for real-time push
- Used by all routers on key events

---

## 7. Middleware & Security

### 7.1 CORS

Configured in `main.py` with allowed origins from `ALLOWED_ORIGINS` env var:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 7.2 Secure Headers

Applied to all responses:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

### 7.3 Rate Limiting

- 500 requests/second per IP address
- Implemented via `middleware/rate_limit.py`
- Returns `429 Too Many Requests` when exceeded

### 7.4 Request Size Limiting

- Maximum request body: 10 MB
- Enforced at Uvicorn/FastAPI level

### 7.5 Authentication Flow

1. Client sends `POST /auth/login` → receives access token (15 min) + refresh token (7 days)
2. Tokens stored in `localStorage` on frontend
3. Axios interceptor attaches `Authorization: Bearer <token>` to every request
4. FastAPI `Depends(get_current_user)` verifies JWT on every protected route
5. Current user dict injected into route handlers via dependency injection
6. On 401, frontend uses refresh token to obtain new access token

### 7.6 Role Enforcement

Each router checks `current_user["primary_role"]` against allowed roles:
```python
if current_user["primary_role"] not in ("ceo", "coo", "pm"):
    raise HTTPException(status_code=403, detail="Insufficient permissions")
```

### 7.7 Password Security

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
Intent classification
    │
    ▼
Slash command parser (if applicable)
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
Action executor (if command response triggers API call)
    │
    ▼
AI response stored in chatbot_messages
    │
    ▼
Response returned to client
```

### 8.2 Slash Commands

| Command | Description | Available To |
|---|---|---|
| `/delayed` | List all delayed projects | PM+ |
| `/reports [name]` | Get employee reports (RAG-based lookup) | TL+ |
| `/project [name]` | Project status summary | Member |
| `/team [name]` | Team summary and member list | TL+ |
| `/blockers` | List active task blockers | TL+ |
| `/stats` | Company-wide metrics | COO+ |
| `/message [name] [msg]` | Send in-app message to employee | TL+ |

### 8.3 Context Injection

The system prompt is dynamically populated with:
- The user's name, role, department
- Their current active projects (names, deadlines)
- Their pending tasks (title, due date, priority)
- Their last 3–5 reports summary
- Team members (if TL+)

### 8.4 Model Config

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
/dashboard            → DashboardPage      (protected, role-adaptive)
/projects             → ProjectsPage       (protected)
/projects/:id         → ProjectDetailPage  (protected)
/tasks                → TasksPage          (protected)
/time-logs            → TimeLogsPage       (protected)
/reports              → ReportsPage        (protected)
/analytics            → AnalyticsPage      (protected, TL+)
/chatbot              → ChatbotPage        (protected)
/chat                 → ChatPage           (protected)
/announcements        → AnnouncementsPage  (protected)
/notifications        → NotificationsPage  (protected)
/profile              → ProfilePage        (protected)
/users                → UsersPage          (protected, COO+)
/teams                → TeamsPage          (protected, TL+)
/departments          → DepartmentsPage    (protected, PM+)
/personal-hub         → PersonalHubPage    (protected)
```

### 9.2 Page Summaries

**LoginPage** — Email/password form, calls `POST /auth/login`, stores token, dispatches Redux login action, redirects to dashboard.

**DashboardPage** — Renders role-specific dashboard component:
- `CEODashboard` / `COODashboard` — company-wide KPIs, department overview, all-projects health
- `PMDashboard` — own projects status, pending tasks, team compliance
- `TeamLeadDashboard` — team task board, member reports, blockers
- `EmployeeDashboard` — personal tasks, today's hours, report status, productivity score

**ProjectsPage** — Grid/list of projects with status badges, priority indicators, member avatars. Filter by status. Create project modal (PM+).

**ProjectDetailPage** — Tabbed interface:
- **Overview** — project info, dates, members list
- **Tasks** — Kanban board (to_do / in_progress / done / blocked columns)
- **Time Logs** — hour log table for project
- **Reports** — daily reports submitted for this project
- **Members** — manage team members (PM+)
- **Settings** — edit project details, repo URL, repo token (PM+)
- **Tracking** — Google Docs/Sheets tracker, add/remove docs, view live Drive stats (PM+ only)

**TasksPage** — All tasks across all visible projects. Filter by project, status, priority, assignee.

**TimeLogsPage** — Calendar or list view of hour logs. Add/edit/delete entries. Summary totals.

**ReportsPage** — Daily report form (submit new) + history list. TL+ can approve/request revision.

**AnalyticsPage** — Multi-tab analytics dashboard:
- Company overview (CEO/COO): project health charts, task completion trends, compliance rates
- Department analytics: per-department productivity breakdown
- Employee list with productivity scores, clicking opens detailed view with charts
- Time-series line charts (Recharts) for trends

**ChatPage** — Real-time messaging with room list (DM / team / project channels), message thread, typing indicators, WebSocket-powered updates.

**ChatbotPage** — Left sidebar: session list, new session button. Main area: markdown-rendered message thread. Slash command support.

**TeamsPage** — Create and manage teams, assign lead and members, link to projects.

**DepartmentsPage** — View and manage departments, assign PM/TL, view member list.

**PersonalHubPage** — Individual workspace: linked Google Drive documents, edit history, collaboration tracking, personal productivity metrics.

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
    refreshToken: string | null,
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
  analytics: {
    company: CompanyAnalytics | null,
    employees: EmployeeAnalytics[],
    selectedEmployee: EmployeeDetail | null,
    projects: ProjectAnalytics[],
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
  chat: {
    rooms: ChatRoom[],
    activeRoom: string | null,
    messages: Record<string, ChatMessage[]>,
    loading: boolean
  },
  chatbot: {
    sessions: ChatbotSession[],
    currentSession: string | null,
    messages: ChatbotMessage[],
    loading: boolean,
    sending: boolean
  },
  teams: {
    list: Team[],
    current: Team | null,
    loading: boolean
  },
  users: {
    list: User[],
    loading: boolean
  },
  theme: {
    mode: "light" | "dark"
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
- `analyticsSaga` — company/project/employee fetch
- `notificationsSaga` — list, mark read, WebSocket integration
- `chatSaga` — room management, message send/receive, typing indicators
- `chatbotSaga` — session management, message send/receive
- `teamsSaga` — team CRUD, member management

---

## 11. Key Frontend Components

### Layout & Navigation
- **`Layout.tsx`** — Shell with sidebar + main content area, notification bell, WebSocket setup, theme toggle
- **`Sidebar.tsx`** — Navigation links, role-filtered menu items, active state
- **`ProtectedRoute.tsx`** — Checks auth state, redirects to login if unauthenticated

### Dashboard Components
- **`CEODashboard.tsx`** — Executive KPIs: company health, delayed projects, department overview
- **`COODashboard.tsx`** — Operations metrics: cross-department compliance, project pipeline
- **`PMDashboard.tsx`** — PM view: own projects, task assignments, team report status
- **`TeamLeadDashboard.tsx`** — Team task board, member metrics, blocker alerts
- **`EmployeeDashboard.tsx`** — Personal view: tasks due today, report submission, productivity score

### Project Components
- **`ProjectCard.tsx`** — Card with status badge, priority color, member count, deadline
- **`MembersPanel.tsx`** — Member list with add/remove (portal modal)
- **`TrackingDocsPanel.tsx`** — Add/list/remove Drive docs, live stats refresh

### Task Components
- **`TaskBoard.tsx`** — Kanban columns (to_do / in_progress / done / blocked)
- **`TaskCard.tsx`** — Card with assignee avatar, priority badge, due date
- **`TaskModal.tsx`** — Create/edit task form with subtasks

### Analytics Components
- **`PerformanceMeter.tsx`** — Circular score display with label and color
- **`BreakdownBars.tsx`** — Horizontal bars for compliance/on-time/task-completion signals
- **`CommitCard.tsx`** — Per-project commit count and recent commits list
- **`TrackingDocsCard.tsx`** — Per-doc edit count, last modifier, modified date
- **Charts** — Recharts line/bar charts for trends and comparisons

### Chat Components
- **`ChatRoomList.tsx`** — Sidebar list of DM/team/project rooms
- **`MessageThread.tsx`** — Scrollable message history with sender avatars
- **`ChatInput.tsx`** — Input with send button, Enter to send, typing indicator emit

### Chatbot Components
- **`SessionList.tsx`** — Sidebar session list with delete button
- **`ChatbotThread.tsx`** — Scrollable markdown-rendered AI conversation
- **`ChatInput.tsx`** — Textarea with send button, slash command hint

### Common Components
- **`CursorEffect.tsx`** — Custom cursor animation (GSAP-powered)
- **`ProtectedRoute.tsx`** — Auth guard with role-check support

---

## 12. Core Data Flows

### 12.1 Authentication Flow

```
User fills login form
    → dispatch(loginRequest({ email, password }))
    → authSaga intercepts
    → POST /auth/login
    → on success: store tokens in localStorage
                  dispatch(loginSuccess({ user, token, refreshToken }))
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
               create notifications for relevant stakeholders
               push via WebSocket
    → saga: dispatch(createProjectSuccess(project))
    → project list updates
```

### 12.3 Report Submission Flow

```
Employee submits daily report
    → POST /reports/ with content + project_id + hours_worked
    → backend: insert into db.daily_reports
               compute compliance update
               create notification for TL/PM
               WebSocket push
    → frontend: report added to list, compliance score refreshes
```

### 12.4 Real-Time Notification Flow

```
Backend event occurs (task assigned, report reviewed, etc.)
    → notification_service.create_and_send(user_id, payload)
    → insert into db.notifications
    → ws_manager.send(user_id, notification_payload)
    → WebSocket frame sent to connected client
    → Layout.tsx WebSocket listener receives frame
    → dispatch(addNotification(notification))
    → unreadCount increments
    → bell badge updates
```

### 12.5 Real-Time Chat Flow

```
User sends message in chat room
    → WebSocket frame: { "type": "message", "content": "..." }
    → backend ws_manager receives, saves to db.chat_messages
    → broadcast to all room participants
    → frontend: message appended, scroll to bottom
    
User starts typing
    → WebSocket frame: { "type": "typing", "user_id": "..." }
    → broadcast to room
    → frontend: typing indicator shown for 3s
```

### 12.6 Analytics Data Flow

```
User opens AnalyticsPage (COO+)
    → dispatch(fetchCompanyAnalytics())
    → saga: GET /analytics/company
    → backend: MongoDB aggregation pipelines for projects/tasks/reports
               compute productivity scores
               return JSON metrics
    → dispatch(setCompanyAnalytics(data))
    → Recharts components render charts

User opens employee detail
    → GET /analytics/employee/{user_id}
    → backend: live GitHub/GitLab commit fetch per project
               live Google Drive stats per tracking doc
               report compliance and on-time delivery calculation
    → return full employee analytics
    → frontend: detailed charts and metric cards rendered
```

### 12.7 GitHub Commit Tracking Flow

```
Analytics detail view for employee
    → GET /analytics/employee/{user_id}
    → backend:
        query db.projects WHERE member_ids contains user_id AND repo_url exists
        for each project:
            decrypt repo_token
            GET GitHub/GitLab API with author_email filter
            count commits, get recent 5
        return per-project array
    → frontend: CommitCard per project, total commits summed
```

### 12.8 Google Drive Tracking Flow

```
PM adds tracking doc
    → POST /projects/{id}/tracking-docs { url, title, api_key }
    → backend: extract_file_id(url), detect_doc_type(url)
               store in project.tracking_docs array

PM views live stats
    → GET /projects/{id}/tracking-docs/live
    → backend: for each tracking_doc: fetch_gdrive_stats(file_id, api_key)
    → return version (edit count), modified_time, last_modifier
```

### 12.9 Chatbot Message Flow

```
User sends message
    → POST /chatbot/sessions/{id}/messages { content }
    → backend:
        check for slash command → execute action if found
        load last 10 messages from db.chatbot_messages
        build context: user projects, tasks, reports
        construct system prompt with context
        try AWS Bedrock invoke
            on failure: try Groq
        store user message + AI reply in db.chatbot_messages
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
| Chat messaging | ✓ | ✓ | ✓ | ✓ | ✓ |
| Personal Hub (documents) | ✓ | ✓ | ✓ | ✓ | ✓ |
| View team analytics | | ✓ | ✓ | ✓ | ✓ |
| Review reports | | ✓ | ✓ | ✓ | ✓ |
| Create tasks | | ✓ | ✓ | ✓ | ✓ |
| Create announcements | | ✓ | ✓ | ✓ | ✓ |
| Manage teams | | ✓ | ✓ | ✓ | ✓ |
| Create projects | | | ✓ | ✓ | ✓ |
| Manage project members | | | ✓ | ✓ | ✓ |
| Add tracking docs | | | ✓ | ✓ | ✓ |
| Manage departments | | | | ✓ | ✓ |
| View all users list | | | | ✓ | ✓ |
| Create/edit users | | | | ✓ | ✓ |
| Delete projects | | | | ✓ | ✓ |
| View company analytics | | | | ✓ | ✓ |
| Deactivate users | | | | | ✓ |

### Project-Level Scoping

Even within a role, data is scoped:
- **Employee**: only sees projects they are `member_ids` of
- **TL**: sees projects where they are `tl_id` or a member
- **PM**: sees projects where they are `pm_id`
- **COO/CEO**: sees all projects

---

## 14. Real-Time Architecture

### WebSocket Connections

```
Frontend (Layout.tsx)
    → new WebSocket("ws://localhost:8004/ws/{user_id}?token={jwt}")
    → notification stream, maintained for session lifetime
    → reconnect on disconnect (exponential backoff)

Frontend (ChatPage.tsx)
    → new WebSocket("ws://localhost:8004/ws/chat/{room_id}?token={jwt}")
    → per-room connection, opened when room is selected
```

### WebSocket Manager

```python
class WebSocketManager:
    connections: dict[str, WebSocket]       # user_id → notification ws
    room_connections: dict[str, list[WebSocket]]  # room_id → list of ws

    async def connect(user_id, ws)
    def disconnect(user_id)
    async def send(user_id, data: dict)     # sends JSON notification frame
    async def broadcast(data: dict)         # sends to all connected users
    async def room_broadcast(room_id, data) # sends to all room members
```

### Notification Trigger Points

Notifications are created and pushed from:
- Task assignment → notify assignee
- Task status change → notify project PM/TL
- Report reviewed → notify report author
- Project member added → notify new member
- Announcement created → notify all relevant users
- Project deadline approaching → notify PM

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
- `version` field = total number of saves (used as edit-count proxy)
- `lastModifyingUser.displayName` = last editor name

### 15.4 AWS Bedrock

- Model: `amazon.nova-pro-v1:0`
- Region: configured via `AWS_REGION` env var
- Auth: `AWS_ACCESS_KEY` + `AWS_BEDROCK_SECRET_KEY` env vars
- SDK: `boto3`

### 15.5 Groq

- Model: `llama-3.3-70b-versatile`
- Auth: `GROQ_API_KEY` env var
- SDK: `groq` Python package
- Role: Fallback when Bedrock fails

---

## 16. Performance & Analytics Engine

### 16.1 Productivity Score Formula

The analytics engine computes a 100-point score from 3 weighted signals:

```
Productivity Score = (compliance * 35) + (on_time_delivery * 35) + (task_completion * 30)
```

| Signal | Weight | Formula |
|---|---|---|
| Report Compliance | 35% | `reports_submitted / expected_reports` |
| On-Time Delivery | 35% | `tasks_completed_on_time / total_tasks_completed` |
| Task Completion | 30% | `tasks_done / total_assigned_tasks` |

### 16.2 Score Labels

| Score Range | Label | Color |
|---|---|---|
| 85–100 | Excellent | #22c55e (green) |
| 70–84 | Good | #84cc16 (lime) |
| 55–69 | Average | #eab308 (yellow) |
| 40–54 | Below Average | #f97316 (orange) |
| 0–39 | Needs Improvement | #ef4444 (red) |

### 16.3 Analytics Scoping by Role

| Role | Company | Department | Projects | Employees |
|---|---|---|---|---|
| CEO / COO | All | All | All | All |
| PM | — | Own department | Own projects | Own project members |
| TL | — | Own department | Assigned projects | Own team |
| Employee | — | — | Own projects | Self only |

### 16.4 Company Analytics Aggregation

The `/analytics/company` endpoint runs parallel MongoDB aggregation pipelines:
1. **Project pipeline** — count by status, flag delayed (`end_date < now AND status = active`)
2. **Task pipeline** — count by status, compute completion rate and overdue count
3. **Report pipeline** — daily submission trend (last 30 days), compliance rate
4. **Productivity pipeline** — aggregate individual scores across employees

### 16.5 Employee Analytics Detail

`GET /analytics/employee/{user_id}` provides full accuracy data:
- Live GitHub/GitLab API calls per project the user is a member of
- Live Google Drive API calls for each tracking doc in PM's projects
- Full report history with compliance trend
- Per-project task breakdown

---

## 17. MCP Server

The `mcp_server/` directory contains a complete Model Context Protocol server that exposes the PM system to Claude and other MCP-compatible AI clients.

### 17.1 Overview

| Property | Value |
|---|---|
| Framework | `mcp.server.fastmcp` (FastMCP) |
| Transport | stdio |
| File | `mcp_server/server.py` (~683 lines) |
| Tools exposed | 19 |
| Auth | JWT token stored globally across tool calls |

### 17.2 Setup

```bash
cd mcp_server
pip install -r requirements.txt
cp .env.example .env         # Set PM_API_URL and optional PM_API_TOKEN
python server.py             # Runs on stdio, ready for Claude Desktop
```

### 17.3 Configuration

**`.env` file:**
```
PM_API_URL=http://localhost:8004
PM_API_TOKEN=<optional pre-set JWT>
```

**`claude_desktop_config.json`** — drop into Claude Desktop's MCP config directory for auto-discovery.

### 17.4 Exposed Tools (19 total)

#### Authentication
| Tool | Description |
|---|---|
| `login(email, password)` | Authenticate and store session token |

#### Project Management
| Tool | Description |
|---|---|
| `list_projects(status?, priority?)` | List projects with optional filters |
| `get_project(project_id)` | Get project details |
| `create_project(name, description, start_date, end_date, ...)` | Create a new project |
| `update_project(project_id, **fields)` | Update project fields |

#### Task Management
| Tool | Description |
|---|---|
| `list_tasks(project_id?, status?, assigned_to?)` | List tasks with filters |
| `create_task(title, project_id, assigned_to, due_date, ...)` | Create a task |
| `update_task(task_id, **fields)` | Update task status/priority/assignee |

#### User & Team Queries
| Tool | Description |
|---|---|
| `list_users(role?, department?)` | List users with filters |
| `list_teams()` | List all teams |
| `list_departments()` | List all departments |

#### Reports & Analytics
| Tool | Description |
|---|---|
| `list_reports(user_id?, project_id?, date?)` | List daily reports |
| `submit_report(project_id, hours_worked, tasks_completed, blockers, ...)` | Submit daily report |
| `get_analytics(scope)` | Fetch analytics (`"company"`, `"projects"`, or `"employees"`) |

#### Document Management
| Tool | Description |
|---|---|
| `list_documents()` | List Personal Hub documents |
| `add_document(title, url, api_key)` | Add a Google Drive document |
| `get_document_changes(doc_id)` | Get change history |
| `log_document_change(doc_id, description)` | Log a manual change |

#### AI Assistant
| Tool | Description |
|---|---|
| `ask_project_ai(message, session_id?)` | Send message to AI chatbot, get response |

### 17.5 Authentication Flow in MCP

1. Call `login(email, password)` → JWT stored in module-level variable
2. All subsequent tools automatically include `Authorization: Bearer <token>` header
3. Token persists for the MCP server process lifetime

---

## 18. Infrastructure & DevOps

### 18.1 Docker Services

Defined in `infrastructure/docker/docker-compose.yml`:

| Service | Image | Port | Memory | CPU |
|---|---|---|---|---|
| redis | redis:7.4-alpine | 6379 | 256 MB | 0.5 |
| backend | custom FastAPI | 8004 | 1 GB | 1.0 |
| frontend | custom React/Nginx | 3000 | 256 MB | 0.5 |

### 18.2 Nginx Configuration

`infrastructure/nginx/nginx.conf` serves:
- Static React files for all non-API routes (`/`)
- Reverse proxy `location /api/` → backend:8004
- WebSocket upgrade for `location /ws/`

### 18.3 Backend Dockerfile

- Base: `python:3.11-slim`
- Runs as non-root user (security best practice)
- Gunicorn with 4 Uvicorn workers: `gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker`
- Exposes port 8004

### 18.4 Frontend Dockerfile

- Build stage: `node:18-alpine` → `npm run build`
- Serve stage: `nginx:alpine` → serves `/build` directory

### 18.5 Environment Variables

**Backend (`.env.example`):**
```
APP_NAME, APP_VERSION, DEBUG, SECRET_KEY, API_PREFIX
MONGODB_URL, MONGODB_DB_NAME
REDIS_URL
ACCESS_TOKEN_EXPIRE_MINUTES=15, REFRESH_TOKEN_EXPIRE_DAYS=7
ALGORITHM=HS256, FERNET_KEY
GROQ_API_KEY, GROQ_MODEL
AWS_ACCESS_KEY, AWS_BEDROCK_SECRET_KEY, AWS_REGION, BEDROCK_MODEL_ID
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM
ALLOWED_ORIGINS=["http://localhost:3000"]
RATE_LIMIT_PER_SECOND=500
```

**Frontend (`.env`):**
```
REACT_APP_API_URL=http://localhost:8004
REACT_APP_WS_URL=ws://localhost:8004
```

---

*Last updated: 2026-04-06*
*Reflects codebase state including: MCP server (19 tools), enhanced analytics engine (company/department/employee), real-time chat rooms, team & department management, Personal Hub documents, role-specific dashboards, Tailwind CSS, Redis caching, Docker resource limits*
