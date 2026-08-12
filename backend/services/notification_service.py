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
    email: bool = False,
):
    """Create in-app notifications for a list of users and push via WebSocket.

    `email=True` additionally queues an email. It is opt-in and defaults to
    False so the twelve existing callers keep their current behaviour exactly.
    Delivery is attempted once inline (best effort, never raising) and anything
    that fails is picked up by the email.retry_failed job.
    """
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
            "email_requested": email,
            "email_attempts": 0,
            "email_error": None,
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

    # Best-effort inline email. Wrapped so a slow or broken SMTP server cannot
    # turn a successful leave approval into a 500; whatever fails here is
    # retried later by the email.retry_failed job.
    if email and inserted_ids:
        from services.email_service import deliver_notification_email
        for notif_id in inserted_ids:
            try:
                await deliver_notification_email(db, notif_id)
            except Exception as exc:
                logger.error("Inline email delivery failed for %s: %s", notif_id, exc)


async def send_email_notification(to_email: str, subject: str, body: str):
    """Send a one-off email.

    Kept for backwards compatibility; the real implementation now lives in
    services/email_service.py. Prefer notify_users(..., email=True), which also
    creates the in-app record and tracks delivery.
    """
    from services.email_service import send_email
    sent, _error = await send_email(to_email, subject, body)
    return sent
