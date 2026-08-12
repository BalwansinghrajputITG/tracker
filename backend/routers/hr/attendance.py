"""
Attendance (hr.md §12).

Self check-in/out plus HR/manager marking. Distinct from routers/reports.py's
daily_reports, which is a self-reported narrative — that answers "what did you
do", this answers "were you here".

"Absent today" deliberately reuses the same scoping helper as /reports/missing
rather than reimplementing it, so the HR dashboard count and the reports view can
never disagree.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from database import get_db
from middleware.auth import get_current_user
from middleware.permissions import has_permission, require_permission
from models.hr.attendance import (
    ATTENDANCE_STATUSES, HALF_DAY_MINUTES, LATE_GRACE_MINUTES, OVERTIME_AFTER_MINUTES,
    WORKDAY_MINUTES, WORKDAY_START_HOUR, AttendanceMark, PunchRequest,
)
from routers.hr.common import aware, iso, oid, parse_date, user_map, utcnow
from routers.hr.dates import (
    COMPANY_UTC_OFFSET_MINUTES, company_now, day_key, holiday_days, is_weekend,
)
from services.audit_service import audit
from utils.export import csv_filename, csv_headers, stream_csv
from utils.team_scope import scoped_user_filter, scoped_user_ids

router = APIRouter()


def _serialize(record: dict, *, users: dict) -> dict:
    u = users.get(str(record.get("user_id")), {})
    return {
        "id":               str(record["_id"]),
        "user_id":          str(record["user_id"]),
        "full_name":        u.get("full_name", ""),
        "date":             iso(record.get("date")),
        "status":           record.get("status", "absent"),
        "check_in":         iso(record.get("check_in")),
        "check_out":        iso(record.get("check_out")),
        "worked_minutes":   record.get("worked_minutes", 0),
        "overtime_minutes": record.get("overtime_minutes", 0),
        "late_minutes":     record.get("late_minutes", 0),
        "source":           record.get("source", "self"),
        "notes":            record.get("notes", ""),
    }


def _derive(check_in, check_out, *, base_status: str = "present") -> dict:
    """Compute worked/late/overtime minutes and the resulting status.

    Kept as one function so self check-out and HR marking cannot disagree about
    what "half day" or "late" means.
    """
    result = {"worked_minutes": 0, "late_minutes": 0, "overtime_minutes": 0, "status": base_status}
    ci, co = aware(check_in), aware(check_out)
    if not ci:
        return result

    # Lateness is measured against company-local wall clock, not UTC.
    local_in = ci + timedelta(minutes=COMPANY_UTC_OFFSET_MINUTES)
    start = local_in.replace(hour=WORKDAY_START_HOUR, minute=0, second=0, microsecond=0)
    late = int((local_in - start).total_seconds() // 60)
    result["late_minutes"] = max(0, late - LATE_GRACE_MINUTES)

    if co:
        worked = max(0, int((co - ci).total_seconds() // 60))
        result["worked_minutes"] = worked
        result["overtime_minutes"] = max(0, worked - OVERTIME_AFTER_MINUTES)
        if worked < HALF_DAY_MINUTES:
            result["status"] = "half_day"
        elif result["late_minutes"] > 0:
            result["status"] = "late"
        else:
            result["status"] = base_status
    elif result["late_minutes"] > 0:
        result["status"] = "late"

    return result


async def _department_of(db, user_id) -> object:
    emp = await db.hr_employees.find_one({"user_id": user_id}, {"department_id": 1})
    return emp.get("department_id") if emp else None


# ── Self service ──────────────────────────────────────────────────────────────
# Declared before /{...} paths.

@router.post("/punch-in", status_code=201)
async def punch_in(
    body: PunchRequest,
    request: Request,
    current_user=Depends(require_permission("attendance.mark")),
    db=Depends(get_db),
):
    """Check in for today. Idempotent — a second call returns the existing record."""
    today = day_key()
    now = utcnow()

    existing = await db.hr_attendance.find_one({"user_id": current_user["_id"], "date": today})
    if existing and existing.get("check_in"):
        return {
            "message": "You are already checked in.",
            "check_in": iso(existing["check_in"]),
            "already": True,
        }

    derived = _derive(now, None, base_status="present")
    doc = {
        "user_id":          current_user["_id"],
        "date":             today,
        "status":           derived["status"],
        "check_in":         now,
        "check_out":        None,
        "worked_minutes":   0,
        "overtime_minutes": 0,
        "late_minutes":     derived["late_minutes"],
        "department_id":    await _department_of(db, current_user["_id"]),
        "leave_request_id": None,
        "holiday_id":       None,
        "source":           "self",
        "notes":            body.notes,
        "marked_by":        None,
        "created_at":       now,
        "updated_at":       now,
    }
    # Upsert rather than insert: the mark-absent job may already have created a
    # record for today, and the unique (user_id, date) index would reject a plain
    # insert with a 500 instead of checking someone in.
    await db.hr_attendance.update_one(
        {"user_id": current_user["_id"], "date": today},
        {"$set": doc},
        upsert=True,
    )
    return {
        "message": "Checked in.",
        "check_in": iso(now),
        "late_minutes": derived["late_minutes"],
        "status": derived["status"],
    }


@router.post("/punch-out")
async def punch_out(
    body: PunchRequest,
    current_user=Depends(require_permission("attendance.mark")),
    db=Depends(get_db),
):
    """Check out for today."""
    today = day_key()
    record = await db.hr_attendance.find_one({"user_id": current_user["_id"], "date": today})
    if not record or not record.get("check_in"):
        raise HTTPException(status_code=400, detail="You have not checked in today.")
    if record.get("check_out"):
        return {"message": "You are already checked out.", "check_out": iso(record["check_out"]), "already": True}

    now = utcnow()
    derived = _derive(record["check_in"], now)
    await db.hr_attendance.update_one(
        {"_id": record["_id"]},
        {"$set": {
            "check_out": now,
            "worked_minutes": derived["worked_minutes"],
            "overtime_minutes": derived["overtime_minutes"],
            "status": derived["status"],
            "notes": body.notes or record.get("notes", ""),
            "updated_at": now,
        }},
    )
    return {
        "message": "Checked out.",
        "check_out": iso(now),
        "worked_minutes": derived["worked_minutes"],
        "overtime_minutes": derived["overtime_minutes"],
        "status": derived["status"],
    }


@router.get("/today")
async def my_today(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """The caller's own status for today — drives the check-in widget."""
    today = day_key()
    record = await db.hr_attendance.find_one({"user_id": current_user["_id"], "date": today})
    holidays = await holiday_days(db, today, today, department_id=await _department_of(db, current_user["_id"]))
    return {
        "date": iso(today),
        "is_weekend": is_weekend(today),
        "is_holiday": today in holidays,
        "checked_in": bool(record and record.get("check_in")),
        "checked_out": bool(record and record.get("check_out")),
        "record": _serialize(record, users={}) if record else None,
        "server_local_time": company_now().isoformat(),
    }


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_attendance(
    user_id: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user=Depends(require_permission("attendance.read")),
    db=Depends(get_db),
):
    """Attendance records, scoped to the caller."""
    scope = await scoped_user_filter(db, current_user, user_id)
    if scope is None:
        return {"attendance": [], "total": 0, "page": page, "limit": limit}

    # attendance.read_all bypasses team scoping for HR; without it the ladder
    # from team_scope applies exactly as it does to daily reports.
    if has_permission(current_user, "attendance.read_all") and not user_id:
        scope = {}

    query: dict = dict(scope)
    if date_from or date_to:
        window = {}
        if date_from:
            window["$gte"] = day_key(parse_date(date_from, "date_from"))
        if date_to:
            window["$lte"] = day_key(parse_date(date_to, "date_to"))
        query["date"] = window
    if status:
        query["status"] = status

    skip = (page - 1) * limit
    records = await db.hr_attendance.find(query).sort("date", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.hr_attendance.count_documents(query)
    users = await user_map(db, {r["user_id"] for r in records})

    return {
        "attendance": [_serialize(r, users=users) for r in records],
        "total": total, "page": page, "limit": limit,
    }


# ── Absent today (§2 dashboard counter) ───────────────────────────────────────

@router.get("/absent-today")
async def absent_today(
    current_user=Depends(require_permission("attendance.read")),
    db=Depends(get_db),
):
    """Who has no presence recorded today.

    Reuses utils/team_scope.scoped_user_ids — the same helper behind
    /reports/missing — so the HR dashboard and the reports view cannot report
    different numbers for the same day.
    """
    today = day_key()
    if is_weekend(today):
        return {"date": iso(today), "absent": [], "total": 0, "reason": "weekend"}

    allowed = await scoped_user_ids(db, current_user)
    if has_permission(current_user, "attendance.read_all"):
        allowed = None

    holidays = await holiday_days(db, today, today)
    if today in holidays:
        return {"date": iso(today), "absent": [], "total": 0, "reason": "holiday"}

    emp_query: dict = {"employment_status": {"$in": ["active", "probation"]}}
    if allowed is not None:
        emp_query["user_id"] = {"$in": allowed}
    employees = await db.hr_employees.find(emp_query, {"user_id": 1}).to_list(2000)
    expected = {e["user_id"] for e in employees}

    present = {
        r["user_id"] async for r in db.hr_attendance.find(
            {"date": today, "user_id": {"$in": list(expected)},
             "status": {"$in": ["present", "late", "half_day", "wfh"]}},
            {"user_id": 1},
        )
    }
    on_leave = {
        r["user_id"] async for r in db.hr_attendance.find(
            {"date": today, "user_id": {"$in": list(expected)}, "status": "leave"},
            {"user_id": 1},
        )
    }

    absent_ids = expected - present - on_leave
    users = await user_map(db, absent_ids)
    return {
        "date": iso(today),
        "absent": [
            {"user_id": str(uid), "full_name": users.get(str(uid), {}).get("full_name", "")}
            for uid in absent_ids
        ],
        "total": len(absent_ids),
        "present": len(present),
        "on_leave": len(on_leave),
    }


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary")
async def attendance_summary(
    user_id: str | None = Query(None),
    month: str | None = Query(None, description="YYYY-MM; defaults to the current month"),
    current_user=Depends(require_permission("attendance.read")),
    db=Depends(get_db),
):
    """Per-status day counts for a month (§12 monthly reports)."""
    ref = company_now() if not month else datetime.strptime(month + "-01", "%Y-%m-%d")
    start = day_key(datetime(ref.year, ref.month, 1))
    end = day_key(datetime(ref.year + (ref.month == 12), (ref.month % 12) + 1, 1)) - timedelta(days=1)

    scope = await scoped_user_filter(db, current_user, user_id)
    if scope is None:
        return {"month": f"{ref.year}-{ref.month:02d}", "by_status": {}, "totals": {}}
    if has_permission(current_user, "attendance.read_all") and not user_id:
        scope = {}

    match = {**scope, "date": {"$gte": start, "$lte": end}}
    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": "$status",
            "days": {"$sum": 1},
            "worked_minutes": {"$sum": "$worked_minutes"},
            "overtime_minutes": {"$sum": "$overtime_minutes"},
            "late_minutes": {"$sum": "$late_minutes"},
        }},
    ]
    by_status, totals = {}, {"days": 0, "worked_minutes": 0, "overtime_minutes": 0, "late_minutes": 0}
    async for row in db.hr_attendance.aggregate(pipeline):
        by_status[row["_id"]] = row["days"]
        for key in ("worked_minutes", "overtime_minutes", "late_minutes"):
            totals[key] += row.get(key, 0)
        totals["days"] += row["days"]

    return {
        "month": f"{ref.year}-{ref.month:02d}",
        "from": iso(start), "to": iso(end),
        "by_status": by_status,
        "totals": totals,
        "attendance_rate": round(
            100 * sum(by_status.get(s, 0) for s in ("present", "late", "half_day", "wfh"))
            / max(1, totals["days"] - by_status.get("holiday", 0)), 1
        ),
    }


