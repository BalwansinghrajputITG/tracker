"""
Google Drive API helpers for tracking Sheets / Docs edit activity.
The `version` field returned by the Drive v3 files.get endpoint increments
on every save, so it serves as a reliable edit-count proxy.
"""
import re
import httpx
from typing import Optional


def extract_file_id(url: str) -> Optional[str]:
    """Return the Google Drive / Docs / Sheets file ID from a sharing URL."""
    patterns = [
        r"/spreadsheets/d/([a-zA-Z0-9-_]+)",
        r"/document/d/([a-zA-Z0-9-_]+)",
        r"/presentation/d/([a-zA-Z0-9-_]+)",
        r"/file/d/([a-zA-Z0-9-_]+)",
        r"[?&]id=([a-zA-Z0-9-_]+)",
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def detect_doc_type(url: str) -> str:
    if "spreadsheets" in url:
        return "sheets"
    if "/document/" in url:
        return "docs"
    if "/presentation/" in url:
        return "slides"
    return "other"


async def fetch_gdrive_stats(file_id: str, api_key: str) -> dict:
    """
    Fetch file metadata from the Google Drive v3 API.

    Requires the file to be shared with "Anyone with the link can view" and
    an API key with the Drive API enabled.

    Returns a dict with:
        name, version (edit count), modified_time, last_modifier, error
    """
    if not api_key:
        return {"error": "No API key provided"}

    gdrive_url = (
        f"https://www.googleapis.com/drive/v3/files/{file_id}"
        f"?fields=name,version,modifiedTime,lastModifyingUser,mimeType&key={api_key}"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(gdrive_url)

        if resp.status_code == 403:
            return {"error": "Access denied — make sure the file is shared and the API key has Drive API enabled"}
        if resp.status_code == 404:
            return {"error": "File not found — check the URL"}
        if resp.status_code != 200:
            return {"error": f"Drive API returned HTTP {resp.status_code}"}

        data = resp.json()
        return {
            "name": data.get("name", ""),
            "version": int(data.get("version", 0)),   # edit count
            "modified_time": data.get("modifiedTime", ""),
            "last_modifier": (data.get("lastModifyingUser") or {}).get("displayName", ""),
            "mime_type": data.get("mimeType", ""),
            "error": None,
        }
    except httpx.TimeoutException:
        return {"error": "Request timed out"}
    except Exception as exc:
        return {"error": f"Failed to fetch Drive stats: {exc}"}
