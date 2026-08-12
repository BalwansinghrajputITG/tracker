"""
HR helpdesk (hr.md §22).

    Open → In Progress → Waiting → Resolved → Closed

The raiser always sees their own tickets. Everyone else needs ticket.read_all,
which is what keeps a payroll query from being readable by the whole company.
Internal notes are visible only to HR — a thread the raiser can read and one HR
can annotate are different things, and conflating them is how a private remark
ends up in front of the person it is about.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from database import get_db
from middleware.auth import get_current_user
from middleware.permissions import has_permission, require_permission
from models.hr.ticket import (
    SLA_HOURS, SLA_TERMINAL, TICKET_CATEGORIES, TICKET_STATUSES,
    TicketCreate, TicketReply, TicketUpdate,
)
from routers.hr.common import aware, iso, oid, user_map, utcnow
from services.audit_service import audit
from services.notification_service import notify_users

router = APIRouter()


def _sla_state(ticket: dict) -> str:
    """breached | due_soon | on_track | met — derived, never stored stale."""
    due = aware(ticket.get("sla_due_at"))
    if not due:
        return "on_track"
    if ticket.get("status") in SLA_TERMINAL:
        resolved = aware(ticket.get("resolved_at"))
        return "met" if (resolved and resolved <= due) else "breached"
    now = utcnow()
    if now > due:
        return "breached"
    if (due - now) <= timedelta(hours=4):
        return "due_soon"
    return "on_track"


def _serialize(ticket: dict, *, users: dict) -> dict:
    return {
        "id":             str(ticket["_id"]),
        "ticket_number":  ticket.get("ticket_number", ""),
        "raised_by":      str(ticket["raised_by"]),
        "raised_by_name": users.get(str(ticket.get("raised_by")), {}).get("full_name", ""),
        "subject":        ticket.get("subject", ""),
        "description":    ticket.get("description", ""),
        "category":       ticket.get("category", "other"),
        "priority":       ticket.get("priority", "medium"),
        "status":         ticket.get("status", "open"),
        "assigned_to":    str(ticket["assigned_to"]) if ticket.get("assigned_to") else None,
        "assigned_to_name": users.get(str(ticket.get("assigned_to")), {}).get("full_name", ""),
        "sla_due_at":     iso(ticket.get("sla_due_at")),
        "sla_state":      _sla_state(ticket),
        "first_response_at": iso(ticket.get("first_response_at")),
        "resolved_at":    iso(ticket.get("resolved_at")),
        "resolution":     ticket.get("resolution", ""),
        "is_confidential": ticket.get("is_confidential", False),
        "message_count":  ticket.get("message_count", 0),
        "created_at":     iso(ticket.get("created_at")),
        "updated_at":     iso(ticket.get("updated_at")),
    }


async def _assert_ticket_access(db, ticket: dict, current_user: dict) -> None:
    if has_permission(current_user, "ticket.read_all"):
        return
    if ticket.get("raised_by") == current_user["_id"]:
        return
    if ticket.get("assigned_to") == current_user["_id"]:
        return
    raise HTTPException(status_code=403, detail="You cannot access this ticket.")


async def _hr_recipients(db) -> list:
    """Who to notify about a new ticket: anyone who can action them."""
    return [
        u["_id"] async for u in db.users.find(
            {"is_active": True, "roles": {"$in": ["hr_admin", "hr_manager", "admin", "coo"]}},
            {"_id": 1},
        )
    ]


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_tickets(
    status: str | None = Query(None),
    category: str | None = Query(None),
    assigned_to_me: bool = Query(False),
    mine: bool = Query(False, description="Only tickets the caller raised"),
    sla: str | None = Query(None, description="breached | due_soon"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user=Depends(require_permission("ticket.read")),
    db=Depends(get_db),
):
    query: dict = {}

    if mine:
        query["raised_by"] = current_user["_id"]
    elif assigned_to_me:
        query["assigned_to"] = current_user["_id"]
    elif not has_permission(current_user, "ticket.read_all"):
        # Without read_all a caller sees only what they raised or were assigned.
        query["$or"] = [
            {"raised_by": current_user["_id"]},
            {"assigned_to": current_user["_id"]},
        ]

    if status:
        query["status"] = status
    if category:
        query["category"] = category
    if sla == "breached":
        query["sla_due_at"] = {"$lt": utcnow()}
        query["status"] = {"$nin": list(SLA_TERMINAL)}
    elif sla == "due_soon":
        query["sla_due_at"] = {"$gte": utcnow(), "$lte": utcnow() + timedelta(hours=4)}
        query["status"] = {"$nin": list(SLA_TERMINAL)}

    skip = (page - 1) * limit
    tickets = await db.hr_tickets.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.hr_tickets.count_documents(query)
    users = await user_map(db, {t.get("raised_by") for t in tickets} | {t.get("assigned_to") for t in tickets})

    serialized = [_serialize(t, users=users) for t in tickets]
    return {
        "tickets": serialized, "total": total, "page": page, "limit": limit,
        "open_count": sum(1 for t in serialized if t["status"] not in SLA_TERMINAL),
        "breached_count": sum(1 for t in serialized if t["sla_state"] == "breached"),
        "categories": list(TICKET_CATEGORIES),
    }


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_ticket(
    body: TicketCreate,
    request: Request,
    current_user=Depends(require_permission("ticket.create")),
    db=Depends(get_db),
):
    now = utcnow()
    # Sequential, human-quotable reference. Derived from the current max rather
    # than a count so deletions cannot cause a collision.
    last = await db.hr_tickets.find(
        {"ticket_number": {"$regex": r"^HR-\d+$"}}, {"ticket_number": 1},
    ).sort("ticket_number", -1).limit(1).to_list(1)
    number = f"HR-{(int(last[0]['ticket_number'].split('-')[1]) if last else 0) + 1:04d}"

    doc = {
        "ticket_number":   number,
        "raised_by":       current_user["_id"],
        "subject_user_id": current_user["_id"],
        "category":        body.category,
        "priority":        body.priority,
        "subject":         body.subject,
        "description":     body.description,
        "status":          "open",
        "assigned_to":     None,
        "sla_due_at":      now + timedelta(hours=SLA_HOURS.get(body.priority, 72)),
        "first_response_at": None,
        "resolved_at":     None, "closed_at": None,
        "resolution":      "",
        "is_confidential": body.is_confidential,
        "message_count":   0,
        "created_at":      now, "updated_at": now,
    }
    result = await db.hr_tickets.insert_one(doc)

    recipients = await _hr_recipients(db)
    if recipients:
        await notify_users(
            db=db, user_ids=recipients,
            notification_type="hr_ticket_raised",
            title=f"{number}: {body.subject}",
            body=f"{body.category.replace('_', ' ').title()} · {body.priority} priority.",
            reference_id=str(result.inserted_id), reference_type="hr_ticket",
            link="/hr/helpdesk", email=True,
        )

    await audit(db, "ticket.created", current_user, "hr_ticket", str(result.inserted_id),
                after={"ticket_number": number, "category": body.category,
                       "priority": body.priority},
                request=request, subject_user_id=current_user["_id"])

    return {"ticket_id": str(result.inserted_id), "ticket_number": number,
            "sla_due_at": iso(doc["sla_due_at"]), "message": "Ticket raised."}


# ── Detail + thread ───────────────────────────────────────────────────────────

@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    current_user=Depends(require_permission("ticket.read")),
    db=Depends(get_db),
):
    ticket = await db.hr_tickets.find_one({"_id": oid(ticket_id, "ticket_id")})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await _assert_ticket_access(db, ticket, current_user)

    query: dict = {"ticket_id": ticket["_id"]}
    # Internal notes never reach the person who raised the ticket.
    if not has_permission(current_user, "ticket.read_all"):
        query["is_internal"] = {"$ne": True}

    messages = await db.hr_ticket_messages.find(query).sort("created_at", 1).to_list(200)
    users = await user_map(
        db,
        {ticket.get("raised_by"), ticket.get("assigned_to")} | {m["author_id"] for m in messages},
    )

    return {
        **_serialize(ticket, users=users),
        "messages": [{
            "id":          str(m["_id"]),
            "author_id":   str(m["author_id"]),
            "author_name": users.get(str(m["author_id"]), {}).get("full_name", ""),
            "body":        m.get("body", ""),
            "is_internal": m.get("is_internal", False),
            "created_at":  iso(m.get("created_at")),
        } for m in messages],
    }


@router.post("/{ticket_id}/reply", status_code=201)
async def reply_ticket(
    ticket_id: str,
    body: TicketReply,
    request: Request,
    current_user=Depends(require_permission("ticket.read")),
    db=Depends(get_db),
):
    ticket_oid = oid(ticket_id, "ticket_id")
    ticket = await db.hr_tickets.find_one({"_id": ticket_oid})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await _assert_ticket_access(db, ticket, current_user)

    if ticket.get("status") == "closed":
        raise HTTPException(status_code=400, detail="This ticket is closed. Raise a new one.")

    is_internal = body.is_internal and has_permission(current_user, "ticket.assign")
    now = utcnow()
    result = await db.hr_ticket_messages.insert_one({
        "ticket_id": ticket_oid, "author_id": current_user["_id"],
        "body": body.body, "is_internal": is_internal, "created_at": now,
    })

    updates: dict = {"updated_at": now, "$inc_marker": None}
    updates.pop("$inc_marker")

    # First response from anyone other than the raiser stops the response clock.
    is_staff_reply = ticket.get("raised_by") != current_user["_id"]
    if is_staff_reply and not ticket.get("first_response_at") and not is_internal:
        updates["first_response_at"] = now
    # A staff reply moves an untouched ticket into progress; a raiser reply on a
    # waiting ticket hands it back to HR.
    if is_staff_reply and ticket.get("status") == "open":
        updates["status"] = "in_progress"
    elif not is_staff_reply and ticket.get("status") == "waiting":
        updates["status"] = "in_progress"

    await db.hr_tickets.update_one(
        {"_id": ticket_oid}, {"$set": updates, "$inc": {"message_count": 1}}
    )

    # Notify the other party — never the author.
    if not is_internal:
        recipient = ticket["raised_by"] if is_staff_reply else ticket.get("assigned_to")
        if recipient and recipient != current_user["_id"]:
            await notify_users(
                db=db, user_ids=[recipient],
                notification_type="hr_ticket_reply",
                title=f"{ticket.get('ticket_number')}: new reply",
                body=body.body[:140],
                reference_id=ticket_id, reference_type="hr_ticket",
                link="/hr/helpdesk", email=True,
            )

    return {"message_id": str(result.inserted_id), "message": "Reply added.",
            "status": updates.get("status", ticket.get("status"))}


# ── Update / assign / resolve ─────────────────────────────────────────────────

@router.put("/{ticket_id}")
async def update_ticket(
    ticket_id: str,
    body: TicketUpdate,
    request: Request,
    current_user=Depends(require_permission("ticket.assign")),
    db=Depends(get_db),
):
    ticket_oid = oid(ticket_id, "ticket_id")
    ticket = await db.hr_tickets.find_one({"_id": ticket_oid})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    updates: dict = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        updates[key] = oid(value, key) if key == "assigned_to" else value

    if not updates:
        return {"message": "Nothing to update."}

    now = utcnow()
    new_status = updates.get("status")

    if new_status in ("resolved", "closed"):
        if not has_permission(current_user, "ticket.resolve"):
            raise HTTPException(status_code=403, detail="You cannot resolve tickets.")
        if new_status == "resolved" and not ticket.get("resolved_at"):
            updates["resolved_at"] = now
        if new_status == "closed":
            updates["closed_at"] = now
            updates.setdefault("resolved_at", ticket.get("resolved_at") or now)
    # Reopening clears the resolution stamps, so SLA state cannot claim "met"
    # for a ticket that is open again.
    if new_status in ("open", "in_progress", "waiting") and ticket.get("resolved_at"):
        updates["resolved_at"] = None
        updates["closed_at"] = None

    # Changing priority re-derives the SLA deadline from creation, not from now —
    # otherwise raising priority on an old ticket would grant it extra time.
    if "priority" in updates:
        created = aware(ticket.get("created_at")) or now
        updates["sla_due_at"] = created + timedelta(hours=SLA_HOURS.get(updates["priority"], 72))

    before = {k: ticket.get(k) for k in updates}
    updates["updated_at"] = now
    await db.hr_tickets.update_one({"_id": ticket_oid}, {"$set": updates})

    if new_status and new_status != ticket.get("status"):
        await notify_users(
            db=db, user_ids=[ticket["raised_by"]],
            notification_type="hr_ticket_status",
            title=f"{ticket.get('ticket_number')}: {new_status.replace('_', ' ')}",
            body=updates.get("resolution") or f"Your ticket is now {new_status.replace('_', ' ')}.",
            reference_id=ticket_id, reference_type="hr_ticket",
            link="/hr/helpdesk", email=True,
        )
    if "assigned_to" in updates and updates["assigned_to"]:
        await notify_users(
            db=db, user_ids=[updates["assigned_to"]],
            notification_type="hr_ticket_assigned",
            title=f"Assigned to you: {ticket.get('ticket_number')}",
            body=ticket.get("subject", ""),
            reference_id=ticket_id, reference_type="hr_ticket",
            link="/hr/helpdesk", email=True,
        )

    await audit(db, "ticket.updated", current_user, "hr_ticket", ticket_id,
                before=before, after=updates, request=request,
                subject_user_id=ticket.get("raised_by"))

    return {"message": "Ticket updated.", "status": updates.get("status", ticket.get("status"))}