# ── CSV export (§12, §39) ─────────────────────────────────────────────────────

@router.get("/export.csv")
async def export_attendance_csv(
    request: Request,
    month: str | None = Query(None, description="YYYY-MM; defaults to the current month"),
    user_id: str | None = Query(None),
    current_user=Depends(require_permission("attendance.read")),
    db=Depends(get_db),
):
    ref = company_now() if not month else datetime.strptime(month + "-01", "%Y-%m-%d")
    start = day_key(datetime(ref.year, ref.month, 1))
    end = day_key(datetime(ref.year + (ref.month == 12), (ref.month % 12) + 1, 1)) - timedelta(days=1)

    scope = await scoped_user_filter(db, current_user, user_id)
    if scope is None:
        raise HTTPException(status_code=403, detail="That employee is outside your scope.")
    if has_permission(current_user, "attendance.read_all") and not user_id:
        scope = {}

    records = await db.hr_attendance.find(
        {**scope, "date": {"$gte": start, "$lte": end}}
    ).sort([("date", 1)]).to_list(10000)
    users = await user_map(db, {r["user_id"] for r in records})

    headers = ["Date", "Employee", "Status", "Check In", "Check Out",
               "Worked (h)", "Overtime (h)", "Late (min)", "Source"]

    def local_time(value) -> str:
        dt = aware(value)
        return (dt + timedelta(minutes=COMPANY_UTC_OFFSET_MINUTES)).strftime("%H:%M") if dt else ""

    async def rows():
        for r in records:
            yield [
                aware(r["date"]).strftime("%Y-%m-%d"),
                users.get(str(r["user_id"]), {}).get("full_name", ""),
                r.get("status", ""),
                local_time(r.get("check_in")),
                local_time(r.get("check_out")),
                round(r.get("worked_minutes", 0) / 60, 2),
                round(r.get("overtime_minutes", 0) / 60, 2),
                r.get("late_minutes", 0),
                r.get("source", ""),
            ]

    await audit(
        db, "report.exported", current_user, "attendance_export", None,
        request=request,
        meta={"format": "csv", "month": f"{ref.year}-{ref.month:02d}", "row_count": len(records)},
    )

    filename = csv_filename(f"attendance-{ref.year}-{ref.month:02d}", stamp=False)
    return StreamingResponse(stream_csv(headers, rows()), media_type="text/csv",
                             headers=csv_headers(filename))


