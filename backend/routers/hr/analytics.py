"""
HR analytics (hr.md §26).

Six views: workforce, recruitment, attendance, leave, performance, attrition.
Each is one aggregation using $facet, cached per-user like routers/analytics.py.

Time-to-hire comes straight out of `hr_applications.stage_history` — the array
exists precisely so the funnel is a query rather than a reconstruction from
audit logs.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from database import get_db, get_redis
from middleware.permissions import require_permission
from routers.hr.common import iso, utcnow
from routers.hr.dates import day_key
from utils.cache import TTL_HR, analytics_key, cache_get, cache_set

router = APIRouter()


def _window(days: int) -> datetime:
    return utcnow() - timedelta(days=days)


# ── Workforce (§26) ───────────────────────────────────────────────────────────

@router.get("/workforce")
async def workforce_analytics(
    days: int = Query(180, ge=30, le=730),
    current_user=Depends(require_permission("analytics.hr_read")),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    """Headcount, hiring and department distribution."""
    ckey = analytics_key("hr_workforce", str(current_user["_id"]), days=days)
    if (hit := await cache_get(redis, ckey)) is not None:
        return {**hit, "cached": True}

    since = _window(days)
    data = (await db.hr_employees.aggregate([{"$facet": {
        "headcount": [
            {"$group": {"_id": "$employment_status", "count": {"$sum": 1}}},
        ],
        "hiring_trend": [
            {"$match": {"joining_date": {"$gte": since}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$joining_date"}},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ],
        "exits_trend": [
            {"$match": {"exit_date": {"$gte": since}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$exit_date"}},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ],
        "by_department": [
            {"$match": {"employment_status": {"$in": ["active", "probation"]}}},
            {"$lookup": {"from": "departments", "localField": "department_id",
                         "foreignField": "_id", "as": "dept"}},
            {"$group": {
                "_id": {"$ifNull": [{"$first": "$dept.name"}, "Unassigned"]},
                "count": {"$sum": 1},
            }},
            {"$sort": {"count": -1}},
        ],
        "by_employment_type": [
            {"$match": {"employment_status": {"$in": ["active", "probation"]}}},
            {"$group": {"_id": "$employment_type", "count": {"$sum": 1}}},
        ],
        "by_work_mode": [
            {"$match": {"employment_status": {"$in": ["active", "probation"]}}},
            {"$group": {"_id": "$work_mode", "count": {"$sum": 1}}},
        ],
        "tenure": [
            {"$match": {"employment_status": {"$in": ["active", "probation"]},
                        "joining_date": {"$ne": None}}},
            {"$project": {"months": {"$dateDiff": {
                "startDate": "$joining_date", "endDate": "$$NOW", "unit": "month"}}}},
            {"$bucket": {
                "groupBy": "$months", "boundaries": [0, 6, 12, 24, 60, 1000],
                "default": "unknown", "output": {"count": {"$sum": 1}},
            }},
        ],
    }}]).to_list(1))[0]

    headcount = {r["_id"]: r["count"] for r in data["headcount"]}
    tenure_labels = {0: "0-6m", 6: "6-12m", 12: "1-2y", 24: "2-5y", 60: "5y+"}

    result = {
        "days": days,
        "headcount": headcount,
        "total": sum(headcount.values()),
        "active": headcount.get("active", 0) + headcount.get("probation", 0),
        "hiring_trend": [{"month": r["_id"], "hires": r["count"]} for r in data["hiring_trend"]],
        "exits_trend": [{"month": r["_id"], "exits": r["count"]} for r in data["exits_trend"]],
        "by_department": [{"name": r["_id"], "count": r["count"]} for r in data["by_department"]],
        "by_employment_type": {r["_id"]: r["count"] for r in data["by_employment_type"]},
        "by_work_mode": {r["_id"]: r["count"] for r in data["by_work_mode"]},
        "tenure_distribution": [
            {"band": tenure_labels.get(r["_id"], str(r["_id"])), "count": r["count"]}
            for r in data["tenure"]
        ],
        "cached": False,
    }
    await cache_set(redis, ckey, result, TTL_HR)
    return result


# ── Recruitment (§26) ─────────────────────────────────────────────────────────

@router.get("/recruitment")
async def recruitment_analytics(
    days: int = Query(180, ge=30, le=730),
    current_user=Depends(require_permission("analytics.hr_read")),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    """Funnel, time-to-hire and offer acceptance."""
    ckey = analytics_key("hr_recruitment", str(current_user["_id"]), days=days)
    if (hit := await cache_get(redis, ckey)) is not None:
        return {**hit, "cached": True}

    since = _window(days)
    applications = (await db.hr_applications.aggregate([{"$facet": {
        "funnel": [{"$group": {"_id": "$stage", "count": {"$sum": 1}}}],
        "by_status": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
        # stage_history is why this is one query: first and last entries give
        # the elapsed time without reconstructing anything.
        "time_to_hire": [
            {"$match": {"status": "hired", "applied_at": {"$gte": since}}},
            {"$project": {
                "days": {"$dateDiff": {
                    "startDate": "$applied_at",
                    "endDate": {"$last": "$stage_history.at"},
                    "unit": "day",
                }},
            }},
            {"$group": {"_id": None, "avg": {"$avg": "$days"},
                        "min": {"$min": "$days"}, "max": {"$max": "$days"},
                        "count": {"$sum": 1}}},
        ],
        "applications_trend": [
            {"$match": {"applied_at": {"$gte": since}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$applied_at"}},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ],
    }}]).to_list(1))[0]

    candidates = (await db.hr_candidates.aggregate([
        {"$group": {"_id": "$source", "count": {"$sum": 1}}}, {"$sort": {"count": -1}},
    ]).to_list(20))

    offers = (await db.hr_offers.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]).to_list(20))
    offer_counts = {r["_id"]: r["count"] for r in offers}
    decided = offer_counts.get("accepted", 0) + offer_counts.get("rejected", 0)

    interviews = (await db.hr_interviews.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]).to_list(20))

    tth = applications["time_to_hire"][0] if applications["time_to_hire"] else {}

    result = {
        "days": days,
        "funnel": {r["_id"]: r["count"] for r in applications["funnel"]},
        "by_status": {r["_id"]: r["count"] for r in applications["by_status"]},
        "applications_trend": [{"month": r["_id"], "count": r["count"]}
                               for r in applications["applications_trend"]],
        "by_source": [{"source": r["_id"] or "unknown", "count": r["count"]} for r in candidates],
        "interviews": {r["_id"]: r["count"] for r in interviews},
        "offers": offer_counts,
        "time_to_hire_days": {
            "avg": round(tth.get("avg") or 0, 1) if tth else None,
            "min": tth.get("min"), "max": tth.get("max"), "hires": tth.get("count", 0),
        },
        # None rather than 0 when nothing has been decided — "no offers yet" and
        # "everyone declined" must not render the same.
        "offer_acceptance_rate": (
            round(100 * offer_counts.get("accepted", 0) / decided, 1) if decided else None
        ),
        "cached": False,
    }
    await cache_set(redis, ckey, result, TTL_HR)
    return result


# ── Attendance (§26) ──────────────────────────────────────────────────────────

@router.get("/attendance")
async def attendance_analytics(
    days: int = Query(30, ge=7, le=365),
    current_user=Depends(require_permission("analytics.hr_read")),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    ckey = analytics_key("hr_attendance", str(current_user["_id"]), days=days)
    if (hit := await cache_get(redis, ckey)) is not None:
        return {**hit, "cached": True}

    since = day_key(utcnow() - timedelta(days=days))
    data = (await db.hr_attendance.aggregate([
        {"$match": {"date": {"$gte": since}}},
        {"$facet": {
            "by_status": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
            "daily_trend": [
                {"$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$date"}},
                    "present": {"$sum": {"$cond": [
                        {"$in": ["$status", ["present", "late", "half_day", "wfh"]]}, 1, 0]}},
                    "absent": {"$sum": {"$cond": [{"$eq": ["$status", "absent"]}, 1, 0]}},
                    "leave": {"$sum": {"$cond": [{"$eq": ["$status", "leave"]}, 1, 0]}},
                }},
                {"$sort": {"_id": 1}},
            ],
            "totals": [{"$group": {
                "_id": None,
                "worked_minutes": {"$sum": "$worked_minutes"},
                "overtime_minutes": {"$sum": "$overtime_minutes"},
                "late_minutes": {"$sum": "$late_minutes"},
                "late_days": {"$sum": {"$cond": [{"$gt": ["$late_minutes", 0]}, 1, 0]}},
                "records": {"$sum": 1},
            }}],
            "by_department": [
                {"$group": {
                    "_id": "$department_id",
                    "present": {"$sum": {"$cond": [
                        {"$in": ["$status", ["present", "late", "half_day", "wfh"]]}, 1, 0]}},
                    "total": {"$sum": 1},
                }},
            ],
        }},
    ]).to_list(1))[0]

    totals = data["totals"][0] if data["totals"] else {}
    by_status = {r["_id"]: r["count"] for r in data["by_status"]}
    counted = sum(by_status.get(s, 0) for s in
                  ("present", "late", "half_day", "wfh", "absent"))
    present = sum(by_status.get(s, 0) for s in ("present", "late", "half_day", "wfh"))

    result = {
        "days": days,
        "by_status": by_status,
        "daily_trend": [{"date": r["_id"], **{k: v for k, v in r.items() if k != "_id"}}
                        for r in data["daily_trend"]],
        "attendance_rate": round(100 * present / counted, 1) if counted else None,
        "absenteeism_rate": round(100 * by_status.get("absent", 0) / counted, 1) if counted else None,
        "late_days": totals.get("late_days", 0),
        "overtime_hours": round(totals.get("overtime_minutes", 0) / 60, 1),
        "avg_hours_per_record": round(
            totals.get("worked_minutes", 0) / 60 / totals["records"], 2
        ) if totals.get("records") else None,
        "cached": False,
    }
    await cache_set(redis, ckey, result, TTL_HR)
    return result


# ── Leave (§26) ───────────────────────────────────────────────────────────────

@router.get("/leave")
async def leave_analytics(
    year: int | None = Query(None),
    current_user=Depends(require_permission("analytics.hr_read")),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    year = year or utcnow().year
    ckey = analytics_key("hr_leave", str(current_user["_id"]), year=year)
    if (hit := await cache_get(redis, ckey)) is not None:
        return {**hit, "cached": True}

    balances = (await db.hr_leave_balances.aggregate([
        {"$match": {"year": year}},
        {"$lookup": {"from": "hr_leave_types", "localField": "leave_type_id",
                     "foreignField": "_id", "as": "type"}},
        {"$group": {
            "_id": {"$first": "$type.name"},
            "allocated": {"$sum": "$allocated"},
            "used": {"$sum": "$used"},
            "pending": {"$sum": "$pending"},
        }},
    ]).to_list(50))

    requests = (await db.hr_leave_requests.aggregate([{"$facet": {
        "by_status": [{"$group": {"_id": "$status", "count": {"$sum": 1},
                                  "days": {"$sum": "$days"}}}],
        "monthly": [
            {"$match": {"status": "approved"}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$start_date"}},
                "days": {"$sum": "$days"},
            }},
            {"$sort": {"_id": 1}},
        ],
    }}]).to_list(1))[0]

    total_allocated = sum(b["allocated"] for b in balances)
    total_used = sum(b["used"] for b in balances)

    result = {
        "year": year,
        "by_type": [{
            "leave_type": b["_id"] or "Unknown",
            "allocated": b["allocated"], "used": b["used"], "pending": b["pending"],
            "utilization": round(100 * b["used"] / b["allocated"], 1) if b["allocated"] else 0,
        } for b in balances],
        "overall_utilization": round(100 * total_used / total_allocated, 1) if total_allocated else None,
        "by_status": {r["_id"]: {"count": r["count"], "days": r["days"]}
                      for r in requests["by_status"]},
        "monthly_trend": [{"month": r["_id"], "days": r["days"]} for r in requests["monthly"]],
        "cached": False,
    }
    await cache_set(redis, ckey, result, TTL_HR)
    return result


# ── Performance (§26) ─────────────────────────────────────────────────────────

@router.get("/performance")
async def performance_analytics(
    current_user=Depends(require_permission("analytics.hr_read")),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    ckey = analytics_key("hr_performance", str(current_user["_id"]))
    if (hit := await cache_get(redis, ckey)) is not None:
        return {**hit, "cached": True}

    reviews = (await db.hr_reviews.aggregate([{"$facet": {
        "by_status": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
        "scores": [
            {"$match": {"composite_score": {"$ne": None}}},
            {"$group": {"_id": None, "avg": {"$avg": "$composite_score"},
                        "count": {"$sum": 1}}},
        ],
        "distribution": [
            {"$match": {"composite_score": {"$ne": None}}},
            {"$bucket": {
                "groupBy": "$composite_score", "boundaries": [0, 40, 60, 80, 101],
                "default": "unrated", "output": {"count": {"$sum": 1}},
            }},
        ],
    }}]).to_list(1))[0]

    goals = (await db.personal_targets.aggregate([
        {"$match": {"visibility": "shared"}},
        {"$facet": {
            "totals": [{"$group": {"_id": None, "total": {"$sum": 1},
                                   "completed": {"$sum": {"$cond": ["$completed", 1, 0]}}}}],
        }},
    ]).to_list(1))[0]

    goal_totals = goals["totals"][0] if goals["totals"] else {}
    scores = reviews["scores"][0] if reviews["scores"] else {}
    band_labels = {0: "At risk (<40)", 40: "Needs attention (40-59)",
                   60: "On track (60-79)", 80: "Excellent (80+)"}

    result = {
        "reviews_by_status": {r["_id"]: r["count"] for r in reviews["by_status"]},
        "average_composite": round(scores.get("avg") or 0, 1) if scores else None,
        "reviews_scored": scores.get("count", 0),
        "score_distribution": [
            {"band": band_labels.get(r["_id"], str(r["_id"])), "count": r["count"]}
            for r in reviews["distribution"]
        ],
        "goals": {
            "total": goal_totals.get("total", 0),
            "completed": goal_totals.get("completed", 0),
            "completion_rate": round(
                100 * goal_totals.get("completed", 0) / goal_totals["total"], 1
            ) if goal_totals.get("total") else None,
        },
        "cached": False,
    }
    await cache_set(redis, ckey, result, TTL_HR)
    return result


# ── Attrition (§26) ───────────────────────────────────────────────────────────

@router.get("/attrition")
async def attrition_analytics(
    months: int = Query(12, ge=3, le=60),
    current_user=Depends(require_permission("analytics.hr_read")),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    """Attrition rate, by department and by tenure.

    Rate uses average headcount over the window (starting + ending) / 2, which is
    the standard formula — dividing by current headcount alone understates it
    whenever the company is growing.
    """
    ckey = analytics_key("hr_attrition", str(current_user["_id"]), months=months)
    if (hit := await cache_get(redis, ckey)) is not None:
        return {**hit, "cached": True}

    since = utcnow() - timedelta(days=months * 30)
    data = (await db.hr_employees.aggregate([{"$facet": {
        "exits": [
            {"$match": {"exit_date": {"$gte": since}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$exit_date"}},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ],
        "exits_by_department": [
            {"$match": {"exit_date": {"$gte": since}}},
            {"$lookup": {"from": "departments", "localField": "department_id",
                         "foreignField": "_id", "as": "dept"}},
            {"$group": {"_id": {"$ifNull": [{"$first": "$dept.name"}, "Unassigned"]},
                        "count": {"$sum": 1}}},
        ],
        "exits_by_tenure": [
            {"$match": {"exit_date": {"$gte": since}, "joining_date": {"$ne": None}}},
            {"$project": {"months": {"$dateDiff": {
                "startDate": "$joining_date", "endDate": "$exit_date", "unit": "month"}}}},
            {"$bucket": {"groupBy": "$months", "boundaries": [0, 6, 12, 24, 1000],
                         "default": "unknown", "output": {"count": {"$sum": 1}}}},
        ],
        "exits_by_reason": [
            {"$match": {"exit_date": {"$gte": since}}},
            {"$group": {"_id": "$employment_status", "count": {"$sum": 1}}},
        ],
        "current_active": [
            {"$match": {"employment_status": {"$in": ["active", "probation", "notice_period"]}}},
            {"$count": "n"},
        ],
    }}]).to_list(1))[0]

    total_exits = sum(r["count"] for r in data["exits"])
    current = data["current_active"][0]["n"] if data["current_active"] else 0
    avg_headcount = (current + (current + total_exits)) / 2 if current or total_exits else 0
    tenure_labels = {0: "<6m", 6: "6-12m", 12: "1-2y", 24: "2y+"}

    result = {
        "months": months,
        "total_exits": total_exits,
        "current_headcount": current,
        "attrition_rate": round(100 * total_exits / avg_headcount, 1) if avg_headcount else None,
        "monthly_trend": [{"month": r["_id"], "exits": r["count"]} for r in data["exits"]],
        "by_department": [{"name": r["_id"], "exits": r["count"]}
                          for r in data["exits_by_department"]],
        "by_tenure": [{"band": tenure_labels.get(r["_id"], str(r["_id"])), "exits": r["count"]}
                      for r in data["exits_by_tenure"]],
        # Voluntary vs involuntary needs an exit_reason taxonomy that only
        # arrives with exit management (§24); reported honestly as unavailable.
        "voluntary_vs_involuntary": None,
        "cached": False,
    }
    await cache_set(redis, ckey, result, TTL_HR)
    return result
