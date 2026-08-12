"""
Leave management (hr.md §13).

    Employee → Leave Request → Manager Approval → HR Approval → Balance Updated

THE CRITICAL INVARIANT: the balance and the request status change together or
not at all. Both final approval and rejection run inside a MongoDB transaction
(verified available — Atlas is a replica set). Without one, two approvers
clicking simultaneously, or a double-clicked button, decrements the balance twice
while the request moves to approved once, and the error is invisible until
someone audits leave days months later.

Days are held in `pending` from submission and moved to `used` at final approval,
so two overlapping requests cannot both be approved against the same remaining
days.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from database import get_db, mongodb
from middleware.auth import get_current_user
from middleware.permissions import has_permission, require_permission
from models.hr.leave import (
    CONSUMING_STATUSES, LeaveDecision, LeaveRequestCreate, LeaveTypeCreate,
)
from routers.hr.common import aware, iso, oid, parse_date, user_map, utcnow
from routers.hr.dates import date_range, day_key, holiday_days, working_days_between
from services.audit_service import audit
from services.notification_service import notify_users
from utils.team_scope import scoped_user_filter, scoped_user_ids

router = APIRouter()


def _year_of(day: datetime) -> int:
    return day.year


async def _leave_type_map(db, ids=None) -> dict:
    query = {"_id": {"$in": [oid(i) for i in ids]}} if ids else {}
    return {str(t["_id"]): t async for t in db.hr_leave_types.find(query)}


def _serialize_request(req: dict, *, users: dict, types: dict, viewer: dict) -> dict:
    lt = types.get(str(req.get("leave_type_id")), {})
    u = users.get(str(req.get("user_id")), {})
    status = req.get("status", "pending")
    viewer_id = str(viewer["_id"])

    # Capability flags computed server-side so the UI never re-derives the
    # approval rules and gets them subtly out of step.
    is_manager = str(req.get("manager_id")) == viewer_id
    can_manager = status == "pending" and (
        is_manager or has_permission(viewer, "leave.manage")
    ) and has_permission(viewer, "leave.approve")
    can_hr = status == "manager_approved" and has_permission(viewer, "leave.approve_final")
    can_cancel = (
        str(req.get("user_id")) == viewer_id and status in ("pending", "manager_approved")
    ) or has_permission(viewer, "leave.manage")

    return {
        "id":              str(req["_id"]),
        "user_id":         str(req["user_id"]),
        "full_name":       u.get("full_name", ""),
        "leave_type_id":   str(req.get("leave_type_id")),
        "leave_type_name": lt.get("name", ""),
        "start_date":      iso(req.get("start_date")),
        "end_date":        iso(req.get("end_date")),
        "days":            req.get("days", 0),
        "is_half_day":     req.get("is_half_day", False),
        "reason":          req.get("reason", ""),
        "status":          status,
        "manager_name":    users.get(str(req.get("manager_id")), {}).get("full_name", ""),
        "manager_comment": req.get("manager_comment", ""),
        "hr_comment":      req.get("hr_comment", ""),
        "rejection_reason": req.get("rejection_reason", ""),
        "created_at":      iso(req.get("created_at")),
        "can_approve_manager": can_manager,
        "can_approve_hr":  can_hr,
        "can_cancel":      can_cancel and status not in ("approved", "rejected", "cancelled"),
    }


# ── Leave types ───────────────────────────────────────────────────────────────

@router.get("/types")
async def list_leave_types(
    current_user=Depends(require_permission("leave.read")),
    db=Depends(get_db),
):
    types = await db.hr_leave_types.find({"is_active": {"$ne": False}}).sort("name", 1).to_list(None)
    return {
        "leave_types": [{
            "id": str(t["_id"]), "name": t["name"], "code": t.get("code", ""),
            "days_per_year": t.get("days_per_year", 0), "is_paid": t.get("is_paid", True),
            "allow_half_day": t.get("allow_half_day", True),
            "max_consecutive_days": t.get("max_consecutive_days"),
        } for t in types],
        "total": len(types),
    }


@router.post("/types", status_code=201)
async def create_leave_type(
    body: LeaveTypeCreate,
    request: Request,
    current_user=Depends(require_permission("leave.manage")),
    db=Depends(get_db),
):
    if await db.hr_leave_types.find_one({"code": body.code}):
        raise HTTPException(status_code=400, detail="A leave type with that code already exists.")
    now = utcnow()
    result = await db.hr_leave_types.insert_one({**body.model_dump(), "is_active": True, "created_at": now})
    await audit(db, "leave_type.created", current_user, "leave_type", str(result.inserted_id),
                after=body.model_dump(), request=request)
    return {"leave_type_id": str(result.inserted_id), "message": "Leave type created."}


# ── Balances ──────────────────────────────────────────────────────────────────

@router.get("/balances")
async def leave_balances(
    user_id: str | None = Query(None, description="Defaults to the caller"),
    year: int | None = Query(None),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Leave balances. Own balances need no permission — identity is the authorization."""
    target = oid(user_id, "user_id") if user_id else current_user["_id"]
    if target != current_user["_id"]:
        allowed = await scoped_user_ids(db, current_user)
        if not has_permission(current_user, "leave.read_all") and (allowed is not None and target not in allowed):
            raise HTTPException(status_code=403, detail="You cannot view this employee's leave balance.")

    year = year or day_key().year
    types = await db.hr_leave_types.find({"is_active": {"$ne": False}}).to_list(None)
    balances = {
        str(b["leave_type_id"]): b
        async for b in db.hr_leave_balances.find({"user_id": target, "year": year})
    }

    out = []
    for t in types:
        b = balances.get(str(t["_id"]), {})
        allocated = b.get("allocated", t.get("days_per_year", 0))
        used, pending = b.get("used", 0), b.get("pending", 0)
        out.append({
            "leave_type_id": str(t["_id"]),
            "leave_type_name": t["name"],
            "leave_type_code": t.get("code", ""),
            "year": year,
            "allocated": allocated,
            "used": used,
            "pending": pending,
            "available": round(allocated - used - pending, 2),
            "is_paid": t.get("is_paid", True),
        })
    return {"balances": out, "year": year, "user_id": str(target)}


