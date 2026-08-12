"""
Performance: goals (hr.md §17) and review cycles (§18).

Goals live in the EXISTING `personal_targets` collection — see
models/hr/performance.py for why. That means a goal set here appears in the
employee's /personal workspace, and one they set for themselves appears here.
One record, two doors.

The composite review score combines the objective signal from
routers/personal._compute_evaluation with human ratings. There is deliberately
no third scoring engine: `personal.py` already has one and `analytics.py` has
another, and adding a third would guarantee three different answers to
"how is this person doing".
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from database import get_db
from middleware.auth import get_current_user
from middleware.permissions import has_permission, require_permission
from models.hr.performance import (
    COMPOSITE_WEIGHTS, CYCLE_STATUSES, RATING_DIMENSIONS, REVIEW_SECTIONS,
    CycleCreate, GoalCreate, GoalUpdate, ReviewSubmit,
)
from routers.hr.common import aware, iso, oid, parse_date, user_map, utcnow
from services.audit_service import audit
from services.notification_service import notify_users
from utils.team_scope import scoped_user_ids

router = APIRouter()


def _serialize_goal(goal: dict, *, users: dict) -> dict:
    target = goal.get("target_value", 0) or 0
    current = goal.get("current_value", 0) or 0
    return {
        "id":            str(goal["_id"]),
        "user_id":       str(goal["user_id"]),
        "employee_name": users.get(str(goal.get("user_id")), {}).get("full_name", ""),
        "title":         goal.get("title", ""),
        "description":   goal.get("description", ""),
        "kpi":           goal.get("kpi", ""),
        "target_value":  target,
        "current_value": current,
        "unit":          goal.get("unit", ""),
        "progress":      round(min(100, (current / target * 100) if target else 0)),
        "weight":        goal.get("weight", 0),
        "deadline":      iso(goal.get("deadline")) if isinstance(goal.get("deadline"), datetime) else goal.get("deadline"),
        "completed":     goal.get("completed", False),
        "cycle_id":      str(goal["cycle_id"]) if goal.get("cycle_id") else None,
        "assigned_by":   users.get(str(goal.get("assigned_by")), {}).get("full_name", ""),
        "manager_approved": goal.get("manager_approved", False),
        # Goals created through /personal/targets have no visibility field and
        # are private by default — the HR view must not surface them as though
        # the employee had shared them.
        "visibility":    goal.get("visibility", "private"),
    }


async def _goal_completion(db, user_id, cycle_id=None) -> float | None:
    """Weighted completion across a person's shared goals, as a percentage.

    Weighted rather than a plain average: §17 gives each goal a weight precisely
    so that finishing three trivial goals does not outrank missing the one that
    mattered. Unweighted goals fall back to equal weighting.
    """
    base: dict = {"user_id": user_id, "visibility": "shared"}
    goals: list = []
    if cycle_id:
        goals = await db.personal_targets.find({**base, "cycle_id": cycle_id}).to_list(200)
    # Fall back to all shared goals when none are linked to the cycle. Without
    # this, a manager who assigns goals and then opens a cycle sees goal
    # completion silently read as "no data" — the common case, since goals are
    # usually set before the cycle exists.
    if not goals:
        goals = await db.personal_targets.find(base).to_list(200)
    if not goals:
        return None

    total_weight = sum(g.get("weight", 0) or 0 for g in goals)
    if total_weight <= 0:
        weights = [1.0] * len(goals)
        total_weight = float(len(goals))
    else:
        weights = [g.get("weight", 0) or 0 for g in goals]

    achieved = 0.0
    for goal, weight in zip(goals, weights):
        target = goal.get("target_value", 0) or 0
        current = goal.get("current_value", 0) or 0
        progress = min(1.0, (current / target) if target else 0.0)
        achieved += progress * weight
    return round(100 * achieved / total_weight, 1)


# ── Goals (§17) ───────────────────────────────────────────────────────────────

@router.get("/goals")
async def list_goals(
    user_id: str | None = Query(None),
    cycle_id: str | None = Query(None),
    current_user=Depends(require_permission("goal.read")),
    db=Depends(get_db),
):
    """Goals for the caller, or for someone they manage."""
    if user_id:
        target = oid(user_id, "user_id")
        allowed = await scoped_user_ids(db, current_user)
        if (target != current_user["_id"]
                and not has_permission(current_user, "performance.read_all")
                and (allowed is not None and target not in allowed)):
            raise HTTPException(status_code=403, detail="You cannot view this employee's goals.")
        query: dict = {"user_id": target}
        # Someone else's private, self-set goals are not the manager's business.
        if target != current_user["_id"]:
            query["visibility"] = "shared"
    else:
        query = {"user_id": current_user["_id"]}

    if cycle_id:
        query["cycle_id"] = oid(cycle_id, "cycle_id")

    goals = await db.personal_targets.find(query).sort(
        [("completed", 1), ("deadline", 1), ("created_at", -1)]
    ).to_list(200)
    users = await user_map(db, {g.get("user_id") for g in goals} | {g.get("assigned_by") for g in goals})

    return {
        "goals": [_serialize_goal(g, users=users) for g in goals],
        "total": len(goals),
        "weighted_completion": await _goal_completion(
            db, oid(user_id, "user_id") if user_id else current_user["_id"],
            oid(cycle_id, "cycle_id") if cycle_id else None,
        ),
    }


@router.post("/goals", status_code=201)
async def create_goal(
    body: GoalCreate,
    request: Request,
    current_user=Depends(require_permission("goal.create")),
    db=Depends(get_db),
):
    """Assign a weighted goal (§17). Written into `personal_targets` so it also
    appears in the employee's own workspace."""
    target_user = oid(body.user_id, "user_id")

    allowed = await scoped_user_ids(db, current_user)
    if (target_user != current_user["_id"]
            and not has_permission(current_user, "performance.read_all")
            and (allowed is not None and target_user not in allowed)):
        raise HTTPException(status_code=403, detail="You cannot set goals for this employee.")

    now = utcnow()
    result = await db.personal_targets.insert_one({
        "user_id":       target_user,
        "title":         body.title,
        "description":   body.description,
        "target_value":  body.target_value,
        "current_value": 0.0,
        "unit":          body.unit,
        "deadline":      parse_date(body.deadline, "deadline"),
        "completed":     False,
        # HR fields — additive, so /personal/targets keeps working on this row.
        "kpi":              body.kpi,
        "weight":           body.weight,
        "cycle_id":         oid(body.cycle_id, "cycle_id") if body.cycle_id else None,
        "assigned_by":      current_user["_id"],
        "manager_approved": True,
        "visibility":       "shared",
        "created_at":    now,
        "updated_at":    now,
    })

    if target_user != current_user["_id"]:
        await notify_users(
            db=db, user_ids=[target_user],
            notification_type="goal_assigned",
            title=f"New goal: {body.title}",
            body=f"Target {body.target_value}{body.unit}"
                 + (f" by {body.deadline}" if body.deadline else "") + ".",
            reference_id=str(result.inserted_id), reference_type="goal",
            link="/hr/performance", email=True,
        )

    await audit(db, "goal.created", current_user, "goal", str(result.inserted_id),
                after={"title": body.title, "weight": body.weight,
                       "target_value": body.target_value},
                request=request, subject_user_id=target_user)

    return {"goal_id": str(result.inserted_id), "message": "Goal assigned."}


