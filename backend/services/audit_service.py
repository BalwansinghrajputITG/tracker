"""
Audit logging (hr.md §29) — explicit, called at the write site.

Mirrors services/notification_service.notify_users(): the handler already holds the
before and after documents, so it is the only place that can record a real diff.
Middleware cannot see pre-write state, and a route decorator breaks FastAPI's
signature introspection — both were considered and rejected.

Never raises. A failed audit write must not fail the user's request; it is logged
at ERROR instead. Rows are append-only: no router exposes update or delete on
`hr_audit_logs`, which makes the log tamper-EVIDENT, not tamper-proof.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId

logger = logging.getLogger(__name__)


# Never written to the audit log in any form, in either before or after.
_REDACTED = frozenset({
    "password", "password_hash", "hashed_password", "token", "refresh_token",
    "secret", "api_key", "access_token", "mfa_secret",
})

# Fields that change on every write and carry no audit value.
_IGNORED = frozenset({"_id", "updated_at", "last_seen"})

# Actions whose `changes` are only rendered to callers holding audit.read_sensitive.
SALARY_ACTIONS = frozenset({
    "salary.created", "salary.updated", "salary.deleted",
    "offer.created", "offer.updated", "offer.approved",
})


def _scrub(value: Any) -> Any:
    """Make a value BSON-safe and JSON-serializable."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _scrub(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


def diff(before: Optional[dict], after: Optional[dict]) -> dict:
    """Field-level {old, new} diff with secrets redacted.

    Only changed fields are stored. Auditing an unchanged field would bloat every
    row with the whole document and bury the one value that actually moved.
    """
    before, after = before or {}, after or {}
    changes: dict[str, dict] = {}
    for key in set(before) | set(after):
        if key in _IGNORED:
            continue
        old, new = before.get(key), after.get(key)
        if old == new:
            continue
        if key in _REDACTED:
            old, new = "***", "***"
        changes[key] = {"old": _scrub(old), "new": _scrub(new)}
    return changes


async def audit(
    db,
    action: str,
    actor: dict,
    entity_type: str,
    entity_id: Optional[str] = None,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    request=None,
    subject_user_id=None,
    meta: Optional[dict] = None,
    success: bool = True,
) -> None:
    """Record a sensitive operation.

    Call it immediately after the write, with the document as it was and as it now is:

        before = await db.hr_compensation.find_one({"_id": comp_id})
        ...
        await audit(
            db, "salary.updated", current_user, "compensation", str(comp_id),
            before=before, after=after, request=request,
            subject_user_id=employee["user_id"],
        )

    `subject_user_id` is whose data was touched, as distinct from `actor` who touched
    it — "show me everyone who read Bob's salary" is the query that matters, and it is
    unanswerable without it.
    """
    try:
        doc = {
            "action": action,
            "actor_id": actor.get("_id"),
            "actor_email": actor.get("email", ""),
            "actor_roles": list(actor.get("roles", [])),
            "entity_type": entity_type,
            "entity_id": entity_id,
            "subject_user_id": ObjectId(subject_user_id) if isinstance(subject_user_id, str) else subject_user_id,
            "changes": diff(before, after),
            "changed_fields": sorted(diff(before, after).keys()),
            "success": success,
            "ip": None,
            "user_agent": "",
            "request_id": None,
            "meta": _scrub(meta or {}),
            "created_at": datetime.now(timezone.utc),
        }

        if request is not None:
            # X-Forwarded-For first: behind Render/Cloudflare, request.client.host is
            # the proxy, so the real caller IP is only in the header.
            fwd = request.headers.get("x-forwarded-for", "")
            doc["ip"] = fwd.split(",")[0].strip() if fwd else (
                request.client.host if request.client else None
            )
            doc["user_agent"] = request.headers.get("user-agent", "")[:300]
            doc["request_id"] = getattr(request.state, "request_id", None)

        await db.hr_audit_logs.insert_one(doc)
    except Exception as exc:
        logger.error("Audit write failed for action=%s entity=%s: %s", action, entity_id, exc)


async def audit_denied(
    db, action: str, actor: dict, entity_type: str,
    entity_id: Optional[str] = None, request=None, reason: str = "",
) -> None:
    """Record a refused attempt at a sensitive operation.

    Denials are the more interesting half of an audit log — a successful salary read
    by HR is routine; three failed ones by a team lead are an incident.
    """
    await audit(
        db, action, actor, entity_type, entity_id,
        request=request, success=False, meta={"denied_reason": reason},
    )
