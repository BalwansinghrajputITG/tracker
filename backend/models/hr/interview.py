"""
Interview models — `hr_interviews`, `hr_interview_feedback` (hr.md §8).

Feedback is a SEPARATE collection, one document per interviewer, rather than an
array on the interview. Three reasons: a panel submits independently and
concurrently (array pushes would race), an interviewer must not see a colleague's
scores before submitting their own (bias), and per-interviewer permissions are
expressible on a document but not on an array element.

Collection shapes:

hr_interviews {
    "_id": ObjectId, "application_id": ObjectId, "candidate_id": ObjectId,
    "job_id": ObjectId, "round": str,        # see INTERVIEW_ROUNDS
    "round_number": int,
    "interviewer_ids": [ObjectId],           # ref users
    "scheduled_at": datetime, "duration_minutes": int,
    "mode": str,                             # video|phone|onsite
    "meeting_url": str, "location": str,
    "status": str,                           # scheduled|completed|cancelled|no_show|rescheduled
    "notes": str,
    "scheduled_by": ObjectId, "created_at": datetime, "updated_at": datetime,
}

hr_interview_feedback {
    "_id": ObjectId, "interview_id": ObjectId, "interviewer_id": ObjectId,
    "technical_score": int, "communication_score": int,
    "problem_solving_score": int, "culture_fit_score": int,     # each 1-5
    "overall_score": float,                  # computed mean
    "recommendation": str,                   # strong_yes|yes|maybe|no|strong_no
    "strengths": str, "concerns": str, "comments": str,
    "submitted_at": datetime,
}
Unique on (interview_id, interviewer_id): one submission per interviewer.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

INTERVIEW_ROUNDS = (
    "hr_screening", "technical_1", "technical_2", "managerial", "hr_final", "other",
)
INTERVIEW_MODES = ("video", "phone", "onsite")
INTERVIEW_STATUSES = ("scheduled", "completed", "cancelled", "no_show", "rescheduled")
RECOMMENDATIONS = ("strong_yes", "yes", "maybe", "no", "strong_no")

# Recommendations that read as "advance this candidate" — used for the
# panel summary so the UI does not re-derive the meaning of each value.
POSITIVE_RECOMMENDATIONS = ("strong_yes", "yes")


class InterviewCreate(BaseModel):
    application_id: str
    round: str = Field("technical_1")
    interviewer_ids: list[str] = Field(..., min_length=1)
    scheduled_at: str = Field(..., description="ISO datetime")
    duration_minutes: int = Field(60, ge=15, le=480)
    mode: str = Field("video")
    meeting_url: str = Field("", max_length=500)
    location: str = Field("", max_length=200)
    notes: str = Field("", max_length=1000)

    @field_validator("meeting_url", "location", "notes", mode="before")
    @classmethod
    def strip_text(cls, v):
        return (v or "").strip()

    @field_validator("round")
    @classmethod
    def valid_round(cls, v: str) -> str:
        if v not in INTERVIEW_ROUNDS:
            raise ValueError(f"round must be one of: {', '.join(INTERVIEW_ROUNDS)}")
        return v

    @field_validator("mode")
    @classmethod
    def valid_mode(cls, v: str) -> str:
        if v not in INTERVIEW_MODES:
            raise ValueError(f"mode must be one of: {', '.join(INTERVIEW_MODES)}")
        return v


class InterviewUpdate(BaseModel):
    scheduled_at: Optional[str] = None
    duration_minutes: Optional[int] = Field(None, ge=15, le=480)
    mode: Optional[str] = None
    meeting_url: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = Field(None, max_length=200)
    status: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=1000)
    interviewer_ids: Optional[list[str]] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v is not None and v not in INTERVIEW_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(INTERVIEW_STATUSES)}")
        return v


class FeedbackCreate(BaseModel):
    """§8 scorecard. All four dimensions are 1-5 and required — a partially
    filled scorecard is worse than none, because it averages as if complete."""
    technical_score: int = Field(..., ge=1, le=5)
    communication_score: int = Field(..., ge=1, le=5)
    problem_solving_score: int = Field(..., ge=1, le=5)
    culture_fit_score: int = Field(..., ge=1, le=5)
    recommendation: str
    strengths: str = Field("", max_length=2000)
    concerns: str = Field("", max_length=2000)
    comments: str = Field("", max_length=2000)

    @field_validator("strengths", "concerns", "comments", mode="before")
    @classmethod
    def strip_text(cls, v):
        return (v or "").strip()

    @field_validator("recommendation")
    @classmethod
    def valid_recommendation(cls, v: str) -> str:
        if v not in RECOMMENDATIONS:
            raise ValueError(f"recommendation must be one of: {', '.join(RECOMMENDATIONS)}")
        return v