@router.put("/goals/{goal_id}")
async def update_goal(
    goal_id: str,
    body: GoalUpdate,
    request: Request,
    current_user=Depends(require_permission("goal.update")),
    db=Depends(get_db),
):
    """Update a goal. The owner may move progress; changing the weight or target
    needs goal.approve — otherwise an employee could lower their own bar."""
    goal_oid = oid(goal_id, "goal_id")
    goal = await db.personal_targets.find_one({"_id": goal_oid})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    is_owner = goal["user_id"] == current_user["_id"]
    can_manage = has_permission(current_user, "goal.approve")
    if not (is_owner or can_manage):
        raise HTTPException(status_code=403, detail="You cannot update this goal.")

    owner_editable = {"current_value"}
    updates: dict = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if not can_manage and key not in owner_editable:
            raise HTTPException(
                status_code=403,
                detail=f"Only a manager can change '{key}' on an assigned goal.",
            )
        updates[key] = parse_date(value, key) if key == "deadline" else value

    if not updates:
        return {"message": "Nothing to update."}

    # Same auto-complete rule as /personal/targets, so the two doors agree.
    current = updates.get("current_value", goal.get("current_value", 0))
    target = updates.get("target_value", goal.get("target_value", 1))
    if current >= target and "completed" not in updates:
        updates["completed"] = True

    before = {k: goal.get(k) for k in updates}
    updates["updated_at"] = utcnow()
    await db.personal_targets.update_one({"_id": goal_oid}, {"$set": updates})

    await audit(db, "goal.updated", current_user, "goal", goal_id,
                before=before, after=updates, request=request,
                subject_user_id=goal["user_id"])
    return {"message": "Goal updated.", "completed": updates.get("completed", goal.get("completed", False))}


