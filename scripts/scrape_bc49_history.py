#!/usr/bin/env python3
"""
scrape_bc49_history.py — One-time full-history backfill for BC/49 (bc-49) from
PlayNow's per-date draw endpoint (BCLC's own site).

Source (verified 2026-07): the same endpoint that serves the latest draw also
serves any past draw by date:
    https://www.playnow.com/services2/lotto/draw/BC49/<YYYY-MM-DD>
Returns 200 + JSON for a real draw date (Wed & Sat), 400 for a non-draw or future
date. Confirmed back to drawNbr 38 (Jun 6, 1992) — i.e. the game's start.

Strategy: walk every Wednesday & Saturday from 1991-09-01 to today, skip dates
already in the DB (resumable — safe to re-run), fetch the rest at a polite pace,
and upsert into the shared `draws` table. Daily freshness is already handled by
scrape_draws.py (playnow_latest); this only fills the deep history.

Usage:  python3 scripts/scrape_bc49_history.py [--delay 0.7] [--since 1991-09-01]
"""
from __future__ import annotations

import argparse
import json
import ssl
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper (replaces sqlite3)

ROOT = Path(__file__).resolve().parent.parent
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
ENDPOINT = "https://www.playnow.com/services2/lotto/draw/BC49/{date}"
GAME = "bc-49"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ssl_ctx() -> ssl.SSLContext:
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


def fetch(d: str):
    """Return parsed draw dict for date d (YYYY-MM-DD), or None if no draw / error."""
    req = urllib.request.Request(ENDPOINT.format(date=d),
                                 headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20, context=ssl_ctx()) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return None  # not a draw date
        raise
    nums = data.get("drawNbrs")
    if not nums or len(nums) < 6:
        return None
    return {"date": d, "numbers": sorted(int(x) for x in nums[:6]),
            "bonus": int(data["bonusNbr"]) if data.get("bonusNbr") else None}


def existing_dates() -> set[str]:
    return {r["draw_date"] for r in
            db.fetch_all("draws", "draw_date", filters=[("eq", "game_id", GAME)])}


def draw_row(draw) -> dict:
    # OMIT `verified`: ON CONFLICT must never reset an existing verified flag;
    # inserts take the DB default (0).
    return {
        "game_id": GAME,
        "draw_date": draw["date"],
        "numbers": ",".join(str(x) for x in draw["numbers"]),
        "bonus": draw["bonus"],
        "source": "playnow-history",
        "scraped_at": now_iso(),
    }


def draw_dates(since: date, until: date):
    """Every Wednesday(2) & Saturday(5) in [since, until]."""
    d = since
    while d <= until:
        if d.weekday() in (2, 5):
            yield d.isoformat()
        d += timedelta(days=1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--delay", type=float, default=0.7, help="seconds between requests")
    ap.add_argument("--since", default="1991-09-01")
    args = ap.parse_args()

    have = existing_dates()
    today = date.today()
    todo = [d for d in draw_dates(date.fromisoformat(args.since), today) if d not in have]
    print(f"→ BC/49 backfill: {len(have)} draws already stored; {len(todo)} candidate dates to try "
          f"(delay {args.delay}s). Est ~{len(todo) * args.delay / 60:.0f} min.", flush=True)

    rows: list[dict] = []
    added = misses = 0
    for i, d in enumerate(todo, 1):
        try:
            draw = fetch(d)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {d}: {type(e).__name__} {e}", file=sys.stderr)
            time.sleep(args.delay * 3)
            continue
        if draw:
            rows.append(draw_row(draw))
            added += 1
        else:
            misses += 1
        if i % 100 == 0:
            print(f"  …{i}/{len(todo)} tried · {added} stored · {misses} empty", flush=True)
        time.sleep(args.delay)
    db.upsert_rows("draws", rows, on_conflict="game_id,draw_date")

    stored = db.fetch_all("draws", "draw_date", filters=[("eq", "game_id", GAME)])
    dates = [r["draw_date"] for r in stored]
    cnt = len(dates)
    lo = min(dates) if dates else None
    hi = max(dates) if dates else None
    print(f"✓ BC/49 backfill done: +{added} this run · {cnt} total · {lo} → {hi}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
