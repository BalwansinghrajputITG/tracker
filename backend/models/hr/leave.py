"""
Leave models — `hr_leave_types`, `hr_leave_balances`, `hr_leave_requests` (hr.md §13).

The §13 flow is two-stage and both stages are real:

    Employee → Leave Request → Manager Approval → HR Approval → Balance Updated

Balance moves ONLY at final approval, and only inside a transaction together
with the status change. Deducting at submission would strand days when a request
is rejected; deducting outside a transaction lets a double-clicked approve
button decrement twice.

Balances are tracked per (user, leave_type, year) with three numbers:

    allocated  the year's entitlement
    used       days consumed by approved requests
    pending    days locked by requests awaiting approval

`pending` exists so an employee cannot get two overlapping requests approved
against the same remaining days. available = allocated - used - pending.

Collection shapes:

hr_leave_types {
    "_id": ObjectId, "name": str, "code": str,          # unique, e.g. "AL"
    "days_per_year": float, "is_paid": bool,
    "requires_approval": bool, "allow_half_day": bool,
    "max_consecutive_days": int | None,
    "carry_forward": bool, "gender_restriction": str,   # "" | male | female
    "is_active": bool, "created_at": datetime,
}

hr_leave_balances {
    "_id": ObjectId, "user_id": ObjectId, "leave_type_id": ObjectId,
    "year": int, "allocated": float, "used": float, "pending": float,
    "carried_forward": float, "updated_at": datetime,
}

hr_leave_requests {
    "_id": ObjectId, "user_id": ObjectId, "leave_type_id": ObjectId,
    "start_date": datetime, "end_date": datetime,      # UTC midnights
    "days": float,                                      # working days, halves allowed
    "is_half_day": bool, "reason": str,
    "status": str,          # pending|manager_approved|approved|rejected|cancelled
    "manager_id": ObjectId | None,
    "manager_action_at": datetime | None, "manager_comment": str,
    "hr_action_by": ObjectId | None,
    "hr_action_at": datetime | None, "hr_comment": str,
    "rejected_by": ObjectId | None, "rejection_reason": str,
    "created_at": datetime, "updated_at": datetime,
}
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

LEAVE_STATUSES = ("pending", "manager_approved", "approved", "rejected", "cancelled")
# Statuses that hold days against a balance — either provisionally or finally.
CONSUMING_STATUSES = ("pending", "manager_approved", "approved")


class LeaveTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    code: str = Field(..., min_length=1, max_length=10)
    days_per_year: float = Field(0, ge=0, le=365)
    is_paid: bool = True
    requires_approval: bool = True
    allow_half_day: bool = True
    max_consecutive_days: Optional[int] = Field(None, ge=1, le=365)
    carry_forward: bool = False
    gender_restriction: str = Field("", description='"" | male | female')

    @field_validator("name", "code", mode="before")
    @classmethod
    def strip_text(cls, v):
        return (v or "").strip()

    @field_validator("code")
    @classmethod
    def upper_code(cls, v: str) -> str:
        return v.upper()


class LeaveRequestCreate(BaseModel):
    leave_type_id: str
    start_date: str = Field(..., description="ISO date")
    end_date: str = Field(..., description="ISO date")
    is_half_day: bool = False
    reason: str = Field("", max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def strip_reason(cls, v):
        return (v or "").strip()


class LeaveDecision(BaseModel):
    """Approve or reject at either stage."""
    approve: bool
    comment: str = Field("", max_length=500)

    @field_validator("comment", mode="before")
    @classmethod
    def strip_comment(cls, v):
        return (v or "").strip()


class LeaveBalanceResponse(BaseModel):
    leave_type_id: str
    leave_type_name: str
    leave_type_code: str
    year: int
    allocated: float
    used: float
    pending: float
    available: float
    is_paid: bool


class LeaveRequestResponse(BaseModel):
    id: str
    user_id: str
    full_name: str = ""
    leave_type_id: str
    leave_type_name: str = ""
    start_date: str
    end_date: str
    days: float
    is_half_day: bool = False
    reason: str = ""
    status: str
    manager_name: str = ""
    manager_comment: str = ""
    hr_comment: str = ""
    rejection_reason: str = ""
    created_at: Optional[str] = None
    # What the CURRENT caller may do with it — computed per request, so the UI
    # never has to re-derive the approval rules and get them subtly wrong.
    can_approve_manager: bool = False
    can_approve_hr: bool = False
    can_cancel: bool = False