# ── Review cycles (§18) ───────────────────────────────────────────────────────

@router.get("/cycles")
async def list_cycles(
    current_user=Depends(require_permission("performance.read")),
    db=Depends(get_db),
):
    cycles = await db.hr_review_cycles.find({}).sort("period_start", -1).to_list(50)
    return {
        "cycles": [{
            "id": str(c["_id"]), "name": c.get("name", ""),
            "cycle_type": c.get("cycle_type", ""),
            "period_start": iso(c.get("period_start")),
            "period_end": iso(c.get("period_end")),
            "self_review_due": iso(c.get("self_review_due")),
            "manager_review_due": iso(c.get("manager_review_due")),
            "status": c.get("status", "draft"),
        } for c in cycles],
        "total": len(cycles),
    }


@router.post("/cycles", status_code=201)
async def create_cycle(
    body: CycleCreate,
    request: Request,
    current_user=Depends(require_permission("performance.manage")),
    db=Depends(get_db),
):
    start = parse_date(body.period_start, "period_start")
    end = parse_date(body.period_end, "period_end")
    if start and end and end < start:
        raise HTTPException(status_code=400, detail="The period end cannot precede the start.")

    now = utcnow()
    result = await db.hr_review_cycles.insert_one({
        "name": body.name, "cycle_type": body.cycle_type,
        "period_start": start, "period_end": end,
        "self_review_due": parse_date(body.self_review_due, "self_review_due"),
        "manager_review_due": parse_date(body.manager_review_due, "manager_review_due"),
        "status": "draft",
        "created_by": current_user["_id"], "created_at": now,
    })
    await audit(db, "review_cycle.created", current_user, "review_cycle",
                str(result.inserted_id), after={"name": body.name, "type": body.cycle_type},
                request=request)
    return {"cycle_id": str(result.inserted_id), "message": "Review cycle created."}


