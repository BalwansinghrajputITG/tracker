"""
Redis cache helpers for analytics endpoints.

Key format  : analytics:{endpoint}:{user_id}:{params}
TTLs        : company=300s, projects=300s, project/{id}=600s, ai=900s, employees=300s

Invalidation: use delete_pattern() — scans and deletes by prefix glob.
"""
import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── TTLs (seconds) ────────────────────────────────────────────────────────────
TTL_COMPANY   = 300   # 5 min
TTL_PROJECTS  = 300   # 5 min
TTL_PROJECT   = 600   # 10 min
TTL_AI        = 900   # 15 min  (LLM calls are expensive)
TTL_EMPLOYEES = 300   # 5 min


def analytics_key(endpoint: str, user_id: str, **params) -> str:
    """Build a deterministic Redis key for an analytics endpoint result."""
    param_str = ":".join(f"{k}={v}" for k, v in sorted(params.items()))
    return f"analytics:{endpoint}:{user_id}:{param_str}"


async def cache_get(redis, key: str) -> Optional[Any]:
    """Return the deserialized cached value, or None on miss/error."""
    if redis is None:
        return None
    try:
        raw = await redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("cache_get error key=%s: %s", key, exc)
        return None


async def cache_set(redis, key: str, value: Any, ttl: int) -> None:
    """Serialize and store value with the given TTL. Silently ignores errors."""
    if redis is None:
        return
    try:
        await redis.setex(key, ttl, json.dumps(value, default=str))
    except Exception as exc:
        logger.warning("cache_set error key=%s: %s", key, exc)


async def delete_pattern(redis, pattern: str) -> int:
    """
    Delete all keys matching a glob pattern using SCAN (safe for production).
    Returns the number of keys deleted.
    """
    if redis is None:
        return 0
    deleted = 0
    try:
        cursor = 0
        while True:
            cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            if keys:
                await redis.delete(*keys)
                deleted += len(keys)
            if cursor == 0:
                break
    except Exception as exc:
        logger.warning("delete_pattern error pattern=%s: %s", pattern, exc)
    return deleted


# ── Invalidation helpers called by write routers ──────────────────────────────

async def invalidate_on_task_write(redis) -> None:
    """Invalidate analytics caches affected by task create/update/delete."""
    for pattern in ("analytics:company:*", "analytics:projects:*",
                    "analytics:project:*", "analytics:employees:*"):
        await delete_pattern(redis, pattern)


async def invalidate_on_report_write(redis) -> None:
    """Invalidate analytics caches affected by report submit/edit/delete."""
    for pattern in ("analytics:company:*", "analytics:employees:*"):
        await delete_pattern(redis, pattern)


async def invalidate_on_project_write(redis) -> None:
    """Invalidate analytics caches affected by project create/update/delete."""
    for pattern in ("analytics:company:*", "analytics:projects:*",
                    "analytics:project:*"):
        await delete_pattern(redis, pattern)
