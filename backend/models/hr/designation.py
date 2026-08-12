"""
Designation models — Pydantic schemas for `hr_designations` (hr.md §4).

A designation is the job title ladder (Junior Engineer → Engineer → Senior → EM),
distinct from an RBAC role. `users.primary_role` decides what you may DO;
a designation describes what you ARE. Conflating them is why the spec's org chart
and the app's permission model have to stay separate concepts.

Collection shape (MongoDB document):
{
    "_id":            ObjectId,
    "title":          str,           # unique per department, case-insensitive
    "level":          int,           # 1 = most junior, ascending
    "career_level":   str,           # "IC" | "Manager" | "Executive"
    "department_id":  ObjectId | None,  # ref departments; None = company-wide
    "salary_band":    {"min": float, "max": float, "currency": str},
    "reports_to_designation_id": ObjectId | None,  # ref hr_designations
    "description":    str,
    "is_active":      bool,
    "created_by":     ObjectId,
    "created_at":     datetime,
    "updated_at":     datetime,
}

salary_band lives here rather than in hr_compensation because a band is a property
of the ROLE, not of a person — it is reference data, not anyone's pay. Reading it
still requires salary.read, since a narrow band plus a title is close to a salary.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

CAREER_LEVELS = ("ic", "manager", "executive")


class SalaryBand(BaseModel):
    min: float = Field(0, ge=0)
    max: float = Field(0, ge=0)
    currency: str = Field("INR", max_length=3)

    @field_validator("currency", mode="before")
    @classmethod
    def upper_currency(cls, v):
        return (v or "INR").strip().upper()


# ── Request bodies ─────────────────────────────────────────────────────────────

class DesignationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    level: int = Field(1, ge=1, le=20)
    career_level: str = Field("ic")
    department_id: Optional[str] = None
    salary_band: Optional[SalaryBand] = None
    reports_to_designation_id: Optional[str] = None
    description: str = Field("", max_length=500)

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, v: str) -> str:
        return (v or "").strip()

    @field_validator("description", mode="before")
    @classmethod
    def strip_description(cls, v) -> str:
        return (v or "").strip()

    @field_validator("department_id", "reports_to_designation_id", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        return v if v else None

    @field_validator("career_level", mode="before")
    @classmethod
    def valid_career_level(cls, v: str) -> str:
        v = (v or "ic").strip().lower()
        if v not in CAREER_LEVELS:
            raise ValueError(f"career_level must be one of: {', '.join(CAREER_LEVELS)}")
        return v


class DesignationUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    level: Optional[int] = Field(None, ge=1, le=20)
    career_level: Optional[str] = None
    department_id: Optional[str] = None
    salary_band: Optional[SalaryBand] = None
    reports_to_designation_id: Optional[str] = None
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, v):
        return v.strip() if v is not None else v

    @field_validator("career_level")
    @classmethod
    def valid_career_level(cls, v):
        if v is not None and v.lower() not in CAREER_LEVELS:
            raise ValueError(f"career_level must be one of: {', '.join(CAREER_LEVELS)}")
        return v.lower() if v is not None else v


# ── Response bodies ────────────────────────────────────────────────────────────

class DesignationResponse(BaseModel):
    id: str
    title: str
    level: int
    career_level: str
    department_id: Optional[str] = None
    department_name: str = ""
    reports_to_designation_id: Optional[str] = None
    description: str = ""
    is_active: bool = True
    employee_count: int = 0
    # Present only when the caller holds salary.read — omitted entirely otherwise.
    salary_band: Optional[SalaryBand] = None