@router.post("/cycles/{cycle_id}/open")
async def open_cycle(
    cycle_id: str,
    request: Request,
    current_user=Depends(require_permission("performance.manage")),
    db=Depends(get_db),
):
    """Open a cycle and create a review row per active employee.

    Rows are created up front rather than lazily so "who has not submitted" is a
    query rather than a diff against the employee list.
    """
    cycle_oid = oid(cycle_id, "cycle_id")
    cycle = await db.hr_review_cycles.find_one({"_id": cycle_oid})
    if not cycle:
        raise HTTPException(status_code=404, detail="Review cycle not found")
    if cycle.get("status") != "draft":
        raise HTTPException(status_code=400, detail=f"This cycle is already {cycle.get('status')}.")

    employees = await db.hr_employees.find(
        {"employment_status": {"$in": ["active", "probation"]}},
        {"user_id": 1, "manager_user_id": 1},
    ).to_list(2000)

    now = utcnow()
    created = 0
    for employee in employees:
        existing = await db.hr_reviews.find_one(
            {"cycle_id": cycle_oid, "user_id": employee["user_id"]}
        )
        if existing:
            continue
        await db.hr_reviews.insert_one({
            "cycle_id": cycle_oid,
            "user_id": employee["user_id"],
            "manager_user_id": employee.get("manager_user_id"),
            "sections": {"self": None, "manager": None, "peer": [], "hr": None},
            "objective_score": None, "goal_completion": None, "composite_score": None,
            "status": "pending",
            "created_at": now, "updated_at": now,
        })
        created += 1

    await db.hr_review_cycles.update_one({"_id": cycle_oid}, {"$set": {"status": "open"}})

    if employees:
        await notify_users(
            db=db, user_ids=[e["user_id"] for e in employees],
            notification_type="review_cycle_open",
            title=f"Performance review open: {cycle.get('name')}",
            body="Your self review is now open. Please complete it before the due date.",
            reference_id=cycle_id, reference_type="review_cycle",
            link="/hr/performance?tab=reviews", email=True,
        )

    await audit(db, "review_cycle.opened", current_user, "review_cycle", cycle_id,
                before={"status": "draft"}, after={"status": "open"},
                request=request, meta={"reviews_created": created})
    return {"message": f"Cycle opened with {created} review(s).", "reviews_created": created}


# ── Reviews ───────────────────────────────────────────────────────────────────

def _section_overall(ratings: dict) -> float:
    return round(sum(ratings.values()) / len(ratings), 2) if ratings else 0.0


async def _recompute(db, review: dict) -> dict:
    """Recalculate the composite from whatever has been submitted so far.

    Missing inputs are dropped and the remaining weights renormalized, so a
    review with no peers yet is not penalised for it — the composite always
    means "out of the evidence available", never "out of 100 with zeros".
    """
    from routers.personal import _batch_evaluations

    sections = review.get("sections", {})
    parts: dict[str, float] = {}

    evaluations = await _batch_evaluations([review["user_id"]], db)
    objective = evaluations.get(str(review["user_id"]), {}).get("evaluation", {}).get("score")
    if objective is not None:
        parts["objective"] = float(objective)

    goal_completion = await _goal_completion(db, review["user_id"], review.get("cycle_id"))
    if goal_completion is not None:
        parts["goals"] = goal_completion

    for key in ("manager", "self", "hr"):
        section = sections.get(key)
        if section and section.get("overall"):
            # Ratings are 1-5; the composite is 0-100.
            parts[key] = (section["overall"] / 5.0) * 100

    peers = [p for p in (sections.get("peer") or []) if p.get("overall")]
    if peers:
        parts["peer"] = (sum(p["overall"] for p in peers) / len(peers) / 5.0) * 100

    if not parts:
        return {"objective_score": objective, "goal_completion": goal_completion,
                "composite_score": None}

    total_weight = sum(COMPOSITE_WEIGHTS[k] for k in parts)
    composite = sum(parts[k] * COMPOSITE_WEIGHTS[k] for k in parts) / total_weight

    return {
        "objective_score": objective,
        "goal_completion": goal_completion,
        "composite_score": round(composite, 1),
    }


