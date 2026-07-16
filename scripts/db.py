"""Shared Supabase data-layer helper for the Lottizen scrapers and calculators.

Replaces the old `sqlite3.connect(data/lottizen.db)` pattern. Every script that
used to open the SQLite file now calls `db.get_client()` and talks to Postgres
through the service-role REST API (PostgREST), which bypasses RLS.

Credentials come from the environment (CI: GitHub Actions secrets; Vercel build:
project env) or, for local runs, from a git-ignored `.env.local` in the repo root:

    SUPABASE_URL=...
    SUPABASE_SERVICE_ROLE_KEY=...

Design notes:
  * Batch writes go through `upsert_rows`, which chunks and retries on the
    transient TLS/HTTP2 read errors seen during bulk operations.
  * `fetch_all` pages past PostgREST's default 1000-row cap so callers that read
    the full draws table (~95k rows) get everything.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Iterable, Sequence

ROOT = Path(__file__).resolve().parent.parent
ENV_LOCAL = ROOT / ".env.local"

_client = None  # cached singleton


def _load_env() -> None:
    if ENV_LOCAL.exists():
        for line in ENV_LOCAL.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def get_client():
    """Return a cached service-role Supabase client."""
    global _client
    if _client is not None:
        return _client
    _load_env()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. In CI they come "
            "from secrets; locally put them in .env.local (git-ignored).")
    try:
        from supabase import create_client
    except ImportError as e:  # pragma: no cover
        raise RuntimeError('supabase not installed. Run: pip install "supabase>=2.0"') from e
    _client = create_client(url, key)
    return _client


def _reset_client():
    """Drop the cached client so the next call opens a fresh HTTP connection."""
    global _client
    _client = None


def upsert_rows(table: str, rows: Sequence[dict], on_conflict: str,
                chunk: int = 1000, tries: int = 6) -> int:
    """Chunked, retrying upsert. Returns the number of rows sent."""
    rows = list(rows)
    if not rows:
        return 0
    for i in range(0, len(rows), chunk):
        batch = rows[i:i + chunk]
        for attempt in range(1, tries + 1):
            try:
                get_client().table(table).upsert(
                    batch, on_conflict=on_conflict).execute()
                break
            except Exception:  # noqa: BLE001 — transient TLS/HTTP2 flakiness
                if attempt == tries:
                    raise
                time.sleep(min(2 * attempt, 8))
                _reset_client()  # poisoned connection → reconnect
    return len(rows)


def insert_rows(table: str, rows: Sequence[dict], chunk: int = 1000,
                tries: int = 6) -> int:
    """Plain chunked INSERT (no conflict handling) — for freshly-cleared tables.

    Used by the scratch full-refresh: prize_tiers rows carry no id, so the
    identity column auto-generates (from 100000).
    """
    rows = list(rows)
    if not rows:
        return 0
    for i in range(0, len(rows), chunk):
        batch = rows[i:i + chunk]
        for attempt in range(1, tries + 1):
            try:
                get_client().table(table).insert(batch).execute()
                break
            except Exception:  # noqa: BLE001 — transient TLS/HTTP2 flakiness
                if attempt == tries:
                    raise
                time.sleep(min(2 * attempt, 8))
                _reset_client()
    return len(rows)


def delete_all(table: str, pk_col: str, sentinel) -> None:
    """Delete every row. PostgREST requires a filter, so match on the PK being
    != a sentinel value it never actually takes (→ matches all rows)."""
    get_client().table(table).delete().neq(pk_col, sentinel).execute()


def insert_ignore(table: str, rows: Sequence[dict], on_conflict: str,
                  tries: int = 6) -> int:
    """INSERT ... ON CONFLICT DO NOTHING (PostgREST ignore-duplicates).

    Used by the daily draw path: never overwrite reconciled/verified history —
    insert only rows whose (game_id, draw_date) isn't present yet.
    """
    rows = list(rows)
    if not rows:
        return 0
    for attempt in range(1, tries + 1):
        try:
            get_client().table(table).upsert(
                rows, on_conflict=on_conflict, ignore_duplicates=True).execute()
            return len(rows)
        except Exception:  # noqa: BLE001 — transient TLS/HTTP2 flakiness
            if attempt == tries:
                raise
            time.sleep(min(2 * attempt, 8))
            _reset_client()
    return len(rows)


def max_draw_date(game_id: str) -> str | None:
    """Latest stored draw_date for a game, or None (daily incremental cursor)."""
    res = (get_client().table("draws").select("draw_date")
           .eq("game_id", game_id).order("draw_date", desc=True).limit(1).execute())
    return res.data[0]["draw_date"] if res.data else None


def fetch_all(table: str, columns: str = "*", *, filters: Iterable = (),
              order: str | None = None, page: int = 1000) -> list[dict]:
    """Fetch every row from `table`, paging past PostgREST's 1000-row cap.

    `filters` is an iterable of (method, *args) tuples applied to the query,
    e.g. [("eq", "game_id", "lotto-max")].
    """
    out: list[dict] = []
    start = 0
    while True:
        q = get_client().table(table).select(columns)
        for f in filters:
            q = getattr(q, f[0])(*f[1:])
        if order:
            q = q.order(order)
        q = q.range(start, start + page - 1)
        rows = q.execute().data or []
        out.extend(rows)
        if len(rows) < page:
            return out
        start += page


def delete_where(table: str, column: str, value: Any) -> None:
    """Delete rows where column == value (used by scratch tier refresh)."""
    get_client().table(table).delete().eq(column, value).execute()


def update_row(table: str, values: dict, match: dict, tries: int = 6) -> None:
    """UPDATE `table` SET values WHERE all match columns equal (retrying)."""
    for attempt in range(1, tries + 1):
        try:
            q = get_client().table(table).update(values)
            for k, v in match.items():
                q = q.eq(k, v)
            q.execute()
            return
        except Exception:  # noqa: BLE001 — transient TLS/HTTP2 flakiness
            if attempt == tries:
                raise
            time.sleep(min(2 * attempt, 8))
            _reset_client()


def count(table: str) -> int:
    res = get_client().table(table).select("*", count="exact", head=True).execute()
    return res.count or 0
