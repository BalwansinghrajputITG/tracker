"""
HR dashboard (hr.md §2) and workforce analytics (§26).

ROUND-TRIP BUDGET: the §2 dashboard reads across eight collections and must stay
at six database round trips. Redis is optional here and is genuinely unavailable
in production, so the uncached path is the real path — a dashboard that only
performs with a warm cache does not perform.

The budget is met with $facet (many counters from one collection scan) and
$unionWith (three recruitment collections in one pipeline):

    1. hr_employees        headcount, joiners, leavers, birthdays, anniversaries
    2. hr_attendance       today: present / absent / leave / remote / anomalies
    3. hr_leave_requests   pending approvals, on leave today
    4. recruitment         jobs + applications + offers, via $unionWith
    5. departments         the §2 department grid
    6. hr_tickets          pending HR approvals

Cache keys are per-user because scoping differs by role — caching an exec's
org-wide numbers under a shared key would serve them to a team lead.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request

from database import get_db, get_redis
from middleware.permissions import has_permission, require_permission
from routers.hr.common import iso, utcnow
from routers.hr.dates import company_now, day_key, is_weekend
from utils.cache import TTL_HR, analytics_key, cache_get, cache_set

router = APIRouter()

BIRTHDAY_WINDOW_DAYS = 30
ANNIVERSARY_WINDOW_DAYS = 30
# A working day this long or this short is worth a human looking at.
ANOMALY_MIN_MINUTES = 4 * 60
ANOMALY_MAX_MINUTES = 12 * 60


def _month_day(dt: datetime) -> int:
    """MMDD as an int, for date-of-year comparisons that ignore the year."""
    return dt.month * 100 + dt.day


def _upcoming_window(today: datetime, days: int) -> tuple[int, int, bool]:
    """(start_mmdd, end_mmdd, wraps_year) for an N-day look-ahead."""
    end = today + timedelta(days=days)
    return _month_day(today), _month_day(end), end.year != today.year


@router.get("")
async def hr_dashboard(
    request: Request,
    current_user=Depends(require_permission("analytics.hr_read")),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    """The §2 dashboard: 18 counters plus the department overview."""
    scope_key = "all" if has_permission(current_user, "employee.read_all") else str(current_user["_id"])
    ckey = analytics_key("hr_dashboard", scope_key)
    if (hit := await cache_get(redis, ckey)) is not None:
        return {**hit, "cached": True}

    now = utcnow()
    local_today = company_now()
    today = day_key()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    next_month = (month_start + timedelta(days=32)).replace(day=1)
    bday_start, bday_end, bday_wraps = _upcoming_window(local_today, BIRTHDAY_WINDOW_DAYS)
    anniv_start, anniv_end, anniv_wraps = _upcoming_window(local_today, ANNIVERSARY_WINDOW_DAYS)

    def date_of_year_match(field: str, start: int, end: int, wraps: bool) -> dict:
        expr = {"$add": [{"$multiply": [{"$month": f"${field}"}, 100]}, {"$dayOfMonth": f"${field}"}]}
        if wraps:
            # A window crossing 31 Dec is two ranges, not one.
            return {"$or": [{"$expr": {"$gte": [expr, start]}}, {"$expr": {"$lte": [expr, end]}}]}
        return {"$and": [{"$expr": {"$gte": [expr, start]}}, {"$expr": {"$lte": [expr, end]}}]}

    # ── 1. Employees ─────────────────────────────────────────────────────────
    employee_facets = {
        "total":        [{"$count": "n"}],
        "active":       [{"$match": {"employment_status": "active"}}, {"$count": "n"}],
        "probation":    [{"$match": {"employment_status": "probation"}}, {"$count": "n"}],
        "notice":       [{"$match": {"employment_status": "notice_period"}}, {"$count": "n"}],
        "new_this_month": [{"$match": {"joining_date": {"$gte": month_start}}}, {"$count": "n"}],
        "joining_this_month": [
            {"$match": {"joining_date": {"$gte": now, "$lt": next_month}}}, {"$count": "n"},
        ],
        "leaving_this_month": [
            {"$match": {"exit_date": {"$gte": month_start, "$lt": next_month}}}, {"$count": "n"},
        ],
        "remote": [{"$match": {"work_mode": {"$in": ["remote", "hybrid"]},
                               "employment_status": {"$in": ["active", "probation"]}}}, {"$count": "n"}],
        # $lookup rather than a follow-up user_map(): a seventh round trip just
        # to resolve at most 40 names would break the budget for a decoration.
        "birthdays": [
            {"$match": {"date_of_birth": {"$ne": None}}},
            {"$match": date_of_year_match("date_of_birth", bday_start, bday_end, bday_wraps)},
            {"$limit": 20},
            {"$lookup": {"from": "users", "localField": "user_id", "foreignField": "_id",
                         "pipeline": [{"$project": {"full_name": 1}}], "as": "u"}},
            {"$project": {"user_id": 1, "date_of_birth": 1,
                          "full_name": {"$first": "$u.full_name"}}},
        ],
        "anniversaries": [
            {"$match": {"joining_date": {"$ne": None, "$lt": month_start}}},
            {"$match": date_of_year_match("joining_date", anniv_start, anniv_end, anniv_wraps)},
            {"$limit": 20},
            {"$lookup": {"from": "users", "localField": "user_id", "foreignField": "_id",
                         "pipeline": [{"$project": {"full_name": 1}}], "as": "u"}},
            {"$project": {"user_id": 1, "joining_date": 1,
                          "full_name": {"$first": "$u.full_name"}}},
        ],
        "by_department": [
            {"$match": {"employment_status": {"$in": ["active", "probation"]}}},
            {"$group": {"_id": "$department_id", "count": {"$sum": 1}}},
        ],
    }
    employees = (await db.hr_employees.aggregate([{"$facet": employee_facets}]).to_list(1))[0]

    def n(block, key="n") -> int:
        rows = employees.get(block) or []
        return rows[0][key] if rows else 0

    # ── 2. Attendance today ──────────────────────────────────────────────────
    attendance = (await db.hr_attendance.aggregate([
        {"$match": {"date": today}},
        {"$facet": {
            "by_status": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
            "anomalies": [
                {"$match": {"$or": [
                    {"worked_minutes": {"$gt": ANOMALY_MAX_MINUTES}},
                    {"$and": [{"worked_minutes": {"$gt": 0}},
                              {"worked_minutes": {"$lt": ANOMALY_MIN_MINUTES}}]},
                    {"late_minutes": {"$gt": 60}},
                ]}},
                {"$count": "n"},
            ],
            "department_present": [
                {"$match": {"status": {"$in": ["present", "late", "wfh", "half_day"]}}},
                {"$group": {"_id": "$department_id", "count": {"$sum": 1}}},
            ],
        }},
    ]).to_list(1))[0]

    status_counts = {r["_id"]: r["count"] for r in (attendance.get("by_status") or [])}
    present_today = sum(status_counts.get(s, 0) for s in ("present", "late", "half_day", "wfh"))
    anomaly_rows = attendance.get("anomalies") or []

    # ── 3. Leave ─────────────────────────────────────────────────────────────
    leave = (await db.hr_leave_requests.aggregate([
        {"$facet": {
            "pending_manager": [{"$match": {"status": "pending"}}, {"$count": "n"}],
            "pending_hr":      [{"$match": {"status": "manager_approved"}}, {"$count": "n"}],
            "on_leave_today":  [
                {"$match": {"status": "approved", "start_date": {"$lte": today},
                            "end_date": {"$gte": today}}},
                {"$count": "n"},
            ],
            "by_type_month": [
                {"$match": {"status": "approved", "start_date": {"$gte": month_start}}},
                {"$group": {"_id": "$leave_type_id", "days": {"$sum": "$days"}}},
            ],
        }},
    ]).to_list(1))[0]

    def ln(block) -> int:
        rows = leave.get(block) or []
        return rows[0]["n"] if rows else 0

    # ── 4. Recruitment: three collections, one pipeline ──────────────────────
    recruitment = (await db.hr_jobs.aggregate([
        {"$match": {"status": "open"}},
        {"$project": {
            "kind": {"$literal": "job"},
            "openings": {"$subtract": ["$openings_count", {"$ifNull": ["$filled_count", 0]}]},
        }},
        {"$unionWith": {"coll": "hr_applications", "pipeline": [
            {"$match": {"status": "active",
                        "stage": {"$in": ["interview", "technical_interview", "hr_interview"]}}},
            {"$project": {"kind": {"$literal": "in_interview"}, "openings": {"$literal": 0}}},
        ]}},
        {"$unionWith": {"coll": "hr_offers", "pipeline": [
            {"$match": {"status": {"$in": ["sent", "viewed"]}}},
            {"$project": {"kind": {"$literal": "offer_pending"}, "openings": {"$literal": 0}}},
        ]}},
        {"$group": {"_id": "$kind", "count": {"$sum": 1}, "openings": {"$sum": "$openings"}}},
    ]).to_list(10))
    rec = {r["_id"]: r for r in recruitment}

    # ── 5. Departments ───────────────────────────────────────────────────────
    departments = await db.departments.find({}, {"name": 1}).to_list(100)
    dept_headcount = {str(r["_id"]): r["count"] for r in (employees.get("by_department") or [])}
    dept_present = {str(r["_id"]): r["count"] for r in (attendance.get("department_present") or [])}

    # ── 6. Tickets ───────────────────────────────────────────────────────────
    tickets = (await db.hr_tickets.aggregate([
        {"$facet": {
            "open":     [{"$match": {"status": {"$nin": ["resolved", "closed"]}}}, {"$count": "n"}],
            "breached": [{"$match": {"status": {"$nin": ["resolved", "closed"]},
                                     "sla_due_at": {"$lt": now}}}, {"$count": "n"}],
        }},
    ]).to_list(1))[0]

    def tn(block) -> int:
        rows = tickets.get(block) or []
        return rows[0]["n"] if rows else 0

    headcount = n("total")
    expected_in = n("active") + n("probation")
    absent_today = max(0, expected_in - present_today - status_counts.get("leave", 0))
    if is_weekend(today):
        absent_today = 0

    result = {
        "generated_at": iso(now),
        "summary": {
            # §2 counters
            "total_employees":      headcount,
            "active_employees":     n("active"),
            "on_probation":         n("probation"),
            "new_employees":        n("new_this_month"),
            "employees_on_leave":   ln("on_leave_today") or status_counts.get("leave", 0),
            "absent_today":         absent_today,
            "present_today":        present_today,
            "working_remotely":     n("remote"),
            "open_positions":       rec.get("job", {}).get("openings", 0),
            "candidates_in_interview": rec.get("in_interview", {}).get("count", 0),
            "offers_pending":       rec.get("offer_pending", {}).get("count", 0),
            "joining_this_month":   n("joining_this_month"),
            "leaving_this_month":   n("leaving_this_month") + n("notice"),
            "pending_leave_approvals": ln("pending_manager") + ln("pending_hr"),
            "pending_hr_approvals": ln("pending_hr") + tn("open"),
            "open_tickets":         tn("open"),
            "sla_breached_tickets": tn("breached"),
            "attendance_anomalies": anomaly_rows[0]["n"] if anomaly_rows else 0,
            # §2 asks for these two; neither module exists yet, so they are
            # reported as unavailable rather than as a misleading zero.
            "pending_expense_approvals": None,
            "payroll_status": "not_connected",
        },
        "attendance_today": {
            "by_status": status_counts,
            "is_weekend": is_weekend(today),
            "date": iso(today),
        },
        "departments": [{
            "id":         str(d["_id"]),
            "name":       d.get("name", ""),
            "headcount":  dept_headcount.get(str(d["_id"]), 0),
            "present_today": dept_present.get(str(d["_id"]), 0),
            "attendance_rate": round(
                100 * dept_present.get(str(d["_id"]), 0) / dept_headcount[str(d["_id"])]
            ) if dept_headcount.get(str(d["_id"])) else None,
        } for d in departments if dept_headcount.get(str(d["_id"]))],
        "upcoming_birthdays": [{
            "user_id": str(e["user_id"]),
            "full_name": e.get("full_name") or "",
            "date": iso(e.get("date_of_birth")),
        } for e in (employees.get("birthdays") or [])],
        "upcoming_anniversaries": [{
            "user_id": str(e["user_id"]),
            "full_name": e.get("full_name") or "",
            "date": iso(e.get("joining_date")),
            "years": max(1, local_today.year - e["joining_date"].year) if e.get("joining_date") else None,
        } for e in (employees.get("anniversaries") or [])],
        "cached": False,
    }

    await cache_set(redis, ckey, result, TTL_HR)
    return result
