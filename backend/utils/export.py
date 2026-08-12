"""
CSV export (hr.md §39).

Streams rather than building the whole file in memory: a 5000-row employee
export assembled as one string is a multi-megabyte allocation per request, and
several concurrent exports on a small dyno is how a backend runs out of memory.

CSV and Excel cover all nine §39 report types. PDF is reserved for the three
letter artifacts (offer, experience, relieving) where layout actually matters —
good PDF tables need system libraries, and a report is more useful in a
spreadsheet than as a picture of one.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import AsyncIterator, Callable, Iterable, Sequence


def _cell(value) -> str:
    """Render one value for CSV."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    text = str(value)
    # A leading =, +, - or @ makes Excel and Sheets evaluate the cell as a
    # formula. Prefixing with a quote neutralises CSV injection while still
    # displaying the original text.
    if text[:1] in ("=", "+", "-", "@"):
        return "'" + text
    return text


async def stream_csv(
    headers: Sequence[str],
    rows: AsyncIterator[Sequence] | Iterable[Sequence],
) -> AsyncIterator[str]:
    """Yield a CSV document chunk by chunk.

    Emits a UTF-8 BOM first: without it, Excel on Windows reads the file as the
    system codepage and mangles every non-ASCII name.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")

    def flush() -> str:
        out = buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)
        return out

    writer.writerow(headers)
    yield "﻿" + flush()

    if hasattr(rows, "__aiter__"):
        async for row in rows:                      # type: ignore[union-attr]
            writer.writerow([_cell(v) for v in row])
            yield flush()
    else:
        for row in rows:                            # type: ignore[assignment]
            writer.writerow([_cell(v) for v in row])
            yield flush()


def csv_filename(prefix: str, when: datetime | None = None, *, stamp: bool = True) -> str:
    """Build a download filename.

    `stamp=False` for a prefix that already carries its own period, so a monthly
    report does not come out as "attendance-2026-08-2026-08-11.csv".
    """
    if not stamp:
        return f"{prefix}.csv"
    return f"{prefix}-{(when or datetime.utcnow()).strftime('%Y-%m-%d')}.csv"


def csv_headers(filename: str) -> dict:
    return {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    }
