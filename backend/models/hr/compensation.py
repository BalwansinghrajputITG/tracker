"""
Compensation models — Pydantic schemas for `hr_compensation` (hr.md §3, §20).

APPEND-ONLY, 1:N per employee. A salary change writes a NEW record with its own
effective_date; it never mutates the previous one. That is what makes §20's
"every compensation change has old value, new value, effective date, reason,
approver, audit log" answerable by reading the collection rather than by trusting
the audit log to be complete.

The current package is the record with the latest effective_date <= today.

This is a SEPARATE COLLECTION from hr_employees on purpose. routers/users.py
serialize() is a deny-list over the whole document, and any employee serializer
could acquire the same flaw. Keeping pay in its own collection means an
accidental find_one() on an employee cannot leak it — the protection is
structural rather than a projection someone has to remember to write.

Collection shape (MongoDB document):
{
    "_id":            ObjectId,
    "user_id":        ObjectId,     # ref users
    "employee_id":    ObjectId,     # ref hr_employees
    "base_salary":    float,
    "ctc":            float,        # annual cost to company
    "variable_pay":   float,
    "bonus":          float,
    "currency":       str,
    "pay_frequency":  str,          # monthly | annual | hourly
    "effective_date": datetime,
    "reason":         str,          # hire | revision | promotion | correction | adjustment
    "notes":          str,
    "approved_by":    ObjectId,     # ref users — who authorized it
    "created_by":     ObjectId,
    "created_at":     datetime,
}
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

PAY_FREQUENCIES = ("monthly", "annual", "hourly")
COMPENSATION_REASONS = ("hire", "revision", "promotion", "correction", "adjustment")


# ── Request bodies ─────────────────────────────────────────────────────────────

class CompensationCreate(BaseModel):
    """Record a new compensation package. There is deliberately no update model —
    corrections are themselves new records with reason='correction'."""
    base_salary: float = Field(..., ge=0)
    ctc: float = Field(0, ge=0)
    variable_pay: float = Field(0, ge=0)
    bonus: float = Field(0, ge=0)
    currency: str = Field("INR", max_length=3)
    pay_frequency: str = Field("monthly")
    effective_date: str = Field(..., description="ISO date")
    reason: str = Field("revision")
    notes: str = Field("", max_length=500)
    approved_by: Optional[str] = Field(None, description="Defaults to the caller")

    @field_validator("currency", mode="before")
    @classmethod
    def upper_currency(cls, v):
        return (v or "INR").strip().upper()

    @field_validator("notes", mode="before")
    @classmethod
    def strip_notes(cls, v):
        return (v or "").strip()

    @field_validator("approved_by", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        return v if v else None

    @field_validator("pay_frequency")
    @classmethod
    def valid_frequency(cls, v: str) -> str:
        if v not in PAY_FREQUENCIES:
            raise ValueError(f"pay_frequency must be one of: {', '.join(PAY_FREQUENCIES)}")
        return v

    @field_validator("reason")
    @classmethod
    def valid_reason(cls, v: str) -> str:
        if v not in COMPENSATION_REASONS:
            raise ValueError(f"reason must be one of: {', '.join(COMPENSATION_REASONS)}")
        return v


# ── Response bodies ────────────────────────────────────────────────────────────

class CompensationResponse(BaseModel):
    id: str
    user_id: str
    employee_id: str
    base_salary: float
    ctc: float
    variable_pay: float
    bonus: float
    currency: str
    pay_frequency: str
    effective_date: str
    reason: str
    notes: str = ""
    approved_by: Optional[str] = None
    approved_by_name: str = ""
    created_at: Optional[str] = None
    is_current: bool = False