# ── Requests ──────────────────────────────────────────────────────────────────

@router.get("/requests")
async def list_leave_requests(
    user_id: str | None = Query(None),
    status: str | None = Query(None),
    pending_my_action: bool = Query(False, description="Only requests awaiting the caller"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user=Depends(require_permission("leave.read")),
    db=Depends(get_db),
):
    scope = await scoped_user_filter(db, current_user, user_id)
    if scope is None:
        return {"requests": [], "total": 0, "page": page, "limit": limit}
    if has_permission(current_user, "leave.read_all") and not user_id:
        scope = {}

    query: dict = dict(scope)
    if status:
        query["status"] = status

    if pending_my_action:
        # Manager stage: requests where the caller is the named manager.
        # HR stage: anything already manager-approved, if they hold final approval.
        clauses = [{"status": "pending", "manager_id": current_user["_id"]}]
        if has_permission(current_user, "leave.approve_final"):
            clauses.append({"status": "manager_approved"})
        query = {"$and": [query, {"$or": clauses}]} if query else {"$or": clauses}

    skip = (page - 1) * limit
    requests = await db.hr_leave_requests.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.hr_leave_requests.count_documents(query)

    users = await user_map(db, {r["user_id"] for r in requests} | {r.get("manager_id") for r in requests})
    types = await _leave_type_map(db)
    return {
        "requests": [_serialize_request(r, users=users, types=types, viewer=current_user) for r in requests],
        "total": total, "page": page, "limit": limit,
    }


@router.post("/requests", status_code=201)
async def create_leave_request(
    body: LeaveRequestCreate,
    request: Request,
    current_user=Depends(require_permission("leave.request")),
    db=Depends(get_db),
):
    """Submit a leave request. Days are reserved in `pending` immediately."""
    start = day_key(parse_date(body.start_date, "start_date"))
    end = day_key(parse_date(body.end_date, "end_date"))
    if end < start:
        raise HTTPException(status_code=400, detail="The end date cannot be before the start date.")

    leave_type = await db.hr_leave_types.find_one({"_id": oid(body.leave_type_id, "leave_type_id")})
    if not leave_type:
        raise HTTPException(status_code=404, detail="Leave type not found.")

    employee = await db.hr_employees.find_one({"user_id": current_user["_id"]})
    if not employee:
        raise HTTPException(status_code=400, detail="You do not have an HR profile yet.")

    # Weekends and holidays are not charged — otherwise a week off bills 7 days.
    holidays = await holiday_days(db, start, end, department_id=employee.get("department_id"))
    days = working_days_between(start, end, holidays)
    if body.is_half_day:
        if not leave_type.get("allow_half_day", True):
            raise HTTPException(status_code=400, detail="This leave type does not allow half days.")
        if start != end:
            raise HTTPException(status_code=400, detail="A half day must start and end on the same date.")
        days = 0.5
    if days <= 0:
        raise HTTPException(status_code=400, detail="That range contains no working days.")

    max_days = leave_type.get("max_consecutive_days")
    if max_days and days > max_days:
        raise HTTPException(status_code=400, detail=f"This leave type allows at most {max_days} consecutive days.")

    # Overlap check against requests that already hold days.
    overlap = await db.hr_leave_requests.find_one({
        "user_id": current_user["_id"],
        "status": {"$in": list(CONSUMING_STATUSES)},
        "start_date": {"$lte": end},
        "end_date": {"$gte": start},
    })
    if overlap:
        raise HTTPException(status_code=400, detail="You already have a leave request covering those dates.")

    year = _year_of(start)
    balance = await db.hr_leave_balances.find_one({
        "user_id": current_user["_id"], "leave_type_id": leave_type["_id"], "year": year,
    })
    allocated = balance.get("allocated", leave_type.get("days_per_year", 0)) if balance else leave_type.get("days_per_year", 0)
    used = balance.get("used", 0) if balance else 0
    pending = balance.get("pending", 0) if balance else 0
    available = allocated - used - pending
    if days > available:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance: {available} day(s) available, {days} requested.",
        )

    manager_id = employee.get("manager_user_id")
    now = utcnow()
    doc = {
        "user_id": current_user["_id"],
        "leave_type_id": leave_type["_id"],
        "start_date": start, "end_date": end, "days": days,
        "is_half_day": body.is_half_day, "reason": body.reason,
        "status": "pending",
        "manager_id": manager_id,
        "manager_action_at": None, "manager_comment": "",
        "hr_action_by": None, "hr_action_at": None, "hr_comment": "",
        "rejected_by": None, "rejection_reason": "",
        "created_at": now, "updated_at": now,
    }
    result = await db.hr_leave_requests.insert_one(doc)

    # Reserve the days so a second request cannot be approved against them.
    await db.hr_leave_balances.update_one(
        {"user_id": current_user["_id"], "leave_type_id": leave_type["_id"], "year": year},
        {"$inc": {"pending": days},
         "$setOnInsert": {"allocated": allocated, "used": used, "carried_forward": 0},
         "$set": {"updated_at": now}},
        upsert=True,
    )

    if manager_id:
        await notify_users(
            db=db, user_ids=[manager_id],
            notification_type="leave_request",
            title=f"Leave request from {current_user.get('full_name', 'an employee')}",
            body=f"{days} day(s) of {leave_type['name']} from {start.date()} to {end.date()}.",
            reference_id=str(result.inserted_id), reference_type="leave_request",
            link="/hr/time?tab=approvals", email=True,
        )

    await audit(db, "leave.requested", current_user, "leave_request", str(result.inserted_id),
                after={"days": days, "leave_type": leave_type["name"],
                       "start": iso(start), "end": iso(end)},
                request=request, subject_user_id=current_user["_id"])

    return {"request_id": str(result.inserted_id), "days": days, "status": "pending",
            "message": "Leave request submitted."}


