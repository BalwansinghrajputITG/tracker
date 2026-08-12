"""
File type verification by magic bytes (hr.md §37).

The Content-Type header and the filename extension are both attacker-controlled.
Renaming payload.exe to resume.pdf and declaring application/pdf passes any check
that trusts either one, so the allow-list here is keyed on the actual leading
bytes of the file.

This is not virus scanning. There is no ClamAV on the deployment target, so §37's
malware requirement is met by: a narrow allow-list of formats, magic-byte
verification, forced attachment disposition on download, and X-Content-Type-Options:
nosniff. That is a documented, accepted gap — see the plan's deviations table.
"""

from __future__ import annotations

# mime -> tuple of acceptable (offset, signature) pairs
_SIGNATURES: dict[str, tuple[tuple[int, bytes], ...]] = {
    "application/pdf":  ((0, b"%PDF-"),),
    "image/jpeg":       ((0, b"\xff\xd8\xff"),),
    "image/png":        ((0, b"\x89PNG\r\n\x1a\n"),),
    "image/webp":       ((0, b"RIFF"), (8, b"WEBP")),
    # DOCX/XLSX are ZIP containers; the container is all the magic bytes can prove.
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ((0, b"PK\x03\x04"),),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":       ((0, b"PK\x03\x04"),),
    "application/msword": ((0, b"\xd0\xcf\x11\xe0"),),   # legacy OLE2
    "application/vnd.ms-excel": ((0, b"\xd0\xcf\x11\xe0"),),
    "text/csv":  (),   # no signature; validated as decodable text below
    "text/plain": (),
}

ALLOWED_MIME_TYPES = tuple(_SIGNATURES.keys())

EXTENSIONS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/msword": ".doc",
    "application/vnd.ms-excel": ".xls",
    "text/csv": ".csv",
    "text/plain": ".txt",
}

# Formats that execute in a browser if ever served inline. None are allowed
# above; listed so the reason survives if someone widens the allow-list later.
NEVER_ALLOW = ("text/html", "image/svg+xml", "application/xhtml+xml", "application/javascript")


def detect_mime(data: bytes, declared: str) -> tuple[bool, str, str]:
    """Verify the bytes match an allowed type.

    Returns (ok, resolved_mime, error). `declared` is only ever used to pick
    which signature to check — it is never trusted as the answer.
    """
    if declared in NEVER_ALLOW:
        return False, "", f"{declared} files are not accepted."

    if declared not in _SIGNATURES:
        return False, "", (
            "Unsupported file type. Allowed: PDF, JPEG, PNG, WebP, "
            "Word, Excel, CSV, plain text."
        )

    if not data:
        return False, "", "The file is empty."

    signatures = _SIGNATURES[declared]

    if not signatures:
        # Text formats: prove it decodes as UTF-8 and holds no null bytes, which
        # is what separates real text from a binary wearing a .txt extension.
        try:
            data[:8192].decode("utf-8")
        except UnicodeDecodeError:
            return False, "", "This file is not valid text."
        if b"\x00" in data[:8192]:
            return False, "", "This file is not valid text."
        return True, declared, ""

    for offset, signature in signatures:
        if data[offset:offset + len(signature)] != signature:
            return False, "", (
                f"File contents do not match the declared type ({declared}). "
                "The extension may have been changed."
            )

    return True, declared, ""


def safe_filename(name: str, mime: str) -> str:
    """Strip path components and enforce a sane extension.

    A filename arrives from the client and ends up in a Content-Disposition
    header; path separators and control characters are removed so it cannot
    traverse or inject.
    """
    base = (name or "file").replace("\\", "/").split("/")[-1]
    base = "".join(c for c in base if c.isprintable() and c not in '"\r\n')[:120].strip()
    if not base:
        base = "file"
    expected = EXTENSIONS.get(mime, "")
    if expected and not base.lower().endswith(expected):
        base = f"{base}{expected}"
    return base
