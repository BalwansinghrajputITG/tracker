"""
Onboarding models — `hr_onboarding_tasks` (hr.md §10).

The §10 checklist is a module constant rather than a database-driven template.
That is deliberate for the MVP: a template table needs its own CRUD, versioning
and a "which template did this hire use" question, and none of that earns its
keep before the list has been through a few real hires. It becomes a collection
the first time two departments genuinely need different lists.

Owner is expressed as a ROLE, not a person, and resolved to a real user when the
tasks are created — the IT lead who provisions laptops changes far more often
than the fact that IT provisions laptops.

Collection shape:
{
    "_id": ObjectId, "user_id": ObjectId,      # the new employee
    "candidate_id": ObjectId|None, "offer_id": ObjectId|None,
    "title": str, "category": str,             # account|equipment|access|documents|orientation
    "owner_role": str, "owner_user_id": ObjectId|None,
    "due_date": datetime|None, "order": int,
    "status": str,                             # pending|in_progress|completed|blocked|skipped
    "completed_at": datetime|None, "completed_by": ObjectId|None,
    "notes": str,
    "created_at": datetime, "updated_at": datetime,
}
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

ONBOARDING_STATUSES = ("pending", "in_progress", "completed", "blocked", "skipped")
ONBOARDING_CATEGORIES = ("account", "equipment", "access", "documents", "orientation")

# The §10 checklist. `days` is an offset from the joining date — negative means
# it must be done BEFORE day one, which is most of the useful ones.
ONBOARDING_TEMPLATE: tuple[dict, ...] = (
    {"title": "Create employee account",      "category": "account",     "owner_role": "hr",  "days": -3},
    {"title": "Set up company email",         "category": "account",     "owner_role": "it",  "days": -2},
    {"title": "Provision laptop",             "category": "equipment",   "owner_role": "it",  "days": -1},
    {"title": "Grant software access",        "category": "access",      "owner_role": "it",  "days": 0},
    {"title": "Grant GitHub access",          "category": "access",      "owner_role": "it",  "days": 0},
    {"title": "Add to Slack workspace",       "category": "access",      "owner_role": "it",  "days": 0},
    {"title": "Configure VPN",                "category": "access",      "owner_role": "it",  "days": 0},
    {"title": "Collect signed HR documents",  "category": "documents",   "owner_role": "hr",  "days": 1},
    {"title": "Collect bank details",         "category": "documents",   "owner_role": "hr",  "days": 1},
    {"title": "Collect tax information",      "category": "documents",   "owner_role": "hr",  "days": 2},
    {"title": "Sign NDA",                     "category": "documents",   "owner_role": "hr",  "days": 1},
    {"title": "Company orientation",          "category": "orientation", "owner_role": "hr",  "days": 1},
    {"title": "Introduce to reporting manager", "category": "orientation", "owner_role": "manager", "days": 0},
)


class OnboardingTaskUpdate(BaseModel):
    status: Optional[str] = None
    owner_user_id: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v is not None and v not in ONBOARDING_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(ONBOARDING_STATUSES)}")
        return v


class OnboardingTaskCreate(BaseModel):
    """Add an ad-hoc task beyond the template."""
    user_id: str
    title: str = Field(..., min_length=1, max_length=200)
    category: str = Field("account")
    owner_user_id: Optional[str] = None
    due_date: Optional[str] = None

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str) -> str:
        if v not in ONBOARDING_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(ONBOARDING_CATEGORIES)}")
        return v
