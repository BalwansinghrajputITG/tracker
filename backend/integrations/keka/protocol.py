"""
HRIS provider interface (hr.md §16).

The spec's requirement is "do not tightly couple the application directly to Keka
APIs" — so nothing outside this package may import a Keka type or know a Keka
field name. Everything speaks the normalized shapes below, and swapping Keka for
BambooHR or Darwinbox means writing one new class.

Modelled on routers/project_tools.py, which already does declarative credential
field definitions, Fernet storage and masked reads for a dozen providers.

A provider returns NORMALIZED records: the mapping from provider fields to these
keys happens inside the adapter, which is the whole point of the seam.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

# ── Normalized record shapes ─────────────────────────────────────────────────
#
# employee: {
#   "external_id":     str        REQUIRED — the provider's stable id
#   "email":           str        REQUIRED — how we match to a local user
#   "full_name":       str
#   "employee_code":   str | None
#   "joining_date":    datetime | None
#   "date_of_birth":   datetime | None
#   "phone":           str
#   "department_name": str | None
#   "designation_title": str | None
#   "manager_email":   str | None    resolved to manager_user_id locally
#   "employment_type": str | None
#   "employment_status": str | None
#   "work_location":   str
# }
#
# department: {"external_id": str, "name": str, "description": str}
#
# attendance: {"external_id", "employee_email", "date", "status",
#              "check_in", "check_out", "worked_minutes"}
#
# leave: {"external_id", "employee_email", "leave_type", "start_date",
#         "end_date", "days", "status"}


@runtime_checkable
class HRISProvider(Protocol):
    """What any HRIS provider must offer.

    Every method returns a list of normalized dicts. A provider that cannot
    serve an entity raises NotSupportedError rather than returning [] — an empty
    list means "nothing there", which the reconciler would read as "everything
    was deleted remotely".
    """

    name: str

    async def health(self) -> dict:
        """Connectivity + credential check. Never raises."""
        ...

    async def fetch_employees(self) -> list[dict]: ...
    async def fetch_departments(self) -> list[dict]: ...
    async def fetch_attendance(self, date_from, date_to) -> list[dict]: ...
    async def fetch_leave(self, date_from, date_to) -> list[dict]: ...


class NotSupportedError(RuntimeError):
    """The provider does not expose this entity, or the account lacks the scope.

    Deliberately distinct from an empty result: §36's reconciler treats a record
    missing from a full fetch as "no longer in the source", and an unsupported
    entity must never be mistaken for that.
    """


class ProviderError(RuntimeError):
    """The provider was reachable but refused or failed the request."""


# Entities the sync engine can actually reconcile TODAY, in dependency order —
# departments before employees, because an employee references a department.
SYNCABLE_ENTITIES = ("departments", "employees")

# Entities the provider interface can FETCH but the reconciler cannot yet merge.
# Kept separate rather than folded into SYNCABLE_ENTITIES: advertising them as
# syncable produced a 500 when one was actually called, and a clear
# "not implemented" is a better answer than a stack trace.
#
# Both need decisions this phase deliberately does not make. Attendance must
# reconcile against locally-recorded punches — when a provider record and a local
# check-in disagree about the same day, one has to win, and that is a policy
# question. Leave must map provider leave types onto hr_leave_types and decide
# whether an imported approval moves a local balance, which would let an
# external system spend someone's leave allowance.
PLANNED_ENTITIES = ("attendance", "leave")

# Fields the LOCAL system owns. §36: "never blindly overwrite". A remote value
# that disagrees with one of these is recorded as a conflict and NOT applied,
# because these are set through deliberate local workflows (an offer acceptance
# sets designation; an HR edit sets manager) and a nightly sync must not quietly
# undo them.
LOCALLY_OWNED_EMPLOYEE_FIELDS = frozenset({
    "designation_id", "manager_user_id", "employment_status", "work_mode",
})

# Fields the PROVIDER owns: the remote value wins without ceremony.
PROVIDER_OWNED_EMPLOYEE_FIELDS = frozenset({
    "employee_code", "joining_date", "date_of_birth", "phone", "work_location",
})
