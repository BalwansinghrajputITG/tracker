"""
Mock HRIS provider.

Not a stub that returns clean data — a stub that returns clean data verifies
nothing. This deliberately emits the payloads that break naive sync code:

  * a record with a malformed email          → must be rejected, never written
  * a record with no external_id             → must be rejected
  * a department name differing only by case → must not create a duplicate
  * an employee whose designation disagrees with the local record
                                             → must be recorded as a conflict,
                                               and the LOCAL value kept (§36)
  * a record that vanishes between runs      → must be marked local_only,
                                               NOT deleted

Every §36 property is therefore testable with no credentials and no network,
which is what let the reconciler be verified before Keka access existed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from integrations.keka.protocol import NotSupportedError

_NOW = datetime(2026, 8, 12, tzinfo=timezone.utc)


class MockProvider:
    name = "mock"

    def __init__(self, *, scenario: str = "default"):
        # 'default'      the full messy set
        # 'removed'      one employee disappears — the local_only path
        # 'unsupported'  attendance raises NotSupportedError
        self.scenario = scenario

    async def health(self) -> dict:
        return {"ok": True, "provider": self.name, "scenario": self.scenario}

    async def fetch_departments(self) -> list[dict]:
        return [
            {"external_id": "kd-1", "name": "Engineering", "description": "From Keka"},
            # Same department as the local "Design", differing only in case:
            # must match, not create a second one.
            {"external_id": "kd-2", "name": "design", "description": "From Keka"},
            {"external_id": "kd-3", "name": "Customer Success", "description": "New in Keka"},
            {"external_id": "", "name": "No External Id", "description": "must be rejected"},
        ]

    async def fetch_employees(self) -> list[dict]:
        records = [
            # Existing local employee. joining_date and phone are provider-owned
            # so they apply; employment_status is locally owned and disagrees,
            # so it must land in conflicts and NOT overwrite.
            {
                "external_id": "ke-1", "email": "emp1@company.com",
                "full_name": "Eve Employee", "employee_code": "EMP-0005",
                "joining_date": _NOW - timedelta(days=720),
                "date_of_birth": datetime(1994, 3, 14, tzinfo=timezone.utc),
                "phone": "+91 90000 11111",
                "department_name": "Engineering",
                "designation_title": "Engineering Manager",   # local says Senior SWE
                "manager_email": "tl@company.com",
                "employment_type": "full_time",
                "employment_status": "notice_period",          # local says active
                "work_location": "Bengaluru HQ",
            },
            # Brand new person — should be created.
            {
                "external_id": "ke-2", "email": "ravi.kumar@company.com",
                "full_name": "Ravi Kumar", "employee_code": "EMP-0101",
                "joining_date": _NOW - timedelta(days=45),
                "date_of_birth": datetime(1996, 7, 2, tzinfo=timezone.utc),
                "phone": "+91 90000 22222",
                "department_name": "Customer Success",
                "designation_title": "Support Engineer",
                "manager_email": "tl@company.com",
                "employment_type": "full_time",
                "employment_status": "active",
                "work_location": "Remote",
            },
            # Malformed email — must be rejected outright.
            {
                "external_id": "ke-3", "email": "not-an-email",
                "full_name": "Broken Record", "employee_code": "EMP-0102",
                "joining_date": _NOW, "date_of_birth": None, "phone": "",
                "department_name": "Engineering", "designation_title": None,
                "manager_email": None, "employment_type": "full_time",
                "employment_status": "active", "work_location": "",
            },
            # No external_id — must be rejected.
            {
                "external_id": "", "email": "ghost@company.com",
                "full_name": "No Id", "employee_code": None,
                "joining_date": None, "date_of_birth": None, "phone": "",
                "department_name": None, "designation_title": None,
                "manager_email": None, "employment_type": None,
                "employment_status": "active", "work_location": "",
            },
        ]
        if self.scenario == "removed":
            # ke-1 vanished from the source: previously synced, now absent.
            # It has to be ke-1 rather than ke-2, because ke-2 is rejected until
            # a local user exists — removing a record that was never written
            # would test nothing.
            records = [r for r in records if r["external_id"] != "ke-1"]
        return records

    async def fetch_attendance(self, date_from, date_to) -> list[dict]:
        if self.scenario == "unsupported":
            raise NotSupportedError("The mock account has no attendance scope")
        return [{
            "external_id": "ka-1", "employee_email": "emp1@company.com",
            "date": _NOW.replace(hour=0, minute=0, second=0, microsecond=0),
            "status": "present",
            "check_in": _NOW.replace(hour=3, minute=35),
            "check_out": _NOW.replace(hour=12, minute=40),
            "worked_minutes": 545,
        }]

    async def fetch_leave(self, date_from, date_to) -> list[dict]:
        return [{
            "external_id": "kl-1", "employee_email": "emp1@company.com",
            "leave_type": "Annual Leave",
            "start_date": _NOW + timedelta(days=20),
            "end_date": _NOW + timedelta(days=22),
            "days": 3.0, "status": "approved",
        }]
