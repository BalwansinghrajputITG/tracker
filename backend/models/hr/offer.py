"""
Offer models — `hr_offers` (hr.md §9).

State machine, strictly enforced server-side:

    draft ──send──> sent ──view──> viewed ──accept──> accepted
      │              │               │
      └──────────────┴───────────────┴──reject──> rejected
                     └───────────────────────────> expired  (by date)

Accepting is the single most consequential action in the MVP: it creates a login,
an employee record, a compensation record and an onboarding checklist, all in one
transaction. Every other status change is metadata; this one mints a person.

Salary fields are gated on salary.read exactly like hr_compensation — an offer
is a compensation record that has not been accepted yet, and gating one but not
the other would leave the obvious back door open.

Collection shape:
{
    "_id": ObjectId, "application_id": ObjectId, "candidate_id": ObjectId,
    "job_id": ObjectId,
    "designation_id": ObjectId|None, "department_id": ObjectId|None,
    "joining_date": datetime,
    "base_salary": float, "ctc": float, "variable_pay": float, "bonus": float,
    "currency": str, "pay_frequency": str,
    "benefits": str, "probation_months": int, "notice_period_days": int,
    "status": str, "expires_at": datetime,
    "sent_at": datetime|None, "viewed_at": datetime|None,
    "decided_at": datetime|None, "decline_reason": str,
    "approved_by": ObjectId|None,
    "document_id": ObjectId|None,        # the offer letter PDF in hr_documents
    "converted_user_id": ObjectId|None,  # set on acceptance
    "created_by": ObjectId, "created_at": datetime, "updated_at": datetime,
}
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

OFFER_STATUSES = ("draft", "sent", "viewed", "accepted", "rejected", "expired", "withdrawn")

# Which statuses may transition to which. Encoded here rather than as scattered
# if-statements so an illegal move is impossible to introduce by accident.
OFFER_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "draft":    ("sent", "withdrawn"),
    "sent":     ("viewed", "accepted", "rejected", "expired", "withdrawn"),
    "viewed":   ("accepted", "rejected", "expired", "withdrawn"),
    "accepted": (),          # terminal — an accepted offer has created a person
    "rejected": (),
    "expired":  (),
    "withdrawn": (),
}


class OfferCreate(BaseModel):
    application_id: str
    designation_id: Optional[str] = None
    department_id: Optional[str] = None
    joining_date: str = Field(..., description="ISO date")
    base_salary: float = Field(..., ge=0)
    ctc: float = Field(0, ge=0)
    variable_pay: float = Field(0, ge=0)
    bonus: float = Field(0, ge=0)
    currency: str = Field("INR", max_length=3)
    pay_frequency: str = Field("monthly")
    benefits: str = Field("", max_length=2000)
    probation_months: int = Field(6, ge=0, le=24)
    notice_period_days: int = Field(60, ge=0, le=365)
    expires_at: str = Field(..., description="ISO date — the offer lapses after this")

    @field_validator("benefits", mode="before")
    @classmethod
    def strip_text(cls, v):
        return (v or "").strip()

    @field_validator("currency", mode="before")
    @classmethod
    def upper_currency(cls, v):
        return (v or "INR").strip().upper()

    @field_validator("designation_id", "department_id", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        return v if v else None


class OfferUpdate(BaseModel):
    """Only a draft may be edited — a sent offer is a communicated commitment."""
    joining_date: Optional[str] = None
    base_salary: Optional[float] = Field(None, ge=0)
    ctc: Optional[float] = Field(None, ge=0)
    variable_pay: Optional[float] = Field(None, ge=0)
    bonus: Optional[float] = Field(None, ge=0)
    benefits: Optional[str] = Field(None, max_length=2000)
    probation_months: Optional[int] = Field(None, ge=0, le=24)
    notice_period_days: Optional[int] = Field(None, ge=0, le=365)
    expires_at: Optional[str] = None
    designation_id: Optional[str] = None
    department_id: Optional[str] = None


class OfferDecision(BaseModel):
    """Record the candidate's answer."""
    accept: bool
    reason: str = Field("", max_length=500)
    # Only used on acceptance. Optional so HR can let the system generate one.
    initial_password: Optional[str] = Field(
        None, min_length=6, max_length=72,
        description="Login password for the new employee; generated when omitted",
    )

    @field_validator("reason", mode="before")
    @classmethod
    def strip_reason(cls, v):
        return (v or "").strip()
