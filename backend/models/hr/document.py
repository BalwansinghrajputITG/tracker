"""
Document models — Pydantic schemas for `hr_documents` (hr.md §23, §38).

Only METADATA lives in Mongo; bytes go to object storage (services/storage.py).
Storing files in the database — or in GridFS, the Mongo-shaped temptation — gives
no expiring URLs, no lifecycle rules, no CDN, and inflates the Atlas tier.

Versioning is by GROUP, not by mutation. Re-uploading a document writes a new
record sharing the previous `doc_group_id`, increments `version`, and flips the
old record's `is_current` to False. Nothing is overwritten, so "what did their
signed contract say in March" stays answerable — which is the entire point of
document versioning in an HR system.

Collection shape (MongoDB document):
{
    "_id":            ObjectId,
    "doc_group_id":   ObjectId,     # stable across versions; == _id of v1
    "version":        int,          # 1-based
    "is_current":     bool,
    "user_id":        ObjectId | None,   # ref users — the subject
    "candidate_id":   ObjectId | None,   # ref hr_candidates (Phase 5); XOR with user_id
    "doc_type":       str,          # resume | offer_letter | contract | id_proof | ...
    "title":          str,
    "description":    str,
    "storage_key":    str,          # opaque key in the storage backend
    "file_name":      str,          # original filename, for the download header
    "mime_type":      str,          # VERIFIED by magic bytes, not the client claim
    "size_bytes":     int,
    "checksum_sha256":str,
    "expires_at":     datetime | None,   # document validity, NOT link expiry
    "reminders_sent": [str],        # e.g. ["30d", "7d"] — makes the job idempotent
    "is_confidential":bool,         # requires document.read_all even for the subject's manager
    "scan_status":    str,          # skipped | clean | infected — see §37 note
    "uploaded_by":    ObjectId,
    "created_at":     datetime,
    "deleted_at":     datetime | None,   # soft delete; the object is removed too
}
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

DOC_TYPES = (
    "resume", "offer_letter", "contract", "nda", "id_proof", "address_proof",
    "tax_document", "bank_document", "certificate", "payslip", "appraisal",
    "experience_letter", "relieving_letter", "other",
)

# Types whose expiry genuinely matters — the reminder job only chases these.
EXPIRING_DOC_TYPES = ("id_proof", "address_proof", "contract", "certificate", "nda")


class DocumentUpdate(BaseModel):
    """Metadata-only edit. Replacing the FILE means uploading a new version."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    doc_type: Optional[str] = None
    expires_at: Optional[str] = None
    is_confidential: Optional[bool] = None

    @field_validator("title", "description", mode="before")
    @classmethod
    def strip_text(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("doc_type")
    @classmethod
    def valid_doc_type(cls, v):
        if v is not None and v not in DOC_TYPES:
            raise ValueError(f"doc_type must be one of: {', '.join(DOC_TYPES)}")
        return v


class DocumentResponse(BaseModel):
    id: str
    doc_group_id: str
    version: int
    is_current: bool
    user_id: Optional[str] = None
    subject_name: str = ""
    doc_type: str
    title: str
    description: str = ""
    file_name: str
    mime_type: str
    size_bytes: int
    expires_at: Optional[str] = None
    expiry_state: str = "none"     # none | valid | expiring_soon | expired
    is_confidential: bool = False
    scan_status: str = "skipped"
    uploaded_by: Optional[str] = None
    uploaded_by_name: str = ""
    created_at: Optional[str] = None
    # Never a raw storage URL — callers must request a short-lived signed link
    # from /hr/documents/{id}/download so every access is checked and audited.
