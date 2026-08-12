"""
Compensation (hr.md §3 sensitive fields, §20 compensation management).

Append-only history. A revision writes a new record; nothing is ever mutated, so
"what did this person earn on 1 April" stays answerable forever and §20's
old/new/effective_date/reason/approver trail comes from the data itself rather
than from trusting the audit log to be complete.

Every route here is gated on salary.read or salary.update, EXCEPT /me — reading
your own pay needs no permission because identity is the authorization. That is
also why salary.read has no scoped variant: holding it always means "may see
other people's pay".

Every read and every write is audited. For most resources auditing reads would be
noise; for salary it is the point.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from database import get_db
from middleware.auth import get_current_user
from middleware.permissions import require_permission
from models.hr import CompensationCreate
from routers.hr.common import aware, iso, oid, parse_date, user_map, utcnow
from services.audit_service import audit

router = APIRouter()


def _serialize(doc: dict, *, approvers: dict, current_id: str | None) -> dict:
    approver = approvers.get(str(doc.get("approved_by")), {})
    return {
        "id":               str(doc["_id"]),
        "user_id":          str(doc["user_id"]),
        "employee_id":      str(doc["employee_id"]),
        "base_salary":      doc.get("base_salary", 0),
        "ctc":              doc.get("ctc", 0),
        "variable_pay":     doc.get("variable_pay", 0),
        "bonus":            doc.get("bonus", 0),
        "currency":         doc.get("currency", "INR"),
        "pay_frequency":    doc.get("pay_frequency", "monthly"),
        "effective_date":   iso(doc.get("effective_date")),
        "reason":           doc.get("reason", ""),
        "notes":            doc.get("notes", ""),
        "approved_by":      str(doc["approved_by"]) if doc.get("approved_by") else None,
        "approved_by_name": approver.get("full_name", ""),
        "created_at":       iso(doc.get("created_at")),
        "is_current":       str(doc["_id"]) == current_id,
    }


def _current_record(records: list[dict]) -> dict | None:
    """The package in force today: latest effective_date not in the future.

    Falls back to the earliest record when every one is future-dated, which is
    the normal state for a new hire whose start date has not arrived.

    effective_date goes through aware() because Mongo hands back naive datetimes.
    """
    now = utcnow()

    def eff(record: dict) -> datetime:
        return aware(record.get("effective_date")) or now

    effective = [r for r in records if eff(r) <= now]
    if effective:
        return max(effective, key=eff)
    return min(records, key=eff) if records else None


async def _load_employee(db, employee_id: str) -> dict:
    emp = await db.hr_employees.find_one({"_id": oid(employee_id, "employee_id")})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


# ── Own compensation ──────────────────────────────────────────────────────────
# Declared before /{employee_id} so the path param cannot swallow it.

@router.get("/me")
async def get_my_compensation(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Your own compensation history. No permission required."""
    records = await db.hr_compensation.find(
        {"user_id": current_user["_id"]}
    ).sort("effective_date", -1).to_list(100)
    if not records:
        return {"current": None, "history": [], "total": 0}

    approvers = await user_map(db, {r.get("approved_by") for r in records})
    current = _current_record(records)
    current_id = str(current["_id"]) if current else None
    serialized = [_serialize(r, approvers=approvers, current_id=current_id) for r in records]

    return {
        "current": next((s for s in serialized if s["is_current"]), None),
        "history": serialized,
        "total": len(serialized),
    }


# ── Read someone else's ───────────────────────────────────────────────────────

@router.get("/{employee_id}")
async def get_compensation(
    employee_id: str,
    request: Request,
    include_history: bool = Query(True),
    current_user=Depends(require_permission("salary.read")),
    db=Depends(get_db),
):
    """Compensation for an employee. Requires salary.read, and is itself audited."""
    emp = await _load_employee(db, employee_id)

    records = await db.hr_compensation.find(
        {"employee_id": emp["_id"]}
    ).sort("effective_date", -1).to_list(100)

    # Audit the READ. "Who looked at Bob's salary, and when" is the question this
    # log exists to answer; without it, salary.read is unaccountable.
    await audit(
        db, "salary.read", current_user, "compensation", employee_id,
        request=request, subject_user_id=emp["user_id"],
        meta={"record_count": len(records)},
    )

    if not records:
        return {"current": None, "history": [], "total": 0}

    approvers = await user_map(db, {r.get("approved_by") for r in records})
    current = _current_record(records)
    current_id = str(current["_id"]) if current else None
    serialized = [_serialize(r, approvers=approvers, current_id=current_id) for r in records]

    return {
        "current": next((s for s in serialized if s["is_current"]), None),
        "history": serialized if include_history else [],
        "total": len(serialized),
    }


# ── Record a new package ──────────────────────────────────────────────────────

@router.post("/{employee_id}", status_code=201)
async def create_compensation(
    employee_id: str,
    body: CompensationCreate,
    request: Request,
    current_user=Depends(require_permission("salary.update")),
    db=Depends(get_db),
):
    """Append a compensation record (§20). Never mutates prior records."""
    emp = await _load_employee(db, employee_id)

    effective = parse_date(body.effective_date, "effective_date")
    if effective is None:
        raise HTTPException(status_code=400, detail="effective_date is required.")

    existing = await db.hr_compensation.find(
        {"employee_id": emp["_id"]}
    ).sort("effective_date", -1).to_list(100)

    # aware() matters here: a naive value from Mongo would never equal the aware
    # one we just parsed, so the duplicate would slip past unnoticed.
    if any(aware(r.get("effective_date")) == effective for r in existing):
        raise HTTPException(
            status_code=400,
            detail="A compensation record already exists with that effective date.",
        )

    now = datetime.now(timezone.utc)
    doc = {
        "user_id":        emp["user_id"],
        "employee_id":    emp["_id"],
        "base_salary":    body.base_salary,
        "ctc":            body.ctc,
        "variable_pay":   body.variable_pay,
        "bonus":          body.bonus,
        "currency":       body.currency,
        "pay_frequency":  body.pay_frequency,
        "effective_date": effective,
        "reason":         body.reason,
        "notes":          body.notes,
        "approved_by":    oid(body.approved_by, "approved_by") if body.approved_by else current_user["_id"],
        "created_by":     current_user["_id"],
        "created_at":     now,
    }
    result = await db.hr_compensation.insert_one(doc)

    # Diff against the package that was in force, so the audit row carries the
    # actual old→new figures rather than just "a record was added".
    previous = _current_record(existing) if existing else None
    money = ("base_salary", "ctc", "variable_pay", "bonus", "currency", "pay_frequency")
    await audit(
        db,
        "salary.updated" if previous else "salary.created",
        current_user, "compensation", str(result.inserted_id),
        before={k: previous.get(k) for k in money} if previous else None,
        after={k: doc[k] for k in money},
        request=request, subject_user_id=emp["user_id"],
        meta={
            "effective_date": effective.isoformat(),
            "reason": body.reason,
            "approved_by": str(doc["approved_by"]),
            "employee_id": employee_id,
        },
    )

    return {
        "compensation_id": str(result.inserted_id),
        "message": "Compensation record added.",
    }
