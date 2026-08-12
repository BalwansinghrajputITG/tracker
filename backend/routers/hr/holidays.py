"""
Holidays and the unified calendar (hr.md §14).

The calendar endpoint merges holidays, approved leave and weekends into one
response because that is how a month is actually read — asking the client to
fetch three lists and reconcile them is how "is the 15th a working day" gets
answered differently in two places.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from database import get_db
from middleware.auth import get_current_user
from middleware.permissions import has_permission, require_permission
from models.hr.holiday import HolidayCreate
from routers.hr.common import aware, iso, name_map, oid, parse_date, user_map, utcnow
from routers.hr.dates import company_now, date_range, day_key, is_weekend
from services.audit_service import audit

router = APIRouter()

WEEKDAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def _serialize(holiday: dict, *, departments: dict) -> dict:
    day = aware(holiday["date"])
    return {
        "id":            str(holiday["_id"]),
        "name":          holiday.get("name", ""),
        "date":          iso(day),
        "holiday_type":  holiday.get("holiday_type", "company"),
        "department_id": str(holiday["department_id"]) if holiday.get("department_id") else None,
        "department_name": departments.get(str(holiday.get("department_id")), ""),
        "region":        holiday.get("region", ""),
        "is_optional":   holiday.get("is_optional", False),
        "description":   holiday.get("description", ""),
        "weekday":       WEEKDAY_NAMES[day.weekday()] if day else "",
    }


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_holidays(
    year: int | None = Query(None),
    department_id: str | None = Query(None),
    current_user=Depends(require_permission("holiday.read")),
    db=Depends(get_db),
):
    year = year or company_now().year
    query: dict = {"date": {"$gte": day_key(datetime(year, 1, 1)),
                            "$lte": day_key(datetime(year, 12, 31))}}
    if department_id:
        query["$or"] = [
            {"holiday_type": {"$in": ["company", "public", "regional"]}},
            {"department_id": oid(department_id, "department_id")},
        ]

    holidays = await db.hr_holidays.find(query).sort("date", 1).to_list(None)
    departments = await name_map(db, "departments", {h.get("department_id") for h in holidays}, "name")
    return {
        "holidays": [_serialize(h, departments=departments) for h in holidays],
        "total": len(holidays), "year": year,
    }


# ── Calendar (§14) ────────────────────────────────────────────────────────────

@router.get("/calendar")
async def holiday_calendar(
    month: str | None = Query(None, description="YYYY-MM; defaults to the current month"),
    user_id: str | None = Query(None, description="Whose leave to overlay; defaults to the caller"),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """A month of days, each labelled working / weekend / holiday / leave."""
    ref = company_now() if not month else datetime.strptime(month + "-01", "%Y-%m-%d")
    start = day_key(datetime(ref.year, ref.month, 1))
    end = day_key(datetime(ref.year + (ref.month == 12), (ref.month % 12) + 1, 1)) - timedelta(days=1)

    target = oid(user_id, "user_id") if user_id else current_user["_id"]
    if target != current_user["_id"] and not has_permission(current_user, "leave.read_all"):
        raise HTTPException(status_code=403, detail="You cannot view this employee's calendar.")

    employee = await db.hr_employees.find_one({"user_id": target}, {"department_id": 1})
    department_id = (employee or {}).get("department_id")

    holidays = await db.hr_holidays.find({
        "date": {"$gte": start, "$lte": end},
        "$or": [
            {"holiday_type": {"$in": ["company", "public"]}},
            {"holiday_type": "department", "department_id": department_id},
            {"holiday_type": "regional"},
        ],
    }).to_list(None)
    holiday_by_day = {aware(h["date"]): h for h in holidays}

    leaves = await db.hr_leave_requests.find({
        "user_id": target, "status": "approved",
        "start_date": {"$lte": end}, "end_date": {"$gte": start},
    }).to_list(None)
    leave_days: dict[datetime, dict] = {}
    for leave in leaves:
        for day in date_range(max(aware(leave["start_date"]), start), min(aware(leave["end_date"]), end)):
            leave_days[day] = leave

    attendance = {
        aware(a["date"]): a
        async for a in db.hr_attendance.find({"user_id": target, "date": {"$gte": start, "$lte": end}})
    }

    days = []
    for day in date_range(start, end):
        holiday = holiday_by_day.get(day)
        leave = leave_days.get(day)
        record = attendance.get(day)
        # Precedence: an explicit holiday outranks leave, which outranks the
        # weekend, which outranks whatever attendance says.
        if holiday and not holiday.get("is_optional"):
            kind = "holiday"
        elif leave:
            kind = "leave"
        elif is_weekend(day):
            kind = "weekend"
        else:
            kind = "working"
        days.append({
            "date": iso(day),
            "weekday": WEEKDAY_NAMES[day.weekday()],
            "kind": kind,
            "holiday_name": holiday.get("name") if holiday else None,
            "holiday_optional": holiday.get("is_optional", False) if holiday else False,
            "attendance_status": record.get("status") if record else None,
        })

    return {
        "month": f"{ref.year}-{ref.month:02d}",
        "user_id": str(target),
        "days": days,
        "summary": {
            "working": sum(1 for d in days if d["kind"] == "working"),
            "weekend": sum(1 for d in days if d["kind"] == "weekend"),
            "holiday": sum(1 for d in days if d["kind"] == "holiday"),
            "leave": sum(1 for d in days if d["kind"] == "leave"),
        },
    }


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_holiday(
    body: HolidayCreate,
    request: Request,
    current_user=Depends(require_permission("holiday.manage")),
    db=Depends(get_db),
):
    day = day_key(parse_date(body.date, "date"))

    if body.holiday_type == "department" and not body.department_id:
        raise HTTPException(status_code=400, detail="A department holiday needs a department_id.")
    if body.holiday_type == "regional" and not body.region:
        raise HTTPException(status_code=400, detail="A regional holiday needs a region.")

    dept = oid(body.department_id, "department_id") if body.department_id else None
    if await db.hr_holidays.find_one({"date": day, "name": body.name, "department_id": dept}):
        raise HTTPException(status_code=400, detail="That holiday already exists on that date.")

    now = utcnow()
    result = await db.hr_holidays.insert_one({
        "name": body.name, "date": day, "holiday_type": body.holiday_type,
        "department_id": dept, "region": body.region, "is_optional": body.is_optional,
        "description": body.description, "year": day.year,
        "created_by": current_user["_id"], "created_at": now,
    })
    await audit(db, "holiday.created", current_user, "holiday", str(result.inserted_id),
                after={"name": body.name, "date": iso(day), "type": body.holiday_type},
                request=request)
    return {"holiday_id": str(result.inserted_id), "date": iso(day), "message": "Holiday added."}


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{holiday_id}")
async def delete_holiday(
    holiday_id: str,
    request: Request,
    current_user=Depends(require_permission("holiday.manage")),
    db=Depends(get_db),
):
    hol_oid = oid(holiday_id, "holiday_id")
    holiday = await db.hr_holidays.find_one({"_id": hol_oid})
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")

    await db.hr_holidays.delete_one({"_id": hol_oid})
    await audit(db, "holiday.deleted", current_user, "holiday", holiday_id,
                before={"name": holiday.get("name"), "date": iso(holiday.get("date"))},
                request=request)
    return {"message": "Holiday removed."}
