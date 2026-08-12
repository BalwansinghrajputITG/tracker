"""
Recruitment models — `hr_jobs`, `hr_candidates`, `hr_applications` (hr.md §6, §7).

The candidate/application split matters: a CANDIDATE is a person, an APPLICATION
is that person's progress against one opening. The same person applying to two
roles is one candidate and two applications — collapsing them would make
"have we spoken to this person before" unanswerable, which is the main thing an
ATS is for.

`stage_history[]` is an append-only array on the application. Every stage move
pushes {stage, at, by}. Recording it there rather than only mutating `stage` is
what makes time-to-hire and funnel conversion a single aggregation instead of a
reconstruction from audit logs.

Collection shapes:

hr_jobs {
    "_id": ObjectId, "title": str, "department_id": ObjectId|None,
    "designation_id": ObjectId|None, "location": str, "employment_type": str,
    "experience_min": int, "experience_max": int,
    "salary_min": float, "salary_max": float, "currency": str,   # salary.read gated
    "skills": [str], "description": str,
    "hiring_manager_id": ObjectId|None, "recruiter_id": ObjectId|None,
    "openings_count": int, "filled_count": int,
    "status": str,          # draft|open|on_hold|closed|cancelled
    "posted_at": datetime|None, "closes_at": datetime|None,
    "created_by": ObjectId, "created_at": datetime, "updated_at": datetime,
}

hr_candidates {
    "_id": ObjectId, "full_name": str, "email": str,             # unique
    "phone": str, "linkedin": str, "portfolio": str,
    "current_company": str, "current_title": str,
    "total_experience_years": float,
    "expected_salary": float|None, "notice_period_days": int|None,
    "skills": [str], "source": str,      # referral|linkedin|job_board|careers_page|agency|other
    "referred_by": ObjectId|None, "notes": str,
    "converted_user_id": ObjectId|None,  # set when hired — the candidate→employee link
    "created_by": ObjectId, "created_at": datetime, "updated_at": datetime,
}

hr_applications {
    "_id": ObjectId, "candidate_id": ObjectId, "job_id": ObjectId,
    "stage": str, "status": str,        # active|rejected|withdrawn|hired
    "stage_history": [{"stage": str, "at": datetime, "by": ObjectId|None, "note": str}],
    "rejection_reason": str, "rating": float|None,
    "applied_at": datetime, "updated_at": datetime,
}
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

# The §6 pipeline, in order. Index position gives "how far along" for free.
PIPELINE_STAGES = (
    "applied", "screening", "shortlisted", "interview",
    "technical_interview", "hr_interview", "selected", "offer", "hired",
)
JOB_STATUSES = ("draft", "open", "on_hold", "closed", "cancelled")
APPLICATION_STATUSES = ("active", "rejected", "withdrawn", "hired")
CANDIDATE_SOURCES = ("referral", "linkedin", "job_board", "careers_page", "agency", "walk_in", "other")
EMPLOYMENT_TYPES = ("full_time", "part_time", "contract", "intern", "consultant")


# ── Jobs ──────────────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    department_id: Optional[str] = None
    designation_id: Optional[str] = None
    location: str = Field("", max_length=120)
    employment_type: str = Field("full_time")
    experience_min: int = Field(0, ge=0, le=50)
    experience_max: int = Field(0, ge=0, le=50)
    salary_min: float = Field(0, ge=0)
    salary_max: float = Field(0, ge=0)
    currency: str = Field("INR", max_length=3)
    skills: list[str] = Field(default_factory=list)
    description: str = Field("", max_length=5000)
    hiring_manager_id: Optional[str] = None
    recruiter_id: Optional[str] = None
    openings_count: int = Field(1, ge=1, le=999)
    closes_at: Optional[str] = None

    @field_validator("title", "location", "description", mode="before")
    @classmethod
    def strip_text(cls, v):
        return (v or "").strip()

    @field_validator("department_id", "designation_id", "hiring_manager_id",
                     "recruiter_id", "closes_at", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        return v if v else None

    @field_validator("employment_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in EMPLOYMENT_TYPES:
            raise ValueError(f"employment_type must be one of: {', '.join(EMPLOYMENT_TYPES)}")
        return v

    @field_validator("skills", mode="before")
    @classmethod
    def clean_skills(cls, v):
        if isinstance(v, str):
            v = [s for s in v.split(",")]
        return [s.strip() for s in (v or []) if s and s.strip()][:40]


class JobUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=150)
    department_id: Optional[str] = None
    designation_id: Optional[str] = None
    location: Optional[str] = Field(None, max_length=120)
    employment_type: Optional[str] = None
    experience_min: Optional[int] = Field(None, ge=0, le=50)
    experience_max: Optional[int] = Field(None, ge=0, le=50)
    salary_min: Optional[float] = Field(None, ge=0)
    salary_max: Optional[float] = Field(None, ge=0)
    skills: Optional[list[str]] = None
    description: Optional[str] = Field(None, max_length=5000)
    hiring_manager_id: Optional[str] = None
    recruiter_id: Optional[str] = None
    openings_count: Optional[int] = Field(None, ge=1, le=999)
    status: Optional[str] = None
    closes_at: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v is not None and v not in JOB_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(JOB_STATUSES)}")
        return v


# ── Candidates ────────────────────────────────────────────────────────────────

class CandidateCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=255)
    phone: str = Field("", max_length=30)
    linkedin: str = Field("", max_length=300)
    portfolio: str = Field("", max_length=300)
    current_company: str = Field("", max_length=120)
    current_title: str = Field("", max_length=120)
    total_experience_years: float = Field(0, ge=0, le=60)
    expected_salary: Optional[float] = Field(None, ge=0)
    notice_period_days: Optional[int] = Field(None, ge=0, le=365)
    skills: list[str] = Field(default_factory=list)
    source: str = Field("other")
    referred_by: Optional[str] = None
    notes: str = Field("", max_length=2000)
    # Optional: apply to a job immediately, so "add candidate" is one step.
    job_id: Optional[str] = None

    @field_validator("full_name", "phone", "linkedin", "portfolio",
                     "current_company", "current_title", "notes", mode="before")
    @classmethod
    def strip_text(cls, v):
        return (v or "").strip()

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v):
        return (v or "").strip().lower()

    @field_validator("referred_by", "job_id", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        return v if v else None

    @field_validator("source")
    @classmethod
    def valid_source(cls, v: str) -> str:
        if v not in CANDIDATE_SOURCES:
            raise ValueError(f"source must be one of: {', '.join(CANDIDATE_SOURCES)}")
        return v

    @field_validator("skills", mode="before")
    @classmethod
    def clean_skills(cls, v):
        if isinstance(v, str):
            v = [s for s in v.split(",")]
        return [s.strip() for s in (v or []) if s and s.strip()][:40]


class CandidateUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=120)
    phone: Optional[str] = Field(None, max_length=30)
    linkedin: Optional[str] = Field(None, max_length=300)
    portfolio: Optional[str] = Field(None, max_length=300)
    current_company: Optional[str] = Field(None, max_length=120)
    current_title: Optional[str] = Field(None, max_length=120)
    total_experience_years: Optional[float] = Field(None, ge=0, le=60)
    expected_salary: Optional[float] = Field(None, ge=0)
    notice_period_days: Optional[int] = Field(None, ge=0, le=365)
    skills: Optional[list[str]] = None
    notes: Optional[str] = Field(None, max_length=2000)


# ── Applications ──────────────────────────────────────────────────────────────

class ApplicationCreate(BaseModel):
    candidate_id: str
    job_id: str


class StageMove(BaseModel):
    stage: str
    note: str = Field("", max_length=500)

    @field_validator("stage")
    @classmethod
    def valid_stage(cls, v: str) -> str:
        if v not in PIPELINE_STAGES:
            raise ValueError(f"stage must be one of: {', '.join(PIPELINE_STAGES)}")
        return v


class ApplicationReject(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)
