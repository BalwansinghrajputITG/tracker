"""
HR helpdesk models — `hr_tickets`, `hr_ticket_messages` (hr.md §22).

Messages are a separate collection rather than an array on the ticket: a long
thread would grow the ticket document unboundedly, every ticket list would then
drag the full conversation over the wire, and concurrent replies would race on
an array push.

SLA is stored as a due date computed at creation from the priority, not as a
duration evaluated on read. A stored deadline can be indexed and queried
("what is breaching today"); a computed one can only be filtered in memory.

Collection shapes:

hr_tickets {
    "_id": ObjectId, "ticket_number": str,     # human-quotable, e.g. "HR-0042"
    "raised_by": ObjectId, "subject_user_id": ObjectId,  # usually the same
    "category": str, "priority": str, "subject": str, "description": str,
    "status": str, "assigned_to": ObjectId|None,
    "sla_due_at": datetime, "first_response_at": datetime|None,
    "resolved_at": datetime|None, "closed_at": datetime|None,
    "resolution": str, "is_confidential": bool,
    "message_count": int, "created_at": datetime, "updated_at": datetime,
}

hr_ticket_messages {
    "_id": ObjectId, "ticket_id": ObjectId, "author_id": ObjectId,
    "body": str, "is_internal": bool,     # internal notes are hidden from the raiser
    "created_at": datetime,
}
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

TICKET_CATEGORIES = (
    "payroll", "attendance", "leave", "documents", "benefits",
    "employee_information", "policy", "it_access", "other",
)
TICKET_STATUSES = ("open", "in_progress", "waiting", "resolved", "closed")
TICKET_PRIORITIES = ("low", "medium", "high", "urgent")

# Hours until the SLA is breached, by priority. Module constants so the policy
# is visible in one place rather than scattered through the router.
SLA_HOURS = {"urgent": 4, "high": 24, "medium": 72, "low": 120}

# Statuses that stop the SLA clock — a resolved ticket cannot breach.
SLA_TERMINAL = ("resolved", "closed")


class TicketCreate(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=5000)
    category: str = Field("other")
    priority: str = Field("medium")
    is_confidential: bool = False

    @field_validator("subject", "description", mode="before")
    @classmethod
    def strip_text(cls, v):
        return (v or "").strip()

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str) -> str:
        if v not in TICKET_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(TICKET_CATEGORIES)}")
        return v

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: str) -> str:
        if v not in TICKET_PRIORITIES:
            raise ValueError(f"priority must be one of: {', '.join(TICKET_PRIORITIES)}")
        return v


class TicketUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    assigned_to: Optional[str] = None
    resolution: Optional[str] = Field(None, max_length=2000)

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v is not None and v not in TICKET_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(TICKET_STATUSES)}")
        return v

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v):
        if v is not None and v not in TICKET_PRIORITIES:
            raise ValueError(f"priority must be one of: {', '.join(TICKET_PRIORITIES)}")
        return v


class TicketReply(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)
    is_internal: bool = Field(False, description="Internal notes are hidden from the raiser")

    @field_validator("body", mode="before")
    @classmethod
    def strip_body(cls, v):
        return (v or "").strip()
