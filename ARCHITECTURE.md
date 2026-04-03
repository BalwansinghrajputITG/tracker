# Enterprise Internal Project Management System
## Complete Architecture Blueprint

---

## 1. HIGH-LEVEL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                    │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │         React + Redux + Redux-Saga SPA                            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │  CEO     │ │  COO     │ │  PM/TL   │ │  Employee        │   │   │
│  │  │Dashboard │ │Dashboard │ │Dashboard │ │  Dashboard       │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │   │
│  │  ┌──────────────────┐  ┌────────────────────────────────────┐   │   │
│  │  │  Chat Module     │  │  AI Chatbot (Groq)                 │   │   │
│  │  └──────────────────┘  └────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              │ HTTPS / WSS
┌─────────────────────────────────────────────────────────────────────────┐
│                        GATEWAY LAYER                                     │
│              Nginx (Load Balancer + Reverse Proxy + SSL)                 │
│              Rate Limiting | Request Routing | CORS                      │
└─────────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────────┐
│                        API LAYER (FastAPI)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Auth API   │  │ Projects API│  │  Reports API│  │  Chat API   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Teams API  │  │  Users API  │  │Notif. API   │  │ Chatbot API │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
│                    WebSocket Manager (real-time)                         │
└─────────────────────────────────────────────────────────────────────────┘
                    │                       │
        ┌───────────┴──────┐    ┌──────────┴────────────┐
        │   DATA LAYER     │    │   EXTERNAL SERVICES    │
        │                  │    │                        │
        │  MongoDB Atlas   │    │  Groq API (LLM)        │
        │  (Primary DB)    │    │  SMTP (Email)          │
        │                  │    │  PageIndex (RAG)       │
        │  Redis           │    │  Firebase (optional    │
        │  (Cache+PubSub)  │    │   push notifications)  │
        └──────────────────┘    └────────────────────────┘
