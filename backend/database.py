from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis
from config import settings
import logging

logger = logging.getLogger(__name__)


class MongoDB:
    client: AsyncIOMotorClient = None
    db = None

    async def connect(self):
        self.client = AsyncIOMotorClient(settings.MONGODB_URL)
        self.db = self.client[settings.MONGODB_DB_NAME]
        await self._create_indexes()
        logger.info("MongoDB connected")

    async def disconnect(self):
        if self.client:
            self.client.close()
            logger.info("MongoDB disconnected")

    async def _create_indexes(self):
        db = self.db
        # Users
        await db.users.create_index("email", unique=True)
        await db.users.create_index("team_ids")
        await db.users.create_index("roles")
        # Projects
        await db.projects.create_index("status")
        await db.projects.create_index("pm_id")
        await db.projects.create_index("team_ids")
        await db.projects.create_index("is_delayed")
        # Reports
        await db.daily_reports.create_index([("user_id", 1), ("report_date", -1)])
        await db.daily_reports.create_index("project_id")
        await db.daily_reports.create_index("report_date")
        # Chat
        await db.chat_messages.create_index([("room_id", 1), ("sent_at", -1)])
        await db.chat_rooms.create_index("participants")
        # Notifications
        await db.notifications.create_index([("user_id", 1), ("is_read", 1)])
        await db.notifications.create_index("created_at")
        # Departments
        await db.departments.create_index("name", unique=True)
        await db.departments.create_index("created_by")
        # HR — employees (hr.md §3, §4, §5)
        # user_id is unique: hr_employees is a 1:1 extension of users, and a
        # second profile for one person would silently split their HR history.
        await db.hr_employees.create_index("user_id", unique=True)
        await db.hr_employees.create_index("employee_code", unique=True, sparse=True)
        await db.hr_employees.create_index("manager_user_id")     # org chart walk
        await db.hr_employees.create_index("department_id")
        await db.hr_employees.create_index("designation_id")
        await db.hr_employees.create_index("employment_status")
        await db.hr_designations.create_index([("title", 1), ("department_id", 1)], unique=True)
        await db.hr_designations.create_index("department_id")
        # Compensation is append-only, so the hot query is "latest for this employee".
        await db.hr_compensation.create_index([("employee_id", 1), ("effective_date", -1)])
        await db.hr_compensation.create_index([("user_id", 1), ("effective_date", -1)])
        # HR — time management (hr.md §12, §13, §14)
        # Unique (user_id, date): one attendance record per person per day, so a
        # duplicate is rejected by the database rather than by every write path
        # remembering to check.
        await db.hr_attendance.create_index([("user_id", 1), ("date", -1)], unique=True)
        await db.hr_attendance.create_index([("date", -1), ("status", 1)])
        await db.hr_attendance.create_index([("department_id", 1), ("date", -1)])
        await db.hr_leave_types.create_index("code", unique=True)
        # One balance row per person per type per year.
        await db.hr_leave_balances.create_index(
            [("user_id", 1), ("leave_type_id", 1), ("year", 1)], unique=True
        )
        await db.hr_leave_requests.create_index([("user_id", 1), ("start_date", -1)])
        await db.hr_leave_requests.create_index([("status", 1), ("manager_id", 1)])
        # Overlap detection on submit.
        await db.hr_leave_requests.create_index([("start_date", 1), ("end_date", 1)])
        await db.hr_holidays.create_index([("date", 1), ("holiday_type", 1)])
        await db.hr_holidays.create_index("year")
        # HR — recruitment (hr.md §6, §7, §8, §9, §10)
        await db.hr_jobs.create_index([("status", 1), ("created_at", -1)])
        await db.hr_jobs.create_index("department_id")
        # Email is the candidate identity: the same person applying twice must
        # be one candidate with two applications, not two candidates.
        await db.hr_candidates.create_index("email", unique=True)
        await db.hr_candidates.create_index("converted_user_id", sparse=True)
        # One application per candidate per job.
        await db.hr_applications.create_index([("candidate_id", 1), ("job_id", 1)], unique=True)
        await db.hr_applications.create_index([("job_id", 1), ("stage", 1), ("status", 1)])
        await db.hr_interviews.create_index([("application_id", 1), ("scheduled_at", 1)])
        await db.hr_interviews.create_index([("interviewer_ids", 1), ("scheduled_at", 1)])
        # One scorecard per interviewer per interview.
        await db.hr_interview_feedback.create_index(
            [("interview_id", 1), ("interviewer_id", 1)], unique=True
        )
        await db.hr_offers.create_index([("application_id", 1), ("status", 1)])
        await db.hr_offers.create_index([("status", 1), ("expires_at", 1)])
        await db.hr_onboarding_tasks.create_index([("user_id", 1), ("order", 1)])
        await db.hr_onboarding_tasks.create_index([("owner_user_id", 1), ("status", 1)])
        # HR — performance & helpdesk (hr.md §17, §18, §22)
        # Goals live in personal_targets; these support the HR views over it.
        await db.personal_targets.create_index([("user_id", 1), ("completed", 1)])
        await db.personal_targets.create_index("cycle_id", sparse=True)
        await db.hr_review_cycles.create_index([("status", 1), ("period_start", -1)])
        # One review per person per cycle.
        await db.hr_reviews.create_index([("cycle_id", 1), ("user_id", 1)], unique=True)
        await db.hr_reviews.create_index([("manager_user_id", 1), ("status", 1)])
        await db.hr_tickets.create_index("ticket_number", unique=True)
        await db.hr_tickets.create_index([("raised_by", 1), ("created_at", -1)])
        await db.hr_tickets.create_index([("status", 1), ("sla_due_at", 1)])
        await db.hr_tickets.create_index([("assigned_to", 1), ("status", 1)])
        await db.hr_ticket_messages.create_index([("ticket_id", 1), ("created_at", 1)])
        # HR — documents (hr.md §23, §38)
        await db.hr_documents.create_index([("user_id", 1), ("is_current", 1), ("created_at", -1)])
        await db.hr_documents.create_index([("doc_group_id", 1), ("version", -1)])
        # Drives the expiry-reminder job — without it that job scans the whole
        # collection on every cron tick.
        await db.hr_documents.create_index([("expires_at", 1), ("is_current", 1)])
        await db.hr_documents.create_index("doc_type")
        # Email retry queue (§27)
        await db.notifications.create_index([("is_email_sent", 1), ("email_requested", 1)])
        # HR — integrations (hr.md §16, §36)
        await db.hr_integration_credentials.create_index("provider", unique=True)
        await db.hr_sync_logs.create_index([("entity", 1), ("started_at", -1)])
        await db.hr_sync_logs.create_index("started_at")
        # Drives the conflict review queue.
        await db.hr_employees.create_index("sync.status", sparse=True)
        # HR — audit (hr.md §29)
        await db.hr_audit_logs.create_index([("created_at", -1)])
        await db.hr_audit_logs.create_index([("actor_id", 1), ("created_at", -1)])
        await db.hr_audit_logs.create_index([("subject_user_id", 1), ("created_at", -1)])
        await db.hr_audit_logs.create_index([("entity_type", 1), ("entity_id", 1)])
        await db.hr_audit_logs.create_index("action")
        logger.info("MongoDB indexes created")


class RedisClient:
    client: Redis = None

    async def connect(self):
        """Connect to Redis, leaving self.client as None if unreachable.

        Redis backs caching, rate limiting and pub/sub — all of which degrade
        gracefully (utils.cache short-circuits on a None client, the rate limiter
        fails open). Raising here instead would abort the FastAPI lifespan and
        take down every worker, so a cache outage must not block startup.
        /health still reports redis separately and returns 503 when it is down.
        """
        try:
            client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
            await client.ping()
            self.client = client
            logger.info("Redis connected")
        except Exception as exc:
            self.client = None
            logger.error(
                "Redis unavailable - starting without cache/rate-limiting/pub-sub: %s", exc
            )

    async def disconnect(self):
        if self.client:
            await self.client.close()
            logger.info("Redis disconnected")


mongodb = MongoDB()
redis_client = RedisClient()


def get_db():
    return mongodb.db


def get_redis():
    return redis_client.client
