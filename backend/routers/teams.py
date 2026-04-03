from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional

from database import get_db
from middleware.auth import get_current_user
from middleware.rbac import require_pm_or_above, require_manager
from utils.team_scope import is_exec, is_pm, is_team_lead, get_team_member_ids

router = APIRouter()


class TeamCreate(BaseModel):
    name: str
    description: str = ""
    department: str
    lead_id: str
    pm_id: Optional[str] = None
    member_ids: list[str] = []


class AddMembers(BaseModel):
    user_ids: list[str]


@router.get("")
async def list_teams(
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    primary_role = current_user.get("primary_role", "")
    query = {"is_active": {"$ne": False}}
    if primary_role in {"ceo", "coo"}:
        pass  # see all teams
    elif primary_role == "pm":
        # PM sees teams where they are the pm_id or a member
        user_id = current_user["_id"]
        team_ids_from_user = [ObjectId(t) for t in current_user.get("team_ids", [])]
        query["$or"] = [{"pm_id": user_id}, {"_id": {"$in": team_ids_from_user}}]
    else:
        query["_id"] = {"$in": [ObjectId(t) for t in current_user.get("team_ids", [])]}

    total = await db.teams.count_documents(query)
    skip = (page - 1) * limit
    cursor = db.teams.find(query).skip(skip).limit(limit)
    teams = []
    async for t in cursor:
        t["id"] = str(t.pop("_id"))
        t["lead_id"] = str(t["lead_id"]) if t.get("lead_id") else None
        t["pm_id"] = str(t["pm_id"]) if t.get("pm_id") else None
        t["chat_room_id"] = str(t["chat_room_id"]) if t.get("chat_room_id") else None
        t["created_by"] = str(t["created_by"]) if t.get("created_by") else None
        t["member_ids"] = [str(m) for m in t.get("member_ids", [])]
        t["project_ids"] = [str(p) for p in t.get("project_ids", [])]
        teams.append(t)
    return {"teams": teams, "total": total, "page": page, "limit": limit}


@router.post("", status_code=201)
async def create_team(
    body: TeamCreate,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    # Team lead scope restrictions
    if is_team_lead(current_user) and not is_exec(current_user) and not is_pm(current_user):
        # Team lead must set themselves as the team lead
        if body.lead_id != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Team leads can only create teams where they are the lead.")
        # Team lead can only add members from their existing teams
        if body.member_ids:
            allowed_ids = await get_team_member_ids(db, current_user)
            allowed_str = {str(i) for i in allowed_ids}
            bad = [m for m in body.member_ids if m not in allowed_str]
            if bad:
                raise HTTPException(status_code=403, detail="You can only add members from your existing teams.")

    member_ids = [ObjectId(m) for m in body.member_ids]
    lead_id = ObjectId(body.lead_id)
    pm_id = ObjectId(body.pm_id) if body.pm_id else None

    # Fetch all CEO/COO users — they must be in every team group
    exec_cursor = db.users.find(
        {"primary_role": {"$in": ["ceo", "coo"]}, "is_active": True},
        {"_id": 1},
    )
    exec_ids = [u["_id"] async for u in exec_cursor]

    # Build initial participant list: members + lead + pm + execs (deduplicated)
    initial_participants = list({
        *member_ids,
        lead_id,
        *([] if pm_id is None else [pm_id]),
        *exec_ids,
    })

    # Create team chat room
    room_doc = {
        "type": "team",
        "name": f"{body.name} — Team Chat",
        "participants": initial_participants,
        "team_id": None,  # filled in after team insert
        "created_by": current_user["_id"],
        "last_message_at": datetime.now(timezone.utc),
        "last_message_preview": "",
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }
    room_result = await db.chat_rooms.insert_one(room_doc)

    doc = {
        "name": body.name,
        "description": body.description,
        "department": body.department,
        "lead_id": lead_id,
        "pm_id": pm_id,
        "member_ids": member_ids,
        "project_ids": [],
        "chat_room_id": room_result.inserted_id,
        "is_active": True,
        "created_by": current_user["_id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.teams.insert_one(doc)
    team_id = result.inserted_id

    # Back-fill team_id on the chat room
    await db.chat_rooms.update_one(
        {"_id": room_result.inserted_id},
        {"$set": {"team_id": team_id}},
    )

    # Update members' team_ids
    await db.users.update_many(
        {"_id": {"$in": member_ids + [lead_id]}},
        {"$addToSet": {"team_ids": team_id}},
    )

    return {"team_id": str(team_id), "chat_room_id": str(room_result.inserted_id)}


@router.post("/{team_id}/members")
async def add_members(
    team_id: str,
    body: AddMembers,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    team = await db.teams.find_one({"_id": ObjectId(team_id)})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if is_team_lead(current_user) and not is_exec(current_user) and not is_pm(current_user):
        if str(team.get("lead_id", "")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="You can only add members to teams you lead.")
        allowed_ids = await get_team_member_ids(db, current_user)
        allowed_str = {str(i) for i in allowed_ids}
        bad = [u for u in body.user_ids if u not in allowed_str]
        if bad:
            raise HTTPException(status_code=403, detail="You can only add members from your existing teams.")

    new_ids = [ObjectId(u) for u in body.user_ids]
    await db.teams.update_one(
        {"_id": ObjectId(team_id)},
        {"$addToSet": {"member_ids": {"$each": new_ids}}},
    )
    await db.users.update_many(
        {"_id": {"$in": new_ids}},
        {"$addToSet": {"team_ids": ObjectId(team_id)}},
    )
    # Add to team chat room
    await db.chat_rooms.update_one(
        {"_id": team["chat_room_id"]},
        {"$addToSet": {"participants": {"$each": new_ids}}},
    )
    return {"message": f"Added {len(new_ids)} members to team"}


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    department: Optional[str] = None
    lead_id: Optional[str] = None
    pm_id: Optional[str] = None      # empty string = clear PM
    member_ids: Optional[list[str]] = None


@router.put("/{team_id}")
async def update_team(
    team_id: str,
    body: TeamUpdate,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    team = await db.teams.find_one({"_id": ObjectId(team_id)})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if is_team_lead(current_user) and not is_exec(current_user) and not is_pm(current_user):
        if str(team.get("lead_id", "")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="You can only edit teams you lead.")

    data = body.model_dump(exclude_unset=True)
    updates: dict = {}

    for field in ("name", "description", "department"):
        if field in data and data[field] is not None:
            updates[field] = data[field]

    if "lead_id" in data and data["lead_id"]:
        updates["lead_id"] = ObjectId(data["lead_id"])

    if "pm_id" in data:
        updates["pm_id"] = ObjectId(data["pm_id"]) if data["pm_id"] else None

    if "member_ids" in data and data["member_ids"] is not None:
        new_oids = [ObjectId(m) for m in data["member_ids"]]
        old_oids = team.get("member_ids", [])
        to_add = [m for m in new_oids if m not in old_oids]
        to_remove = [m for m in old_oids if m not in new_oids]
        updates["member_ids"] = new_oids
        if to_add:
            await db.users.update_many(
                {"_id": {"$in": to_add}},
                {"$addToSet": {"team_ids": ObjectId(team_id)}},
            )
            if team.get("chat_room_id"):
                await db.chat_rooms.update_one(
                    {"_id": team["chat_room_id"]},
                    {"$addToSet": {"participants": {"$each": to_add}}},
                )
        if to_remove:
            await db.users.update_many(
                {"_id": {"$in": to_remove}},
                {"$pull": {"team_ids": ObjectId(team_id)}},
            )

    if not updates:
        return {"message": "Nothing to update"}

    updates["updated_at"] = datetime.now(timezone.utc)
    await db.teams.update_one({"_id": ObjectId(team_id)}, {"$set": updates})
    return {"message": "Team updated"}


@router.delete("/{team_id}")
async def delete_team(
    team_id: str,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    team = await db.teams.find_one({"_id": ObjectId(team_id)})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if is_team_lead(current_user) and not is_exec(current_user) and not is_pm(current_user):
        if str(team.get("lead_id", "")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="You can only delete teams you lead.")

    await db.teams.update_one(
        {"_id": ObjectId(team_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": f"Team '{team['name']}' deleted"}


@router.delete("/{team_id}/members/{user_id}")
async def remove_member(
    team_id: str,
    user_id: str,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    team = await db.teams.find_one({"_id": ObjectId(team_id)})
    if team and is_team_lead(current_user) and not is_exec(current_user) and not is_pm(current_user):
        if str(team.get("lead_id", "")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="You can only remove members from teams you lead.")
    uid = ObjectId(user_id)
    await db.teams.update_one(
        {"_id": ObjectId(team_id)},
        {"$pull": {"member_ids": uid}},
    )
    await db.users.update_one(
        {"_id": uid},
        {"$pull": {"team_ids": ObjectId(team_id)}},
    )
    return {"message": "Member removed"}