```

---

## 2. TECHNOLOGY STACK

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + TypeScript | UI Framework |
| State | Redux Toolkit + Redux-Saga | State + Side Effects |
| Styling | Tailwind CSS + shadcn/ui | UI Components |
| Backend | FastAPI (Python 3.11+) | REST API + WebSockets |
| Database | MongoDB 7.x (Atlas) | Primary Data Store |
| Cache | Redis 7.x | Sessions, PubSub, Rate Limiting |
| AI | Groq API (llama3-70b) | Chatbot Intelligence |
| RAG | PageIndex | Document/Report Indexing |
| Auth | JWT + bcrypt | Authentication |
| Real-time | WebSockets (FastAPI native) | Live Updates + Chat |
| Email | FastAPI-Mail + SMTP | Notifications |
| Deploy | Docker + Nginx + PM2 | Production |

---

## 3. DATABASE SCHEMA (MongoDB Collections)

### 3.1 users
```json
{
  "_id": "ObjectId",
  "email": "string (unique, indexed)",
  "password_hash": "string",
  "full_name": "string",
  "avatar_url": "string | null",
  "phone": "string | null",
  "roles": ["ceo|coo|pm|team_lead|employee"],
  "primary_role": "string",
  "department": "string",
  "team_ids": ["ObjectId"],
  "project_ids": ["ObjectId"],
  "manager_id": "ObjectId | null",
  "is_active": "boolean",
  "last_seen": "datetime",
  "notification_preferences": {
    "email": "boolean",
    "in_app": "boolean",
    "daily_digest": "boolean"
  },
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 3.2 teams
```json
{
  "_id": "ObjectId",
  "name": "string",
  "description": "string",
  "department": "string",
  "lead_id": "ObjectId (ref: users)",
  "member_ids": ["ObjectId (ref: users)"],
  "project_ids": ["ObjectId (ref: projects)"],
  "chat_room_id": "ObjectId (ref: chat_rooms)",
  "is_active": "boolean",
  "created_by": "ObjectId",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 3.3 projects
```json
{
  "_id": "ObjectId",
  "name": "string",
  "description": "string",
  "status": "planning|active|on_hold|completed|cancelled",
  "priority": "low|medium|high|critical",
  "pm_id": "ObjectId (ref: users)",
  "team_ids": ["ObjectId (ref: teams)"],
  "member_ids": ["ObjectId (ref: users)"],
  "start_date": "datetime",
  "due_date": "datetime",
  "completed_at": "datetime | null",
  "progress_percentage": "number (0-100)",
  "milestones": [
    {
      "id": "ObjectId",
      "title": "string",
      "due_date": "datetime",
      "is_completed": "boolean",
      "completed_at": "datetime | null"
    }
  ],
  "tags": ["string"],
  "budget": {
    "allocated": "number",
    "spent": "number",
    "currency": "string"
  },
  "is_delayed": "boolean",
  "delay_reason": "string | null",
  "created_by": "ObjectId",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 3.4 tasks
```json
{
  "_id": "ObjectId",
  "project_id": "ObjectId (ref: projects)",
  "title": "string",
  "description": "string",
  "status": "todo|in_progress|review|blocked|done",
  "priority": "low|medium|high|critical",
  "assignee_ids": ["ObjectId (ref: users)"],
  "reporter_id": "ObjectId (ref: users)",
  "due_date": "datetime | null",
  "estimated_hours": "number",
  "logged_hours": "number",
  "tags": ["string"],
  "attachments": [
    {
      "filename": "string",
      "url": "string",
      "size": "number",
      "uploaded_by": "ObjectId",
      "uploaded_at": "datetime"
    }
  ],
  "comments": [
    {
      "id": "ObjectId",
      "user_id": "ObjectId",
      "text": "string",
      "created_at": "datetime"
    }
  ],
  "is_blocked": "boolean",
  "blocked_reason": "string | null",
  "parent_task_id": "ObjectId | null",
  "subtask_ids": ["ObjectId"],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 3.5 daily_reports
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref: users, indexed)",
  "project_id": "ObjectId (ref: projects, indexed)",
  "team_id": "ObjectId (ref: teams)",
  "report_date": "date (indexed)",
  "structured_data": {
    "tasks_completed": [
      {
        "task_id": "ObjectId | null",
        "description": "string",
        "hours_spent": "number",
        "status": "completed|in_progress|blocked"
      }
    ],
    "tasks_planned": ["string"],
    "blockers": ["string"],
    "hours_worked": "number"
  },
  "unstructured_notes": "string (free text)",
  "mood": "great|good|neutral|stressed|blocked",
  "submitted_at": "datetime",
  "reviewed_by": "ObjectId | null",
  "reviewed_at": "datetime | null",
  "review_comment": "string | null",
  "is_late_submission": "boolean",
  "ai_summary": "string | null",
  "created_at": "datetime"
}
```

### 3.6 chat_rooms
```json
{
  "_id": "ObjectId",
  "type": "direct|team|project|broadcast",
  "name": "string | null",
  "participants": ["ObjectId (ref: users)"],
  "team_id": "ObjectId | null",
  "project_id": "ObjectId | null",
  "created_by": "ObjectId",
  "last_message_at": "datetime",
  "last_message_preview": "string",
  "is_active": "boolean",
  "created_at": "datetime"
}
```

### 3.7 chat_messages
```json
{
  "_id": "ObjectId",
  "room_id": "ObjectId (ref: chat_rooms, indexed)",
  "sender_id": "ObjectId (ref: users)",
  "content": "string",
  "message_type": "text|file|system|bot",
  "attachments": ["string (urls)"],
  "reply_to": "ObjectId | null",
  "mentions": ["ObjectId (ref: users)"],
  "reactions": [
    {
      "emoji": "string",
      "user_ids": ["ObjectId"]
    }
  ],
  "is_edited": "boolean",
  "edited_at": "datetime | null",
  "is_deleted": "boolean",
  "read_by": ["ObjectId"],
  "sent_at": "datetime (indexed)"
}
```

### 3.8 notifications
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref: users, indexed)",
  "type": "task_assigned|report_due|message|project_update|system|mention",
  "title": "string",
  "body": "string",
  "link": "string | null",
  "reference_id": "ObjectId | null",
  "reference_type": "task|project|report|message|user",
  "is_read": "boolean",
  "is_email_sent": "boolean",
  "created_at": "datetime (indexed)"
}
```

### 3.9 chatbot_sessions
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref: users)",
  "session_id": "string (uuid)",
  "messages": [
    {
      "role": "user|assistant|system",
      "content": "string",
      "timestamp": "datetime",
      "command": "string | null",
      "metadata": "object | null"
    }
  ],
  "context": {
    "active_project_id": "ObjectId | null",
    "active_team_id": "ObjectId | null",
    "last_queried_user": "ObjectId | null"
  },
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 3.10 workflows
```json
{
  "_id": "ObjectId",
  "name": "string",
  "description": "string",
  "project_id": "ObjectId | null",
  "team_id": "ObjectId | null",
  "trigger": "manual|scheduled|event",
  "trigger_config": "object",
  "steps": [
    {
      "id": "string",
      "name": "string",
      "type": "approval|notification|assignment|status_change",
      "config": "object",
      "assignee_id": "ObjectId | null",
      "timeout_hours": "number | null"
    }
  ],
  "is_active": "boolean",
  "created_by": "ObjectId",
  "created_at": "datetime"
}
```

---

## 4. BACKEND STRUCTURE (FastAPI)

```
backend/
├── main.py                    # App entry point
├── config.py                  # Settings (Pydantic BaseSettings)
├── database.py                # MongoDB + Redis connections
├── models/                    # Pydantic models (request/response)
│   ├── user.py
│   ├── project.py
│   ├── task.py
│   ├── report.py
│   ├── chat.py
│   ├── notification.py
│   └── chatbot.py
├── routers/                   # FastAPI routers
│   ├── auth.py                # POST /auth/login, /register, /refresh
│   ├── users.py               # CRUD /users
│   ├── teams.py               # CRUD /teams
│   ├── projects.py            # CRUD /projects
│   ├── tasks.py               # CRUD /tasks
│   ├── reports.py             # CRUD /reports
│   ├── chat.py                # REST + WS /chat
│   ├── notifications.py       # GET /notifications
│   ├── chatbot.py             # POST /chatbot/message
│   ├── dashboard.py           # GET /dashboard/{role}
│   └── analytics.py           # GET /analytics
├── services/                  # Business logic
│   ├── auth_service.py
│   ├── user_service.py
│   ├── project_service.py
│   ├── report_service.py
│   ├── notification_service.py
│   ├── chatbot_service.py     # Groq + PageIndex integration
│   └── analytics_service.py
├── middleware/
│   ├── auth.py                # JWT verification
│   ├── rbac.py                # Role-based access control
│   └── rate_limit.py          # Redis-based rate limiting
├── websockets/
│   ├── manager.py             # Connection manager
│   ├── chat_ws.py             # Chat WebSocket handler
│   └── notifications_ws.py    # Notifications WebSocket handler
├── chatbot/
│   ├── groq_client.py         # Groq API wrapper
│   ├── page_index.py          # PageIndex integration for RAG
│   ├── command_parser.py      # Command extraction
│   ├── context_builder.py     # Context from DB
│   └── system_prompt.py       # System prompt template
└── utils/
    ├── pagination.py
    ├── email.py
    └── file_upload.py
