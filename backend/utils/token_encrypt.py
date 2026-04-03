"""
Simple symmetric encryption for repo tokens stored in MongoDB.
Uses Fernet (AES-128-CBC + HMAC-SHA256) from the cryptography package
which is already installed via python-jose[cryptography].

Set REPO_TOKEN_KEY in your .env (generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
If the key is missing, tokens are stored as-is (backwards-compatible fallback).
"""
import os
import base64
import logging

logger = logging.getLogger(__name__)

_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is not None:
        return _fernet
    key = os.getenv("REPO_TOKEN_KEY", "")
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        return _fernet
    except Exception as e:
        logger.warning("REPO_TOKEN_KEY invalid, token encryption disabled: %s", e)
        return None


def encrypt_token(plain: str) -> str:
    """Encrypt a repo token for storage. Returns plain text if key not set."""
    if not plain:
        return plain
    f = _get_fernet()
    if f is None:
        return plain
    try:
        return f.encrypt(plain.encode()).decode()
    except Exception as e:
        logger.warning("Token encryption failed: %s", e)
        return plain


def decrypt_token(stored: str) -> str:
    """Decrypt a stored repo token. Returns stored value if key not set or token is plaintext."""
    if not stored:
        return stored
    f = _get_fernet()
    if f is None:
        return stored
    try:
        return f.decrypt(stored.encode()).decode()
    except Exception:
        # Token might be stored in plaintext (legacy) — return as-is
        return stored
