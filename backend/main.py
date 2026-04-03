from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings
from database import mongodb, redis_client
from routers import auth, users, teams, projects, tasks, reports, chat, notifications, chatbot, dashboard, analytics, digital_marketing, project_tools, sheets
from middleware.rate_limit import RateLimitMiddleware
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mongodb.connect()
    await redis_client.connect()
    yield
    await mongodb.disconnect()
    await redis_client.disconnect()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
)

# Configure CORS with explicit allowed origins for JWT auth
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Allow ngrok tunnel requests (bypasses the ngrok browser warning page)
@app.middleware("http")
async def ngrok_header_middleware(request, call_next):
    response = await call_next(request)
    response.headers["ngrok-skip-browser-warning"] = "true"
    return response

prefix = settings.API_PREFIX
app.include_router(auth.router,          prefix=f"{prefix}/auth",          tags=["Auth"])
app.include_router(users.router,         prefix=f"{prefix}/users",         tags=["Users"])
app.include_router(teams.router,         prefix=f"{prefix}/teams",         tags=["Teams"])
app.include_router(projects.router,      prefix=f"{prefix}/projects",      tags=["Projects"])
app.include_router(tasks.router,         prefix=f"{prefix}/tasks",         tags=["Tasks"])
app.include_router(reports.router,       prefix=f"{prefix}/reports",       tags=["Reports"])
app.include_router(chat.router,          prefix=f"{prefix}/chat",          tags=["Chat"])
app.include_router(notifications.router, prefix=f"{prefix}/notifications", tags=["Notifications"])
app.include_router(chatbot.router,       prefix=f"{prefix}/chatbot",       tags=["Chatbot"])
app.include_router(dashboard.router,     prefix=f"{prefix}/dashboard",     tags=["Dashboard"])
app.include_router(analytics.router,         prefix=f"{prefix}/analytics",          tags=["Analytics"])
app.include_router(digital_marketing.router, prefix=f"{prefix}/digital-marketing",  tags=["Digital Marketing"])
app.include_router(project_tools.router,     prefix=f"{prefix}/project-tools",       tags=["Project Tools"])
app.include_router(sheets.router,            prefix=f"{prefix}/sheets",               tags=["Sheets"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": settings.APP_VERSION}
