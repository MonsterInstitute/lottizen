#!/usr/bin/env python3
"""One-time SQLite → Supabase bulk import over the REST API (supabase-py).

Uses the service-role key (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, read from
the environment or .env.local) — no Postgres password or connection string
needed. The tables must already exist; run the DDL first:

    python scripts/apply_sql.py supabase/migrations/0001_init.sql

Then load the data:

    pip install "supabase>=2.0"
    python scripts/migrate_sqlite_to_supabase.py

Idempotent: every table is written with upsert on its conflict key, so re-runs
converge. Verifies row counts against SQLite at the end. (The prize_tiers identity
sequence starts at 100000 in the schema, above the imported ids, so no post-import
sequence fix is needed.)
"""
from __future__ import annotations

import os
import sqlite3
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQLITE_DB = ROOT / "data" / "lottizen.db"
ENV_FILE = ROOT / ".env.local"
CHUNK = 1000  # rows per upsert request

# (table, columns, on_conflict-key). Order respects the prize_tiers→games FK.
TABLES = [
    ("games",
     ["game_number", "name", "slug", "price", "overall_odds", "top_prize_odds",
      "source", "scraped_at"],
     "game_number"),
    ("prize_tiers",
     ["id", "game_number", "amount", "label", "total", "remaining", "is_top",
      "scraped_at"],
     "id"),
    ("draws",
     ["game_id", "draw_date", "numbers", "bonus", "bonus2", "jackpot", "source",
      "verified", "scraped_at"],
     "game_id,draw_date"),
    ("game_meta",
     ["game_id", "next_draw_date", "next_jackpot", "updated_at"],
     "game_id"),
]


def load_env() -> None:
    """Populate os.environ from .env.local if the vars aren't already set."""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"'))


def main() -> int:
    load_env()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (env or .env.local).")
    if not SQLITE_DB.exists():
        sys.exit(f"✗ {SQLITE_DB} not found.")

    try:
        from supabase import create_client
    except ImportError:
        sys.exit('✗ supabase not installed. Run: pip install "supabase>=2.0"')

    def new_client():
        return create_client(url, key)

    sb = new_client()
    lite = sqlite3.connect(SQLITE_DB)
    lite.row_factory = sqlite3.Row

    def upsert_with_retry(table, batch, on_conflict, tries=6):
        nonlocal sb
        for attempt in range(1, tries + 1):
            try:
                sb.table(table).upsert(batch, on_conflict=on_conflict).execute()
                return
            except Exception as e:  # noqa: BLE001 — transient TLS/HTTP2 flakiness
                if attempt == tries:
                    raise
                # Recreate the client to drop a poisoned HTTP/2 connection.
                time.sleep(min(2 * attempt, 8))
                sb = new_client()

    for table, cols, on_conflict in TABLES:
        rows = lite.execute(f"SELECT {', '.join(cols)} FROM {table}").fetchall()
        total = len(rows)
        for i in range(0, total, CHUNK):
            batch = [dict((c, r[c]) for c in cols) for r in rows[i:i + CHUNK]]
            upsert_with_retry(table, batch, on_conflict)
            print(f"  {table}: {min(i + CHUNK, total)}/{total}", end="\r", flush=True)
        print(f"✓ {table}: {total} rows upserted" + " " * 20)

    # Verify counts (REST count via head request).
    print("\n=== verification (sqlite → supabase) ===")
    ok = True
    for table, *_ in TABLES:
        a = lite.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        res = sb.table(table).select("*", count="exact", head=True).execute()
        b = res.count or 0
        flag = "✓" if a == b else "✗ MISMATCH"
        ok &= (a == b)
        print(f"  {flag} {table}: sqlite={a} supabase={b}")
    print("\nAll counts match ✓" if ok else "\n✗ Count mismatch — investigate.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
