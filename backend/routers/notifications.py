from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from bson import ObjectId
from datetime import datetime, timezone

from database import get_db
from middleware.auth import get_current_user
from ws_manager.manager import connection_manager

router = APIRouter()


@router.get("")
async def list_notifications(
    unread_only: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=50),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    query = {"user_id": current_user["_id"]}
    if unread_only:
        query["is_read"] = False

    skip = (page - 1) * limit
    cursor = db.notifications.find(query).skip(skip).limit(limit).sort("created_at", -1)
    notifications = []
    async for n in cursor:
        n["id"] = str(n.pop("_id"))
        # Convert every remaining field that may contain ObjectId or datetime
        for k, v in list(n.items()):
            if isinstance(v, ObjectId):
                n[k] = str(v)
            elif isinstance(v, datetime):
                n[k] = v.isoformat()
        notifications.append(n)

    unread_count = await db.notifications.count_documents({"user_id": current_user["_id"], "is_read": False})

    return {"notifications": notifications, "unread_count": unread_count}


@router.put("/{notif_id}/read")
async def mark_read(
    notif_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await db.notifications.update_one(
        {"_id": ObjectId(notif_id), "user_id": current_user["_id"]},
        {"$set": {"is_read": True}},
    )
    return {"message": "Marked as read"}


@router.put("/read-all")
async def mark_all_read(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    result = await db.notifications.update_many(
        {"user_id": current_user["_id"], "is_read": False},
        {"$set": {"is_read": True}},
    )
    return {"updated": result.modified_count}


@router.delete("/{notif_id}")
async def delete_notification(
    notif_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await db.notifications.delete_one(
        {"_id": ObjectId(notif_id), "user_id": current_user["_id"]}
    )
    return {"message": "Deleted"}


@router.delete("")
async def delete_all_notifications(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    result = await db.notifications.delete_many({"user_id": current_user["_id"]})
    return {"deleted": result.deleted_count}


@router.websocket("/ws")
async def notifications_websocket(
    websocket: WebSocket,
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

    user_id = str(user["_id"])
    await connection_manager.connect_user(websocket, user_id)
    try:
        while True:
            await websocket.receive_text()  # Keep alive (ping/pong handled by client)
    except WebSocketDisconnect:
        connection_manager.disconnect_user(websocket, user_id)