@router.get("/reviews")
async def list_reviews(
    cycle_id: str | None = Query(None),
    user_id: str | None = Query(None),
    mine: bool = Query(False, description="Only the caller's own review"),
    pending_my_action: bool = Query(False),
    current_user=Depends(require_permission("performance.read")),
    db=Depends(get_db),
):
    query: dict = {}
    if cycle_id:
        query["cycle_id"] = oid(cycle_id, "cycle_id")

    if mine:
        query["user_id"] = current_user["_id"]
    elif pending_my_action:
        query["manager_user_id"] = current_user["_id"]
        query["sections.manager"] = None
    elif user_id:
        target = oid(user_id, "user_id")
        allowed = await scoped_user_ids(db, current_user)
        if (target != current_user["_id"]
                and not has_permission(current_user, "performance.read_all")
                and (allowed is not None and target not in allowed)):
            raise HTTPException(status_code=403, detail="You cannot view this employee's review.")
        query["user_id"] = target
    elif not has_permission(current_user, "performance.read_all"):
        allowed = await scoped_user_ids(db, current_user)
        if allowed is not None:
            query["user_id"] = {"$in": allowed}

    reviews = await db.hr_reviews.find(query).sort("updated_at", -1).to_list(500)
    users = await user_map(db, {r["user_id"] for r in reviews} | {r.get("manager_user_id") for r in reviews})
    cycles = {str(c["_id"]): c async for c in db.hr_review_cycles.find({})}

    return {
        "reviews": [{
            "id":              str(r["_id"]),
            "cycle_id":        str(r["cycle_id"]),
            "cycle_name":      cycles.get(str(r["cycle_id"]), {}).get("name", ""),
            "user_id":         str(r["user_id"]),
            "employee_name":   users.get(str(r["user_id"]), {}).get("full_name", ""),
            "manager_name":    users.get(str(r.get("manager_user_id")), {}).get("full_name", ""),
            "status":          r.get("status", "pending"),
            "objective_score": r.get("objective_score"),
            "goal_completion": r.get("goal_completion"),
            "composite_score": r.get("composite_score"),
            "submitted": {
                "self":    bool((r.get("sections") or {}).get("self")),
                "manager": bool((r.get("sections") or {}).get("manager")),
                "hr":      bool((r.get("sections") or {}).get("hr")),
                "peer":    len((r.get("sections") or {}).get("peer") or []),
            },
            # Server-computed so the UI never re-derives who may write what.
            "can_submit_self":    r["user_id"] == current_user["_id"] and not (r.get("sections") or {}).get("self"),
            "can_submit_manager": r.get("manager_user_id") == current_user["_id"] and not (r.get("sections") or {}).get("manager"),
            "can_submit_hr":      has_permission(current_user, "performance.manage") and not (r.get("sections") or {}).get("hr"),
            "updated_at":      iso(r.get("updated_at")),
        } for r in reviews],
        "total": len(reviews),
    }


@router.get("/reviews/{review_id}")
async def get_review(
    review_id: str,
    current_user=Depends(require_permission("performance.read")),
    db=Depends(get_db),
):
    review = await db.hr_reviews.find_one({"_id": oid(review_id, "review_id")})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    is_subject = review["user_id"] == current_user["_id"]
    is_manager = review.get("manager_user_id") == current_user["_id"]
    if not (is_subject or is_manager or has_permission(current_user, "performance.read_all")):
        raise HTTPException(status_code=403, detail="You cannot view this review.")

    sections = review.get("sections", {})
    # The subject sees manager and HR feedback only once the review is complete —
    # partial feedback read mid-cycle is how a review becomes an argument
    # before the reviewer has finished forming it.
    if is_subject and review.get("status") != "completed":
        sections = {"self": sections.get("self"), "manager": None, "peer": [], "hr": None}
    # Peer feedback is always anonymised to the subject.
    elif is_subject:
        sections = {**sections, "peer": [
            {**p, "by": None, "by_name": "Peer"} for p in (sections.get("peer") or [])
        ]}

    users = await user_map(db, {review["user_id"], review.get("manager_user_id")})
    return {
        "id":              str(review["_id"]),
        "cycle_id":        str(review["cycle_id"]),
        "user_id":         str(review["user_id"]),
        "employee_name":   users.get(str(review["user_id"]), {}).get("full_name", ""),
        "manager_name":    users.get(str(review.get("manager_user_id")), {}).get("full_name", ""),
        "status":          review.get("status", "pending"),
        "objective_score": review.get("objective_score"),
        "goal_completion": review.get("goal_completion"),
        "composite_score": review.get("composite_score"),
        "sections":        _serialize_sections(sections),
        "dimensions":      list(RATING_DIMENSIONS),
    }


def _serialize_sections(sections: dict) -> dict:
    def one(s):
        if not s:
            return None
        return {
            "by_name":      s.get("by_name", ""),
            "submitted_at": iso(s.get("submitted_at")),
            "ratings":      s.get("ratings", {}),
            "overall":      s.get("overall"),
            "strengths":    s.get("strengths", ""),
            "improvements": s.get("improvements", ""),
            "comments":     s.get("comments", ""),
        }
    return {
        "self":    one(sections.get("self")),
        "manager": one(sections.get("manager")),
        "hr":      one(sections.get("hr")),
        "peer":    [one(p) for p in (sections.get("peer") or [])],
    }


