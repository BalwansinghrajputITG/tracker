"""
Company-calendar date handling for the time modules (hr.md §12, §13, §14).

Everything that reasons about a "day" goes through here, because attendance,
leave and holidays must agree on what a day IS. Two records disagreeing by an
hour of timezone offset is how an employee ends up marked absent on a day they
took approved leave.

THE CONTRACT: a company-local calendar day is stored as UTC midnight of that
date. `day_key(dt)` produces it; every query filters on values it produced.

The company runs in one timezone. That is a real assumption, stated rather than
hidden: a multi-region rollout needs per-employee timezones on hr_employees, and
this module is where that change would land.
"""

from __future__ import annotations

from datetime import date as date_cls, datetime, timedelta, timezone

from models.hr.attendance import WEEKEND_DAYS

# Company timezone as an offset from UTC. India Standard Time by default, matching
# the seeded demo data. A named zone would be better; an offset avoids a tzdata
# dependency and is correct for zones without DST — which IST is.
COMPANY_UTC_OFFSET_MINUTES = 330


def company_now() -> datetime:
    """Wall-clock time in the company's timezone, as a naive datetime."""
    return datetime.now(timezone.utc) + timedelta(minutes=COMPANY_UTC_OFFSET_MINUTES)


def day_key(value: datetime | date_cls | None = None) -> datetime:
    """The canonical stored value for a company-local calendar day.

    Pass a UTC datetime and get the UTC-midnight marker for the company-local day
    it falls in. 18:00 UTC on the 11th is already the 12th in IST, and this is
    what makes that come out as the 12th rather than the 11th.
    """
    if value is None:
        local = company_now()
    elif isinstance(value, datetime):
        aware_value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        local = aware_value.astimezone(timezone.utc).replace(tzinfo=None) + timedelta(
            minutes=COMPANY_UTC_OFFSET_MINUTES
        )
    else:
        local = datetime(value.year, value.month, value.day)
    return datetime(local.year, local.month, local.day, tzinfo=timezone.utc)


def is_weekend(day: datetime) -> bool:
    return day.weekday() in WEEKEND_DAYS


def working_days_between(start: datetime, end: datetime, holidays: set[datetime]) -> float:
    """Count working days in an inclusive range, excluding weekends and holidays.

    This is what a leave request actually costs. Charging calendar days instead
    would bill an employee for the weekend in the middle of a week off.
    """
    if end < start:
        return 0
    total = 0
    cursor = start
    while cursor <= end:
        if not is_weekend(cursor) and cursor not in holidays:
            total += 1
        cursor += timedelta(days=1)
    return float(total)


def date_range(start: datetime, end: datetime):
    """Yield each day-key in an inclusive range."""
    cursor = start
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=1)


async def holiday_days(db, start: datetime, end: datetime, *, department_id=None) -> set[datetime]:
    """Holiday day-keys applying to a department within a range.

    Optional (floating) holidays are excluded: they are only holidays for the
    people who choose to take them, so they must not silently discount everyone's
    leave or suppress everyone's attendance.
    """
    query: dict = {
        "date": {"$gte": start, "$lte": end},
        "is_optional": {"$ne": True},
        "$or": [
            {"holiday_type": {"$in": ["company", "public"]}},
            {"holiday_type": "department", "department_id": department_id},
        ],
    }
    return {
        h["date"].replace(tzinfo=timezone.utc) if h["date"].tzinfo is None else h["date"]
        async for h in db.hr_holidays.find(query, {"date": 1})
    }
