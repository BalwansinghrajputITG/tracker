"""
Email delivery (hr.md §27).

Replaces the stub at services/notification_service.py:60-68, which only called
logger.info while writing `is_email_sent: False` that nothing ever read.

Three principles:

  Never blocks the request. Sending happens off the request path; an SMTP server
  that takes 8 seconds must not make the user's approval take 8 seconds.

  Never raises. A failed email must not fail the action that triggered it —
  a leave approval that succeeded but 500s because SMTP was down is worse than
  a missing email. Failures are recorded on the notification for later retry.

  No-ops cleanly when unconfigured. SMTP_USER/SMTP_PASSWORD are empty in this
  deployment, so the default path logs and marks the row rather than erroring —
  matching how Redis and storage degrade here.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from bson import ObjectId

from config import settings

logger = logging.getLogger(__name__)

MAX_EMAIL_ATTEMPTS = 3

# Never allowed into an email body. §37 forbids sensitive HR data leaving over a
# channel we do not control; an email sits in an inbox forever and is frequently
# forwarded. Notifications reference the record, they never quote it.
_FORBIDDEN_IN_BODY = re.compile(
    r"\b(salary|ctc|compensation|payslip|bank\s*account|aadhaar|ssn|pan\s*number)\b",
    re.IGNORECASE,
)


def is_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def redact_body(body: str) -> tuple[str, bool]:
    """Strip sensitive terms from an outbound body.

    Returns (safe_body, was_redacted). Rather than dropping the email, the body
    is replaced with a pointer back into the app — the recipient still learns
    that something needs their attention, without the figure travelling by mail.
    """
    if _FORBIDDEN_IN_BODY.search(body or ""):
        return ("You have an update that contains confidential information. "
                "Please sign in to view it."), True
    return body, False


async def send_email(to: str, subject: str, body: str) -> tuple[bool, str]:
    """Send one email. Returns (sent, error). Never raises."""
    safe_body, redacted = redact_body(body)
    if redacted:
        logger.info("Email body redacted before sending to %s (subject=%r)", to, subject)

    if not is_configured():
        logger.info("[EMAIL-NOOP] to=%s subject=%r (SMTP not configured)", to, subject)
        return False, "smtp_not_configured"

    try:
        from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

        config = ConnectionConfig(
            MAIL_USERNAME=settings.SMTP_USER,
            MAIL_PASSWORD=settings.SMTP_PASSWORD,
            MAIL_FROM=settings.EMAIL_FROM,
            MAIL_PORT=settings.SMTP_PORT,
            MAIL_SERVER=settings.SMTP_HOST,
            MAIL_STARTTLS=settings.SMTP_PORT == 587,
            MAIL_SSL_TLS=settings.SMTP_PORT == 465,
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True,
        )
        message = MessageSchema(
            subject=subject,
            recipients=[to],
            body=safe_body,
            subtype=MessageType.plain,
        )
        await FastMail(config).send_message(message)
        return True, ""
    except Exception as exc:
        logger.error("Email send failed to=%s subject=%r: %s", to, subject, exc)
        return False, str(exc)[:200]


async def deliver_notification_email(db, notification_id) -> bool:
    """Send the email for one notification row and record the outcome.

    This is what finally reads and writes `is_email_sent`, which the existing
    code has been setting to False and ignoring since it was written.
    """
    nid = ObjectId(notification_id) if isinstance(notification_id, str) else notification_id
    notification = await db.notifications.find_one({"_id": nid})
    if not notification or notification.get("is_email_sent"):
        return False

    user = await db.users.find_one(
        {"_id": notification["user_id"]},
        {"email": 1, "full_name": 1, "notification_preferences": 1},
    )
    if not user:
        return False

    # Honour the per-user preference that already exists on the user document
    # but has never been consulted.
    if not (user.get("notification_preferences") or {}).get("email", True):
        await db.notifications.update_one(
            {"_id": nid}, {"$set": {"email_error": "user_opted_out", "email_attempts": 0}}
        )
        return False

    sent, error = await send_email(
        to=user["email"],
        subject=notification.get("title", "Notification"),
        body=notification.get("body", ""),
    )

    update = {
        "is_email_sent": sent,
        "email_attempts": (notification.get("email_attempts") or 0) + 1,
        "email_error": None if sent else error,
    }
    if sent:
        update["email_sent_at"] = datetime.now(timezone.utc)
    await db.notifications.update_one({"_id": nid}, {"$set": update})
    return sent


async def retry_failed_emails(db, limit: int = 50) -> dict:
    """Job entrypoint: retry notifications whose email has not gone out.

    Capped at MAX_EMAIL_ATTEMPTS so an unconfigured or permanently broken SMTP
    server does not have every notification retried forever on every cron tick.
    """
    pending = await db.notifications.find({
        "is_email_sent": False,
        "email_requested": True,
        "email_attempts": {"$lt": MAX_EMAIL_ATTEMPTS},
    }).sort("created_at", 1).limit(limit).to_list(limit)

    sent = 0
    for notification in pending:
        if await deliver_notification_email(db, notification["_id"]):
            sent += 1

    return {"considered": len(pending), "sent": sent, "configured": is_configured()}
