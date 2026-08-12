"""
Background job runner (hr.md §34).

There is no worker infrastructure here and no reliable Redis to build one on —
Redis is optional by design (database.py leaves the client as None on failure)
and is currently unavailable in production, so a Redis-backed queue would
silently never run. Celery/ARQ would each add a second deployable.

So: an external cron (Render Cron, GitHub Actions, cron-job.org) POSTs to a
token-protected endpoint, and a MongoDB lease lock makes concurrent runs safe.
That matters because the Dockerfile runs gunicorn with 4 workers — any
in-process scheduler would fire every job four times.

Adding a job:
    1. write an async fn(db) -> dict
    2. register it in JOBS below
    3. point cron at POST /api/v1/jobs/run/<name> with the X-Job-Token header
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from config import settings
from database import get_db
from middleware.permissions import require_permission
from routers.hr.common import aware

logger = logging.getLogger(__name__)
router = APIRouter()

LEASE_SECONDS = 300     # a job holding its lease longer than this is presumed dead


async def acquire_lease(db, job_name: str, lease_seconds: int = LEASE_SECONDS) -> bool:
    """Take the lease for a job, or return False if another runner holds it.

    One atomic findOneAndUpdate: the filter matches only when the job is unheld
    or its lease has expired, so two workers racing produce exactly one winner.
    A crashed worker's lease simply times out — no manual cleanup, no stuck job.
    """
    now = datetime.now(timezone.utc)
    result = await db.hr_job_leases.find_one_and_update(
        {
            "_id": job_name,
            "$or": [
                {"locked_until": {"$lt": now}},
                {"locked_until": None},
            ],
        },
        {"$set": {"locked_until": now + timedelta(seconds=lease_seconds), "started_at": now}},
        upsert=False,
        return_document=True,
    )
    if result:
        return True

    # First run for this job: insert. A duplicate-key error means another worker
    # inserted first, which is the same as losing the race.
    try:
        await db.hr_job_leases.insert_one({
            "_id": job_name,
            "locked_until": now + timedelta(seconds=lease_seconds),
            "started_at": now,
            "last_result": None,
            "last_finished_at": None,
        })
        return True
    except Exception:
        return False


async def release_lease(db, job_name: str, result: dict) -> None:
    await db.hr_job_leases.update_one(
        {"_id": job_name},
        {"$set": {
            "locked_until": None,
            "last_finished_at": datetime.now(timezone.utc),
            "last_result": result,
        }},
    )


# ── Jobs ──────────────────────────────────────────────────────────────────────

async def job_document_expiry_reminders(db) -> dict:
    """Notify about documents nearing or past expiry (§23).

    Idempotent via `reminders_sent`: each window is recorded on the document, so
    re-running the job — which cron will inevitably do after a retry or an
    overlapping schedule — never re-notifies for the same window.
    """
    from services.notification_service import notify_users

    now = datetime.now(timezone.utc)
    # Windows are EXCLUSIVE ranges, not cumulative thresholds. Overlapping them
    # meant a document five days from expiry matched both the 30-day and 7-day
    # queries — two notifications at once, one of them saying "expiring in 30
    # days" about a document with five days left.
    windows = [
        ("30d", 7, 30),          # 7 < days remaining <= 30
        ("7d", 0, 7),            # 0 < days remaining <= 7
        ("expired", None, None),
    ]
    sent: dict[str, int] = {}

    for label, lower_days, upper_days in windows:
        if label == "expired":
            query = {
                "expires_at": {"$lt": now},
                "deleted_at": None, "is_current": True,
                "reminders_sent": {"$ne": label},
            }
        else:
            query = {
                "expires_at": {
                    "$gt": now + timedelta(days=lower_days),
                    "$lte": now + timedelta(days=upper_days),
                },
                "deleted_at": None, "is_current": True,
                "reminders_sent": {"$ne": label},
            }
        days = upper_days

        documents = await db.hr_documents.find(query).limit(200).to_list(200)
        for doc in documents:
            if not doc.get("user_id"):
                continue
            if label == "expired":
                title = f"Document expired: {doc.get('title')}"
            else:
                # Say the ACTUAL days remaining, not the window's upper bound.
                remaining = max(1, (aware(doc["expires_at"]) - now).days)
                title = (
                    f"Document expires tomorrow: {doc.get('title')}" if remaining == 1
                    else f"Document expires in {remaining} days: {doc.get('title')}"
                )
            await notify_users(
                db=db,
                user_ids=[doc["user_id"]],
                notification_type="document_expiring",
                title=title,
                body=f"Your {doc.get('doc_type', 'document').replace('_', ' ')} needs renewing.",
                reference_id=str(doc["_id"]),
                reference_type="document",
                link="/hr/employees",
                email=True,
            )
            # Marked only after the notification exists, so a crash mid-loop
            # re-notifies rather than silently skipping.
            await db.hr_documents.update_one(
                {"_id": doc["_id"]}, {"$addToSet": {"reminders_sent": label}}
            )
            sent[label] = sent.get(label, 0) + 1

    return {"notified": sent, "total": sum(sent.values())}


async def job_email_retry(db) -> dict:
    from services.email_service import retry_failed_emails
    return await retry_failed_emails(db)


async def job_mark_absent(db) -> dict:
    """Mark yesterday's no-shows absent (§12).

    Runs for YESTERDAY, not today: someone who has not checked in at 09:05 is not
    absent, they are late. The day has to be over before absence is a fact.

    Skips weekends and holidays, and never overwrites an existing record — so an
    approved leave day, a manual mark or a late check-in all survive the job.
    """
    from routers.hr.dates import day_key, holiday_days, is_weekend

    target_day = day_key() - timedelta(days=1)

    if is_weekend(target_day):
        return {"date": target_day.isoformat(), "skipped": "weekend", "marked": 0}

    holidays = await holiday_days(db, target_day, target_day)
    if target_day in holidays:
        return {"date": target_day.isoformat(), "skipped": "holiday", "marked": 0}

    employees = await db.hr_employees.find(
        {"employment_status": {"$in": ["active", "probation"]}},
        {"user_id": 1, "department_id": 1},
    ).to_list(5000)

    existing = {
        r["user_id"] async for r in db.hr_attendance.find(
            {"date": target_day, "user_id": {"$in": [e["user_id"] for e in employees]}},
            {"user_id": 1},
        )
    }

    now = datetime.now(timezone.utc)
    marked = 0
    for employee in employees:
        if employee["user_id"] in existing:
            continue
        # upsert with $setOnInsert only: if a record appears between the read and
        # the write, its status is left untouched rather than clobbered.
        await db.hr_attendance.update_one(
            {"user_id": employee["user_id"], "date": target_day},
            {"$setOnInsert": {
                "status": "absent", "check_in": None, "check_out": None,
                "worked_minutes": 0, "overtime_minutes": 0, "late_minutes": 0,
                "department_id": employee.get("department_id"),
                "leave_request_id": None, "holiday_id": None,
                "source": "job", "notes": "No attendance recorded",
                "marked_by": None, "created_at": now, "updated_at": now,
            }},
            upsert=True,
        )
        marked += 1

    return {"date": target_day.isoformat(), "considered": len(employees), "marked": marked}


JOBS = {
    "documents.expiry_reminders": job_document_expiry_reminders,
    "email.retry_failed": job_email_retry,
    "attendance.mark_absent": job_mark_absent,
}


# ── Runner endpoint ───────────────────────────────────────────────────────────

@router.post("/run/{job_name}")
async def run_job(
    job_name: str,
    x_job_token: str | None = Header(None, alias="X-Job-Token"),
    db=Depends(get_db),
):
    """Run one job. Called by external cron, authenticated by a shared token.

    Deliberately NOT protected by require_permission: cron has no user session.
    An unset JOB_RUNNER_TOKEN disables the endpoint entirely rather than leaving
    it open — failing closed, since this route triggers side effects.
    """
    if not settings.JOB_RUNNER_TOKEN:
        raise HTTPException(status_code=503, detail="Job runner is disabled (JOB_RUNNER_TOKEN unset).")

    import secrets
    if not x_job_token or not secrets.compare_digest(x_job_token, settings.JOB_RUNNER_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid job token.")

    job = JOBS.get(job_name)
    if not job:
        raise HTTPException(status_code=404, detail=f"Unknown job. Available: {', '.join(sorted(JOBS))}")

    if not await acquire_lease(db, job_name):
        # Not an error: with 4 workers and overlapping cron schedules this is the
        # expected outcome for all but one caller.
        return {"job": job_name, "status": "skipped", "reason": "another run holds the lease"}

    started = datetime.now(timezone.utc)
    try:
        result = await job(db)
        status = "ok"
    except Exception as exc:
        logger.exception("Job %s failed", job_name)
        result, status = {"error": str(exc)[:300]}, "error"

    duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
    payload = {"job": job_name, "status": status, "duration_ms": duration_ms, "result": result}
    await release_lease(db, job_name, payload)
    return payload


@router.get("/status")
async def jobs_status(
    current_user=Depends(require_permission("audit.read")),
    db=Depends(get_db),
):
    """Last run of every registered job — so a silently dead cron is visible."""
    leases = {l["_id"]: l async for l in db.hr_job_leases.find({})}
    now = datetime.now(timezone.utc)
    return {
        "jobs": [
            {
                "name": name,
                "running": bool(
                    leases.get(name, {}).get("locked_until")
                    and leases[name]["locked_until"].replace(tzinfo=timezone.utc) > now
                ),
                "last_finished_at": (
                    leases[name]["last_finished_at"].isoformat()
                    if leases.get(name, {}).get("last_finished_at") else None
                ),
                "last_result": leases.get(name, {}).get("last_result"),
            }
            for name in sorted(JOBS)
        ],
        "runner_enabled": bool(settings.JOB_RUNNER_TOKEN),
    }
