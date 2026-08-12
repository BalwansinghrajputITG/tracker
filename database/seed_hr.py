"""
HR Controller demo data (docs/hr.md Phase 2).

Run: python database/seed_hr.py

ADDITIVE AND IDEMPOTENT BY DESIGN. Unlike database/seed.py — which delete_many()s
users, teams, projects, tasks, daily_reports and chat_rooms at line 47 — this
script only upserts. Running it twice changes nothing, and running it never
destroys existing demo data. Keeping the two separate is deliberate: HR seeding
should never be a reason to lose the rest of the workspace.

Requires database/seed.py to have run first, since HR profiles attach to users.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# load_dotenv() with no argument resolves from the CALLING FILE's directory and
# walks up — so from database/ it never finds backend/.env and silently falls
# back to the defaults below. Point it at the real file.
BACKEND_ENV = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(BACKEND_ENV)

MONGO_URL = os.getenv("MONGODB_URL")
DB_NAME = os.getenv("MONGODB_DB_NAME", "enterprise_pm")

if not MONGO_URL:
    sys.exit(f"MONGODB_URL not set. Looked in {BACKEND_ENV}")


DEPARTMENTS = [
    {"name": "Executive",   "description": "Company leadership",              "cost_center": "CC-100"},
    {"name": "Engineering", "description": "Product engineering",             "cost_center": "CC-200"},
    {"name": "Design",      "description": "Product design and brand",        "cost_center": "CC-300"},
    {"name": "Operations",  "description": "Business and people operations",  "cost_center": "CC-400"},
]

# level ascends with seniority; salary bands are annual INR.
DESIGNATIONS = [
    {"title": "Chief Executive Officer",  "level": 10, "career_level": "executive", "department": "Executive",   "band": (6000000, 9000000)},
    {"title": "Chief Operating Officer",  "level": 9,  "career_level": "executive", "department": "Executive",   "band": (5000000, 7500000)},
    {"title": "Engineering Manager",      "level": 7,  "career_level": "manager",   "department": "Engineering", "band": (3000000, 4500000)},
    {"title": "Team Lead",                "level": 6,  "career_level": "manager",   "department": "Engineering", "band": (2200000, 3200000)},
    {"title": "Senior Software Engineer", "level": 5,  "career_level": "ic",        "department": "Engineering", "band": (1800000, 2600000)},
    {"title": "Software Engineer",        "level": 4,  "career_level": "ic",        "department": "Engineering", "band": (1200000, 1800000)},
    {"title": "Junior Software Engineer", "level": 3,  "career_level": "ic",        "department": "Engineering", "band": (700000, 1100000)},
    {"title": "Product Designer",         "level": 4,  "career_level": "ic",        "department": "Design",      "band": (1100000, 1700000)},
]

# email → (designation title, manager email, employment_type, work_mode, months of tenure)
# The manager chain forms the §5 org chart:
#   Alice CEO → Bob COO
#             → Carol PM → Dave TL → Eve / Frank / Grace
EMPLOYEES = {
    "ceo@company.com":  ("Chief Executive Officer",  None,                "full_time", "hybrid", 72),
    "coo@company.com":  ("Chief Operating Officer",  "ceo@company.com",   "full_time", "hybrid", 60),
    "pm@company.com":   ("Engineering Manager",      "ceo@company.com",   "full_time", "onsite", 48),
    "tl@company.com":   ("Team Lead",                "pm@company.com",    "full_time", "onsite", 36),
    "emp1@company.com": ("Senior Software Engineer", "tl@company.com",    "full_time", "remote", 24),
    "emp2@company.com": ("Software Engineer",        "tl@company.com",    "full_time", "onsite", 14),
    "emp3@company.com": ("Product Designer",         "tl@company.com",    "full_time", "hybrid", 9),
}

# Deliberately only three, so the "salary column is absent for unauthorized
# callers" test has both populated and empty rows to check.
COMPENSATION = {
    "ceo@company.com":  (700000, 9000000),
    "tl@company.com":   (240000, 3000000),
    "emp1@company.com": (180000, 2200000),
}

LEAVE_TYPES = [
    {"code": "AL",  "name": "Annual Leave",    "days": 21, "paid": True,  "half_day": True,  "carry_forward": True},
    {"code": "SL",  "name": "Sick Leave",      "days": 12, "paid": True,  "half_day": True,  "max_consecutive": 5},
    {"code": "CL",  "name": "Casual Leave",    "days": 8,  "paid": True,  "half_day": True,  "max_consecutive": 3},
    {"code": "UL",  "name": "Unpaid Leave",    "days": 30, "paid": False, "half_day": False},
    {"code": "ML",  "name": "Maternity Leave", "days": 182, "paid": True, "half_day": False, "gender": "female"},
    {"code": "PL",  "name": "Paternity Leave", "days": 15, "paid": True,  "half_day": False, "gender": "male"},
]

# (name, month, day, is_optional) — Indian public holidays for the demo calendar.
HOLIDAYS = [
    ("New Year's Day",     1,  1,  False),
    ("Republic Day",       1,  26, False),
    ("Holi",               3,  14, False),
    ("Independence Day",   8,  15, False),
    ("Gandhi Jayanti",     10, 2,  False),
    ("Diwali",             11, 8,  False),
    ("Christmas Day",      12, 25, False),
    ("Your Birthday",      6,  1,  True),   # optional/floating — must NOT suppress attendance
]


async def seed_hr():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    now = datetime.now(timezone.utc)

    users = {u["email"]: u async for u in db.users.find({}, {"email": 1, "full_name": 1})}
    if not users:
        sys.exit("No users found. Run `python database/seed.py` first.")

    # ── Departments (upsert; extend with the §4 fields) ───────────────────────
    print("Departments...")
    dept_ids = {}
    for d in DEPARTMENTS:
        existing = await db.departments.find_one({"name": d["name"]})
        fields = {
            "description": d["description"],
            "cost_center": d["cost_center"],
            "budget":      {"allocated": 0, "spent": 0, "currency": "INR"},
            "updated_at":  now,
        }
        if existing:
            await db.departments.update_one({"_id": existing["_id"]}, {"$set": fields})
            dept_ids[d["name"]] = existing["_id"]
            print(f"  = {d['name']}")
        else:
            res = await db.departments.insert_one({
                "name": d["name"], **fields,
                "pm_id": None, "tl_id": None, "head_user_id": None,
                "created_by": users["ceo@company.com"]["_id"],
                "created_at": now,
            })
            dept_ids[d["name"]] = res.inserted_id
            print(f"  + {d['name']}")

    # ── Designations ──────────────────────────────────────────────────────────
    print("Designations...")
    designation_ids = {}
    for d in DESIGNATIONS:
        dept_id = dept_ids.get(d["department"])
        existing = await db.hr_designations.find_one({"title": d["title"], "department_id": dept_id})
        fields = {
            "level":        d["level"],
            "career_level": d["career_level"],
            "salary_band":  {"min": d["band"][0], "max": d["band"][1], "currency": "INR"},
            "description":  "",
            "is_active":    True,
            "reports_to_designation_id": None,
            "updated_at":   now,
        }
        if existing:
            await db.hr_designations.update_one({"_id": existing["_id"]}, {"$set": fields})
            designation_ids[d["title"]] = existing["_id"]
        else:
            res = await db.hr_designations.insert_one({
                "title": d["title"], "department_id": dept_id, **fields,
                "created_by": users["ceo@company.com"]["_id"], "created_at": now,
            })
            designation_ids[d["title"]] = res.inserted_id
    print(f"  {len(designation_ids)} designations")

    # ── Employee profiles ─────────────────────────────────────────────────────
    print("Employee profiles...")
    employee_ids = {}
    for index, (email, (title, manager_email, emp_type, work_mode, tenure)) in enumerate(EMPLOYEES.items(), start=1):
        user = users.get(email)
        if not user:
            print(f"  ! no user {email}, skipped")
            continue

        dept_name = next((d["department"] for d in DESIGNATIONS if d["title"] == title), "Engineering")
        manager_id = users[manager_email]["_id"] if manager_email and manager_email in users else None

        fields = {
            "employee_code":     f"EMP-{index:04d}",
            "joining_date":      now - timedelta(days=tenure * 30),
            "date_of_birth":     now - timedelta(days=365 * (28 + index)),
            "gender":            "undisclosed",
            "personal_email":    email.replace("@company.com", "@personal.example"),
            "phone":             f"+91 90000 {10000 + index}",
            "address":           f"{index} Demo Street, Bengaluru 5600{index:02d}",
            "emergency_contact": {"name": "Demo Contact", "relationship": "Spouse", "phone": f"+91 98000 {20000 + index}"},
            "designation_id":    designation_ids.get(title),
            "department_id":     dept_ids.get(dept_name),
            "manager_user_id":   manager_id,
            "employment_type":   emp_type,
            "employment_status": "active" if tenure >= 6 else "probation",
            "work_mode":         work_mode,
            "work_location":     "Bengaluru HQ" if work_mode != "remote" else "Remote — India",
            "probation_status":  "confirmed" if tenure >= 6 else "ongoing",
            "probation_end_date": None if tenure >= 6 else now + timedelta(days=30),
            "confirmation_date": (now - timedelta(days=(tenure - 6) * 30)) if tenure >= 6 else None,
            "exit_date":         None,
            "exit_reason":       "",
            "external_ids":      {},
            "sync":              {"last_synced_at": None, "status": "local_only", "error": None},
            "updated_at":        now,
        }

        existing = await db.hr_employees.find_one({"user_id": user["_id"]})
        if existing:
            await db.hr_employees.update_one({"_id": existing["_id"]}, {"$set": fields})
            employee_ids[email] = existing["_id"]
            print(f"  = {email:22} {title}")
        else:
            res = await db.hr_employees.insert_one({
                "user_id": user["_id"], **fields,
                "created_by": users["ceo@company.com"]["_id"], "created_at": now,
            })
            employee_ids[email] = res.inserted_id
            print(f"  + {email:22} {title}")

    # ── Compensation (append-only; only insert when absent) ───────────────────
    print("Compensation...")
    for email, (monthly, ctc) in COMPENSATION.items():
        emp_id = employee_ids.get(email)
        if not emp_id:
            continue
        if await db.hr_compensation.find_one({"employee_id": emp_id}):
            print(f"  = {email} (already has records)")
            continue
        tenure = EMPLOYEES[email][4]
        await db.hr_compensation.insert_many([
            {
                "user_id": users[email]["_id"], "employee_id": emp_id,
                "base_salary": round(monthly * 0.85), "ctc": round(ctc * 0.85),
                "variable_pay": 0, "bonus": 0, "currency": "INR",
                "pay_frequency": "monthly",
                "effective_date": now - timedelta(days=tenure * 30),
                "reason": "hire", "notes": "Initial package on joining.",
                "approved_by": users["ceo@company.com"]["_id"],
                "created_by": users["ceo@company.com"]["_id"],
                "created_at": now - timedelta(days=tenure * 30),
            },
            {
                "user_id": users[email]["_id"], "employee_id": emp_id,
                "base_salary": monthly, "ctc": ctc,
                "variable_pay": round(ctc * 0.1), "bonus": 0, "currency": "INR",
                "pay_frequency": "monthly",
                "effective_date": now - timedelta(days=90),
                "reason": "revision", "notes": "Annual revision.",
                "approved_by": users["ceo@company.com"]["_id"],
                "created_by": users["ceo@company.com"]["_id"],
                "created_at": now - timedelta(days=90),
            },
        ])
        print(f"  + {email:22} 2 records")

    # ── Leave types (§13) ─────────────────────────────────────────────────────
    print("Leave types...")
    leave_type_ids = {}
    for lt in LEAVE_TYPES:
        existing = await db.hr_leave_types.find_one({"code": lt["code"]})
        fields = {
            "name": lt["name"], "days_per_year": lt["days"], "is_paid": lt["paid"],
            "requires_approval": True, "allow_half_day": lt["half_day"],
            "max_consecutive_days": lt.get("max_consecutive"),
            "carry_forward": lt.get("carry_forward", False),
            "gender_restriction": lt.get("gender", ""),
            "is_active": True,
        }
        if existing:
            await db.hr_leave_types.update_one({"_id": existing["_id"]}, {"$set": fields})
            leave_type_ids[lt["code"]] = existing["_id"]
        else:
            res = await db.hr_leave_types.insert_one({"code": lt["code"], **fields, "created_at": now})
            leave_type_ids[lt["code"]] = res.inserted_id
    print(f"  {len(leave_type_ids)} leave types")

    # ── Leave balances for the current year ───────────────────────────────────
    print("Leave balances...")
    year = now.year
    balance_count = 0
    for email in EMPLOYEES:
        user = users.get(email)
        if not user:
            continue
        for lt in LEAVE_TYPES:
            if lt.get("gender"):        # skip gender-restricted types in demo data
                continue
            type_id = leave_type_ids[lt["code"]]
            existing = await db.hr_leave_balances.find_one(
                {"user_id": user["_id"], "leave_type_id": type_id, "year": year}
            )
            if existing:
                continue
            await db.hr_leave_balances.insert_one({
                "user_id": user["_id"], "leave_type_id": type_id, "year": year,
                "allocated": lt["days"], "used": 0, "pending": 0,
                "carried_forward": 0, "updated_at": now,
            })
            balance_count += 1
    print(f"  {balance_count} balance rows created")

    # ── Holidays (§14) ────────────────────────────────────────────────────────
    print("Holidays...")
    holiday_count = 0
    for name, month, day, optional in HOLIDAYS:
        date = datetime(year, month, day, tzinfo=timezone.utc)
        if await db.hr_holidays.find_one({"name": name, "date": date}):
            continue
        await db.hr_holidays.insert_one({
            "name": name, "date": date, "holiday_type": "public",
            "department_id": None, "region": "", "is_optional": optional,
            "description": "", "year": year,
            "created_by": users["ceo@company.com"]["_id"], "created_at": now,
        })
        holiday_count += 1
    print(f"  {holiday_count} holidays added")

    print("\nHR seed complete (additive — nothing was deleted).")
    print(f"  departments   {await db.departments.count_documents({})}")
    print(f"  designations  {await db.hr_designations.count_documents({})}")
    print(f"  employees     {await db.hr_employees.count_documents({})}")
    print(f"  compensation  {await db.hr_compensation.count_documents({})}")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_hr())
