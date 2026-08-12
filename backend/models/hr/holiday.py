"""
Holiday models — `hr_holidays` (hr.md §14).

Holidays suppress both attendance and leave: the mark-absent job skips them, and
a leave request spanning one does not spend a day against it. That is why they
live in their own collection rather than as a flag on attendance — the rule has
to be answerable BEFORE any attendance record exists for the day.

Scope narrows in one direction: company-wide < department < region. A department
holiday applies only to that department; a regional one only to matching
locations.

Collection shape:
{
    "_id":           ObjectId,
    "name":          str,
    "date":          datetime,      # UTC midnight of the company-local day
    "holiday_type":  str,           # company | public | department | regional
    "department_id": ObjectId | None,   # required when holiday_type == department
    "region":        str,               # required when holiday_type == regional
    "is_optional":   bool,          # floating/restricted holiday
    "description":   str,
    "year":          int,           # denormalized for the calendar query
    "created_by":    ObjectId,
    "created_at":    datetime,
}
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

HOLIDAY_TYPES = ("company", "public", "department", "regional")


class HolidayCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    date: str = Field(..., description="ISO date")
    holiday_type: str = Field("company")
    department_id: Optional[str] = None
    region: str = Field("", max_length=80)
    is_optional: bool = False
    description: str = Field("", max_length=300)

    @field_validator("name", "region", "description", mode="before")
    @classmethod
    def strip_text(cls, v):
        return (v or "").strip()

    @field_validator("department_id", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        return v if v else None

    @field_validator("holiday_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in HOLIDAY_TYPES:
            raise ValueError(f"holiday_type must be one of: {', '.join(HOLIDAY_TYPES)}")
        return v


class HolidayResponse(BaseModel):
    id: str
    name: str
    date: str
    holiday_type: str
    department_id: Optional[str] = None
    department_name: str = ""
    region: str = ""
    is_optional: bool = False
    description: str = ""
    weekday: str = ""
