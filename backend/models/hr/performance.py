"""
Performance models — goals and reviews (hr.md §17, §18).

GOALS REUSE THE EXISTING `personal_targets` COLLECTION rather than creating a
parallel `hr_goals`. That collection already holds title/description/target_value/
current_value/unit/deadline/completed and is live behind /personal/targets — about
80% of §17. A second goals store would mean two places to look for "what is this
person working towards", which is exactly what §40 forbids.

The HR fields are ADDITIVE and optional, so every existing row stays valid and
/personal/targets keeps working untouched:

    kpi               str    how the goal is measured (§17)
    weight            float  contribution to the review score, 0-100
    cycle_id          ObjectId | None  links the goal to a review cycle
    assigned_by       ObjectId | None  set when a manager creates it
    manager_approved  bool
    visibility        str    "private" (self-set) | "shared" (manager-visible)

A goal created through /personal/targets is private and unweighted; one created
through /hr/performance/goals is shared and carries a weight. Same collection,
same documents, two doors.

Review shapes:

hr_review_cycles {
    "_id": ObjectId, "name": str, "cycle_type": str,   # quarterly|half_yearly|yearly
    "period_start": datetime, "period_end": datetime,
    "self_review_due": datetime|None, "manager_review_due": datetime|None,
    "status": str,          # draft|open|in_review|closed
    "created_by": ObjectId, "created_at": datetime,
}

hr_reviews {
    "_id": ObjectId, "cycle_id": ObjectId, "user_id": ObjectId,
    "manager_user_id": ObjectId|None,
    "sections": {                       # one per reviewer type (§18)
        "self":    {...} | None,
        "manager": {...} | None,
        "peer":    [{...}],             # many
        "hr":      {...} | None,
    },
    "objective_score": float|None,      # from _compute_evaluation, not typed by anyone
    "goal_completion": float|None,      # weighted % of linked goals
    "composite_score": float|None,
    "status": str,                      # pending|self_submitted|manager_submitted|completed
    "created_at": datetime, "updated_at": datetime,
}

A section: {"by": ObjectId, "submitted_at": datetime, "ratings": {...},
            "strengths": str, "improvements": str, "comments": str, "overall": float}
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

CYCLE_TYPES = ("quarterly", "half_yearly", "yearly")
CYCLE_STATUSES = ("draft", "open", "in_review", "closed")
REVIEW_SECTIONS = ("self", "manager", "peer", "hr")
REVIEW_STATUSES = ("pending", "self_submitted", "manager_submitted", "completed")

# The §18 metric block. Each is rated 1-5.
RATING_DIMENSIONS = (
    "performance", "technical_skills", "leadership", "communication", "collaboration",
)

# How the composite is assembled. Objective signals are weighted less than human
# judgement because _compute_evaluation measures activity, not contribution —
# a person can log hours and close tasks while doing the wrong work.
COMPOSITE_WEIGHTS = {
    "objective": 0.20,      # _compute_evaluation score (0-100)
    "goals":     0.25,      # weighted goal completion
    "manager":   0.30,      # manager rating, scaled to 0-100
    "hr":        0.10,      # HR calibration across the org
    "self":      0.05,      # self rating — deliberately small; it is self-reported
    "peer":      0.10,      # mean of peer ratings
}


class GoalCreate(BaseModel):
    """A goal set through HR (§17). Weighted and visible to the manager."""
    user_id: str
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=1000)
    kpi: str = Field("", max_length=200, description="How success is measured")
    target_value: float = Field(100, gt=0)
    unit: str = Field("%", max_length=20)
    weight: float = Field(0, ge=0, le=100, description="Contribution to the review score")
    deadline: Optional[str] = None
    cycle_id: Optional[str] = None

    @field_validator("title", "description", "kpi", mode="before")
    @classmethod
    def strip_text(cls, v):
        return (v or "").strip()

    @field_validator("cycle_id", "deadline", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        return v if v else None


class GoalUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    kpi: Optional[str] = Field(None, max_length=200)
    target_value: Optional[float] = Field(None, gt=0)
    current_value: Optional[float] = Field(None, ge=0)
    weight: Optional[float] = Field(None, ge=0, le=100)
    deadline: Optional[str] = None
    manager_approved: Optional[bool] = None


class CycleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    cycle_type: str = Field("quarterly")
    period_start: str
    period_end: str
    self_review_due: Optional[str] = None
    manager_review_due: Optional[str] = None

    @field_validator("cycle_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in CYCLE_TYPES:
            raise ValueError(f"cycle_type must be one of: {', '.join(CYCLE_TYPES)}")
        return v


class ReviewSubmit(BaseModel):
    """One reviewer's contribution (§18)."""
    section: str = Field(..., description="self | manager | peer | hr")
    ratings: dict[str, int] = Field(..., description="1-5 per dimension")
    strengths: str = Field("", max_length=2000)
    improvements: str = Field("", max_length=2000)
    comments: str = Field("", max_length=2000)

    @field_validator("section")
    @classmethod
    def valid_section(cls, v: str) -> str:
        if v not in REVIEW_SECTIONS:
            raise ValueError(f"section must be one of: {', '.join(REVIEW_SECTIONS)}")
        return v

    @field_validator("ratings")
    @classmethod
    def valid_ratings(cls, v: dict) -> dict:
        unknown = set(v) - set(RATING_DIMENSIONS)
        if unknown:
            raise ValueError(f"Unknown rating dimensions: {', '.join(sorted(unknown))}")
        if not v:
            raise ValueError("At least one rating is required.")
        for dim, score in v.items():
            if not isinstance(score, int) or not 1 <= score <= 5:
                raise ValueError(f"{dim} must be an integer from 1 to 5.")
        return v