```

---

## 5. API ENDPOINTS

### Authentication
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

### Users
- `GET /api/v1/users` (admin/ceo/coo)
- `GET /api/v1/users/{id}`
- `PUT /api/v1/users/{id}`
- `GET /api/v1/users/me`
- `GET /api/v1/users/subordinates`

### Teams
- `GET /api/v1/teams`
- `POST /api/v1/teams`
- `PUT /api/v1/teams/{id}`
- `POST /api/v1/teams/{id}/members`
- `DELETE /api/v1/teams/{id}/members/{user_id}`

### Projects
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/{id}`
- `PUT /api/v1/projects/{id}`
- `GET /api/v1/projects/{id}/analytics`
- `GET /api/v1/projects/delayed` (CEO/COO)

### Tasks
- `GET /api/v1/tasks?project_id=&assignee_id=`
- `POST /api/v1/tasks`
- `PUT /api/v1/tasks/{id}`
- `POST /api/v1/tasks/{id}/comments`
- `POST /api/v1/tasks/{id}/log-hours`

### Reports
- `GET /api/v1/reports?user_id=&project_id=&date_from=&date_to=`
- `POST /api/v1/reports`
- `GET /api/v1/reports/{id}`
- `PUT /api/v1/reports/{id}/review`
- `GET /api/v1/reports/missing` (who hasn't submitted)

### Chat
- `GET /api/v1/chat/rooms`
- `POST /api/v1/chat/rooms`
- `GET /api/v1/chat/rooms/{id}/messages`
- `POST /api/v1/chat/rooms/{id}/messages`
- `WS /api/v1/ws/chat/{room_id}`

### Chatbot
- `POST /api/v1/chatbot/message`
- `GET /api/v1/chatbot/sessions`
- `GET /api/v1/chatbot/sessions/{id}`

### Dashboard
- `GET /api/v1/dashboard/ceo`
- `GET /api/v1/dashboard/coo`
- `GET /api/v1/dashboard/pm`
- `GET /api/v1/dashboard/team-lead`
- `GET /api/v1/dashboard/employee`

### Notifications
- `GET /api/v1/notifications`
- `PUT /api/v1/notifications/{id}/read`
- `PUT /api/v1/notifications/read-all`
- `WS /api/v1/ws/notifications`

---

## 6. ROLE-BASED DASHBOARD FEATURES

### CEO Dashboard
- Company-wide project health overview (Gantt chart)
- Delayed projects by department (red flags)
- Team productivity heatmap
- Daily report compliance rate
- Revenue vs. progress metrics
- Chatbot for instant insights
- Broadcast messaging to all employees
- Top-level KPIs

### COO Dashboard
- All teams operational status
- Cross-department resource utilization
- Workflow bottlenecks
- SLA/delivery compliance
- Employee performance trends
- Escalated issues
- Department comparison analytics

### Project Manager Dashboard
- Projects under management
- Task completion velocity
- Team member workload
- Milestone tracking
- Risk indicators (delayed tasks, missing reports)
- Resource allocation
- Client communication logs

### Team Lead Dashboard
- Team member status (working/absent/blocked)
- Daily reports by team members
- Task assignments and progress
- Blockers resolution
- Team chat
- Performance individual tracking

### Employee Dashboard
- My tasks (Kanban board)
- Daily report submission
- My projects
- Team chat
- Notifications
- Personal productivity metrics
- Direct message

---

## 7. REAL-TIME ARCHITECTURE (WebSockets)

```
Client                     FastAPI WS              Redis PubSub
  │                            │                       │
  │──connect /ws/chat/{room}──►│                       │
  │                            │──subscribe room_id───►│
  │──send message─────────────►│                       │
  │                            │──save to MongoDB      │
  │                            │──publish to Redis────►│
  │                            │                       │──fan-out to
  │◄──message broadcast────────│◄──receive event───────│   all subscribers
  │                            │                       │
  │──connect /ws/notifications──►│                     │
  │                            │──subscribe user_id───►│
  │◄──notification push────────│◄──user event──────────│
```

---

## 8. SECURITY ARCHITECTURE

### JWT Flow
```
Login → bcrypt verify → issue access_token (15min) + refresh_token (7d)
       → access_token in Authorization: Bearer header
       → refresh_token in httpOnly cookie
```

### RBAC Permission Matrix
| Resource        | CEO | COO | PM | TL | Employee |
|----------------|-----|-----|----|----|----------|
| All Users Read  | ✓   | ✓   | ✗  | ✗  | ✗        |
| All Projects    | ✓   | ✓   | Own| Own team | Own |
| All Reports     | ✓   | ✓   | Team| Team | Own |
| Create Project  | ✓   | ✓   | ✓  | ✗  | ✗        |
| Broadcast Msg   | ✓   | ✓   | ✗  | ✗  | ✗        |
| Chatbot Full    | ✓   | ✓   | ✗  | ✗  | ✗        |
| Manage Teams    | ✓   | ✓   | ✓  | Own| ✗        |

---

## 9. DEPLOYMENT STRATEGY (250+ Users)

```
Internet
    │
[Cloudflare CDN] ─── Static assets
    │
[Nginx] (2 instances, HAProxy or AWS ALB)
    │
    ├─── [FastAPI Workers] x4 (Gunicorn + Uvicorn, 4 workers each)
    │         │
    │    [Redis Cluster] (cache + pubsub + sessions)
    │         │
    │    [MongoDB Atlas M30+] (3-node replica set)
    │
    └─── [React Build] (Nginx static serve)

Monitoring: Prometheus + Grafana
Logs: ELK Stack or Datadog
CI/CD: GitHub Actions → Docker → Deploy
```

### Scaling Estimates (250 users)
- FastAPI: 2 servers × 4 workers = 8 processes (handles ~2000 req/s)
- MongoDB: M30 tier (8 vCPU, 16GB RAM) — sufficient for 250 users
- Redis: 1 master + 1 replica (session + pubsub)
- WebSocket connections: 250 concurrent — single server handles 10k+
