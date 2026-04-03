from datetime import datetime, timezone
from bson import ObjectId
from typing import Union
import logging

logger = logging.getLogger(__name__)


async def notify_users(
    db,
    user_ids: list[Union[str, ObjectId]],
    notification_type: str,
    title: str,
    body: str,
    reference_id: str = None,
    reference_type: str = None,
    link: str = None,
):
    """Create in-app notifications for a list of users and push via WebSocket."""
    from ws_manager.manager import connection_manager

    docs = []
    now = datetime.now(timezone.utc)
    for uid in user_ids:
        uid_obj = ObjectId(uid) if isinstance(uid, str) else uid
        docs.append({
            "user_id": uid_obj,
            "type": notification_type,
            "title": title,
            "body": body,
            "link": link,
            "reference_id": reference_id,
            "reference_type": reference_type,
            "is_read": False,
            "is_email_sent": False,
            "created_at": now,
        })

    if docs:
        result = await db.notifications.insert_many(docs)
        inserted_ids = result.inserted_ids
    else:
        inserted_ids = []

    # Push live notifications via WebSocket (include real _id so frontend can mark read)
    for i, uid in enumerate(user_ids):
        notif_id = str(inserted_ids[i]) if i < len(inserted_ids) else None
        await connection_manager.send_to_user(str(uid), {
            "type": "notification",
            "id": notif_id,
            "title": title,
            "body": body,
            "notification_type": notification_type,
            "reference_id": reference_id,
            "reference_type": reference_type,
            "timestamp": now.isoformat(),
        })


async def send_email_notification(
    to_email: str,
    subject: str,
    body: str,
):
    """Send email notification (stub — integrate with FastAPI-Mail or SMTP)."""
    logger.info(f"[EMAIL] To: {to_email} | Subject: {subject}")
    # from fastapi_mail import FastMail, MessageSchema
    # Implement with your SMTP config