# ── Manual marking ────────────────────────────────────────────────────────────

@router.post("/mark", status_code=201)
async def mark_attendance(
    body: AttendanceMark,
    request: Request,
    current_user=Depends(require_permission("attendance.update")),
    db=Depends(get_db),
):
    """HR/manager records attendance on someone's behalf (§12)."""
    target = oid(body.user_id, "user_id")
    day = day_key(parse_date(body.date, "date"))
    now = utcnow()

    check_in = parse_date(body.check_in, "check_in") if body.check_in else None
    check_out = parse_date(body.check_out, "check_out") if body.check_out else None
    derived = _derive(check_in, check_out, base_status=body.status) if check_in else {
        "worked_minutes": 0, "late_minutes": 0, "overtime_minutes": 0, "status": body.status,
    }
    # An explicit status wins over the derived one — that is the point of marking
    # manually (e.g. recording an approved half day regardless of hours logged).
    derived["status"] = body.status

    before = await db.hr_attendance.find_one({"user_id": target, "date": day})

    await db.hr_attendance.update_one(
        {"user_id": target, "date": day},
        {"$set": {
            "status": derived["status"],
            "check_in": check_in,
            "check_out": check_out,
            "worked_minutes": derived["worked_minutes"],
            "overtime_minutes": derived["overtime_minutes"],
            "late_minutes": derived["late_minutes"],
            "department_id": await _department_of(db, target),
            "source": "manual",
            "notes": body.notes,
            "marked_by": current_user["_id"],
            "updated_at": now,
        }, "$setOnInsert": {"created_at": now, "leave_request_id": None, "holiday_id": None}},
        upsert=True,
    )

    await audit(
        db, "attendance.marked", current_user, "attendance", None,
        before={"status": before.get("status")} if before else None,
        after={"status": derived["status"], "date": iso(day)},
        request=request, subject_user_id=target,
    )
    return {"message": f"Attendance marked as {derived['status']}.", "date": iso(day)}
