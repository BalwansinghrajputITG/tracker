"""
Database seed script — creates demo users, teams, and projects for all roles.
Run: python database/seed.py
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGO_URL = os.getenv("MONGODB_URL", "mongodb+srv://balwanrajput_db_user:170800@zenova.bzjqhcl.mongodb.net")
DB_NAME = os.getenv("MONGODB_DB_NAME", "enterprise_pm")

# Note: SECRET_KEY is loaded from .env but not used for password hashing (only JWT)
SECRET_KEY = os.getenv("SECRET_KEY", "")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

import hashlib

def hash_password(password: str) -> str:
    # Normalize password with SHA256 (64-char hex < 72-byte bcrypt limit)
    normalized = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return pwd_context.hash(normalized)

USERS = [
    {"email": "ceo@company.com",      "password": "ceo123",      "full_name": "Alice CEO",       "roles": ["ceo"],       "department": "Executive"},
    {"email": "coo@company.com",      "password": "coo123",      "full_name": "Bob COO",         "roles": ["coo"],       "department": "Operations"},
    {"email": "pm@company.com",       "password": "pm123",       "full_name": "Carol PM",        "roles": ["pm"],        "department": "Engineering"},
    {"email": "tl@company.com",       "password": "tl123",       "full_name": "Dave TL",         "roles": ["team_lead"], "department": "Engineering"},
    {"email": "emp1@company.com",     "password": "emp123",      "full_name": "Eve Employee",    "roles": ["employee"],  "department": "Engineering"},
    {"email": "emp2@company.com",     "password": "emp123",      "full_name": "Frank Dev",       "roles": ["employee"],  "department": "Engineering"},
    {"email": "emp3@company.com",     "password": "emp123",      "full_name": "Grace Designer",  "roles": ["employee"],  "department": "Design"},
]


async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Clear existing data
    for col in ["users", "teams", "projects", "tasks", "daily_reports", "chat_rooms"]:
        await db[col].delete_many({})

    print("Seeding users...")
    user_ids = {}
    for u in USERS:
        doc = {
            **u,
            "password_hash": hash_password(u.pop("password")),
            "primary_role": u["roles"][0],
            "team_ids": [],
            "project_ids": [],
            "manager_id": None,
            "is_active": True,
            "last_seen": datetime.now(timezone.utc),
            "notification_preferences": {"email": True, "in_app": True, "daily_digest": False},
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        result = await db.users.insert_one(doc)
        user_ids[u["email"]] = result.inserted_id
        print(f"  Created user: {u['email']}")

    print("Seeding team...")
    team_members = [user_ids["tl@company.com"], user_ids["emp1@company.com"], user_ids["emp2@company.com"], user_ids["emp3@company.com"]]
    team_doc = {
        "name": "Engineering Team Alpha",
        "description": "Core product engineering team",
        "department": "Engineering",
        "lead_id": user_ids["tl@company.com"],
        "member_ids": team_members,
        "project_ids": [],
        "is_active": True,
        "created_by": user_ids["ceo@company.com"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    team_result = await db.teams.insert_one(team_doc)
    team_id = team_result.inserted_id
    await db.users.update_many({"_id": {"$in": team_members}}, {"$push": {"team_ids": team_id}})

    print("Seeding project...")
    project_doc = {
        "name": "Enterprise Portal v2.0",
        "description": "Complete redesign of the internal portal",
        "status": "active",
        "priority": "high",
        "pm_id": user_ids["pm@company.com"],
        "team_ids": [team_id],
        "member_ids": team_members,
        "start_date": datetime.now(timezone.utc) - timedelta(days=30),
        "due_date": datetime.now(timezone.utc) + timedelta(days=60),
        "progress_percentage": 35,
        "milestones": [{"id": str(ObjectId()), "title": "Design Phase", "due_date": datetime.now(timezone.utc) + timedelta(days=15), "is_completed": False}],
        "tags": ["portal", "redesign"],
        "budget": {"allocated": 50000, "spent": 18000, "currency": "USD"},
        "is_delayed": False,
        "delay_reason": None,
        "completed_at": None,
        "created_by": user_ids["pm@company.com"],
        "created_at": datetime.now(timezone.utc) - timedelta(days=30),
        "updated_at": datetime.now(timezone.utc),
    }
    project_result = await db.projects.insert_one(project_doc)
    project_id = project_result.inserted_id

    # Delayed project
    delayed_doc = {
        **project_doc,
        "_id": ObjectId(),
        "name": "Mobile App Rewrite",
        "status": "active",
        "is_delayed": True,
        "delay_reason": "Backend API dependencies not ready",
        "progress_percentage": 15,
        "due_date": datetime.now(timezone.utc) - timedelta(days=5),
    }
    await db.projects.insert_one(delayed_doc)

    print("Seeding tasks...")
    for i, title in enumerate(["Implement auth module", "Design dashboard UI", "Set up CI/CD", "API integration", "Unit tests"]):
        await db.tasks.insert_one({
            "project_id": project_id,
            "title": title,
            "description": f"Task description for {title}",
            "status": ["todo", "in_progress", "review", "in_progress", "todo"][i],
            "priority": ["high", "medium", "low", "high", "medium"][i],
            "assignee_ids": [team_members[i % len(team_members)]],
            "reporter_id": user_ids["pm@company.com"],
            "due_date": datetime.now(timezone.utc) + timedelta(days=7 + i * 3),
            "estimated_hours": 8 + i * 2,
            "logged_hours": i * 3,
            "is_blocked": i == 3,
            "blocked_reason": "Waiting for design approval" if i == 3 else None,
            "comments": [],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })

    print("Seeding daily reports...")
    for emp_email in ["emp1@company.com", "emp2@company.com"]:
        for days_ago in range(5):
            report_date = datetime.now(timezone.utc) - timedelta(days=days_ago)
            await db.daily_reports.insert_one({
                "user_id": user_ids[emp_email],
                "project_id": project_id,
                "team_id": team_id,
                "report_date": report_date.replace(hour=0, minute=0, second=0, microsecond=0),
                "structured_data": {
                    "tasks_completed": [{"description": "Worked on feature X", "hours_spent": 4, "status": "completed"}],
                    "tasks_planned": ["Continue feature X", "Code review"],
                    "blockers": [] if days_ago > 0 else ["Waiting for API spec"],
                    "hours_worked": 8,
                },
                "unstructured_notes": f"Good productive day. Progress on the portal project.",
                "mood": ["good", "great", "neutral", "good", "good"][days_ago],
                "is_late_submission": False,
                "reviewed_by": None,
                "reviewed_at": None,
                "review_comment": None,
                "ai_summary": None,
                "submitted_at": report_date,
                "created_at": report_date,
            })

    print("\nSeed complete!")
    print("\nLogin credentials:")
    for u in USERS:
        email = u["email"]
        role = u["roles"][0]
        passwords = {"ceo": "ceo123", "coo": "coo123", "pm": "pm123", "team_lead": "tl123", "employee": "emp123"}
        print(f"  {role:12} → {email:25} / {passwords.get(role, 'emp123')}")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
