"""
Jobs, candidates and the application pipeline (hr.md §6, §7).

Salary ranges on a job are gated on salary.read, matching hr_compensation and
hr_offers — a posted band plus a title is close enough to individual pay that
gating two of the three would be theatre.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from database import get_db
from middleware.permissions import has_permission, require_permission
from models.hr.recruitment import (
    APPLICATION_STATUSES, PIPELINE_STAGES, ApplicationCreate, ApplicationReject,
    CandidateCreate, CandidateUpdate, JobCreate, JobUpdate, StageMove,
)
from routers.hr.common import iso, name_map, oid, parse_date, user_map, utcnow
from services.audit_service import audit

router = APIRouter()


def _serialize_job(job: dict, *, departments: dict, users: dict, counts: dict, reveal_salary: bool) -> dict:
    out = {
        "id":               str(job["_id"]),
        "title":            job.get("title", ""),
        "department_id":    str(job["department_id"]) if job.get("department_id") else None,
        "department_name":  departments.get(str(job.get("department_id")), ""),
        "designation_id":   str(job["designation_id"]) if job.get("designation_id") else None,
        "location":         job.get("location", ""),
        "employment_type":  job.get("employment_type", "full_time"),
        "experience_min":   job.get("experience_min", 0),
        "experience_max":   job.get("experience_max", 0),
        "skills":           job.get("skills", []),
        "description":      job.get("description", ""),
        "hiring_manager_id": str(job["hiring_manager_id"]) if job.get("hiring_manager_id") else None,
        "hiring_manager_name": users.get(str(job.get("hiring_manager_id")), {}).get("full_name", ""),
        "recruiter_name":   users.get(str(job.get("recruiter_id")), {}).get("full_name", ""),
        "openings_count":   job.get("openings_count", 1),
        "filled_count":     job.get("filled_count", 0),
        "status":           job.get("status", "draft"),
        "posted_at":        iso(job.get("posted_at")),
        "closes_at":        iso(job.get("closes_at")),
        "applicant_count":  counts.get(str(job["_id"]), 0),
        "created_at":       iso(job.get("created_at")),
    }
    # Omitted entirely rather than zeroed, so "no band set" and "not allowed to
    # see the band" cannot be confused.
    if reveal_salary:
        out["salary_min"] = job.get("salary_min", 0)
        out["salary_max"] = job.get("salary_max", 0)
        out["currency"] = job.get("currency", "INR")
    return out


def _serialize_candidate(c: dict, *, users: dict, reveal_salary: bool) -> dict:
    out = {
        "id":              str(c["_id"]),
        "full_name":       c.get("full_name", ""),
        "email":           c.get("email", ""),
        "phone":           c.get("phone", ""),
        "linkedin":        c.get("linkedin", ""),
        "portfolio":       c.get("portfolio", ""),
        "current_company": c.get("current_company", ""),
        "current_title":   c.get("current_title", ""),
        "total_experience_years": c.get("total_experience_years", 0),
        "notice_period_days": c.get("notice_period_days"),
        "skills":          c.get("skills", []),
        "source":          c.get("source", "other"),
        "referred_by_name": users.get(str(c.get("referred_by")), {}).get("full_name", ""),
        "notes":           c.get("notes", ""),
        "converted_user_id": str(c["converted_user_id"]) if c.get("converted_user_id") else None,
        "created_at":      iso(c.get("created_at")),
    }
    if reveal_salary:
        out["expected_salary"] = c.get("expected_salary")
    return out


def _serialize_application(app: dict, *, candidates: dict, jobs: dict, users: dict) -> dict:
    candidate = candidates.get(str(app.get("candidate_id")), {})
    job = jobs.get(str(app.get("job_id")), {})
    stage = app.get("stage", "applied")
    return {
        "id":            str(app["_id"]),
        "candidate_id":  str(app["candidate_id"]),
        "candidate_name": candidate.get("full_name", ""),
        "candidate_email": candidate.get("email", ""),
        "current_title": candidate.get("current_title", ""),
        "job_id":        str(app["job_id"]),
        "job_title":     job.get("title", ""),
        "stage":         stage,
        "stage_index":   PIPELINE_STAGES.index(stage) if stage in PIPELINE_STAGES else 0,
        "status":        app.get("status", "active"),
        "rejection_reason": app.get("rejection_reason", ""),
        "applied_at":    iso(app.get("applied_at")),
        "updated_at":    iso(app.get("updated_at")),
        "stage_history": [
            {"stage": h.get("stage"), "at": iso(h.get("at")),
             "by": users.get(str(h.get("by")), {}).get("full_name", ""),
             "note": h.get("note", "")}
            for h in app.get("stage_history", [])
        ],
        "days_in_pipeline": (
            (utcnow() - app["applied_at"].replace(tzinfo=timezone.utc)).days
            if app.get("applied_at") else 0
        ),
    }


async def _applicant_counts(db) -> dict:
    """Applicants per job in one aggregation, not one query per row."""
    pipeline = [
        {"$match": {"status": {"$ne": "withdrawn"}}},
        {"$group": {"_id": "$job_id", "count": {"$sum": 1}}},
    ]
    return {str(r["_id"]): r["count"] async for r in db.hr_applications.aggregate(pipeline)}


# ── Jobs ──────────────────────────────────────────────────────────────────────

@router.get("/jobs")
async def list_jobs(
    status: str | None = Query(None),
    department_id: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user=Depends(require_permission("job_position.read")),
    db=Depends(get_db),
):
    query: dict = {}
    if status:
        query["status"] = status
    if department_id:
        query["department_id"] = oid(department_id, "department_id")
    if search:
        query["title"] = {"$regex": re.escape(search.strip()), "$options": "i"}

    skip = (page - 1) * limit
    jobs = await db.hr_jobs.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.hr_jobs.count_documents(query)

    departments = await name_map(db, "departments", {j.get("department_id") for j in jobs}, "name")
    users = await user_map(db, {j.get("hiring_manager_id") for j in jobs} | {j.get("recruiter_id") for j in jobs})
    counts = await _applicant_counts(db)
    reveal = has_permission(current_user, "salary.read")

    return {
        "jobs": [_serialize_job(j, departments=departments, users=users, counts=counts, reveal_salary=reveal)
                 for j in jobs],
        "total": total, "page": page, "limit": limit,
        "open_positions": sum(
            max(0, j.get("openings_count", 1) - j.get("filled_count", 0))
            for j in jobs if j.get("status") == "open"
        ),
    }


@router.post("/jobs", status_code=201)
async def create_job(
    body: JobCreate,
    request: Request,
    current_user=Depends(require_permission("job_position.create")),
    db=Depends(get_db),
):
    if body.experience_max and body.experience_max < body.experience_min:
        raise HTTPException(status_code=400, detail="Maximum experience cannot be below the minimum.")
    if body.salary_max and body.salary_max < body.salary_min:
        raise HTTPException(status_code=400, detail="Maximum salary cannot be below the minimum.")

    now = utcnow()
    doc = {
        **body.model_dump(exclude={"department_id", "designation_id", "hiring_manager_id",
                                   "recruiter_id", "closes_at"}),
        "department_id":     oid(body.department_id, "department_id") if body.department_id else None,
        "designation_id":    oid(body.designation_id, "designation_id") if body.designation_id else None,
        "hiring_manager_id": oid(body.hiring_manager_id, "hiring_manager_id") if body.hiring_manager_id else None,
        "recruiter_id":      oid(body.recruiter_id, "recruiter_id") if body.recruiter_id else current_user["_id"],
        "closes_at":         parse_date(body.closes_at, "closes_at"),
        "filled_count":      0,
        "status":            "open",
        "posted_at":         now,
        "created_by":        current_user["_id"],
        "created_at":        now,
        "updated_at":        now,
    }
    result = await db.hr_jobs.insert_one(doc)
    await audit(db, "job.created", current_user, "job", str(result.inserted_id),
                after={"title": body.title, "openings": body.openings_count}, request=request)
    return {"job_id": str(result.inserted_id), "message": "Job opening created."}


@router.put("/jobs/{job_id}")
async def update_job(
    job_id: str,
    body: JobUpdate,
    request: Request,
    current_user=Depends(require_permission("job_position.update")),
    db=Depends(get_db),
):
    job_oid = oid(job_id, "job_id")
    job = await db.hr_jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    updates = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if key in ("department_id", "designation_id", "hiring_manager_id", "recruiter_id"):
            updates[key] = oid(value, key) if value else None
        elif key == "closes_at":
            updates[key] = parse_date(value, key)
        else:
            updates[key] = value

    if not updates:
        return {"message": "Nothing to update."}

    before = {k: job.get(k) for k in updates}
    updates["updated_at"] = utcnow()
    await db.hr_jobs.update_one({"_id": job_oid}, {"$set": updates})
    await audit(db, "job.updated", current_user, "job", job_id,
                before=before, after=updates, request=request)
    return {"message": "Job updated."}


# ── Candidates ────────────────────────────────────────────────────────────────

@router.get("/candidates")
async def list_candidates(
    search: str | None = Query(None),
    source: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user=Depends(require_permission("candidate.read")),
    db=Depends(get_db),
):
    query: dict = {}
    if source:
        query["source"] = source
    if search:
        pattern = re.escape(search.strip())
        query["$or"] = [
            {"full_name": {"$regex": pattern, "$options": "i"}},
            {"email": {"$regex": pattern, "$options": "i"}},
            {"skills": {"$regex": pattern, "$options": "i"}},
            {"current_company": {"$regex": pattern, "$options": "i"}},
        ]

    skip = (page - 1) * limit
    candidates = await db.hr_candidates.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.hr_candidates.count_documents(query)
    users = await user_map(db, {c.get("referred_by") for c in candidates})
    reveal = has_permission(current_user, "salary.read")

    return {
        "candidates": [_serialize_candidate(c, users=users, reveal_salary=reveal) for c in candidates],
        "total": total, "page": page, "limit": limit,
    }


@router.get("/candidates/{candidate_id}")
async def get_candidate(
    candidate_id: str,
    current_user=Depends(require_permission("candidate.read")),
    db=Depends(get_db),
):
    """Candidate with their full application history (§7)."""
    cand_oid = oid(candidate_id, "candidate_id")
    candidate = await db.hr_candidates.find_one({"_id": cand_oid})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    applications = await db.hr_applications.find({"candidate_id": cand_oid}).sort("applied_at", -1).to_list(50)
    jobs = {str(j["_id"]): j async for j in db.hr_jobs.find(
        {"_id": {"$in": [a["job_id"] for a in applications]}}
    )}
    history_users = {h.get("by") for a in applications for h in a.get("stage_history", [])}
    users = await user_map(db, history_users | {candidate.get("referred_by")})
    candidates_map = {str(candidate["_id"]): candidate}

    return {
        **_serialize_candidate(candidate, users=users,
                               reveal_salary=has_permission(current_user, "salary.read")),
        "applications": [
            _serialize_application(a, candidates=candidates_map, jobs=jobs, users=users)
            for a in applications
        ],
    }


@router.post("/candidates", status_code=201)
async def create_candidate(
    body: CandidateCreate,
    request: Request,
    current_user=Depends(require_permission("candidate.create")),
    db=Depends(get_db),
):
    """Add a candidate, optionally applying them to a job in the same step."""
    existing = await db.hr_candidates.find_one({"email": body.email})
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A candidate with that email already exists ({existing.get('full_name')}).",
        )

    now = utcnow()
    doc = {
        **body.model_dump(exclude={"referred_by", "job_id"}),
        "referred_by":       oid(body.referred_by, "referred_by") if body.referred_by else None,
        "converted_user_id": None,
        "created_by":        current_user["_id"],
        "created_at":        now,
        "updated_at":        now,
    }
    result = await db.hr_candidates.insert_one(doc)

    application_id = None
    if body.job_id:
        application_id = await _create_application(
            db, result.inserted_id, oid(body.job_id, "job_id"), current_user,
        )

    await audit(db, "candidate.created", current_user, "candidate", str(result.inserted_id),
                after={"full_name": body.full_name, "email": body.email, "source": body.source},
                request=request)

    return {
        "candidate_id": str(result.inserted_id),
        "application_id": str(application_id) if application_id else None,
        "message": "Candidate added.",
    }


@router.put("/candidates/{candidate_id}")
async def update_candidate(
    candidate_id: str,
    body: CandidateUpdate,
    request: Request,
    current_user=Depends(require_permission("candidate.update")),
    db=Depends(get_db),
):
    cand_oid = oid(candidate_id, "candidate_id")
    candidate = await db.hr_candidates.find_one({"_id": cand_oid})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        return {"message": "Nothing to update."}

    before = {k: candidate.get(k) for k in updates}
    updates["updated_at"] = utcnow()
    await db.hr_candidates.update_one({"_id": cand_oid}, {"$set": updates})
    await audit(db, "candidate.updated", current_user, "candidate", candidate_id,
                before=before, after=updates, request=request)
    return {"message": "Candidate updated."}


# ── Applications / pipeline ───────────────────────────────────────────────────

async def _create_application(db, candidate_id, job_id, current_user) -> object:
    """Shared by POST /candidates and POST /applications."""
    job = await db.hr_jobs.find_one({"_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") not in ("open", "draft"):
        raise HTTPException(status_code=400, detail=f"This job is {job.get('status')} and not accepting applicants.")

    if await db.hr_applications.find_one({"candidate_id": candidate_id, "job_id": job_id}):
        raise HTTPException(status_code=400, detail="This candidate has already applied to that job.")

    now = utcnow()
    result = await db.hr_applications.insert_one({
        "candidate_id": candidate_id,
        "job_id": job_id,
        "stage": "applied",
        "status": "active",
        # Seeded with the first entry so the funnel has a start point without a
        # special case for "applied".
        "stage_history": [{"stage": "applied", "at": now, "by": current_user["_id"], "note": ""}],
        "rejection_reason": "",
        "rating": None,
        "applied_at": now,
        "updated_at": now,
    })
    return result.inserted_id


@router.get("/applications")
async def list_applications(
    job_id: str | None = Query(None),
    candidate_id: str | None = Query(None),
    stage: str | None = Query(None),
    status: str | None = Query("active"),
    page: int = Query(1, ge=1),
    limit: int = Query(200, le=500),
    current_user=Depends(require_permission("application.read")),
    db=Depends(get_db),
):
    """The pipeline. Defaults to active applications — the kanban board's data."""
    query: dict = {}
    if job_id:
        query["job_id"] = oid(job_id, "job_id")
    if candidate_id:
        query["candidate_id"] = oid(candidate_id, "candidate_id")
    if stage:
        query["stage"] = stage
    if status and status != "all":
        query["status"] = status

    skip = (page - 1) * limit
    applications = await db.hr_applications.find(query).sort("updated_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.hr_applications.count_documents(query)

    candidates = {str(c["_id"]): c async for c in db.hr_candidates.find(
        {"_id": {"$in": [a["candidate_id"] for a in applications]}}
    )}
    jobs = {str(j["_id"]): j async for j in db.hr_jobs.find(
        {"_id": {"$in": [a["job_id"] for a in applications]}}
    )}
    users = await user_map(db, {h.get("by") for a in applications for h in a.get("stage_history", [])})

    serialized = [_serialize_application(a, candidates=candidates, jobs=jobs, users=users)
                  for a in applications]

    # Counts per stage drive the kanban column headers; deriving them here means
    # the board never disagrees with its own contents.
    by_stage: dict[str, int] = {s: 0 for s in PIPELINE_STAGES}
    for a in serialized:
        by_stage[a["stage"]] = by_stage.get(a["stage"], 0) + 1

    return {"applications": serialized, "total": total, "page": page, "limit": limit,
            "by_stage": by_stage, "stages": list(PIPELINE_STAGES)}


@router.post("/applications", status_code=201)
async def create_application(
    body: ApplicationCreate,
    request: Request,
    current_user=Depends(require_permission("application.create")),
    db=Depends(get_db),
):
    application_id = await _create_application(
        db, oid(body.candidate_id, "candidate_id"), oid(body.job_id, "job_id"), current_user,
    )
    await audit(db, "application.created", current_user, "application", str(application_id),
                after={"candidate_id": body.candidate_id, "job_id": body.job_id}, request=request)
    return {"application_id": str(application_id), "message": "Application created."}


@router.post("/applications/{application_id}/stage")
async def move_stage(
    application_id: str,
    body: StageMove,
    request: Request,
    current_user=Depends(require_permission("application.update")),
    db=Depends(get_db),
):
    """Move an application through the §6 pipeline, recording the transition."""
    app_oid = oid(application_id, "application_id")
    application = await db.hr_applications.find_one({"_id": app_oid})
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.get("status") != "active":
        raise HTTPException(
            status_code=400,
            detail=f"This application is {application.get('status')} and cannot be moved.",
        )

    current_stage = application.get("stage", "applied")
    if body.stage == current_stage:
        return {"message": "Already at that stage.", "stage": current_stage}

    # "hired" is reached only by accepting an offer, which creates the employee
    # record. Allowing it here would produce a hired candidate with no account.
    if body.stage == "hired":
        raise HTTPException(
            status_code=400,
            detail="A candidate becomes hired by accepting an offer, not by a manual stage move.",
        )

    now = utcnow()
    await db.hr_applications.update_one(
        {"_id": app_oid},
        {"$set": {"stage": body.stage, "updated_at": now},
         "$push": {"stage_history": {"stage": body.stage, "at": now,
                                     "by": current_user["_id"], "note": body.note}}},
    )
    await audit(db, "application.stage_changed", current_user, "application", application_id,
                before={"stage": current_stage}, after={"stage": body.stage}, request=request)
    return {"message": f"Moved to {body.stage.replace('_', ' ')}.", "stage": body.stage}


@router.post("/applications/{application_id}/reject")
async def reject_application(
    application_id: str,
    body: ApplicationReject,
    request: Request,
    current_user=Depends(require_permission("application.update")),
    db=Depends(get_db),
):
    app_oid = oid(application_id, "application_id")
    application = await db.hr_applications.find_one({"_id": app_oid})
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.get("status") != "active":
        raise HTTPException(status_code=400, detail=f"This application is already {application.get('status')}.")

    now = utcnow()
    await db.hr_applications.update_one(
        {"_id": app_oid},
        {"$set": {"status": "rejected", "rejection_reason": body.reason, "updated_at": now},
         "$push": {"stage_history": {"stage": application.get("stage"), "at": now,
                                     "by": current_user["_id"], "note": f"Rejected: {body.reason}"}}},
    )
    await audit(db, "application.rejected", current_user, "application", application_id,
                before={"status": "active"}, after={"status": "rejected", "reason": body.reason},
                request=request)
    return {"message": "Application rejected."}
