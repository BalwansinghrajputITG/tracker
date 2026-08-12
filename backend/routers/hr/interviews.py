"""
Interview scheduling and panel feedback (hr.md §8).

An interviewer sees the interview but NOT their colleagues' scores until they
have submitted their own. That is an anchoring-bias control, not a permission
technicality: a panel whose members read each other's ratings first stops being
a panel.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from database import get_db
from middleware.auth import get_current_user
from middleware.permissions import has_permission, require_permission
from models.hr.interview import (
    POSITIVE_RECOMMENDATIONS, FeedbackCreate, InterviewCreate, InterviewUpdate,
)
from routers.hr.common import aware, iso, oid, parse_date, user_map, utcnow
from services.audit_service import audit
from services.notification_service import notify_users

router = APIRouter()


def _serialize(interview: dict, *, users: dict, candidates: dict, jobs: dict,
               feedback_counts: dict, viewer_id: str) -> dict:
    candidate = candidates.get(str(interview.get("candidate_id")), {})
    job = jobs.get(str(interview.get("job_id")), {})
    interviewer_ids = interview.get("interviewer_ids", [])
    submitted = feedback_counts.get(str(interview["_id"]), {})

    return {
        "id":              str(interview["_id"]),
        "application_id":  str(interview["application_id"]),
        "candidate_id":    str(interview["candidate_id"]),
        "candidate_name":  candidate.get("full_name", ""),
        "job_id":          str(interview["job_id"]),
        "job_title":       job.get("title", ""),
        "round":           interview.get("round", ""),
        "round_number":    interview.get("round_number", 1),
        "interviewers":    [
            {"user_id": str(i), "full_name": users.get(str(i), {}).get("full_name", ""),
             "submitted": str(i) in submitted.get("ids", set())}
            for i in interviewer_ids
        ],
        "scheduled_at":    iso(interview.get("scheduled_at")),
        "duration_minutes": interview.get("duration_minutes", 60),
        "mode":            interview.get("mode", "video"),
        "meeting_url":     interview.get("meeting_url", ""),
        "location":        interview.get("location", ""),
        "status":          interview.get("status", "scheduled"),
        "notes":           interview.get("notes", ""),
        "feedback_submitted": submitted.get("count", 0),
        "feedback_expected":  len(interviewer_ids),
        "is_interviewer":  viewer_id in {str(i) for i in interviewer_ids},
    }


async def _feedback_counts(db, interview_ids) -> dict:
    """Who has submitted, per interview — one query for the whole page."""
    out: dict[str, dict] = {}
    async for f in db.hr_interview_feedback.find(
        {"interview_id": {"$in": interview_ids}}, {"interview_id": 1, "interviewer_id": 1}
    ):
        entry = out.setdefault(str(f["interview_id"]), {"count": 0, "ids": set()})
        entry["count"] += 1
        entry["ids"].add(str(f["interviewer_id"]))
    return out


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_interviews(
    application_id: str | None = Query(None),
    candidate_id: str | None = Query(None),
    status: str | None = Query(None),
    mine: bool = Query(False, description="Only interviews the caller is on the panel for"),
    upcoming: bool = Query(False),
    page: int = Query(1, ge=1),
    limit: int = Query(100, le=200),
    current_user=Depends(require_permission("interview.read")),
    db=Depends(get_db),
):
    query: dict = {}
    if application_id:
        query["application_id"] = oid(application_id, "application_id")
    if candidate_id:
        query["candidate_id"] = oid(candidate_id, "candidate_id")
    if status:
        query["status"] = status
    if mine:
        query["interviewer_ids"] = current_user["_id"]
    if upcoming:
        query["scheduled_at"] = {"$gte": utcnow()}
        query.setdefault("status", "scheduled")

    skip = (page - 1) * limit
    interviews = await db.hr_interviews.find(query).sort("scheduled_at", 1).skip(skip).limit(limit).to_list(limit)
    total = await db.hr_interviews.count_documents(query)

    users = await user_map(db, {i for iv in interviews for i in iv.get("interviewer_ids", [])})
    candidates = {str(c["_id"]): c async for c in db.hr_candidates.find(
        {"_id": {"$in": [i["candidate_id"] for i in interviews]}}
    )}
    jobs = {str(j["_id"]): j async for j in db.hr_jobs.find(
        {"_id": {"$in": [i["job_id"] for i in interviews]}}
    )}
    counts = await _feedback_counts(db, [i["_id"] for i in interviews])

    return {
        "interviews": [
            _serialize(i, users=users, candidates=candidates, jobs=jobs,
                       feedback_counts=counts, viewer_id=str(current_user["_id"]))
            for i in interviews
        ],
        "total": total, "page": page, "limit": limit,
    }


# ── Schedule ──────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def schedule_interview(
    body: InterviewCreate,
    request: Request,
    current_user=Depends(require_permission("interview.schedule")),
    db=Depends(get_db),
):
    app_oid = oid(body.application_id, "application_id")
    application = await db.hr_applications.find_one({"_id": app_oid})
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.get("status") != "active":
        raise HTTPException(status_code=400, detail=f"This application is {application.get('status')}.")

    scheduled_at = parse_date(body.scheduled_at, "scheduled_at")
    if scheduled_at and scheduled_at < utcnow() - timedelta(hours=1):
        raise HTTPException(status_code=400, detail="Interviews cannot be scheduled in the past.")

    interviewer_ids = [oid(i, "interviewer_ids") for i in body.interviewer_ids]
    found = await db.users.count_documents({"_id": {"$in": interviewer_ids}, "is_active": True})
    if found != len(set(interviewer_ids)):
        raise HTTPException(status_code=400, detail="One or more interviewers were not found.")

    prior_rounds = await db.hr_interviews.count_documents({"application_id": app_oid})
    now = utcnow()
    doc = {
        "application_id":   app_oid,
        "candidate_id":     application["candidate_id"],
        "job_id":           application["job_id"],
        "round":            body.round,
        "round_number":     prior_rounds + 1,
        "interviewer_ids":  interviewer_ids,
        "scheduled_at":     scheduled_at,
        "duration_minutes": body.duration_minutes,
        "mode":             body.mode,
        "meeting_url":      body.meeting_url,
        "location":         body.location,
        "status":           "scheduled",
        "notes":            body.notes,
        "scheduled_by":     current_user["_id"],
        "created_at":       now,
        "updated_at":       now,
    }
    result = await db.hr_interviews.insert_one(doc)

    # Advance the pipeline as a side effect of scheduling — recruiters otherwise
    # have to remember to do it, and the funnel silently under-reports.
    if application.get("stage") in ("applied", "screening", "shortlisted"):
        await db.hr_applications.update_one(
            {"_id": app_oid},
            {"$set": {"stage": "interview", "updated_at": now},
             "$push": {"stage_history": {"stage": "interview", "at": now,
                                         "by": current_user["_id"],
                                         "note": f"Scheduled {body.round}"}}},
        )

    candidate = await db.hr_candidates.find_one({"_id": application["candidate_id"]}, {"full_name": 1})
    await notify_users(
        db=db, user_ids=interviewer_ids,
        notification_type="interview_scheduled",
        title=f"Interview scheduled: {candidate.get('full_name', 'candidate')}",
        body=f"{body.round.replace('_', ' ').title()} on "
             f"{scheduled_at.strftime('%d %b at %H:%M UTC') if scheduled_at else 'TBD'}.",
        reference_id=str(result.inserted_id), reference_type="interview",
        link="/hr/recruitment?tab=interviews", email=True,
    )

    await audit(db, "interview.scheduled", current_user, "interview", str(result.inserted_id),
                after={"round": body.round, "scheduled_at": iso(scheduled_at),
                       "interviewers": len(interviewer_ids)},
                request=request, subject_user_id=None)

    return {"interview_id": str(result.inserted_id), "round_number": prior_rounds + 1,
            "message": "Interview scheduled."}


@router.put("/{interview_id}")
async def update_interview(
    interview_id: str,
    body: InterviewUpdate,
    request: Request,
    current_user=Depends(require_permission("interview.update")),
    db=Depends(get_db),
):
    int_oid = oid(interview_id, "interview_id")
    interview = await db.hr_interviews.find_one({"_id": int_oid})
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    updates: dict = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if key == "scheduled_at":
            updates[key] = parse_date(value, key)
        elif key == "interviewer_ids":
            updates[key] = [oid(i, "interviewer_ids") for i in value]
        else:
            updates[key] = value

    if not updates:
        return {"message": "Nothing to update."}

    before = {k: interview.get(k) for k in updates}
    updates["updated_at"] = utcnow()
    await db.hr_interviews.update_one({"_id": int_oid}, {"$set": updates})

    # A moved interview is only useful if the panel is told.
    if "scheduled_at" in updates:
        await notify_users(
            db=db, user_ids=interview.get("interviewer_ids", []),
            notification_type="interview_rescheduled",
            title="Interview rescheduled",
            body=f"New time: {updates['scheduled_at'].strftime('%d %b at %H:%M UTC')}.",
            reference_id=interview_id, reference_type="interview",
            link="/hr/recruitment?tab=interviews", email=True,
        )

    await audit(db, "interview.updated", current_user, "interview", interview_id,
                before=before, after=updates, request=request)
    return {"message": "Interview updated."}


# ── Feedback (§8) ─────────────────────────────────────────────────────────────

@router.get("/{interview_id}/feedback")
async def get_feedback(
    interview_id: str,
    current_user=Depends(require_permission("feedback.read")),
    db=Depends(get_db),
):
    """Panel feedback.

    An interviewer who has not submitted sees only their own (empty) slot —
    reading colleagues' scores first would anchor their own.
    """
    int_oid = oid(interview_id, "interview_id")
    interview = await db.hr_interviews.find_one({"_id": int_oid})
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    all_feedback = await db.hr_interview_feedback.find({"interview_id": int_oid}).to_list(20)
    is_panel = current_user["_id"] in interview.get("interviewer_ids", [])
    has_submitted = any(f["interviewer_id"] == current_user["_id"] for f in all_feedback)
    # Anyone who can see all feedback anyway (HR, hiring manager) is unaffected.
    can_see_all = has_permission(current_user, "candidate.update") or not is_panel or has_submitted

    visible = all_feedback if can_see_all else [
        f for f in all_feedback if f["interviewer_id"] == current_user["_id"]
    ]

    users = await user_map(db, {f["interviewer_id"] for f in all_feedback})
    scores = [f.get("overall_score", 0) for f in all_feedback]
    positives = sum(1 for f in all_feedback if f.get("recommendation") in POSITIVE_RECOMMENDATIONS)

    return {
        "feedback": [{
            "id":                str(f["_id"]),
            "interviewer_id":    str(f["interviewer_id"]),
            "interviewer_name":  users.get(str(f["interviewer_id"]), {}).get("full_name", ""),
            "technical_score":   f.get("technical_score"),
            "communication_score": f.get("communication_score"),
            "problem_solving_score": f.get("problem_solving_score"),
            "culture_fit_score": f.get("culture_fit_score"),
            "overall_score":     f.get("overall_score"),
            "recommendation":    f.get("recommendation"),
            "strengths":         f.get("strengths", ""),
            "concerns":          f.get("concerns", ""),
            "comments":          f.get("comments", ""),
            "submitted_at":      iso(f.get("submitted_at")),
        } for f in visible],
        "submitted_count": len(all_feedback),
        "expected_count":  len(interview.get("interviewer_ids", [])),
        "average_score":   round(sum(scores) / len(scores), 2) if scores else None,
        "positive_recommendations": positives,
        "withheld": not can_see_all,
        "you_submitted": has_submitted,
    }


@router.post("/{interview_id}/feedback", status_code=201)
async def submit_feedback(
    interview_id: str,
    body: FeedbackCreate,
    request: Request,
    current_user=Depends(require_permission("feedback.submit")),
    db=Depends(get_db),
):
    int_oid = oid(interview_id, "interview_id")
    interview = await db.hr_interviews.find_one({"_id": int_oid})
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if current_user["_id"] not in interview.get("interviewer_ids", []):
        raise HTTPException(status_code=403, detail="You are not on this interview panel.")

    if await db.hr_interview_feedback.find_one(
        {"interview_id": int_oid, "interviewer_id": current_user["_id"]}
    ):
        raise HTTPException(status_code=400, detail="You have already submitted feedback for this interview.")

    overall = round(
        (body.technical_score + body.communication_score
         + body.problem_solving_score + body.culture_fit_score) / 4, 2
    )
    now = utcnow()
    result = await db.hr_interview_feedback.insert_one({
        "interview_id":   int_oid,
        "interviewer_id": current_user["_id"],
        **body.model_dump(),
        "overall_score":  overall,
        "submitted_at":   now,
    })

    # Once the whole panel has reported, the interview is done — inferring it
    # here saves a manual status change that would otherwise be forgotten.
    submitted = await db.hr_interview_feedback.count_documents({"interview_id": int_oid})
    if submitted >= len(interview.get("interviewer_ids", [])):
        await db.hr_interviews.update_one(
            {"_id": int_oid}, {"$set": {"status": "completed", "updated_at": now}}
        )

    await audit(db, "feedback.submitted", current_user, "interview_feedback", str(result.inserted_id),
                after={"overall_score": overall, "recommendation": body.recommendation},
                request=request, meta={"interview_id": interview_id})

    return {"feedback_id": str(result.inserted_id), "overall_score": overall,
            "message": "Feedback submitted."}
