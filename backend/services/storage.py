"""
Object storage for HR documents (hr.md §38).

NOT Cloudinary. The existing avatar upload (routers/users.py:90-122) returns a
Cloudinary `secure_url`, which is a permanent, public, unauthenticated URL. That
is fine for a profile photo and unacceptable for offer letters, ID proofs and tax
documents — anyone who ever sees the link keeps access forever.

Two backends behind one protocol:

  LocalDiskBackend  development and the default. Files under STORAGE_LOCAL_DIR,
                    served by a signed, expiring route on this API.
  S3Backend         production. Any S3-compatible service (Cloudflare R2, MinIO,
                    AWS) via boto3 presigned GETs.

Both issue URLs that EXPIRE. That is the property the whole design rests on, so
LocalDiskBackend implements real HMAC-signed expiry rather than a permanent path
— otherwise dev and prod would differ in the one behaviour that matters, and the
weaker one would be the one everybody tests against.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from pathlib import Path
from typing import Optional, Protocol

from config import settings

logger = logging.getLogger(__name__)


class StorageBackend(Protocol):
    """Minimal surface. Deliberately no list/copy/move — HR documents are
    addressed by the key recorded in Mongo, never by scanning the bucket."""

    name: str

    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def delete(self, key: str) -> None: ...
    async def exists(self, key: str) -> bool: ...
    def signed_url(self, key: str, *, expires_in: int, filename: str) -> str: ...
    async def read(self, key: str) -> bytes: ...


# ── Signature helpers (shared by the local backend and its download route) ────

def _sign(key: str, expires_at: int) -> str:
    """HMAC over key+expiry using SECRET_KEY.

    Signing the expiry as well as the key is what makes the URL expiring rather
    than merely obscure: a client cannot extend its own link without the secret.
    """
    message = f"{key}:{expires_at}".encode("utf-8")
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()


def verify_signature(key: str, expires_at: int, signature: str) -> tuple[bool, str]:
    """Validate a local signed URL. Returns (ok, reason)."""
    if expires_at < int(time.time()):
        return False, "This download link has expired."
    expected = _sign(key, expires_at)
    # compare_digest, not ==, so a wrong signature cannot be recovered byte by
    # byte from response timing.
    if not hmac.compare_digest(expected, signature):
        return False, "Invalid download signature."
    return True, ""


# ── Local disk ────────────────────────────────────────────────────────────────

class LocalDiskBackend:
    name = "local"

    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Resolve and re-check containment: a key like "../../etc/passwd" would
        # otherwise escape the storage root. Keys are server-generated today,
        # but this is the one place where a traversal would be catastrophic.
        candidate = (self.root / key).resolve()
        if not str(candidate).startswith(str(self.root)):
            raise ValueError("Storage key escapes the storage root")
        return candidate

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        import asyncio
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)

    async def read(self, key: str) -> bytes:
        import asyncio
        return await asyncio.to_thread(self._path(key).read_bytes)

    async def delete(self, key: str) -> None:
        import asyncio
        path = self._path(key)
        if path.exists():
            await asyncio.to_thread(path.unlink)

    async def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def signed_url(self, key: str, *, expires_in: int, filename: str) -> str:
        expires_at = int(time.time()) + expires_in
        signature = _sign(key, expires_at)
        base = settings.PUBLIC_BASE_URL.rstrip("/")
        return (
            f"{base}{settings.API_PREFIX}/hr/documents/file"
            f"?key={key}&exp={expires_at}&sig={signature}&name={filename}"
        )


# ── S3-compatible ─────────────────────────────────────────────────────────────

class S3Backend:
    name = "s3"

    def __init__(self):
        import boto3
        self.bucket = settings.S3_BUCKET
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL or None,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
        )

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        import asyncio
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket, Key=key, Body=data, ContentType=content_type,
        )

    async def read(self, key: str) -> bytes:
        import asyncio

        def _get():
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

        return await asyncio.to_thread(_get)

    async def delete(self, key: str) -> None:
        import asyncio
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)

    async def exists(self, key: str) -> bool:
        import asyncio

        def _head():
            try:
                self.client.head_object(Bucket=self.bucket, Key=key)
                return True
            except Exception:
                return False

        return await asyncio.to_thread(_head)

    def signed_url(self, key: str, *, expires_in: int, filename: str) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                # Force a download rather than inline rendering: an HTML or SVG
                # document served inline from our origin would execute scripts
                # in that origin's context.
                "ResponseContentDisposition": f'attachment; filename="{filename}"',
            },
            ExpiresIn=expires_in,
        )


# ── Selection ─────────────────────────────────────────────────────────────────

_backend: Optional[StorageBackend] = None


def get_storage() -> StorageBackend:
    """The configured backend, chosen once.

    Falls back to local disk when S3 is selected but unconfigured, rather than
    raising at import — matching how Redis degrades here. Documents uploaded to
    the fallback are still readable; they are simply not in the bucket.
    """
    global _backend
    if _backend is not None:
        return _backend

    if settings.STORAGE_BACKEND == "s3":
        if settings.S3_BUCKET and settings.S3_ACCESS_KEY:
            try:
                _backend = S3Backend()
                logger.info("Storage backend: s3 (bucket=%s)", settings.S3_BUCKET)
                return _backend
            except Exception as exc:
                logger.error("S3 storage unavailable, falling back to local disk: %s", exc)
        else:
            logger.warning("STORAGE_BACKEND=s3 but S3_BUCKET/S3_ACCESS_KEY are unset — using local disk")

    _backend = LocalDiskBackend(settings.STORAGE_LOCAL_DIR)
    logger.info("Storage backend: local (dir=%s)", settings.STORAGE_LOCAL_DIR)
    return _backend


async def storage_health() -> str:
    """Reported by /health so a misconfigured bucket is visible before someone
    tries to upload an offer letter."""
    try:
        backend = get_storage()
        probe = ".healthcheck"
        await backend.put(probe, b"ok", "text/plain")
        await backend.delete(probe)
        return f"ok ({backend.name})"
    except Exception as exc:
        return f"error: {exc}"
