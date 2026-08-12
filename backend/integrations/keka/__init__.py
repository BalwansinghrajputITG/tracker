"""
Keka integration (docs/hr.md §16, §36).

    protocol.py    the provider interface + field-ownership rules
    adapter.py     the live Keka HTTP client (the only file that knows Keka)
    mock.py        an offline provider that emits the messy cases
    reconcile.py   Fetch → Normalize → Validate → Compare → Sync

get_provider() is the seam: nothing outside this package constructs a provider,
so swapping Keka for another HRIS is one new class and one line here.
"""

from __future__ import annotations

import logging

from config import settings
from integrations.keka.mock import MockProvider
from integrations.keka.protocol import (
    NotSupportedError, PLANNED_ENTITIES, ProviderError, SYNCABLE_ENTITIES,
)

logger = logging.getLogger(__name__)


def keka_configured() -> bool:
    return bool(settings.KEKA_BASE_URL and settings.KEKA_CLIENT_ID
                and settings.KEKA_CLIENT_SECRET and settings.KEKA_API_KEY)


def get_provider(name: str = "keka", *, credentials: dict | None = None,
                 scenario: str = "default"):
    """Build a provider.

    'mock' always works and needs nothing. 'keka' requires both credentials and
    KEKA_SYNC_ENABLED — the flag exists so credentials can be saved and verified
    before anything is allowed to call the live API.
    """
    if name == "mock":
        return MockProvider(scenario=scenario)

    if name == "keka":
        creds = credentials or {}
        base_url = creds.get("base_url") or settings.KEKA_BASE_URL
        client_id = creds.get("client_id") or settings.KEKA_CLIENT_ID
        client_secret = creds.get("client_secret") or settings.KEKA_CLIENT_SECRET
        api_key = creds.get("api_key") or settings.KEKA_API_KEY

        if not (base_url and client_id and client_secret and api_key):
            raise ProviderError(
                "Keka is not configured. Set KEKA_BASE_URL, KEKA_CLIENT_ID, "
                "KEKA_CLIENT_SECRET and KEKA_API_KEY, or save credentials via "
                "POST /api/v1/hr/integrations/keka/credentials."
            )

        # Imported lazily so a missing httpx or a typo in the adapter cannot
        # break the mock path, which is what CI and local development use.
        from integrations.keka.adapter import KekaProvider
        return KekaProvider(base_url=base_url, client_id=client_id,
                            client_secret=client_secret, api_key=api_key)

    raise ProviderError(f"Unknown provider '{name}'. Available: keka, mock")


__all__ = [
    "get_provider", "keka_configured", "SYNCABLE_ENTITIES", "PLANNED_ENTITIES",
    "NotSupportedError", "ProviderError",
]
