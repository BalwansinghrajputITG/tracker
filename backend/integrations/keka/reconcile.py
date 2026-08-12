"""
Sync reconciliation (hr.md §36).

    Keka → Fetch → Normalize → Validate → Compare → Sync → Local Database

The spec's rule is one sentence: "Never blindly overwrite local data." Every
design decision here follows from it.

  Validate   A record missing an external_id or carrying a malformed email is
             REJECTED and never written. Rejects are returned, not swallowed —
             a sync that silently drops 40 of 300 employees looks like a success.

  Compare    Fields are partitioned into provider-owned and locally-owned.
             Provider-owned differences apply. Locally-owned differences are
             recorded as CONFLICTS and the local value is kept, because those
             fields are set by deliberate local workflows (an accepted offer
             sets designation; an HR edit sets the reporting line) and a nightly
             job must not quietly undo them.

  Sync       A source_hash of the incoming record short-circuits records that
             have not changed, so a re-run costs one comparison rather than one
             write per employee.

  Absent     A record that disappears from a full fetch is marked local_only.
             It is NEVER deleted: a provider outage returning a short list would
             otherwise delete the workforce.

Dry run performs every step except the writes and returns the same report, so
"what would this do" is answerable before it does it.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from integrations.keka.protocol import (
    LOCALLY_OWNED_EMPLOYEE_FIELDS, PROVIDER_OWNED_EMPLOYEE_FIELDS, NotSupportedError,
)

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _hash(record: dict) -> str:
    """Stable digest of a normalized record, for change detection."""
    payload = json.dumps(record, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def _blank(value: Any) -> bool:
    return value is None or value == "" or value == []


class SyncReport:
    """What a sync did, or would do. Returned to the caller and persisted."""

    def __init__(self, entity: str, provider: str, dry_run: bool):
        self.entity = entity
        self.provider = provider
        self.dry_run = dry_run
        self.fetched = 0
        self.created = 0
        self.updated = 0
        self.skipped = 0          # unchanged (source_hash matched)
        self.local_only = 0       # absent from the source this run
        self.rejected: list[dict] = []
        self.conflicts: list[dict] = []
        self.errors: list[str] = []

    def to_dict(self) -> dict:
        return {
            "entity": self.entity, "provider": self.provider, "dry_run": self.dry_run,
            "fetched": self.fetched, "created": self.created, "updated": self.updated,
            "skipped": self.skipped, "local_only": self.local_only,
            "rejected": self.rejected[:50], "rejected_count": len(self.rejected),
            "conflicts": self.conflicts[:50], "conflict_count": len(self.conflicts),
            "errors": self.errors,
        }


# ── Validation ────────────────────────────────────────────────────────────────

def validate_employee(record: dict) -> str | None:
    if not record.get("external_id"):
        return "missing external_id"
    email = (record.get("email") or "").strip().lower()
    if not email:
        return "missing email"
    if not EMAIL_RE.match(email):
        return f"malformed email: {email!r}"
    if not record.get("full_name"):
        return "missing full_name"
    return None


def validate_department(record: dict) -> str | None:
    if not record.get("external_id"):
        return "missing external_id"
    if not (record.get("name") or "").strip():
        return "missing name"
    return None


# ── Departments ───────────────────────────────────────────────────────────────

async def sync_departments(db, provider, *, dry_run: bool = True) -> SyncReport:
    report = SyncReport("departments", provider.name, dry_run)
    records = await provider.fetch_departments()
    report.fetched = len(records)
    now = datetime.now(timezone.utc)

    for record in records:
        error = validate_department(record)
        if error:
            report.rejected.append({"external_id": record.get("external_id"),
                                    "name": record.get("name"), "reason": error})
            continue

        name = record["name"].strip()
        # Match on external id first, then case-insensitively on name: a
        # department already created locally must not be duplicated just because
        # Keka spells it "design".
        existing = await db.departments.find_one({"external_ids.{}".format(provider.name): record["external_id"]})
        if not existing:
            existing = await db.departments.find_one(
                {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
            )

        source_hash = _hash(record)
        if existing and existing.get("sync", {}).get("source_hash") == source_hash:
            report.skipped += 1
            continue

        sync_meta = {"last_synced_at": now, "status": "synced", "error": None,
                     "source_hash": source_hash, "provider": provider.name}

        if existing:
            report.updated += 1
            if not dry_run:
                await db.departments.update_one({"_id": existing["_id"]}, {"$set": {
                    f"external_ids.{provider.name}": record["external_id"],
                    "sync": sync_meta, "updated_at": now,
                }})
        else:
            report.created += 1
            if not dry_run:
                await db.departments.insert_one({
                    "name": name, "description": record.get("description", ""),
                    "pm_id": None, "tl_id": None, "head_user_id": None,
                    "budget": {"allocated": 0, "spent": 0, "currency": "INR"},
                    "cost_center": "",
                    "external_ids": {provider.name: record["external_id"]},
                    "sync": sync_meta,
                    "created_by": None, "created_at": now, "updated_at": now,
                })

    return report


# ── Employees ─────────────────────────────────────────────────────────────────

async def sync_employees(db, provider, *, dry_run: bool = True) -> SyncReport:
    report = SyncReport("employees", provider.name, dry_run)
    records = await provider.fetch_employees()
    report.fetched = len(records)
    now = datetime.now(timezone.utc)

    departments = {
        (d.get("name") or "").lower(): d["_id"]
        async for d in db.departments.find({}, {"name": 1})
    }
    designations = {
        (d.get("title") or "").lower(): d["_id"]
        async for d in db.hr_designations.find({}, {"title": 1})
    }

    seen_external_ids: set[str] = set()

    for record in records:
        error = validate_employee(record)
        if error:
            report.rejected.append({"external_id": record.get("external_id"),
                                    "email": record.get("email"), "reason": error})
            continue

        external_id = record["external_id"]
        seen_external_ids.add(external_id)
        email = record["email"].strip().lower()

        user = await db.users.find_one({"email": email}, {"_id": 1})
        if not user:
            # A provider employee with no local login. Creating one silently
            # would mint an account nobody asked for, so this is surfaced as a
            # reject for a human to action — Phase 5's offer flow is the
            # sanctioned way a person becomes a user.
            report.rejected.append({
                "external_id": external_id, "email": email,
                "reason": "no local user with that email — create the account first",
            })
            continue

        employee = await db.hr_employees.find_one({"user_id": user["_id"]})
        source_hash = _hash(record)

        # The hash short-circuit is only safe when the LOCAL side is also settled.
        # It compares the remote record alone, so a record sitting in `conflict`
        # or `local_only` would be skipped forever: a returning employee would
        # never be re-linked, and a conflict resolved locally would never clear.
        # Re-evaluate anything not cleanly synced.
        existing_sync = (employee or {}).get("sync") or {}
        if (employee
                and existing_sync.get("source_hash") == source_hash
                and existing_sync.get("status") == "synced"):
            report.skipped += 1
            continue

        # Map names to local ids. An unknown department/designation is left
        # untouched rather than nulled — losing a local assignment because the
        # provider used a different label is exactly the overwrite §36 forbids.
        incoming: dict = {}
        for field in PROVIDER_OWNED_EMPLOYEE_FIELDS:
            value = record.get(field)
            if not _blank(value):
                incoming[field] = value

        if record.get("department_name"):
            dept_id = departments.get(record["department_name"].strip().lower())
            if dept_id:
                incoming["department_id"] = dept_id

        manager_id = None
        if record.get("manager_email"):
            manager = await db.users.find_one({"email": record["manager_email"]}, {"_id": 1})
            manager_id = manager["_id"] if manager else None

        # Values the provider proposes for LOCALLY-OWNED fields. These are
        # compared, reported, and deliberately not applied.
        proposed_local: dict = {}
        if record.get("designation_title"):
            desig_id = designations.get(record["designation_title"].strip().lower())
            if desig_id:
                proposed_local["designation_id"] = desig_id
        if manager_id:
            proposed_local["manager_user_id"] = manager_id
        if record.get("employment_status"):
            proposed_local["employment_status"] = record["employment_status"]

        sync_meta = {"last_synced_at": now, "status": "synced", "error": None,
                     "source_hash": source_hash, "provider": provider.name}

        if employee:
            conflicts = []
            for field, proposed in proposed_local.items():
                current = employee.get(field)
                if current is not None and current != proposed:
                    conflicts.append({
                        "field": field,
                        "local": str(current), "remote": str(proposed),
                        "resolution": "kept_local",
                    })
                elif current is None:
                    # No local value to protect — adopting the provider's is a
                    # fill, not an overwrite.
                    incoming[field] = proposed

            if conflicts:
                for c in conflicts:
                    report.conflicts.append({"external_id": external_id, "email": email, **c})
                sync_meta["status"] = "conflict"
                sync_meta["conflicts"] = conflicts

            report.updated += 1
            if not dry_run:
                await db.hr_employees.update_one({"_id": employee["_id"]}, {"$set": {
                    **incoming,
                    f"external_ids.{provider.name}": external_id,
                    "sync": sync_meta, "updated_at": now,
                }})
        else:
            report.created += 1
            if not dry_run:
                await db.hr_employees.insert_one({
                    "user_id": user["_id"],
                    "employee_code": record.get("employee_code") or None,
                    "joining_date": record.get("joining_date"),
                    "date_of_birth": record.get("date_of_birth"),
                    "gender": "", "personal_email": email,
                    "phone": record.get("phone", ""), "address": "",
                    "emergency_contact": {"name": "", "relationship": "", "phone": ""},
                    "designation_id": proposed_local.get("designation_id"),
                    "department_id": incoming.get("department_id"),
                    "manager_user_id": manager_id,
                    "employment_type": record.get("employment_type") or "full_time",
                    "employment_status": record.get("employment_status") or "active",
                    "work_mode": "onsite",
                    "work_location": record.get("work_location", ""),
                    "probation_status": "not_applicable",
                    "probation_end_date": None, "confirmation_date": None,
                    "exit_date": None, "exit_reason": "",
                    "external_ids": {provider.name: external_id},
                    "sync": sync_meta,
                    "created_by": None, "created_at": now, "updated_at": now,
                })

    # Records previously synced from this provider but absent this run.
    # Marked, never deleted: a provider outage returning a short list would
    # otherwise wipe the workforce.
    field = f"external_ids.{provider.name}"
    async for stale in db.hr_employees.find(
        {field: {"$exists": True, "$nin": list(seen_external_ids)}},
        {"_id": 1, field: 1},
    ):
        report.local_only += 1
        if not dry_run:
            await db.hr_employees.update_one(
                {"_id": stale["_id"]},
                {"$set": {"sync.status": "local_only", "sync.last_synced_at": now}},
            )

    return report


# ── Entrypoint ────────────────────────────────────────────────────────────────

SYNCERS = {
    "departments": sync_departments,
    "employees": sync_employees,
}


async def run_sync(db, provider, entity: str, *, dry_run: bool = True) -> dict:
    """Reconcile one entity and persist a log row.

    A dry run is logged too: "what would have happened" is worth keeping, and
    it is how a scheduled sync can be reviewed before being trusted.
    """
    if entity not in SYNCERS:
        raise ValueError(f"Cannot sync '{entity}'. Available: {', '.join(SYNCERS)}")

    started = datetime.now(timezone.utc)
    try:
        report = await SYNCERS[entity](db, provider, dry_run=dry_run)
        payload = report.to_dict()
        status = "ok" if not payload["errors"] else "partial"
    except NotSupportedError as exc:
        payload = SyncReport(entity, provider.name, dry_run).to_dict()
        payload["errors"] = [str(exc)]
        status = "not_supported"
    except Exception as exc:
        logger.exception("Sync failed for %s", entity)
        payload = SyncReport(entity, provider.name, dry_run).to_dict()
        payload["errors"] = [str(exc)[:300]]
        status = "error"

    duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
    log = {
        "provider": provider.name, "entity": entity, "dry_run": dry_run,
        "status": status, "duration_ms": duration_ms,
        "started_at": started, "finished_at": datetime.now(timezone.utc),
        **payload,
    }
    await db.hr_sync_logs.insert_one(dict(log))
    log.pop("_id", None)
    return {**payload, "status": status, "duration_ms": duration_ms}
