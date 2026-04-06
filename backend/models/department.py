"""
Department models — Pydantic schemas for the `departments` collection.

Collection shape (MongoDB document):
{
    "_id":         ObjectId,
    "name":        str,          # unique, case-insensitive
    "description": str,
    "pm_id":       ObjectId | None,   # ref users (Project Manager)
    "tl_id":       ObjectId | None,   # ref users (Team Lead)
    "created_by":  ObjectId,          # ref users
    "created_at":  datetime,
    "updated_at":  datetime,
}
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ── Request bodies ─────────────────────────────────────────────────────────────

class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field("", max_length=500)
    pm_id: Optional[str] = Field(None, description="ObjectId of the assigned Project Manager")
    tl_id: Optional[str] = Field(None, description="ObjectId of the assigned Team Lead")

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("description", mode="before")
    @classmethod
    def strip_description(cls, v: str) -> str:
        return (v or "").strip()

    @field_validator("pm_id", "tl_id", mode="before")
    @classmethod
    def empty_to_none(cls, v: Optional[str]) -> Optional[str]:
        return v if v else None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    pm_id: Optional[str] = Field(None, description="Pass empty string to clear")
    tl_id: Optional[str] = Field(None, description="Pass empty string to clear")

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v is not None else v

    @field_validator("description", mode="before")
    @classmethod
    def strip_description(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v is not None else v


class MemberIds(BaseModel):
    """Used by add-members and replace-members endpoints."""
    user_ids: list[str] = Field(..., min_length=1)


# ── Response bodies ────────────────────────────────────────────────────────────

class DepartmentMemberResponse(BaseModel):
    id: str
    full_name: str
    email: str
    primary_role: str
    department: str


class DepartmentResponse(BaseModel):
    id: str
    name: str
    description: str
    user_count: int
    created_at: str
    pm_id: Optional[str] = None
    pm_name: Optional[str] = None
    tl_id: Optional[str] = None
    tl_name: Optional[str] = None


class DepartmentDetailResponse(DepartmentResponse):
    members: list[DepartmentMemberResponse] = []
