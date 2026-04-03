from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional

from database import get_db
from middleware.auth import get_current_user
from ws_manager.manager import connection_manager
from services.notification_service import notify_users

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def serialize_msg(doc):
    if doc:
        doc["id"] = str(doc.pop("_id"))
        doc["sender_id"] = str(doc.get("sender_id", ""))
        doc["room_id"] = str(doc.get("room_id", ""))
        doc["read_by"] = [str(u) for u in doc.get("read_by", [])]
        doc["mentions"] = [str(m) for m in doc.get("mentions", [])]
        if doc.get("reply_to"):
            doc["reply_to"] = str(doc["reply_to"])
    return doc


def _role(user: dict) -> str:
    return user.get("primary_role", "")


def _is_exec(user: dict) -> bool:
    return _role(user) in ("ceo", "coo")


async def _get_allowed_dm_partners(db, current_user: dict) -> list:
    """Return ObjectIds of users the current user is allowed to DM."""
    if _is_exec(current_user):
        # CEO/COO can DM anyone
        cursor = db.users.find(
            {"is_active": True, "_id": {"$ne": current_user["_id"]}},
            {"_id": 1},
        )
        return [u["_id"] async for u in cursor]

    allowed: set = set()

    # Always allow messaging CEO/COO
    exec_cursor = db.users.find(
        {"primary_role": {"$in": ["ceo", "coo"]}, "is_active": True},
        {"_id": 1},
    )
    async for u in exec_cursor:
        allowed.add(u["_id"])

    # Add all members of the user's own teams
    team_ids = [ObjectId(t) for t in current_user.get("team_ids", [])]
    if team_ids:
        team_cursor = db.teams.find(
            {"_id": {"$in": team_ids}, "is_active": {"$ne": False}},
        )
        async for team in team_cursor:
            for mid in team.get("member_ids", []):
                allowed.add(mid)
            if team.get("lead_id"):
                allowed.add(team["lead_id"])
            if team.get("pm_id"):
                allowed.add(team["pm_id"])

    # PM/Team lead: also include members from teams they manage
    role = _role(current_user)
    if role in ("pm", "team_lead"):
        managed_cursor = db.teams.find(
            {
                "$or": [
                    {"lead_id": current_user["_id"]},
                    {"pm_id": current_user["_id"]},
                ],
                "is_active": {"$ne": False},
            }
        )
        async for team in managed_cursor:
            for mid in team.get("member_ids", []):
                allowed.add(mid)
            if team.get("lead_id"):
                allowed.add(team["lead_id"])
            if team.get("pm_id"):
                allowed.add(team["pm_id"])

    allowed.discard(current_user["_id"])
    return list(allowed)


# ─── Models ───────────────────────────────────────────────────────────────────

class RoomCreate(BaseModel):
    type: str = "direct"
    name: Optional[str] = None
    participant_ids: list[str]
    team_id: Optional[str] = None
    project_id: Optional[str] = None


