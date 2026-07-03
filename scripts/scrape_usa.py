#!/usr/bin/env python3
"""
scrape_usa.py — Ingest US lottery history from New York State Open Data
(data.ny.gov SODA API) into SQLite (draws table). This is the official,
authoritative source with full history and clean JSON.

Games (dataset id):
  powerball        d6yy-54nr   5/69 + Powerball(1-26); winning_numbers holds
                               "n n n n n PB" (6 tokens: 5 main + powerball)
  mega-millions    5xaw-6ayf   5/70 + Mega Ball; mega_ball separate field
  cash4life        kwxv-fwze   5/60 + Cash Ball; cash_ball separate field
  new-york-lotto   6nbc-h7bj   6/59 + Bonus; bonus separate field
  take-5           dg63-4siq   5/39; evening draw (midday also available)
  pick-10          bycu-cw7c   keno 20/80

Matrix changes (statsFrom, applied by calculate_stats): Powerball -> 69/26 on
2015-10-07; Mega Millions -> 70/25 on 2017-10-31. Older draws are stored but
the default statistics use the current-rules era.

Usage:  python3 scripts/scrape_usa.py [--game powerball]
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import ssl
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "lottizen.db"
UA = "Mozilla/5.0 (Lottizen data pipeline)"

US = [
    {"slug": "powerball", "ds": "d6yy-54nr", "field": "winning_numbers",
     "pick": 5, "max": 69, "bonus_in_field": True},
    {"slug": "mega-millions", "ds": "5xaw-6ayf", "field": "winning_numbers",
     "pick": 5, "max": 70, "bonus_field": "mega_ball"},
    {"slug": "cash4life", "ds": "kwxv-fwze", "field": "winning_numbers",
     "pick": 5, "max": 60, "bonus_field": "cash_ball"},
    {"slug": "new-york-lotto", "ds": "6nbc-h7bj", "field": "winning_numbers",
     "pick": 6, "max": 59, "bonus_field": "bonus"},
    {"slug": "take-5", "ds": "dg63-4siq", "field": "evening_winning_numbers",
     "pick": 5, "max": 39},
    {"slug": "pick-10", "ds": "bycu-cw7c", "field": "winning_numbers",
     "pick": 20, "max": 80},
]

# Positional digit games (each draw is N digits 0-9, repeats allowed) from the
# combined NY "Daily Numbers / Win-4" dataset. Evening draw is canonical.
US_DIGIT = [
    {"slug": "numbers", "ds": "hsys-3def", "field": "evening_daily", "positions": 3},
    {"slug": "win-4", "ds": "hsys-3def", "field": "evening_win_4", "positions": 4},
]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ssl_ctx() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        c = ssl.create_default_context(); c.check_hostname = False; c.verify_mode = ssl.CERT_NONE
        return c


def init_db(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS draws (
            game_id TEXT NOT NULL, draw_date TEXT NOT NULL, numbers TEXT NOT NULL,
            bonus INTEGER, jackpot REAL, source TEXT NOT NULL,
            verified INTEGER NOT NULL DEFAULT 0, scraped_at TEXT NOT NULL,
            PRIMARY KEY (game_id, draw_date)
        );
        """
    )
    conn.commit()


def fetch_all(ds: str) -> list[dict]:
    url = f"https://data.ny.gov/resource/{ds}.json?$limit=100000&$order=draw_date%20ASC"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=90, context=ssl_ctx()) as r:
        return json.loads(r.read())


def scrape_game(conn, cfg) -> tuple[int, str, str]:
    rows = fetch_all(cfg["ds"])
    ts = now_iso()
    stored = 0
    dates = []
    for r in rows:
        raw = r.get(cfg["field"])
        if not raw:
            continue
        toks = [int(x) for x in re.findall(r"\d+", raw)]
        pick = cfg["pick"]
        if cfg.get("bonus_in_field"):
            if len(toks) < pick + 1:
                continue
            main, bonus = sorted(toks[:pick]), toks[pick]
        else:
            if len(toks) < pick:
                continue
            main = sorted(toks[:pick])
            b = r.get(cfg.get("bonus_field", ""))
            bonus = int(re.sub(r"\D", "", str(b))) if b and re.search(r"\d", str(b)) else None
        if len(set(main)) != pick or main[0] < 1 or main[-1] > cfg["max"]:
            continue
        date = r["draw_date"][:10]
        dates.append(date)
        conn.execute(
            """INSERT INTO draws (game_id, draw_date, numbers, bonus, source, verified, scraped_at)
               VALUES (?,?,?,?, 'data.ny.gov', 0, ?)
               ON CONFLICT(game_id, draw_date) DO UPDATE SET
                 numbers=excluded.numbers, bonus=excluded.bonus, source=excluded.source,
                 scraped_at=excluded.scraped_at""",
            (cfg["slug"], date, ",".join(map(str, main)), bonus, ts),
        )
        stored += 1
    conn.commit()
    dates.sort()
    return stored, (dates[0] if dates else "?"), (dates[-1] if dates else "?")


def scrape_digit(conn, cfg) -> tuple[int, str, str]:
    rows = fetch_all(cfg["ds"])
    ts = now_iso()
    stored, dates = 0, []
    for r in rows:
        raw = r.get(cfg["field"])
        if not raw or not str(raw).strip():
            continue
        s = re.sub(r"\D", "", str(raw)).zfill(cfg["positions"])
        if len(s) != cfg["positions"]:
            continue
        digits = [int(c) for c in s]
        date = r["draw_date"][:10]
        dates.append(date)
        conn.execute(
            """INSERT INTO draws (game_id, draw_date, numbers, bonus, source, verified, scraped_at)
               VALUES (?,?,?,NULL,'data.ny.gov',0,?)
               ON CONFLICT(game_id, draw_date) DO UPDATE SET
                 numbers=excluded.numbers, source=excluded.source, scraped_at=excluded.scraped_at""",
            (cfg["slug"], date, ",".join(map(str, digits)), ts),
        )
        stored += 1
    conn.commit()
    dates.sort()
    return stored, (dates[0] if dates else "?"), (dates[-1] if dates else "?")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game")
    args = ap.parse_args()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)
    try:
        for cfg in US:
            if args.game and cfg["slug"] != args.game:
                continue
            try:
                n, lo, hi = scrape_game(conn, cfg)
                print(f"✓ {cfg['slug']}: {n} draws, {lo} → {hi} (data.ny.gov)")
            except Exception as e:  # noqa: BLE001
                print(f"✗ {cfg['slug']}: {e}", file=sys.stderr)
        for cfg in US_DIGIT:
            if args.game and cfg["slug"] != args.game:
                continue
            try:
                n, lo, hi = scrape_digit(conn, cfg)
                print(f"✓ {cfg['slug']}: {n} digit draws, {lo} → {hi} (data.ny.gov)")
            except Exception as e:  # noqa: BLE001
                print(f"✗ {cfg['slug']}: {e}", file=sys.stderr)
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
