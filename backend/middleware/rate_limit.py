from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from database import get_redis
from config import settings
import time


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path == "/health":
            return await call_next(request)

        try:
            redis = get_redis()
            client_ip = request.client.host if request.client else (
                request.headers.get("x-forwarded-for", "unknown").split(",")[0].strip()
            )
            key = f"rate_limit:{client_ip}"
            current = await redis.get(key)
            if current is None:
                await redis.setex(key, 60, 1)
            elif int(current) >= settings.RATE_LIMIT_PER_MINUTE:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Try again in 1 minute."}
                )
            else:
                await redis.incr(key)
        except Exception:
            pass  # Fail open if Redis is unavailable

        return await call_next(request)
