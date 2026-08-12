"""
Employee models — Pydantic schemas for the `hr_employees` collection (hr.md §3).

`hr_employees` is a 1:1 PROFILE EXTENSION of `users`, keyed by a unique `user_id`.
It is not a replacement: `users` remains the identity/auth record referenced by
team_ids, project_ids, assignee_ids and every helper in utils/team_scope.py.

Field ownership is strict, because the alternative is two sources of truth:
    users          → email, full_name, avatar_url, roles, is_active, team_ids
    hr_employees   → everything HR-specific below
    hr_compensation→ salary, CTC, bonus (SEPARATE collection, see compensation.py)

hr_employees NEVER duplicates full_name / email / department. Those are read from
`users` via a batch map at serialization time.

Compensation deliberately lives elsewhere: routers/users.py serialize() is a
deny-list over the whole document, so any salary field on `users` — or joined into
an employee response by default — becomes readable by every authenticated caller.

Collection shape (MongoDB document):
{
    "_id":               ObjectId,
    "user_id":           ObjectId,       # ref users, UNIQUE
    "employee_code":     str,            # human-readable, e.g. "EMP-0007"
    "joining_date":      datetime | None,
    "date_of_birth":     datetime | None,
    "gender":            str,            # "" when undisclosed
    "personal_email":    str,
    "phone":             str,
    "address":           str,
    "emergency_contact": {"name": str, "relationship": str, "phone": str},
    "designation_id":    ObjectId | None,  # ref hr_designations
    "department_id":     ObjectId | None,  # ref departments
    "manager_user_id":   ObjectId | None,  # ref users — THE reporting line (§5)
    "employment_type":   str,            # full_time | part_time | contract | intern | consultant
    "employment_status": str,            # active | probation | notice_period | resigned | terminated | on_leave
    "work_mode":         str,            # onsite | remote | hybrid
    "work_location":     str,
    "probation_status":  str,            # not_applicable | ongoing | confirmed | extended
    "probation_end_date":datetime | None,
    "confirmation_date": datetime | None,
    "exit_date":         datetime | None,
    "exit_reason":       str,
    "external_ids":      {"keka": str},  # §36 sync seam, populated in Phase 8
    "sync":              {"last_synced_at": datetime|None, "status": str, "error": str|None},
    "created_by":        ObjectId,
    "created_at":        datetime,
    "updated_at":        datetime,
}

`manager_user_id` exists because users.manager_id is NOT a reporting line — it is
set to the account's creator at routers/users.py:211 and never used for scoping.
The org chart (§5) reads this field, not that one.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

# Vocabularies. Kept as tuples so routers can validate against them without a
# second copy, and so the frontend can be generated from one list later.
EMPLOYMENT_TYPES = ("full_time", "part_time", "contract", "intern", "consultant")
EMPLOYMENT_STATUSES = ("active", "probation", "notice_period", "resigned", "terminated", "on_leave")
WORK_MODES = ("onsite", "remote", "hybrid")
PROBATION_STATUSES = ("not_applicable", "ongoing", "confirmed", "extended")
GENDERS = ("", "male", "female", "other", "undisclosed")


class EmergencyContact(BaseModel):
    name: str = Field("", max_length=120)
    relationship: str = Field("", max_length=60)
    phone: str = Field("", max_length=30)

    @field_validator("name", "relationship", "phone", mode="before")
    @classmethod
    def strip_field(cls, v):
        return (v or "").strip()


# ── Request bodies ─────────────────────────────────────────────────────────────

class EmployeeCreate(BaseModel):
    """Create an HR profile for an EXISTING user.

    Deliberately does not create the user account: identity lives in `users` and
    is created by /users or (from Phase 5) by accepting an offer. One code path
    per account, not two.
    """
    user_id: str = Field(..., description="ObjectId of the existing user")
    employee_code: Optional[str] = Field(None, max_length=32, description="Auto-generated when omitted")
    joining_date: Optional[str] = Field(None, description="ISO date")
    date_of_birth: Optional[str] = Field(None, description="ISO date")
    gender: str = Field("", max_length=20)
    personal_email: str = Field("", max_length=255)
    phone: str = Field("", max_length=30)
    address: str = Field("", max_length=500)
    emergency_contact: EmergencyContact = Field(default_factory=EmergencyContact)
    designation_id: Optional[str] = None
    department_id: Optional[str] = None
    manager_user_id: Optional[str] = None
    employment_type: str = Field("full_time")
    employment_status: str = Field("active")
    work_mode: str = Field("onsite")
    work_location: str = Field("", max_length=120)
    probation_status: str = Field("not_applicable")
    probation_end_date: Optional[str] = None

    @field_validator("gender", "personal_email", "phone", "address", "work_location", mode="before")
    @classmethod
    def strip_optional_text(cls, v):
        return (v or "").strip()

    @field_validator(
        "employee_code", "joining_date", "date_of_birth", "designation_id",
        "department_id", "manager_user_id", "probation_end_date", mode="before",
    )
    @classmethod
    def empty_to_none(cls, v):
        return v if v else None

    @field_validator("employment_type")
    @classmethod
    def valid_employment_type(cls, v: str) -> str:
        if v not in EMPLOYMENT_TYPES:
            raise ValueError(f"employment_type must be one of: {', '.join(EMPLOYMENT_TYPES)}")
        return v

    @field_validator("employment_status")
    @classmethod
    def valid_employment_status(cls, v: str) -> str:
        if v not in EMPLOYMENT_STATUSES:
            raise ValueError(f"employment_status must be one of: {', '.join(EMPLOYMENT_STATUSES)}")
        return v

    @field_validator("work_mode")
    @classmethod
    def valid_work_mode(cls, v: str) -> str:
        if v not in WORK_MODES:
            raise ValueError(f"work_mode must be one of: {', '.join(WORK_MODES)}")
        return v

    @field_validator("probation_status")
    @classmethod
    def valid_probation_status(cls, v: str) -> str:
        if v not in PROBATION_STATUSES:
            raise ValueError(f"probation_status must be one of: {', '.join(PROBATION_STATUSES)}")
        return v


class EmployeeUpdate(BaseModel):
    """Partial update. None means "not supplied" and is skipped."""
    employee_code: Optional[str] = Field(None, max_length=32)
    joining_date: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = Field(None, max_length=20)
    personal_email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=30)
    address: Optional[str] = Field(None, max_length=500)
    emergency_contact: Optional[EmergencyContact] = None
    designation_id: Optional[str] = None
    department_id: Optional[str] = None
    manager_user_id: Optional[str] = None
    employment_type: Optional[str] = None
    employment_status: Optional[str] = None
    work_mode: Optional[str] = None
    work_location: Optional[str] = Field(None, max_length=120)
    probation_status: Optional[str] = None
    probation_end_date: Optional[str] = None
    confirmation_date: Optional[str] = None
    exit_date: Optional[str] = None
    exit_reason: Optional[str] = Field(None, max_length=500)

    @field_validator("employment_type")
    @classmethod
    def valid_employment_type(cls, v):
        if v is not None and v not in EMPLOYMENT_TYPES:
            raise ValueError(f"employment_type must be one of: {', '.join(EMPLOYMENT_TYPES)}")
        return v

    @field_validator("employment_status")
    @classmethod
    def valid_employment_status(cls, v):
        if v is not None and v not in EMPLOYMENT_STATUSES:
            raise ValueError(f"employment_status must be one of: {', '.join(EMPLOYMENT_STATUSES)}")
        return v

    @field_validator("work_mode")
    @classmethod
    def valid_work_mode(cls, v):
        if v is not None and v not in WORK_MODES:
            raise ValueError(f"work_mode must be one of: {', '.join(WORK_MODES)}")
        return v

    @field_validator("probation_status")
    @classmethod
    def valid_probation_status(cls, v):
        if v is not None and v not in PROBATION_STATUSES:
            raise ValueError(f"probation_status must be one of: {', '.join(PROBATION_STATUSES)}")
        return v


# ── Response bodies ────────────────────────────────────────────────────────────
# Flat all-str DTOs, matching models/department.py. Note there is NO salary field
# anywhere in these responses — compensation is fetched from its own endpoint,
# gated on salary.read, so it cannot leak by being forgotten in a serializer.

class EmployeeResponse(BaseModel):
    id: str
    user_id: str
    employee_code: str
    # Denormalized from `users` at read time — never stored on hr_employees.
    full_name: str = ""
    email: str = ""
    avatar_url: str = ""
    primary_role: str = ""
    is_active: bool = True

    joining_date: Optional[str] = None
    designation_id: Optional[str] = None
    designation_title: str = ""
    department_id: Optional[str] = None
    department_name: str = ""
    manager_user_id: Optional[str] = None
    manager_name: str = ""
    employment_type: str = "full_time"
    employment_status: str = "active"
    work_mode: str = "onsite"
    work_location: str = ""
    probation_status: str = "not_applicable"


class EmployeeDetailResponse(EmployeeResponse):
    date_of_birth: Optional[str] = None
    gender: str = ""
    personal_email: str = ""
    phone: str = ""
    address: str = ""
    emergency_contact: EmergencyContact = Field(default_factory=EmergencyContact)
    probation_end_date: Optional[str] = None
    confirmation_date: Optional[str] = None
    exit_date: Optional[str] = None
    exit_reason: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class OrgChartNode(BaseModel):
    """A node in the reporting tree (§5). `reports` nests recursively."""
    user_id: str
    full_name: str
    avatar_url: str = ""
    designation_title: str = ""
    department_name: str = ""
    employee_id: Optional[str] = None
    reports: list["OrgChartNode"] = []


OrgChartNode.model_rebuild()