class MessageCreate(BaseModel):
    content: str
    reply_to: Optional[str] = None
    mentions: list[str] = []


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/contacts")
async def get_chat_contacts(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Return users the current user is allowed to start a DM with."""
    allowed_ids = await _get_allowed_dm_partners(db, current_user)
    if not allowed_ids:
        return {"contacts": []}

    cursor = db.users.find(
        {"_id": {"$in": allowed_ids}, "is_active": True},
        {"password_hash": 0},
    ).sort("full_name", 1)

    contacts = []
    async for u in cursor:
        contacts.append({
            "id": str(u["_id"]),
            "full_name": u.get("full_name", ""),
            "primary_role": u.get("primary_role", ""),
            "department": u.get("department", ""),
        })
    return {"contacts": contacts}


@router.get("/rooms")
async def list_rooms(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    cursor = db.chat_rooms.find({
        "participants": current_user["_id"],
        "is_active": True,
    }).sort("last_message_at", -1)

    uid = str(current_user["_id"])
    rooms = []
    async for r in cursor:
        r["id"] = str(r.pop("_id"))
        r["participants"] = [str(p) for p in r.get("participants", [])]
        r["created_by"] = str(r["created_by"]) if r.get("created_by") else None
        r["team_id"] = str(r["team_id"]) if r.get("team_id") else None
        r["project_id"] = str(r["project_id"]) if r.get("project_id") else None

        # For direct rooms: resolve the other person's name/role for display
        if r["type"] == "direct":
            other_id = next((p for p in r["participants"] if p != uid), None)
            if other_id:
                other = await db.users.find_one(
                    {"_id": ObjectId(other_id)},
                    {"full_name": 1, "primary_role": 1},
                )
                if other:
                    r["name"] = other.get("full_name", "Direct Message")
                    r["other_user_role"] = other.get("primary_role", "")
                    r["other_user_id"] = other_id

        if r.get("last_message_at"):
            r["last_message_at"] = r["last_message_at"].isoformat()
        rooms.append(r)
    return {"rooms": rooms}


@router.post("/rooms", status_code=201)
async def create_room(
    body: RoomCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    participant_ids = [ObjectId(p) for p in body.participant_ids]
    if current_user["_id"] not in participant_ids:
        participant_ids.append(current_user["_id"])

    # Enforce DM access control
    if body.type == "direct" and len(participant_ids) == 2:
        target_id = next((p for p in participant_ids if p != current_user["_id"]), None)
        if target_id and not _is_exec(current_user):
            allowed = await _get_allowed_dm_partners(db, current_user)
            if target_id not in allowed:
                raise HTTPException(status_code=403, detail="You are not allowed to message this user")

        # Return existing DM room if already exists
        existing = await db.chat_rooms.find_one({
            "type": "direct",
            "participants": {"$all": participant_ids, "$size": 2},
        })
        if existing:
            return {"room_id": str(existing["_id"]), "existing": True}

    doc = {
        "type": body.type,
        "name": body.name,
        "participants": participant_ids,
        "team_id": ObjectId(body.team_id) if body.team_id else None,
        "project_id": ObjectId(body.project_id) if body.project_id else None,
        "created_by": current_user["_id"],
        "last_message_at": datetime.now(timezone.utc),
        "last_message_preview": "",
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.chat_rooms.insert_one(doc)
    return {"room_id": str(result.inserted_id), "existing": False}


@router.get("/rooms/{room_id}/messages")
async def get_messages(
    room_id: str,
    before: Optional[str] = None,
    limit: int = Query(50, le=100),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    room = await db.chat_rooms.find_one({
        "_id": ObjectId(room_id),
        "participants": current_user["_id"],
    })
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    query = {"room_id": ObjectId(room_id), "is_deleted": False}
    if before:
        query["_id"] = {"$lt": ObjectId(before)}

    cursor = db.chat_messages.find(query).sort("sent_at", -1).limit(limit)
    messages = [serialize_msg(m) async for m in cursor]
    messages.reverse()

    await db.chat_messages.update_many(
        {"room_id": ObjectId(room_id), "read_by": {"$ne": current_user["_id"]}},
        {"$push": {"read_by": current_user["_id"]}},
    )

    return {"messages": messages}


@router.post("/rooms/{room_id}/messages", status_code=201)
async def send_message(
    room_id: str,
    body: MessageCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    room = await db.chat_rooms.find_one({
        "_id": ObjectId(room_id),
        "participants": current_user["_id"],
    })
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    now = datetime.now(timezone.utc)
    doc = {
        "room_id": ObjectId(room_id),
        "sender_id": current_user["_id"],
        "content": body.content,
        "message_type": "text",
        "attachments": [],
        "reply_to": ObjectId(body.reply_to) if body.reply_to else None,
        "mentions": [ObjectId(m) for m in body.mentions],
        "reactions": [],
        "is_edited": False,
        "is_deleted": False,
        "read_by": [current_user["_id"]],
        "sent_at": now,
    }
    result = await db.chat_messages.insert_one(doc)
    msg_id = str(result.inserted_id)

    await db.chat_rooms.update_one(
        {"_id": ObjectId(room_id)},
        {"$set": {"last_message_at": now, "last_message_preview": body.content[:100]}},
    )

    payload = {
        "type": "new_message",
        "message_id": msg_id,
        "room_id": room_id,
        "sender_id": str(current_user["_id"]),
        "sender_name": current_user["full_name"],
        "content": body.content,
        "sent_at": now.isoformat(),
    }
    await connection_manager.broadcast_to_room(room_id, payload)

    if body.mentions:
        await notify_users(
            db=db,
            user_ids=body.mentions,
            notification_type="mention",
            title=f"{current_user['full_name']} mentioned you",
            body=body.content[:80],
            reference_id=room_id,
            reference_type="message",
        )

    return {"message_id": msg_id}


@router.websocket("/ws/{room_id}")
async def websocket_chat(
    websocket: WebSocket,
    room_id: str,
    token: str,
    db=Depends(get_db),
):
    from middleware.auth import get_current_user as _get_user
    from fastapi.security import HTTPAuthorizationCredentials
    try:
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        user = await _get_user(credentials=creds, db=db)
    except Exception:
        await websocket.close(code=4001)
        return

    await connection_manager.connect(websocket, room_id, str(user["_id"]))
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "typing":
                await connection_manager.broadcast_to_room(room_id, {
                    "type": "typing",
                    "user_id": str(user["_id"]),
                    "user_name": user["full_name"],
                    "room_id": room_id,
                }, exclude_user=str(user["_id"]))
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket, room_id)
