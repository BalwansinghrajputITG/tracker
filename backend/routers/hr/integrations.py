"""
HRIS integration management (hr.md §16, §36).

Credential handling follows routers/project_tools.py, the existing in-repo
convention: declarative field definitions, Fernet encryption at rest via
utils/token_encrypt.py, and secrets masked on every read. A credential that has
been saved can never be read back through the API — only replaced.

The live provider is additionally gated on KEKA_SYNC_ENABLED, so credentials can
be stored and health-checked before anything is permitted to call Keka.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from config import settings
from database import get_db
from middleware.permissions import require_permission
from integrations.keka import (
    PLANNED_ENTITIES, ProviderError, SYNCABLE_ENTITIES, get_provider, keka_configured,
)
from integrations.keka.reconcile import run_sync
from routers.hr.common import iso, oid, utcnow
from services.audit_service import audit
from utils.token_encrypt import decrypt_token, encrypt_token

router = APIRouter()

# Declarative field definitions, as project_tools.py does for its dozen tools.
# The UI renders the form from this rather than hardcoding Keka's fields.
PROVIDER_FIELDS = {
    "keka": [
        {"key": "base_url", "label": "Keka domain", "type": "url", "secret": False,
         "placeholder": "https://yourcompany.keka.com",
         "help": "Your Keka tenant URL, without a trailing slash."},
        {"key": "client_id", "label": "Client ID", "type": "text", "secret": False,
         "help": "Keka → Settings → Integrations → API access."},
        {"key": "client_secret", "label": "Client secret", "type": "password", "secret": True},
        {"key": "api_key", "label": "API key", "type": "password", "secret": True},
    ],
}
SECRET_KEYS = {"client_secret", "api_key"}
MASK = "••••••••"


class CredentialPayload(BaseModel):
    base_url: str = Field("", max_length=300)
    client_id: str = Field("", max_length=200)
    client_secret: str = Field("", max_length=400)
    api_key: str = Field("", max_length=400)


def _mask(credentials: dict) -> dict:
    """Secrets are shown as a placeholder, never returned."""
    return {
        key: (MASK if key in SECRET_KEYS and value else value)
        for key, value in credentials.items()
    }


async def _load_credentials(db, provider: str) -> dict:
    doc = await db.hr_integration_credentials.find_one({"provider": provider})
    if not doc:
        return {}
    return {
        key: (decrypt_token(value) if key in SECRET_KEYS else value)
        for key, value in (doc.get("credentials") or {}).items()
    }


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("")
async def integration_status(
    current_user=Depends(require_permission("integration.read")),
    db=Depends(get_db),
):
    """What is configured, and what the last sync did."""
    stored = await db.hr_integration_credentials.find_one({"provider": "keka"})
    last_syncs = {}
    for entity in (*SYNCABLE_ENTITIES, *PLANNED_ENTITIES):
        log = await db.hr_sync_logs.find({"entity": entity}).sort("started_at", -1).limit(1).to_list(1)
        if log:
            last_syncs[entity] = {
                "status": log[0].get("status"), "dry_run": log[0].get("dry_run"),
                "created": log[0].get("created"), "updated": log[0].get("updated"),
                "skipped": log[0].get("skipped"),
                "conflicts": log[0].get("conflict_count", 0),
                "rejected": log[0].get("rejected_count", 0),
                "at": iso(log[0].get("started_at")),
            }

    return {
        "providers": [{
            "name": "keka",
            "fields": PROVIDER_FIELDS["keka"],
            "credentials_saved": bool(stored),
            "env_configured": keka_configured(),
            # Both must be true before a live call is possible. Reported
            # separately so "I saved credentials but nothing syncs" has an answer.
            "sync_enabled": settings.KEKA_SYNC_ENABLED,
            "ready": (bool(stored) or keka_configured()) and settings.KEKA_SYNC_ENABLED,
        }, {
            "name": "mock",
            "fields": [], "credentials_saved": True, "env_configured": True,
            "sync_enabled": True, "ready": True,
        }],
        "syncable_entities": list(SYNCABLE_ENTITIES),
        "planned_entities": list(PLANNED_ENTITIES),
        "last_syncs": last_syncs,
    }


@router.get("/{provider}/credentials")
async def get_credentials(
    provider: str,
    current_user=Depends(require_permission("integration.read")),
    db=Depends(get_db),
):
    """Saved credentials, with secrets masked. They cannot be read back."""
    if provider not in PROVIDER_FIELDS:
        raise HTTPException(status_code=404, detail=f"Unknown provider '{provider}'")
    credentials = await _load_credentials(db, provider)
    return {"provider": provider, "credentials": _mask(credentials),
            "fields": PROVIDER_FIELDS[provider]}


@router.post("/{provider}/credentials")
async def save_credentials(
    provider: str,
    body: CredentialPayload,
    request: Request,
    current_user=Depends(require_permission("integration.sync")),
    db=Depends(get_db),
):
    if provider not in PROVIDER_FIELDS:
        raise HTTPException(status_code=404, detail=f"Unknown provider '{provider}'")

    existing = await _load_credentials(db, provider)
    incoming = body.model_dump()
    to_store: dict = {}

    for key, value in incoming.items():
        # An unchanged masked value means "leave it alone" — otherwise saving the
        # form after only editing the domain would wipe both secrets.
        if key in SECRET_KEYS and value in ("", MASK):
            if existing.get(key):
                to_store[key] = encrypt_token(existing[key])
            continue
        if key in SECRET_KEYS:
            to_store[key] = encrypt_token(value)
        else:
            to_store[key] = value.strip().rstrip("/") if key == "base_url" else value

    now = utcnow()
    await db.hr_integration_credentials.update_one(
        {"provider": provider},
        {"$set": {"credentials": to_store, "updated_at": now,
                  "updated_by": current_user["_id"]},
         "$setOnInsert": {"created_at": now}},
        upsert=True,
    )

    # The values themselves never reach the audit log — only which keys moved.
    await audit(db, "integration.credentials_saved", current_user, "integration", provider,
                after={"fields_set": sorted(k for k, v in incoming.items() if v and v != MASK)},
                request=request)

    return {"message": f"{provider} credentials saved.", "provider": provider}


@router.get("/{provider}/health")
async def provider_health(
    provider: str,
    current_user=Depends(require_permission("integration.read")),
    db=Depends(get_db),
):
    """Check connectivity and credentials without syncing anything."""
    try:
        credentials = await _load_credentials(db, provider) if provider != "mock" else {}
        instance = get_provider(provider, credentials=credentials)
        return await instance.health()
    except ProviderError as exc:
        return {"ok": False, "provider": provider, "error": str(exc)}


# ── Sync ──────────────────────────────────────────────────────────────────────

@router.post("/{provider}/sync/{entity}")
async def sync_entity(
    provider: str,
    entity: str,
    request: Request,
    dry_run: bool = Query(True, description="Report what would change, writing nothing"),
    scenario: str = Query("default", description="Mock provider scenario"),
    current_user=Depends(require_permission("integration.sync")),
    db=Depends(get_db),
):
    """Reconcile one entity (§36).

    Defaults to dry_run=True. A sync that rewrites employee records should be an
    explicit choice, not what happens when a parameter is forgotten.
    """
    if entity in PLANNED_ENTITIES:
        raise HTTPException(
            status_code=501,
            detail=f"Reconciling '{entity}' is not implemented yet. The provider can "
                   f"fetch it, but merging it needs a conflict policy against local "
                   f"records. Available now: {', '.join(SYNCABLE_ENTITIES)}.",
        )
    if entity not in SYNCABLE_ENTITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot sync '{entity}'. Available: {', '.join(SYNCABLE_ENTITIES)}",
        )

    # Fails closed: with the flag off no live provider is even constructed, so
    # no outbound request can be made.
    if provider != "mock" and not settings.KEKA_SYNC_ENABLED:
        raise HTTPException(
            status_code=409,
            detail="Live sync is disabled. Set KEKA_SYNC_ENABLED=true once the "
                   "credentials are verified with a dry run.",
        )

    try:
        credentials = await _load_credentials(db, provider) if provider != "mock" else {}
        instance = get_provider(provider, credentials=credentials, scenario=scenario)
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    result = await run_sync(db, instance, entity, dry_run=dry_run)

    await audit(
        db, "integration.synced", current_user, "integration", provider,
        after={"entity": entity, "dry_run": dry_run, "status": result["status"],
               "created": result["created"], "updated": result["updated"],
               "conflicts": result["conflict_count"], "rejected": result["rejected_count"]},
        request=request,
    )
    return result


@router.get("/sync-logs")
async def sync_logs(
    entity: str | None = Query(None),
    limit: int = Query(20, le=100),
    current_user=Depends(require_permission("integration.read")),
    db=Depends(get_db),
):
    query = {"entity": entity} if entity else {}
    logs = await db.hr_sync_logs.find(query).sort("started_at", -1).limit(limit).to_list(limit)
    return {"logs": [{
        "id": str(l["_id"]), "provider": l.get("provider"), "entity": l.get("entity"),
        "dry_run": l.get("dry_run"), "status": l.get("status"),
        "fetched": l.get("fetched"), "created": l.get("created"),
        "updated": l.get("updated"), "skipped": l.get("skipped"),
        "local_only": l.get("local_only"),
        "conflicts": l.get("conflict_count", 0), "rejected": l.get("rejected_count", 0),
        "duration_ms": l.get("duration_ms"), "started_at": iso(l.get("started_at")),
        "errors": l.get("errors", []),
    } for l in logs], "total": len(logs)}


@router.get("/conflicts")
async def list_conflicts(
    current_user=Depends(require_permission("integration.read")),
    db=Depends(get_db),
):
    """Employees whose local values disagree with the provider (§36).

    A review queue, not an error list: every one of these is a case where the
    local value was deliberately kept and a human should decide which is right.
    """
    employees = await db.hr_employees.find(
        {"sync.status": "conflict"},
        {"user_id": 1, "employee_code": 1, "sync": 1},
    ).to_list(200)

    from routers.hr.common import user_map
    users = await user_map(db, {e["user_id"] for e in employees})

    return {
        "conflicts": [{
            "employee_id": str(e["_id"]),
            "user_id": str(e["user_id"]),
            "full_name": users.get(str(e["user_id"]), {}).get("full_name", ""),
            "employee_code": e.get("employee_code", ""),
            "last_synced_at": iso((e.get("sync") or {}).get("last_synced_at")),
            "fields": (e.get("sync") or {}).get("conflicts", []),
        } for e in employees],
        "total": len(employees),
    }