# ── Approval ──────────────────────────────────────────────────────────────────

@router.post("/requests/{request_id}/decision")
async def decide_leave_request(
    request_id: str,
    body: LeaveDecision,
    request: Request,
    current_user=Depends(require_permission("leave.approve")),
    db=Depends(get_db),
):
    """Approve or reject at whichever stage the request is in (§13).

    Final approval and rejection both mutate a balance alongside the status, so
    both run in a transaction. The status is also re-read INSIDE the transaction
    and used as a guard in the update filter, which is what makes two concurrent
    approvals resolve to exactly one balance movement.
    """
    req_oid = oid(request_id, "request_id")
    req = await db.hr_leave_requests.find_one({"_id": req_oid})
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")

    status = req.get("status")
    if status in ("approved", "rejected", "cancelled"):
        raise HTTPException(status_code=400, detail=f"This request is already {status}.")

    is_manager_stage = status == "pending"
    if is_manager_stage:
        is_named_manager = req.get("manager_id") == current_user["_id"]
        if not (is_named_manager or has_permission(current_user, "leave.manage")):
            raise HTTPException(status_code=403, detail="Only the employee's manager can approve at this stage.")
    else:
        if not has_permission(current_user, "leave.approve_final"):
            raise HTTPException(status_code=403, detail="Final approval requires HR.")

    now = utcnow()
    year = _year_of(aware(req["start_date"]))
    days = req.get("days", 0)
    balance_filter = {"user_id": req["user_id"], "leave_type_id": req["leave_type_id"], "year": year}

    # ── Manager stage: no balance movement, days stay in `pending` ────────────
    if is_manager_stage and body.approve:
        updated = await db.hr_leave_requests.update_one(
            {"_id": req_oid, "status": "pending"},          # guard against a double click
            {"$set": {"status": "manager_approved", "manager_action_at": now,
                      "manager_comment": body.comment, "updated_at": now}},
        )
        if updated.modified_count == 0:
            raise HTTPException(status_code=409, detail="This request was just actioned by someone else.")
        new_status = "manager_approved"

    else:
        # ── Final approval or rejection: balance moves, so use a transaction ──
        approving = body.approve
        async with await mongodb.client.start_session() as session:
            async with session.start_transaction():
                # The filter doubles as the concurrency guard: the second of two
                # simultaneous approvals matches nothing and modifies nothing.
                set_fields = {"updated_at": now}
                if approving:
                    set_fields.update({"status": "approved", "hr_action_by": current_user["_id"],
                                       "hr_action_at": now, "hr_comment": body.comment})
                    expected_status = "manager_approved"
                else:
                    set_fields.update({"status": "rejected", "rejected_by": current_user["_id"],
                                       "rejection_reason": body.comment,
                                       "hr_action_at": now if not is_manager_stage else None})
                    expected_status = status

                result = await db.hr_leave_requests.update_one(
                    {"_id": req_oid, "status": expected_status},
                    {"$set": set_fields},
                    session=session,
                )
                if result.modified_count == 0:
                    raise HTTPException(status_code=409, detail="This request was just actioned by someone else.")

                if approving:
                    # pending -> used, in one atomic step
                    await db.hr_leave_balances.update_one(
                        balance_filter, {"$inc": {"pending": -days, "used": days}, "$set": {"updated_at": now}},
                        session=session,
                    )
                else:
                    # Rejected: release the reservation entirely.
                    await db.hr_leave_balances.update_one(
                        balance_filter, {"$inc": {"pending": -days}, "$set": {"updated_at": now}},
                        session=session,
                    )
        new_status = "approved" if approving else "rejected"

    # Attendance rows for approved leave are written outside the transaction:
    # they are derived data, and a failure here should not roll back a decision
    # the employee has already been told about.
    if new_status == "approved":
        employee = await db.hr_employees.find_one({"user_id": req["user_id"]}, {"department_id": 1})
        start, end = aware(req["start_date"]), aware(req["end_date"])
        holidays = await holiday_days(db, start, end,
                                      department_id=(employee or {}).get("department_id"))
        for day in date_range(start, end):
            if day.weekday() >= 5 or day in holidays:
                continue
            await db.hr_attendance.update_one(
                {"user_id": req["user_id"], "date": day},
                {"$set": {"status": "leave", "leave_request_id": req_oid,
                          "source": "job", "updated_at": now},
                 "$setOnInsert": {"check_in": None, "check_out": None, "worked_minutes": 0,
                                  "overtime_minutes": 0, "late_minutes": 0,
                                  "department_id": (employee or {}).get("department_id"),
                                  "holiday_id": None, "notes": "Approved leave",
                                  "marked_by": current_user["_id"], "created_at": now}},
                upsert=True,
            )

    types = await _leave_type_map(db, [req["leave_type_id"]])
    type_name = types.get(str(req["leave_type_id"]), {}).get("name", "leave")
    await notify_users(
        db=db, user_ids=[req["user_id"]],
        notification_type=f"leave_{new_status}",
        title=f"Leave {new_status.replace('_', ' ')}: {type_name}",
        body=(body.comment or f"Your {days} day(s) of {type_name} were {new_status.replace('_', ' ')}."),
        reference_id=request_id, reference_type="leave_request",
        link="/my-hr?tab=leave", email=True,
    )

    await audit(db, f"leave.{new_status}", current_user, "leave_request", request_id,
                before={"status": status}, after={"status": new_status, "days": days},
                request=request, subject_user_id=req["user_id"])

    return {"message": f"Leave request {new_status.replace('_', ' ')}.", "status": new_status}


