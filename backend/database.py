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
        logger.info("MongoDB indexes created")


class RedisClient:
    client: Redis = None

    async def connect(self):
        self.client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        await self.client.ping()
        logger.info("Redis connected")

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
