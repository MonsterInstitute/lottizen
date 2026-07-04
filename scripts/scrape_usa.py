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
        CREATE TABLE IF NOT EXISTS game_meta (
            game_id TEXT PRIMARY KEY, next_draw_date TEXT,
            next_jackpot REAL, updated_at TEXT
        );
        """
    )
    conn.commit()


def set_meta(conn, game_id, next_date, jackpot):
    conn.execute(
        """INSERT INTO game_meta (game_id, next_draw_date, next_jackpot, updated_at)
           VALUES (?,?,?,?)
           ON CONFLICT(game_id) DO UPDATE SET
             next_draw_date=excluded.next_draw_date, next_jackpot=excluded.next_jackpot,
             updated_at=excluded.updated_at""",
        (game_id, next_date, jackpot, now_iso()),
    )
    conn.commit()


def http_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json, text/xml, */*"})
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx()) as r:
        return r.read().decode("utf-8", "replace")


# Mega Millions publishes the next draw's estimated jackpot (annuity) on its own
# official service. Powerball's equivalent API is bot-walled, so we surface only
# Mega Millions' estimate here; other US games show the next draw date and hide
# the jackpot row (handled in the frontend). The next draw DATE is derived from the
# fixed draw-day schedule at build time, so we store the amount with a null date.
MM_ENDPOINT = "https://www.megamillions.com/cmspages/utilservice.asmx/GetLatestDrawData"


def mega_millions_meta(conn) -> None:
    try:
        text = http_text(MM_ENDPOINT)
        m = re.search(r'"NextPrizePool":\s*([0-9.]+)', text)
        if not m:
            print("  ! mega-millions: NextPrizePool not found", file=sys.stderr)
            return
        jackpot = float(m.group(1))
        set_meta(conn, "mega-millions", None, jackpot)
        print(f"✓ mega-millions next jackpot: ${jackpot:,.0f} (megamillions.com)")
    except Exception as e:  # noqa: BLE001
        print(f"  ! mega-millions jackpot: {e}", file=sys.stderr)


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
        if not args.game or args.game == "mega-millions":
            mega_millions_meta(conn)
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
