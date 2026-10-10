#!/usr/bin/env python3
"""history_integrity.py — the history tables only ever grow.

Several tables are the site's memory: no source keeps this history for us,
so a row lost is lost for good. From 2026-08 to 2026-10-09 scratch_snapshots
was cascade-deleted by every scratch refresh (migration 0022) and held only
"today" — and nothing noticed, because nothing checked. This does, daily:

  1. Each table's row count must be >= its count on the previous check
     (counts are recorded in table_row_counts, migration 0026).
  2. scratch_snapshots and scratch_rank_snapshots must cover more than one
     captured_date once they've had time to (the exact shape of the old bug).

Problems go to history_integrity_problems.json for scripts/health_issues.sh
("[auto] History integrity: …" issues, auto-closed on recovery).
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402

# table -> its date column (for the multi-day check) or None
HISTORY = {
    "scratch_snapshots": "captured_date",
    "scratch_rank_snapshots": "captured_date",
    "jackpot_snapshots": "captured_date",
    "ops_snapshots": None,
    "unclaimed_prizes": None,
    "news_items": None,
    "email_log": None,
    "indexnow_batches": None,
}
MULTI_DAY_SINCE = "2026-10-11"  # the first date by which scratch_snapshots must span 2+ days after the 0022 fix


def count(table: str) -> int:
    res = db.get_client().table(table).select("*", count="exact", head=True).execute()
    return int(res.count or 0)


def main() -> int:
    today = datetime.now(ZoneInfo("America/Toronto")).date()
    client = db.get_client()
    problems = []
    prev_rows = db.fetch_all("table_row_counts", "captured_date,table_name,row_count",
                             filters=[("lt", "captured_date", today.isoformat())])
    prev: dict[str, tuple[str, int]] = {}
    for r in prev_rows:
        if r["table_name"] not in prev or r["captured_date"] > prev[r["table_name"]][0]:
            prev[r["table_name"]] = (r["captured_date"], int(r["row_count"]))
    for table, date_col in HISTORY.items():
        n = count(table)
        client.table("table_row_counts").upsert(
            {"captured_date": today.isoformat(), "table_name": table, "row_count": n},
            on_conflict="captured_date,table_name").execute()
        was = prev.get(table)
        print(f"{table}: {n} rows" + (f" (was {was[1]} on {was[0]})" if was else " (first check)"))
        if was and n < was[1]:
            problems.append({
                "title": f"History integrity: {table} lost {was[1] - n} rows",
                "body": f"`{table}` had {was[1]} rows on {was[0]} and has {n} today ({today}). It is an append-only "
                        f"history table; rows disappearing means something is deleting history (compare migration "
                        f"0022, where a foreign-key cascade erased scratch_snapshots daily). Find the delete before "
                        f"more is lost — this history can't be re-fetched.",
            })
        if date_col and today.isoformat() >= MULTI_DAY_SINCE:
            since = (today - timedelta(days=7)).isoformat()
            days = {r[date_col] for r in db.fetch_all(table, f"id,{date_col}", filters=[("gte", date_col, since)])}
            if len(days) < 2:
                problems.append({
                    "title": f"History integrity: {table} holds only {len(days)} day(s)",
                    "body": f"`{table}` should hold one set of rows per day, but the last 7 days contain only "
                            f"{sorted(days)}. Either the daily refresh isn't writing it, or earlier days are being "
                            f"deleted (the 0022 cascade bug looked exactly like this).",
                })
    Path("history_integrity_problems.json").write_text(json.dumps(problems, indent=2))
    for p in problems:
        print(f"❌ {p['title']}")
    print(f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