@router.post("/reviews/{review_id}/submit")
async def submit_review(
    review_id: str,
    body: ReviewSubmit,
    request: Request,
    current_user=Depends(require_permission("performance.read")),
    db=Depends(get_db),
):
    """Submit one section of a review (§18)."""
    review_oid = oid(review_id, "review_id")
    review = await db.hr_reviews.find_one({"_id": review_oid})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    section = body.section
    is_subject = review["user_id"] == current_user["_id"]
    is_manager = review.get("manager_user_id") == current_user["_id"]

    if section == "self" and not is_subject:
        raise HTTPException(status_code=403, detail="Only the employee can write their self review.")
    if section == "manager" and not (is_manager or has_permission(current_user, "performance.manage")):
        raise HTTPException(status_code=403, detail="Only the reporting manager can write the manager review.")
    if section == "hr" and not has_permission(current_user, "performance.manage"):
        raise HTTPException(status_code=403, detail="Only HR can write the HR review.")
    if section == "peer":
        if is_subject:
            raise HTTPException(status_code=400, detail="You cannot submit peer feedback on yourself.")
        if not has_permission(current_user, "performance.review"):
            raise HTTPException(status_code=403, detail="You cannot submit peer feedback.")

    sections = review.get("sections") or {}
    if section != "peer" and sections.get(section):
        raise HTTPException(status_code=400, detail=f"The {section} review has already been submitted.")
    if section == "peer" and any(
        str(p.get("by")) == str(current_user["_id"]) for p in (sections.get("peer") or [])
    ):
        raise HTTPException(status_code=400, detail="You have already submitted peer feedback.")

    now = utcnow()
    entry = {
        "by":           current_user["_id"],
        "by_name":      current_user.get("full_name", ""),
        "submitted_at": now,
        "ratings":      body.ratings,
        "overall":      _section_overall(body.ratings),
        "strengths":    body.strengths,
        "improvements": body.improvements,
        "comments":     body.comments,
    }

    if section == "peer":
        await db.hr_reviews.update_one({"_id": review_oid}, {"$push": {"sections.peer": entry}})
    else:
        await db.hr_reviews.update_one({"_id": review_oid}, {"$set": {f"sections.{section}": entry}})

    refreshed = await db.hr_reviews.find_one({"_id": review_oid})
    scores = await _recompute(db, refreshed)

    updated_sections = refreshed.get("sections") or {}
    if updated_sections.get("hr"):
        status = "completed"
    elif updated_sections.get("manager"):
        status = "manager_submitted"
    elif updated_sections.get("self"):
        status = "self_submitted"
    else:
        status = "pending"

    await db.hr_reviews.update_one(
        {"_id": review_oid}, {"$set": {**scores, "status": status, "updated_at": now}}
    )

    # The subject is told only when the review is finished — see get_review.
    if status == "completed":
        await notify_users(
            db=db, user_ids=[review["user_id"]],
            notification_type="review_completed",
            title="Your performance review is complete",
            body=f"Composite score: {scores.get('composite_score')}.",
            reference_id=review_id, reference_type="review",
            link="/hr/performance?tab=reviews", email=True,
        )
    elif section == "self" and review.get("manager_user_id"):
        await notify_users(
            db=db, user_ids=[review["manager_user_id"]],
            notification_type="review_self_submitted",
            title=f"Self review submitted by {current_user.get('full_name')}",
            body="Your manager review is now due.",
            reference_id=review_id, reference_type="review",
            link="/hr/performance?tab=reviews", email=True,
        )

    await audit(db, f"review.{section}_submitted", current_user, "review", review_id,
                after={"overall": entry["overall"], "status": status},
                request=request, subject_user_id=review["user_id"])

    return {"message": f"{section.title()} review submitted.", "status": status, **scores}
