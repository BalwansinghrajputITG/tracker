from fastapi import Depends, HTTPException, status
from typing import List
from middleware.auth import get_current_user


def require_roles(*roles: str):
    """Dependency factory: requires user to have at least one of the specified roles."""
    async def checker(current_user=Depends(get_current_user)):
        user_roles = set(current_user.get("roles", []))
        if not user_roles.intersection(set(roles)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {list(roles)}"
            )
        return current_user
    return checker


def require_any_role(*roles: str):
    return require_roles(*roles)


# Convenience dependencies
require_ceo          = require_roles("ceo")
require_ceo_coo      = require_roles("ceo", "coo")
require_dept_admin   = require_roles("ceo", "coo", "admin")   # department management
require_manager      = require_roles("ceo", "coo", "pm", "team_lead", "admin")
require_pm_or_above  = require_roles("ceo", "coo", "pm")
# Includes admin — for user-management endpoints only
require_user_manager = require_roles("ceo", "coo", "admin", "pm", "team_lead")
require_authenticated = get_current_user


def can_access_user_data(target_user_id: str, current_user: dict, target_user: dict | None = None) -> bool:
    """
    Check if current_user can access data of target_user_id.
    Pass target_user dict to enable team-membership check for PM/TL.
    """
    roles = set(current_user.get("roles", []))
    if roles.intersection({"ceo", "coo"}):
        return True
    if str(current_user["_id"]) == target_user_id:
        return True
    if "pm" in roles or "team_lead" in roles:
        # PM/TL can only see users who share at least one team with them
        if target_user is not None:
            caller_teams = set(str(t) for t in current_user.get("team_ids", []))
            target_teams = set(str(t) for t in target_user.get("team_ids", []))
            return bool(caller_teams & target_teams)
        # No target_user provided → allow (backwards-compat for callers without it)
        return True
    return False