# ── Cancel ────────────────────────────────────────────────────────────────────

@router.post("/requests/{request_id}/cancel")
async def cancel_leave_request(
    request_id: str,
    request: Request,
    current_user=Depends(require_permission("leave.request")),
    db=Depends(get_db),
):
    """Withdraw a request that has not been finally approved."""
    req_oid = oid(request_id, "request_id")
    req = await db.hr_leave_requests.find_one({"_id": req_oid})
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")

    is_owner = req["user_id"] == current_user["_id"]
    if not (is_owner or has_permission(current_user, "leave.manage")):
        raise HTTPException(status_code=403, detail="You cannot cancel this request.")
    if req["status"] not in ("pending", "manager_approved"):
        raise HTTPException(status_code=400, detail=f"A {req['status']} request cannot be cancelled.")

    now = utcnow()
    year = _year_of(aware(req["start_date"]))
    async with await mongodb.client.start_session() as session:
        async with session.start_transaction():
            result = await db.hr_leave_requests.update_one(
                {"_id": req_oid, "status": req["status"]},
                {"$set": {"status": "cancelled", "updated_at": now}},
                session=session,
            )
            if result.modified_count == 0:
                raise HTTPException(status_code=409, detail="This request was just actioned by someone else.")
            await db.hr_leave_balances.update_one(
                {"user_id": req["user_id"], "leave_type_id": req["leave_type_id"], "year": year},
                {"$inc": {"pending": -req.get("days", 0)}, "$set": {"updated_at": now}},
                session=session,
            )

    await audit(db, "leave.cancelled", current_user, "leave_request", request_id,
                before={"status": req["status"]}, after={"status": "cancelled"},
                request=request, subject_user_id=req["user_id"])
    return {"message": "Leave request cancelled.", "status": "cancelled"}
