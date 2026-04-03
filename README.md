# Enterprise Internal Project Management System

Full-stack enterprise platform with role-based dashboards, real-time communication, and AI chatbot integration.

## Stack
- **Frontend**: React 18 + TypeScript + Redux Toolkit + Redux-Saga + Tailwind CSS
- **Backend**: Python FastAPI + Motor (async MongoDB) + Redis
- **Database**: MongoDB 7.x
- **AI**: Groq API (llama3-70b) + PageIndex-style RAG
- **Real-time**: FastAPI WebSockets + Redis PubSub
- **Auth**: JWT + bcrypt + RBAC
- **Deploy**: Docker + Nginx + Gunicorn

## Quick Start

### 1. Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your Groq API key, MongoDB, Redis credentials

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Seed Database
```bash
python database/seed.py
```

### 3. Frontend
```bash
cd frontend
npm install
REACT_APP_API_URL=http://localhost:8000/api/v1 npm start
```

### 4. Docker (Production)
```bash
cd infrastructure/docker
cp ../../backend/.env.example .env
# Fill in .env values
docker-compose up -d
```

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| CEO | ceo@company.com | ceo123 |
| COO | coo@company.com | coo123 |
| Project Manager | pm@company.com | pm123 |
| Team Lead | tl@company.com | tl123 |
| Employee | emp1@company.com | emp123 |

## Key Features

### Role-Based Dashboards
- **CEO/COO**: Company-wide metrics, delayed projects, compliance rates, AI insights
- **Project Manager**: Project health, task velocity, resource allocation
- **Team Lead**: Daily reports, blockers, team member activity
- **Employee**: Kanban task board, daily report submission, notifications

### AI Chatbot (Groq + PageIndex)
Available to CEO/COO/PM/TL via floating button. Supports:
```
/delayed              → List all delayed projects
/reports [name]       → Get employee reports (uses PageIndex RAG)
/project [name]       → Project status & analytics
/team [name]          → Team summary
/blockers             → Active blockers across all projects
/stats                → Company-wide metrics
/message [name] [msg] → Send message to employee via chat
```

### Real-Time
- WebSocket chat (direct, team, project channels)
- Live notification push (task assignments, mentions, report due)
- Typing indicators

### API Docs
When `DEBUG=true`, available at: `http://localhost:8000/api/docs`

## Project Structure
```
project/
├── backend/              FastAPI application
│   ├── routers/          REST endpoints
│   ├── middleware/        Auth + RBAC + rate limiting
│   ├── chatbot/           Groq + PageIndex AI
│   ├── websockets/        WS connection manager
│   └── services/          Business logic
├── frontend/             React SPA
│   └── src/
│       ├── store/         Redux + Sagas
│       │   ├── slices/    State slices
│       │   └── sagas/     Async side effects
│       ├── components/    UI components
│       └── pages/         Page layouts
├── database/             Seed scripts
└── infrastructure/       Docker + Nginx configs
```
