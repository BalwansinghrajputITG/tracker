from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from database import get_redis
from config import settings
import logging

logger = logging.getLogger(__name__)


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
            block_key = f"rate_limit:blocked:{client_ip}"
            count_key = f"rate_limit:{client_ip}"

            # If IP is currently blocked, reject immediately
            if await redis.exists(block_key):
                ttl = await redis.ttl(block_key)
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": str(max(ttl, 1))},
                    content={"detail": f"Too many requests. Blocked for {max(ttl, 1)} more second(s)."}
                )

            # 1-second window counter
            current = await redis.get(count_key)
            if current is None:
                await redis.setex(count_key, 1, 1)
            elif int(current) >= settings.RATE_LIMIT_PER_SECOND:
                # Limit exceeded — set a 30-second block and clear the counter
                await redis.setex(block_key, 30, 1)
                await redis.delete(count_key)
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": "30"},
                    content={"detail": "Rate limit exceeded. Blocked for 30 seconds."}
                )
            else:
                await redis.incr(count_key)
        except Exception as exc:
            # Redis unavailable — log a warning so ops can detect the issue;
            # still allow the request through rather than blocking legitimate traffic.
            logger.warning("Rate limiter Redis unavailable — failing open: %s", exc)

        return await call_next(request)
