"""
Live Keka adapter (hr.md §16).

Keka authenticates with OAuth2 client credentials: POST the client id, secret and
an API key to the token endpoint, get a bearer token, refresh it before expiry.
The token is cached in memory — re-authenticating on every request would triple
the call count and Keka rate-limits.

NOTHING OUTSIDE THIS FILE KNOWS A KEKA FIELD NAME. `_normalize_*` maps their
payload onto the shapes in protocol.py; the reconciler and routers only ever see
those. Replacing Keka is writing one new class, not a migration.

Untested against the live API: the credentials had not arrived when this was
written. The shapes follow Keka's published v1 API. Everything downstream of the
adapter is verified against MockProvider, so if a field name here turns out to be
wrong, the fix is confined to _normalize_*.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from integrations.keka.protocol import NotSupportedError, ProviderError

logger = logging.getLogger(__name__)

# Keka's employment-status vocabulary → ours. Anything unmapped is left to the
# reconciler's validator to reject rather than silently coerced to "active".
_STATUS_MAP = {
    "Active": "active", "Probation": "probation",
    "NoticePeriod": "notice_period", "Resigned": "resigned",
    "Terminated": "terminated", "Relieved": "resigned",
}
_TYPE_MAP = {
    "FullTime": "full_time", "PartTime": "part_time",
    "Contract": "contract", "Intern": "intern", "Consultant": "consultant",
}


def _parse_date(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class KekaProvider:
    """Talks to Keka. Constructed with decrypted credentials by the router."""

    name = "keka"

    def __init__(self, *, base_url: str, client_id: str, client_secret: str,
                 api_key: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.api_key = api_key
        self.timeout = timeout
        self._token: str | None = None
        self._token_expires_at: datetime | None = None

    # ── Auth ─────────────────────────────────────────────────────────────────

    async def _access_token(self) -> str:
        # 60s of slack: a token that expires mid-flight fails the request that
        # is already in progress, which is far more annoying than refreshing early.
        if (self._token and self._token_expires_at
                and self._token_expires_at > datetime.now(timezone.utc) + timedelta(seconds=60)):
            return self._token

        token_url = f"{self.base_url}/connect/token"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(token_url, data={
                    "grant_type": "kekaapi",
                    "scope": "kekaapi",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "api_key": self.api_key,
                })
        except httpx.HTTPError as exc:
            raise ProviderError(f"Could not reach the Keka token endpoint: {exc}") from exc

        if response.status_code != 200:
            raise ProviderError(
                f"Keka rejected the credentials ({response.status_code}). "
                "Check KEKA_CLIENT_ID / KEKA_CLIENT_SECRET / KEKA_API_KEY."
            )

        payload = response.json()
        self._token = payload.get("access_token")
        if not self._token:
            raise ProviderError("Keka returned no access_token.")
        self._token_expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=int(payload.get("expires_in", 3600))
        )
        return self._token

    async def _get(self, path: str, params: dict | None = None) -> list[dict]:
        """GET a paginated Keka collection, following pages to the end."""
        token = await self._access_token()
        url = f"{self.base_url}/api/v1{path}"
        results: list[dict] = []
        page = 1

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            while True:
                try:
                    response = await client.get(
                        url,
                        headers={"Authorization": f"Bearer {token}"},
                        params={**(params or {}), "pageNumber": page, "pageSize": 200},
                    )
                except httpx.HTTPError as exc:
                    raise ProviderError(f"Keka request failed: {exc}") from exc

                if response.status_code == 404:
                    raise NotSupportedError(f"Keka has no endpoint {path}")
                if response.status_code == 403:
                    raise NotSupportedError(
                        f"The Keka account lacks the scope for {path}"
                    )
                if response.status_code != 200:
                    raise ProviderError(
                        f"Keka returned {response.status_code} for {path}: {response.text[:200]}"
                    )

                body = response.json()
                batch = body.get("data") or []
                results.extend(batch)

                # Stop on a short page rather than trusting a total count that
                # may not be present on every endpoint.
                if len(batch) < 200:
                    break
                page += 1
                if page > 100:      # 20k records; a runaway guard, not a limit
                    logger.warning("Keka pagination stopped at page 100 for %s", path)
                    break

        return results

    # ── Health ───────────────────────────────────────────────────────────────

    async def health(self) -> dict:
        try:
            await self._access_token()
            return {"ok": True, "provider": self.name, "base_url": self.base_url}
        except Exception as exc:
            return {"ok": False, "provider": self.name, "error": str(exc)[:300]}

    # ── Normalizers: the only place Keka field names appear ──────────────────

    @staticmethod
    def _normalize_employee(raw: dict) -> dict:
        job = raw.get("jobDetails") or {}
        return {
            "external_id":       str(raw.get("id") or ""),
            "email":             (raw.get("email") or "").strip().lower(),
            "full_name":         " ".join(
                p for p in (raw.get("firstName"), raw.get("lastName")) if p
            ).strip() or raw.get("displayName", ""),
            "employee_code":     raw.get("employeeNumber"),
            "joining_date":      _parse_date(raw.get("joiningDate")),
            "date_of_birth":     _parse_date(raw.get("dateOfBirth")),
            "phone":             raw.get("mobilePhone") or raw.get("phone") or "",
            "department_name":   (raw.get("department") or {}).get("title"),
            "designation_title": (raw.get("jobTitle") or {}).get("title"),
            "manager_email":     ((job.get("reportsTo") or {}).get("email") or "").strip().lower() or None,
            "employment_type":   _TYPE_MAP.get(job.get("employmentType") or ""),
            "employment_status": _STATUS_MAP.get(raw.get("employmentStatus") or ""),
            "work_location":     (raw.get("location") or {}).get("name", ""),
        }

    @staticmethod
    def _normalize_department(raw: dict) -> dict:
        return {
            "external_id": str(raw.get("id") or ""),
            "name":        (raw.get("title") or raw.get("name") or "").strip(),
            "description": raw.get("description") or "",
        }

    @staticmethod
    def _normalize_attendance(raw: dict) -> dict:
        return {
            "external_id":    str(raw.get("id") or ""),
            "employee_email": (raw.get("employeeEmail") or "").strip().lower(),
            "date":           _parse_date(raw.get("attendanceDate")),
            "status":         (raw.get("status") or "").lower(),
            "check_in":       _parse_date(raw.get("firstInTime")),
            "check_out":      _parse_date(raw.get("lastOutTime")),
            "worked_minutes": int(raw.get("totalWorkDuration") or 0),
        }

    @staticmethod
    def _normalize_leave(raw: dict) -> dict:
        return {
            "external_id":    str(raw.get("id") or ""),
            "employee_email": (raw.get("employeeEmail") or "").strip().lower(),
            "leave_type":     (raw.get("leaveType") or {}).get("name", ""),
            "start_date":     _parse_date(raw.get("fromDate")),
            "end_date":       _parse_date(raw.get("toDate")),
            "days":           float(raw.get("leaveDays") or 0),
            "status":         (raw.get("status") or "").lower(),
        }

    # ── Fetchers ─────────────────────────────────────────────────────────────

    async def fetch_employees(self) -> list[dict]:
        return [self._normalize_employee(r) for r in await self._get("/hris/employees")]

    async def fetch_departments(self) -> list[dict]:
        return [self._normalize_department(r) for r in await self._get("/hris/departments")]

    async def fetch_attendance(self, date_from, date_to) -> list[dict]:
        return [self._normalize_attendance(r) for r in await self._get(
            "/time/attendance",
            {"from": date_from.strftime("%Y-%m-%d"), "to": date_to.strftime("%Y-%m-%d")},
        )]

    async def fetch_leave(self, date_from, date_to) -> list[dict]:
        return [self._normalize_leave(r) for r in await self._get(
            "/time/leaverequests",
            {"from": date_from.strftime("%Y-%m-%d"), "to": date_to.strftime("%Y-%m-%d")},
        )]
