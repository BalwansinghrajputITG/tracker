"""
Offers and the offer→employee conversion (hr.md §9, §10, §40).

ACCEPTING AN OFFER IS THE HIGHEST-CONSEQUENCE OPERATION IN THIS SYSTEM. It
creates, in one transaction:

    users               the login
    hr_employees        the HR profile
    hr_compensation     the pay record
    hr_onboarding_tasks the §10 checklist
    hr_candidates       stamped with converted_user_id
    hr_applications     moved to hired
    hr_jobs             filled_count incremented
    hr_offers           moved to accepted

All eight or none. Without a transaction, a failure halfway leaves an orphaned
login with no employee record — a person who can sign in and whom HR cannot see.
That is the failure §40's "one canonical employee record" exists to prevent, and
the forced-failure test is the most important one in the build.

Salary fields are gated on salary.read, matching hr_compensation.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from passlib.context import CryptContext

from database import get_db, mongodb
from middleware.permissions import has_permission, require_permission
from models.hr.offer import OFFER_TRANSITIONS, OfferCreate, OfferDecision, OfferUpdate
from models.hr.onboarding import ONBOARDING_TEMPLATE
from routers.hr.common import aware, iso, oid, parse_date, user_map, utcnow
from services.audit_service import audit
from services.notification_service import notify_users

router = APIRouter()

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _hash_password(password: str) -> str:
    """Same scheme as routers/auth.py: SHA-256 normalize, then bcrypt.

    Must stay identical or a converted employee cannot log in — bcrypt silently
    truncates at 72 bytes, which is why the normalization exists.
    """
    normalized = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return _pwd_context.hash(normalized)


def _serialize(offer: dict, *, candidates: dict, jobs: dict, users: dict, reveal_salary: bool) -> dict:
    candidate = candidates.get(str(offer.get("candidate_id")), {})
    job = jobs.get(str(offer.get("job_id")), {})
    expires = aware(offer.get("expires_at"))
    status = offer.get("status", "draft")
    # Surfaced as a derived flag rather than mutating the row on read: a GET
    # should not have the side effect of expiring records.
    is_expired = bool(expires and expires < utcnow() and status in ("sent", "viewed"))

    out = {
        "id":             str(offer["_id"]),
        "application_id": str(offer["application_id"]),
        "candidate_id":   str(offer["candidate_id"]),
        "candidate_name": candidate.get("full_name", ""),
        "candidate_email": candidate.get("email", ""),
        "job_id":         str(offer["job_id"]),
        "job_title":      job.get("title", ""),
        "joining_date":   iso(offer.get("joining_date")),
        "probation_months": offer.get("probation_months", 6),
        "notice_period_days": offer.get("notice_period_days", 60),
        "benefits":       offer.get("benefits", ""),
        "status":         "expired" if is_expired else status,
        "expires_at":     iso(offer.get("expires_at")),
        "sent_at":        iso(offer.get("sent_at")),
        "decided_at":     iso(offer.get("decided_at")),
        "decline_reason": offer.get("decline_reason", ""),
        "converted_user_id": str(offer["converted_user_id"]) if offer.get("converted_user_id") else None,
        "created_by_name": users.get(str(offer.get("created_by")), {}).get("full_name", ""),
        "created_at":     iso(offer.get("created_at")),
        "allowed_transitions": list(OFFER_TRANSITIONS.get(status, ())),
    }
    if reveal_salary:
        out.update({
            "base_salary":  offer.get("base_salary", 0),
            "ctc":          offer.get("ctc", 0),
            "variable_pay": offer.get("variable_pay", 0),
            "bonus":        offer.get("bonus", 0),
            "currency":     offer.get("currency", "INR"),
            "pay_frequency": offer.get("pay_frequency", "monthly"),
        })
    return out


def _assert_transition(current: str, target: str) -> None:
    if target not in OFFER_TRANSITIONS.get(current, ()):
        allowed = ", ".join(OFFER_TRANSITIONS.get(current, ())) or "nothing (terminal state)"
        raise HTTPException(
            status_code=400,
            detail=f"An offer in '{current}' cannot move to '{target}'. Allowed: {allowed}.",
        )


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_offers(
    status: str | None = Query(None),
    candidate_id: str | None = Query(None),
    job_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user=Depends(require_permission("offer.read")),
    db=Depends(get_db),
):
    query: dict = {}
    if status:
        query["status"] = status
    if candidate_id:
        query["candidate_id"] = oid(candidate_id, "candidate_id")
    if job_id:
        query["job_id"] = oid(job_id, "job_id")

    skip = (page - 1) * limit
    offers = await db.hr_offers.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.hr_offers.count_documents(query)

    candidates = {str(c["_id"]): c async for c in db.hr_candidates.find(
        {"_id": {"$in": [o["candidate_id"] for o in offers]}})}
    jobs = {str(j["_id"]): j async for j in db.hr_jobs.find(
        {"_id": {"$in": [o["job_id"] for o in offers]}})}
    users = await user_map(db, {o.get("created_by") for o in offers})
    reveal = has_permission(current_user, "salary.read")

    serialized = [_serialize(o, candidates=candidates, jobs=jobs, users=users, reveal_salary=reveal)
                  for o in offers]
    return {
        "offers": serialized, "total": total, "page": page, "limit": limit,
        "pending_count": sum(1 for o in serialized if o["status"] in ("sent", "viewed")),
    }


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_offer(
    body: OfferCreate,
    request: Request,
    current_user=Depends(require_permission("offer.create")),
    db=Depends(get_db),
):
    app_oid = oid(body.application_id, "application_id")
    application = await db.hr_applications.find_one({"_id": app_oid})
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.get("status") != "active":
        raise HTTPException(status_code=400, detail=f"This application is {application.get('status')}.")

    live = await db.hr_offers.find_one({
        "application_id": app_oid, "status": {"$in": ["draft", "sent", "viewed", "accepted"]},
    })
    if live:
        raise HTTPException(
            status_code=400,
            detail=f"This application already has a {live['status']} offer.",
        )

    joining = parse_date(body.joining_date, "joining_date")
    expires = parse_date(body.expires_at, "expires_at")
    if expires and joining and expires > joining:
        raise HTTPException(status_code=400, detail="The offer must expire on or before the joining date.")

    now = utcnow()
    doc = {
        **body.model_dump(exclude={"application_id", "joining_date", "expires_at",
                                   "designation_id", "department_id"}),
        "application_id":  app_oid,
        "candidate_id":    application["candidate_id"],
        "job_id":          application["job_id"],
        "designation_id":  oid(body.designation_id, "designation_id") if body.designation_id else None,
        "department_id":   oid(body.department_id, "department_id") if body.department_id else None,
        "joining_date":    joining,
        "expires_at":      expires,
        "status":          "draft",
        "sent_at": None, "viewed_at": None, "decided_at": None,
        "decline_reason": "", "approved_by": None,
        "document_id": None, "converted_user_id": None,
        "created_by":      current_user["_id"],
        "created_at":      now, "updated_at": now,
    }
    result = await db.hr_offers.insert_one(doc)

    await db.hr_applications.update_one(
        {"_id": app_oid},
        {"$set": {"stage": "offer", "updated_at": now},
         "$push": {"stage_history": {"stage": "offer", "at": now,
                                     "by": current_user["_id"], "note": "Offer drafted"}}},
    )

    await audit(db, "offer.created", current_user, "offer", str(result.inserted_id),
                after={"base_salary": body.base_salary, "ctc": body.ctc,
                       "joining_date": iso(joining)},
                request=request)

    return {"offer_id": str(result.inserted_id), "status": "draft", "message": "Offer drafted."}


@router.put("/{offer_id}")
async def update_offer(
    offer_id: str,
    body: OfferUpdate,
    request: Request,
    current_user=Depends(require_permission("offer.update")),
    db=Depends(get_db),
):
    """Only drafts are editable — a sent offer is a communicated commitment."""
    offer_oid = oid(offer_id, "offer_id")
    offer = await db.hr_offers.find_one({"_id": offer_oid})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    if offer.get("status") != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"A {offer['status']} offer cannot be edited. Withdraw it and draft a new one.",
        )

    updates: dict = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if key in ("joining_date", "expires_at"):
            updates[key] = parse_date(value, key)
        elif key in ("designation_id", "department_id"):
            updates[key] = oid(value, key) if value else None
        else:
            updates[key] = value

    if not updates:
        return {"message": "Nothing to update."}

    before = {k: offer.get(k) for k in updates}
    updates["updated_at"] = utcnow()
    await db.hr_offers.update_one({"_id": offer_oid}, {"$set": updates})
    await audit(db, "offer.updated", current_user, "offer", offer_id,
                before=before, after=updates, request=request)
    return {"message": "Offer updated."}


# ── Send ──────────────────────────────────────────────────────────────────────

@router.post("/{offer_id}/send")
async def send_offer(
    offer_id: str,
    request: Request,
    current_user=Depends(require_permission("offer.send")),
    db=Depends(get_db),
):
    offer_oid = oid(offer_id, "offer_id")
    offer = await db.hr_offers.find_one({"_id": offer_oid})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    _assert_transition(offer.get("status", "draft"), "sent")

    now = utcnow()
    await db.hr_offers.update_one(
        {"_id": offer_oid, "status": "draft"},
        {"$set": {"status": "sent", "sent_at": now, "updated_at": now,
                  "approved_by": current_user["_id"]}},
    )
    await audit(db, "offer.sent", current_user, "offer", offer_id,
                before={"status": "draft"}, after={"status": "sent"}, request=request)
    return {"message": "Offer sent.", "status": "sent"}


# ── Decision — the conversion ─────────────────────────────────────────────────

@router.post("/{offer_id}/decision")
async def decide_offer(
    offer_id: str,
    body: OfferDecision,
    request: Request,
    current_user=Depends(require_permission("offer.update")),
    db=Depends(get_db),
):
    """Record the candidate's answer. Acceptance creates the employee.

    The whole conversion runs in one transaction. The offer's status doubles as
    the concurrency guard: two simultaneous acceptances both try to move it out
    of 'sent', exactly one matches, and the loser's writes never commit — so
    there is no window in which two logins are minted for one offer.
    """
    offer_oid = oid(offer_id, "offer_id")
    offer = await db.hr_offers.find_one({"_id": offer_oid})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    current_status = offer.get("status", "draft")
    target = "accepted" if body.accept else "rejected"
    _assert_transition(current_status, target)

    expires = aware(offer.get("expires_at"))
    if expires and expires < utcnow():
        raise HTTPException(status_code=400, detail="This offer has expired.")

    candidate = await db.hr_candidates.find_one({"_id": offer["candidate_id"]})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    now = utcnow()

    # ── Rejection: no employee is created, so no transaction is needed ────────
    if not body.accept:
        updated = await db.hr_offers.update_one(
            {"_id": offer_oid, "status": current_status},
            {"$set": {"status": "rejected", "decided_at": now,
                      "decline_reason": body.reason, "updated_at": now}},
        )
        if updated.modified_count == 0:
            raise HTTPException(status_code=409, detail="This offer was just actioned by someone else.")
        await db.hr_applications.update_one(
            {"_id": offer["application_id"]},
            {"$set": {"status": "rejected", "rejection_reason": f"Offer declined: {body.reason}",
                      "updated_at": now}},
        )
        await audit(db, "offer.rejected", current_user, "offer", offer_id,
                    before={"status": current_status}, after={"status": "rejected"},
                    request=request, meta={"reason": body.reason})
        return {"message": "Offer declined.", "status": "rejected"}

    # ── Acceptance: mint the person ──────────────────────────────────────────
    email = (candidate.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="The candidate has no email address.")

    # Friendly pre-check. The unique index on users.email is the real guard —
    # this only turns a 500 into a sentence.
    if await db.users.find_one({"email": email}):
        raise HTTPException(
            status_code=400,
            detail=f"A user account already exists for {email}. Link it manually instead.",
        )

    password = body.initial_password or secrets.token_urlsafe(9)
    job = await db.hr_jobs.find_one({"_id": offer["job_id"]})
    department_id = offer.get("department_id") or (job or {}).get("department_id")
    designation_id = offer.get("designation_id") or (job or {}).get("designation_id")
    joining_date = aware(offer.get("joining_date")) or now

    department_name = ""
    if department_id:
        dept = await db.departments.find_one({"_id": department_id}, {"name": 1})
        department_name = (dept or {}).get("name", "")

    # Employee code derived before the transaction to keep the critical section
    # short; the unique index still guards against a concurrent duplicate.
    last = await db.hr_employees.find(
        {"employee_code": {"$regex": r"^EMP-\d+$"}}, {"employee_code": 1},
    ).sort("employee_code", -1).limit(1).to_list(1)
    next_code = f"EMP-{(int(last[0]['employee_code'].split('-')[1]) if last else 0) + 1:04d}"

    hiring_manager_id = (job or {}).get("hiring_manager_id")

    async with await mongodb.client.start_session() as session:
        async with session.start_transaction():
            # 1. The offer moves first: its status is the concurrency guard, so
            #    a loser aborts before creating anything.
            claimed = await db.hr_offers.update_one(
                {"_id": offer_oid, "status": current_status},
                {"$set": {"status": "accepted", "decided_at": now, "updated_at": now}},
                session=session,
            )
            if claimed.modified_count == 0:
                raise HTTPException(status_code=409, detail="This offer was just actioned by someone else.")

            # 2. Login
            user_doc = {
                "email":         email,
                "password_hash": _hash_password(password),
                "full_name":     candidate.get("full_name", ""),
                "department":    department_name,
                "phone":         candidate.get("phone", ""),
                "roles":         ["employee"],
                "primary_role":  "employee",
                "avatar_url":    "",
                "team_ids":      [],
                "project_ids":   [],
                "manager_id":    hiring_manager_id,
                "is_active":     True,
                "last_seen":     now,
                "notification_preferences": {"email": True, "in_app": True, "daily_digest": False},
                "must_change_password": True,
                "created_by":    current_user["_id"],
                "created_at":    now,
                "updated_at":    now,
            }
            user_result = await db.users.insert_one(user_doc, session=session)
            new_user_id = user_result.inserted_id

            # 3. HR profile
            employee_result = await db.hr_employees.insert_one({
                "user_id":            new_user_id,
                "employee_code":      next_code,
                "joining_date":       joining_date,
                "date_of_birth":      None,
                "gender":             "",
                "personal_email":     email,
                "phone":              candidate.get("phone", ""),
                "address":            "",
                "emergency_contact":  {"name": "", "relationship": "", "phone": ""},
                "designation_id":     designation_id,
                "department_id":      department_id,
                "manager_user_id":    hiring_manager_id,
                "employment_type":    (job or {}).get("employment_type", "full_time"),
                # Probation, not active: a new hire on a 6-month probation is not
                # a confirmed employee, and reports that treat them as one are wrong.
                "employment_status":  "probation" if offer.get("probation_months") else "active",
                "work_mode":          "onsite",
                "work_location":      (job or {}).get("location", ""),
                "probation_status":   "ongoing" if offer.get("probation_months") else "not_applicable",
                "probation_end_date": (
                    joining_date + timedelta(days=30 * offer.get("probation_months", 0))
                    if offer.get("probation_months") else None
                ),
                "confirmation_date":  None, "exit_date": None, "exit_reason": "",
                "external_ids":       {},
                "sync":               {"last_synced_at": None, "status": "local_only", "error": None},
                "created_by":         current_user["_id"],
                "created_at":         now, "updated_at": now,
            }, session=session)

            # 4. Compensation — the offer's numbers become the hire record
            await db.hr_compensation.insert_one({
                "user_id":        new_user_id,
                "employee_id":    employee_result.inserted_id,
                "base_salary":    offer.get("base_salary", 0),
                "ctc":            offer.get("ctc", 0),
                "variable_pay":   offer.get("variable_pay", 0),
                "bonus":          offer.get("bonus", 0),
                "currency":       offer.get("currency", "INR"),
                "pay_frequency":  offer.get("pay_frequency", "monthly"),
                "effective_date": joining_date,
                "reason":         "hire",
                "notes":          f"From accepted offer {offer_id}.",
                "approved_by":    offer.get("approved_by") or current_user["_id"],
                "created_by":     current_user["_id"],
                "created_at":     now,
            }, session=session)

            # 5. Onboarding checklist (§10)
            tasks = [{
                "user_id":       new_user_id,
                "candidate_id":  offer["candidate_id"],
                "offer_id":      offer_oid,
                "title":         t["title"],
                "category":      t["category"],
                "owner_role":    t["owner_role"],
                "owner_user_id": hiring_manager_id if t["owner_role"] == "manager" else None,
                "due_date":      joining_date + timedelta(days=t["days"]),
                "order":         index,
                "status":        "pending",
                "completed_at":  None, "completed_by": None, "notes": "",
                "created_at":    now, "updated_at": now,
            } for index, t in enumerate(ONBOARDING_TEMPLATE)]
            await db.hr_onboarding_tasks.insert_many(tasks, session=session)

            # 6. Link the candidate to the person they became (§40)
            await db.hr_candidates.update_one(
                {"_id": offer["candidate_id"]},
                {"$set": {"converted_user_id": new_user_id, "updated_at": now}},
                session=session,
            )

            # 7. Application → hired
            await db.hr_applications.update_one(
                {"_id": offer["application_id"]},
                {"$set": {"stage": "hired", "status": "hired", "updated_at": now},
                 "$push": {"stage_history": {"stage": "hired", "at": now,
                                             "by": current_user["_id"],
                                             "note": "Offer accepted"}}},
                session=session,
            )

            # 8. Job headcount; close it once every opening is filled
            await db.hr_jobs.update_one(
                {"_id": offer["job_id"]}, {"$inc": {"filled_count": 1}}, session=session,
            )
            refreshed = await db.hr_jobs.find_one({"_id": offer["job_id"]}, session=session)
            if refreshed and refreshed.get("filled_count", 0) >= refreshed.get("openings_count", 1):
                await db.hr_jobs.update_one(
                    {"_id": offer["job_id"]},
                    {"$set": {"status": "closed", "updated_at": now}}, session=session,
                )

            await db.hr_offers.update_one(
                {"_id": offer_oid}, {"$set": {"converted_user_id": new_user_id}}, session=session,
            )

    # Everything below is outside the transaction: notifications and audit must
    # not be able to roll back a hire that has already happened.
    await audit(db, "offer.accepted", current_user, "offer", offer_id,
                before={"status": current_status},
                after={"status": "accepted", "employee_code": next_code},
                request=request, subject_user_id=new_user_id,
                meta={"candidate_id": str(offer["candidate_id"]), "user_id": str(new_user_id)})

    if hiring_manager_id:
        await notify_users(
            db=db, user_ids=[hiring_manager_id],
            notification_type="offer_accepted",
            title=f"{candidate.get('full_name')} accepted their offer",
            body=f"Joining {joining_date.date()} as {next_code}. Onboarding has started.",
            reference_id=offer_id, reference_type="offer",
            link="/hr/employees", email=True,
        )

    return {
        "message":       "Offer accepted — employee created.",
        "status":        "accepted",
        "user_id":       str(new_user_id),
        "employee_id":   str(employee_result.inserted_id),
        "employee_code": next_code,
        "email":         email,
        # Returned once and never stored in plain text. The account is flagged
        # must_change_password so it cannot stay as issued.
        "initial_password": password,
        "onboarding_tasks": len(ONBOARDING_TEMPLATE),
    }


# ── Withdraw ──────────────────────────────────────────────────────────────────

@router.post("/{offer_id}/withdraw")
async def withdraw_offer(
    offer_id: str,
    request: Request,
    current_user=Depends(require_permission("offer.approve")),
    db=Depends(get_db),
):
    offer_oid = oid(offer_id, "offer_id")
    offer = await db.hr_offers.find_one({"_id": offer_oid})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    _assert_transition(offer.get("status", "draft"), "withdrawn")

    now = utcnow()
    await db.hr_offers.update_one(
        {"_id": offer_oid}, {"$set": {"status": "withdrawn", "decided_at": now, "updated_at": now}},
    )
    await audit(db, "offer.withdrawn", current_user, "offer", offer_id,
                before={"status": offer.get("status")}, after={"status": "withdrawn"},
                request=request)
    return {"message": "Offer withdrawn.", "status": "withdrawn"}
