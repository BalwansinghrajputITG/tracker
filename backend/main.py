from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from bson.errors import InvalidId

from config import settings
from database import mongodb, redis_client
from routers import auth, users, teams, projects, tasks, reports, chat, notifications, chatbot, dashboard, analytics, digital_marketing, project_tools, sheets, personal, departments
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

# Reject oversized request bodies (default FastAPI has no limit)
MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024  # 10 MB

@app.middleware("http")
async def limit_request_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BODY_SIZE:
        return JSONResponse(status_code=413, content={"detail": "Request body too large (max 10 MB)"})
    return await call_next(request)


# Security headers on every response
@app.middleware("http")
async def security_headers_middleware(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["ngrok-skip-browser-warning"] = "true"
    return response

@app.exception_handler(InvalidId)
async def invalid_object_id_handler(_request: Request, _exc: InvalidId):
    return JSONResponse(status_code=400, content={"detail": "Invalid ID format"})


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
app.include_router(personal.router,         prefix=f"{prefix}/personal",             tags=["Personal"])
app.include_router(departments.router,      prefix=f"{prefix}/departments",          tags=["Departments"])


@app.get("/health")
async def health_check():
    checks: dict = {"version": settings.APP_VERSION}
    overall = "ok"

    # MongoDB ping
    try:
        await mongodb.client.admin.command("ping")
        checks["mongodb"] = "ok"
    except Exception as exc:
        checks["mongodb"] = f"error: {exc}"
        overall = "degraded"

    # Redis ping
    try:
        await redis_client.client.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"
        overall = "degraded"

    checks["status"] = overall
    status_code = 200 if overall == "ok" else 503
    return JSONResponse(content=checks, status_code=status_code)
