"""
Shared helpers for the HR routers.

Exists so the twelve HR routers do not each grow their own _oid/_serialize copy —
which is exactly how routers/users.py, tasks.py and projects.py ended up with
three different serializers and two ObjectId parsers.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional

from bson import ObjectId
from fastapi import HTTPException

from middleware.permissions import has_permission
from utils.team_scope import is_exec, is_pm, is_team_lead, get_team_member_ids, get_pm_member_ids


def oid(value, field: str = "id") -> ObjectId:
    """Parse an ObjectId, raising 400 rather than the generic InvalidId handler."""
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {field} format")


def parse_date(value: Optional[str], field: str = "date") -> Optional[datetime]:
    """Parse an ISO date/datetime to an aware UTC datetime. None passes through."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field}; expected ISO 8601.")
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def iso(value) -> Optional[str]:
    """Render a stored datetime for the wire."""
    return value.isoformat() if isinstance(value, datetime) else value


def aware(value) -> Optional[datetime]:
    """Attach UTC to a datetime read back from Mongo.

    BSON has no timezone, so Motor returns naive datetimes even though we always
    write aware ones. Comparing those against datetime.now(timezone.utc) raises
    "can't compare offset-naive and offset-aware datetimes" — always normalize a
    value that came out of the database before comparing it to now().
    """
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def user_map(db, user_ids: Iterable) -> dict:
    """Batch-fetch users keyed by str(_id).

    HR responses denormalize full_name/email/avatar from `users` at read time.
    Doing that with a per-row find_one is the N+1 that makes
    routers/personal.py:363-419 fire ~6000 queries — one $in query instead.
    """
    ids = [oid(u) for u in user_ids if u]
    if not ids:
        return {}
    cursor = db.users.find(
        {"_id": {"$in": ids}},
        {"full_name": 1, "email": 1, "avatar_url": 1, "primary_role": 1, "is_active": 1},
    )
    return {str(u["_id"]): u async for u in cursor}


async def name_map(db, collection: str, ids: Iterable, field: str = "name") -> dict:
    """Batch-fetch a display field from any collection, keyed by str(_id)."""
    parsed = [oid(i) for i in ids if i]
    if not parsed:
        return {}
    cursor = db[collection].find({"_id": {"$in": parsed}}, {field: 1})
    return {str(d["_id"]): d.get(field, "") for d in [x async for x in cursor]}


async def scoped_user_ids(db, current_user: dict) -> Optional[list]:
    """The set of user_ids this caller may see HR records for.

    Returns None to mean "no restriction" (org-wide). Mirrors the role-scoping
    ladder used by routers/tasks.py:75-92 and routers/reports.py:126-155.

    Note the permission check comes FIRST: employee.read_all is what grants
    org-wide visibility, so an hr_manager sees everyone without needing an exec
    role, while a team lead stays scoped to their team no matter what.
    """
    if has_permission(current_user, "employee.read_all") or is_exec(current_user):
        return None
    if is_pm(current_user):
        members = await get_pm_member_ids(db, current_user)
        return list({*members, current_user["_id"]})
    if is_team_lead(current_user):
        members = await get_team_member_ids(db, current_user)
        return list({*members, current_user["_id"]})
    # Everyone else: themselves only.
    return [current_user["_id"]]


async def assert_employee_access(db, employee: dict, current_user: dict) -> None:
    """Raise 403 unless the caller may view this employee record.

    Same shape as utils/team_scope.assert_user_access — self always allowed,
    then permission, then team scope.
    """
    target_user_id = employee.get("user_id")
    if str(target_user_id) == str(current_user["_id"]):
        return
    allowed = await scoped_user_ids(db, current_user)
    if allowed is None:
        return
    if target_user_id not in allowed:
        raise HTTPException(status_code=403, detail="You cannot access this employee record.")


def next_employee_code(existing_max: int) -> str:
    """EMP-0001 style. Sequential rather than random so it is human-quotable."""
    return f"EMP-{existing_max + 1:04d}"
