"""
Granular permissions (hr.md §28) — the canonical role vocabulary for the app.

Sits alongside middleware/rbac.py rather than replacing it. `require_roles` keeps
working untouched for every existing endpoint; HR endpoints use `require_permission`.

Scope is encoded in the ACTION, not inferred from the caller:

    employee.read       may read rows they are already entitled to (self + reports)
    employee.read_all   may read org-wide, bypassing row scoping

That distinction is what implements §28's "an employee should never automatically
have access to all employee data" — holding `x.read` never widens a caller's rows,
it only lets them through the door. Row scoping still runs via utils/team_scope.py.

Wildcards: "*" grants everything; "<resource>.*" grants every action on a resource.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from middleware.auth import get_current_user


# ── Permission vocabulary ─────────────────────────────────────────────────────
# Format is strictly "<resource>.<action>" — two lowercase snake_case segments.

PERMISSIONS: frozenset[str] = frozenset({
    # Employee records
    "employee.read", "employee.read_all", "employee.create",
    "employee.update", "employee.update_self", "employee.delete",
    # Compensation / payroll.
    # `salary.read` has no scoped variant on purpose: an employee reads their own
    # pay through /hr/employees/me/compensation, where identity IS the
    # authorization. So holding salary.read always means "may see others' pay".
    "salary.read", "salary.update", "payroll.read",
    # Organization
    "department.read", "department.manage",
    "designation.read", "designation.manage",
    # Recruitment
    "job_position.read", "job_position.create", "job_position.update", "job_position.delete",
    "candidate.read", "candidate.create", "candidate.update", "candidate.delete",
    "application.read", "application.create", "application.update",
    "interview.read", "interview.schedule", "interview.update", "interview.cancel",
    "feedback.read", "feedback.submit",
    "offer.read", "offer.create", "offer.update", "offer.approve", "offer.send",
    "onboarding.read", "onboarding.manage",
    # Time
    "attendance.read", "attendance.read_all", "attendance.mark",
    "attendance.update", "attendance.regularize",
    "leave.read", "leave.read_all", "leave.request",
    "leave.approve", "leave.approve_final", "leave.manage",
    "holiday.read", "holiday.manage",
    # Documents
    "document.read", "document.read_all", "document.upload",
    "document.download", "document.delete", "document.read_history",
    # Performance
    "performance.read", "performance.read_all", "performance.manage", "performance.review",
    "goal.read", "goal.create", "goal.update", "goal.approve",
    # Helpdesk
    "ticket.read", "ticket.read_all", "ticket.create", "ticket.assign", "ticket.resolve",
    # Platform
    "audit.read", "audit.read_sensitive", "analytics.hr_read",
    "integration.read", "integration.sync", "rbac.manage",
})


# ── Roles ─────────────────────────────────────────────────────────────────────
# The single source of truth for role names. routers/users.py, the chatbot's
# action_executor and frontend/src/constants/roles.ts all derive from this list.

EXISTING_ROLES = ("ceo", "coo", "admin", "pm", "team_lead", "employee")
HR_ROLES = ("hr_admin", "hr_manager", "recruiter", "hiring_manager", "finance")
ALL_ROLES = EXISTING_ROLES + HR_ROLES


ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    # ── Existing app roles ────────────────────────────────────────────────────
    # ceo/coo get "*" so nothing that works today changes behaviour.
    "ceo": frozenset({"*"}),
    "coo": frozenset({"*"}),

    # `admin` is the EXISTING app administrator (user management), NOT the spec's
    # "Super Admin". Granting "*" here would silently hand every current admin
    # account org-wide salary access, so salary/payroll/rbac are withheld.
    "admin": frozenset({
        "employee.read", "employee.read_all", "employee.create", "employee.update",
        "department.read", "department.manage", "designation.read", "designation.manage",
        "job_position.read", "candidate.read", "application.read", "interview.read",
        "offer.read", "onboarding.read", "onboarding.manage",
        "attendance.read", "attendance.read_all", "leave.read", "leave.read_all",
        "holiday.read", "holiday.manage", "document.read", "document.upload",
        "performance.read", "performance.read_all", "goal.read",
        "ticket.read", "ticket.read_all", "ticket.assign", "ticket.resolve",
        "audit.read", "analytics.hr_read", "integration.read",
    }),
    "pm": frozenset({
        "employee.read", "employee.update_self",
        "department.read", "designation.read",
        "job_position.read", "candidate.read", "application.read",
        "interview.read", "interview.schedule", "feedback.read", "feedback.submit",
        "attendance.read", "attendance.mark",
        "leave.read", "leave.request", "leave.approve",
        "holiday.read", "document.read",
        "onboarding.read",
        "performance.read", "performance.review",
        "goal.read", "goal.create", "goal.update", "goal.approve",
        "ticket.read", "ticket.create",
    }),
    "team_lead": frozenset({
        "employee.read", "employee.update_self",
        "department.read", "designation.read",
        "interview.read", "feedback.read", "feedback.submit",
        "attendance.read", "attendance.mark",
        "leave.read", "leave.request", "leave.approve",
        "holiday.read", "document.read",
        "onboarding.read",
        "performance.read", "performance.review",
        "goal.read", "goal.create", "goal.update", "goal.approve",
        "ticket.read", "ticket.create",
    }),
    "employee": frozenset({
        "employee.read", "employee.update_self",
        "department.read", "designation.read",
        "attendance.read", "attendance.mark", "attendance.regularize",
        "leave.read", "leave.request", "holiday.read",
        "document.read", "document.download",
        # Their OWN checklist — routers/hr/onboarding.py scopes to the caller
        # without onboarding.manage. A new hire who cannot see the list of
        # things they must do on day one is the whole point of §10/§11.
        "onboarding.read",
        # PEER review (§18). This unlocks only the peer section: the manager
        # section separately requires being the reporting manager, and the HR
        # section requires performance.manage. Without it, "peer review" could
        # only be written by managers, which is not what a peer is.
        "performance.review",
        "performance.read", "goal.read", "goal.update",
        "ticket.read", "ticket.create",
    }),

    # ── New HR roles (§28) ────────────────────────────────────────────────────
    "hr_admin": frozenset({
        "employee.*", "salary.read", "salary.update", "payroll.read",
        "department.*", "designation.*",
        "job_position.*", "candidate.*", "application.*", "interview.*",
        "feedback.*", "offer.*", "onboarding.*",
        "attendance.*", "leave.*", "holiday.*", "document.*",
        "performance.*", "goal.*", "ticket.*",
        "audit.read", "analytics.hr_read", "integration.*", "rbac.manage",
    }),
    "hr_manager": frozenset({
        "employee.read", "employee.read_all", "employee.create", "employee.update",
        "salary.read",                      # read only — cannot change pay
        "department.read", "designation.read", "designation.manage",
        "job_position.*", "candidate.*", "application.*", "interview.*",
        "feedback.read", "offer.read", "offer.create", "offer.update", "offer.send",
        "onboarding.*",
        "attendance.*", "leave.*", "holiday.*",
        "document.read", "document.read_all", "document.upload", "document.download",
        "performance.*", "goal.read", "goal.approve",
        "ticket.*", "analytics.hr_read", "integration.read",
    }),
    "recruiter": frozenset({
        "employee.read", "department.read", "designation.read",
        "job_position.read", "job_position.create", "job_position.update",
        "candidate.*", "application.*",
        "interview.read", "interview.schedule", "interview.update", "interview.cancel",
        "feedback.read",
        "offer.read", "offer.create", "offer.update",   # NOT approve / send
        "onboarding.read",
        "document.upload", "document.read",             # candidate resumes
        "ticket.create", "ticket.read", "analytics.hr_read",
    }),
    "hiring_manager": frozenset({
        "employee.read", "department.read", "designation.read",
        "job_position.read", "candidate.read",
        "application.read", "application.update",       # advance/reject own reqs
        "interview.read", "interview.schedule",
        "feedback.read", "feedback.submit",
        "offer.read",                                    # salary fields still stripped
        "leave.read", "leave.approve",
        "performance.read", "performance.review",
        "goal.read", "goal.approve",
        "ticket.read", "ticket.create",
    }),
    "finance": frozenset({
        "employee.read", "employee.read_all",
        "salary.read", "payroll.read",
        "department.read", "designation.read",
        "attendance.read", "attendance.read_all",
        "leave.read", "leave.read_all",
        "document.read", "document.read_all", "document.download",
        "analytics.hr_read", "audit.read",
        "ticket.read", "ticket.create",
    }),
}


# ── Role assignment hierarchy ─────────────────────────────────────────────────
# Canonical home for the tables that were previously duplicated across
# routers/users.py, chatbot/action_executor.py and frontend/src/constants/roles.ts.
#
# The REST and chatbot tables genuinely DIVERGE and both are preserved verbatim:
# via the REST API an `admin` may manage every role, but via the chatbot it may
# only manage pm/team_lead/employee. That divergence was previously accidental
# (two copies drifting); it is now explicit. Collapsing them would either widen
# the AI path — letting an admin deactivate the CEO by chat — or silently narrow
# a working REST endpoint, so the choice is left to the product owner.

_HR_ASSIGNABLE = {"hr_admin", "hr_manager", "recruiter", "hiring_manager", "finance"}
_ALL_ASSIGNABLE = set(ALL_ROLES)

# Roles each caller level may ASSIGN when creating or updating a user (REST API).
ASSIGNABLE_ROLES: dict[str, set[str]] = {
    "ceo":       set(_ALL_ASSIGNABLE),
    "coo":       set(_ALL_ASSIGNABLE),
    "admin":     set(_ALL_ASSIGNABLE),
    "hr_admin":  {"hr_manager", "recruiter", "hiring_manager", "finance", "employee"},
    "hr_manager": {"recruiter", "employee"},
    "pm":        {"team_lead", "employee"},        # unchanged
    "team_lead": {"employee"},                     # unchanged
}

# Roles each caller level may DEACTIVATE (REST API). Mirrors ASSIGNABLE_ROLES.
DELETABLE_ROLES: dict[str, set[str]] = {
    role: set(perms) for role, perms in ASSIGNABLE_ROLES.items()
}

# The chatbot path is deliberately stricter for `admin` — see the note above.
CHATBOT_CREATABLE_ROLES: dict[str, set[str]] = {
    "ceo":        set(_ALL_ASSIGNABLE),
    "coo":        set(_ALL_ASSIGNABLE),
    "admin":      {"pm", "team_lead", "employee"} | _HR_ASSIGNABLE,
    "hr_admin":   {"hr_manager", "recruiter", "hiring_manager", "finance", "employee"},
    "hr_manager": {"recruiter", "employee"},
    "pm":         {"team_lead", "employee"},
    "team_lead":  {"employee"},
}
CHATBOT_DELETABLE_ROLES: dict[str, set[str]] = {
    role: set(perms) for role, perms in CHATBOT_CREATABLE_ROLES.items()
}


# ── Resolution ────────────────────────────────────────────────────────────────

def get_user_permissions(user: dict) -> set[str]:
    """Resolve a user's effective permission set.

    Union of every role's grants, plus per-user `extra_permissions`, minus
    `denied_permissions`. Both overrides live on the user document, so granting
    one person a single extra capability needs no new collection.

    Wildcards are preserved verbatim — expanding them here would lose the "*"
    shorthand that keeps ceo/coo future-proof against new permissions.
    """
    granted: set[str] = set()
    for role in user.get("roles", []):
        granted |= ROLE_PERMISSIONS.get(role, frozenset())
    granted |= set(user.get("extra_permissions", []))
    return granted - set(user.get("denied_permissions", []))


def has_permission(user: dict, permission: str) -> bool:
    """True if the user holds `permission`, directly or via a wildcard."""
    granted = get_user_permissions(user)
    if "*" in granted or permission in granted:
        return True
    resource = permission.split(".", 1)[0]
    return f"{resource}.*" in granted


def require_permission(*permissions: str):
    """Dependency factory: requires ALL of the given permissions.

    Mirrors require_roles() in rbac.py — returns the same raw user dict, so it
    replaces `current_user=Depends(get_current_user)` rather than sitting beside it:

        @router.get("")
        async def list_employees(
            current_user=Depends(require_permission("employee.read")),
            db=Depends(get_db),
        ):

    ALL rather than ANY, because a permission name is already the narrowest unit;
    when an endpoint genuinely accepts either, gate on the broader one and branch
    inside the handler with has_permission().
    """
    async def checker(current_user=Depends(get_current_user)):
        missing = [p for p in permissions if not has_permission(current_user, p)]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires permission: {', '.join(missing)}",
            )
        return current_user
    return checker


# Convenience dependencies — same style as rbac.py:24-31
require_hr_read      = require_permission("employee.read")
require_hr_manage    = require_permission("employee.update")
require_salary_read  = require_permission("salary.read")
require_audit_read   = require_permission("audit.read")
require_hr_analytics = require_permission("analytics.hr_read")
