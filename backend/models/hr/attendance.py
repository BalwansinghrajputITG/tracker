"""
Attendance models — `hr_attendance` (hr.md §12).

TIMEZONE CONTRACT, stated once because it is the single most common source of
off-by-one-day bugs in attendance systems:

    `date` is ALWAYS stored as UTC midnight of the company-local calendar day.

Every write normalizes to that; every query filters on it. The company operates
in one timezone (COMPANY_TIMEZONE_OFFSET_MINUTES), so "2026-08-11" means the same
day for everyone. A genuinely multi-region rollout would need per-employee
timezones on hr_employees — deliberately out of scope, and flagged rather than
silently assumed away.

Distinct from `daily_reports` (routers/reports.py), which is a SELF-REPORTED
narrative of work done. Attendance is a record of presence with check-in/out
times. They corroborate each other; neither replaces the other.

Collection shape (MongoDB document):
{
    "_id":              ObjectId,
    "user_id":          ObjectId,     # ref users
    "date":             datetime,     # UTC midnight of the company-local day
    "status":           str,          # present|absent|half_day|late|wfh|holiday|leave
    "check_in":         datetime | None,
    "check_out":        datetime | None,
    "worked_minutes":   int,
    "overtime_minutes": int,
    "late_minutes":     int,
    "department_id":    ObjectId | None,  # denormalized for department rollups
    "leave_request_id": ObjectId | None,  # set when status == "leave"
    "holiday_id":       ObjectId | None,  # set when status == "holiday"
    "source":           str,          # self | manual | job | keka
    "notes":            str,
    "marked_by":        ObjectId | None,
    "created_at":       datetime,
    "updated_at":       datetime,
}

Unique on (user_id, date): one attendance record per person per day, enforced by
the database rather than by hoping every write path remembers to check.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

ATTENDANCE_STATUSES = ("present", "absent", "half_day", "late", "wfh", "holiday", "leave")
ATTENDANCE_SOURCES = ("self", "manual", "job", "keka")

# Company working-hours policy. Module constants rather than magic numbers so the
# rules are visible in one place and configurable later without hunting.
WORKDAY_MINUTES = 8 * 60
HALF_DAY_MINUTES = 4 * 60
WORKDAY_START_HOUR = 9          # company-local
LATE_GRACE_MINUTES = 15
OVERTIME_AFTER_MINUTES = WORKDAY_MINUTES
# Monday=0 … Sunday=6. Saturday and Sunday are non-working.
WEEKEND_DAYS = (5, 6)


class PunchRequest(BaseModel):
    """Self check-in / check-out."""
    notes: str = Field("", max_length=200)
    work_mode: Optional[str] = Field(None, description="onsite | remote | hybrid")

    @field_validator("notes", mode="before")
    @classmethod
    def strip_notes(cls, v):
        return (v or "").strip()


class AttendanceMark(BaseModel):
    """HR/manager marking attendance on someone's behalf (§12)."""
    user_id: str
    date: str = Field(..., description="ISO date")
    status: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    notes: str = Field("", max_length=200)

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        if v not in ATTENDANCE_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(ATTENDANCE_STATUSES)}")
        return v


class AttendanceResponse(BaseModel):
    id: str
    user_id: str
    full_name: str = ""
    date: str
    status: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    worked_minutes: int = 0
    overtime_minutes: int = 0
    late_minutes: int = 0
    source: str = "self"
    notes: str = ""
