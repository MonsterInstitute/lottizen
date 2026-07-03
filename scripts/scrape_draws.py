#!/usr/bin/env python3
"""
scrape_draws.py — Fetch Canadian draw-lottery winning numbers into SQLite
(data/lottizen.db, table `draws`). Adapter pattern: one adapter per data source.

Verified sources (2026-07):
  * WCLC  — www.wclc.com/winning-numbers/<slug>.htm renders draws as
            <ul class="pastWinNumbers"><li class="pastWinNumber">N</li>…, and its
            month tabs (a.pastMonthYearWinners) AJAX-load ~13 months of history.
            Direct GET of ?back=N is CDN-flaky, so we drive the tabs with
            Playwright. Covers the national + western games (Lotto Max, 6/49…).
  * OLG   — gateway.www.olg.ca/feeds/winning-numbers gives the LATEST draw for
            all OLG games (incl. Ontario 49, which WCLC doesn't carry). Needs
            headers x-site-code: playolg.ca + x-client-id (public frontend key).
  * OLG   — gateway.www.olg.ca/bede-middleware/lottery/drawinformation gives the
            next draw date + jackpot per productId (for the homepage).

History depth is source-limited (~13 months from WCLC; latest-only for
Ontario 49). We record each game's earliest draw as its "data since" date and
let the daily job accumulate more over time.

Usage:
  python3 scripts/scrape_draws.py            # scrape all live games + latest/jackpots
  python3 scripts/scrape_draws.py --game lotto-max
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

OLG_FEED = "https://gateway.www.olg.ca/feeds/winning-numbers"
OLG_DRAWINFO = "https://gateway.www.olg.ca/bede-middleware/lottery/drawinformation"
OLG_KEY = "9c92a16d25b542048aa93a397093efe2"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# Live games and their scrape config (mirrors config/games.ts).
LIVE = [
    {"slug": "lotto-max", "wclc": "lotto-max-extra", "olg_name": "LOTTO MAX", "product": "LMAX"},
    {"slug": "lotto-6-49", "wclc": "lotto-649-extra", "olg_name": "LOTTO 6/49", "product": "649"},
    {"slug": "ontario-49", "wclc": None, "olg_name": "ONTARIO 49", "product": "ONT49"},
]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ssl_ctx() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        c = ssl.create_default_context()
        c.check_hostname = False
        c.verify_mode = ssl.CERT_NONE
        return c


# --------------------------------------------------------------------------
# SQLite
# --------------------------------------------------------------------------
def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS draws (
            game_id    TEXT NOT NULL,
            draw_date  TEXT NOT NULL,      -- YYYY-MM-DD
            numbers    TEXT NOT NULL,      -- comma-separated ints
            bonus      INTEGER,
            jackpot    REAL,
            source     TEXT NOT NULL,
            scraped_at TEXT NOT NULL,
            PRIMARY KEY (game_id, draw_date)
        );
        CREATE TABLE IF NOT EXISTS game_meta (
            game_id       TEXT PRIMARY KEY,
            next_draw_date TEXT,
            next_jackpot  REAL,
            updated_at    TEXT
        );
        """
    )
    conn.commit()


def upsert_draws(conn: sqlite3.Connection, game_id: str, draws: list[dict], source: str) -> int:
    ts = now_iso()
    n = 0
    for d in draws:
        if not d.get("numbers"):
            continue
        conn.execute(
            """INSERT INTO draws (game_id, draw_date, numbers, bonus, jackpot, source, scraped_at)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(game_id, draw_date) DO UPDATE SET
                 numbers=excluded.numbers, bonus=excluded.bonus,
                 jackpot=COALESCE(excluded.jackpot, draws.jackpot),
                 source=excluded.source, scraped_at=excluded.scraped_at""",
            (game_id, d["date"], ",".join(str(x) for x in d["numbers"]),
             d.get("bonus"), d.get("jackpot"), source, ts),
        )
        n += 1
    conn.commit()
    return n


def set_meta(conn: sqlite3.Connection, game_id: str, next_date, jackpot) -> None:
    conn.execute(
        """INSERT INTO game_meta (game_id, next_draw_date, next_jackpot, updated_at)
           VALUES (?,?,?,?)
           ON CONFLICT(game_id) DO UPDATE SET
             next_draw_date=excluded.next_draw_date,
             next_jackpot=excluded.next_jackpot, updated_at=excluded.updated_at""",
        (game_id, next_date, jackpot, now_iso()),
    )
    conn.commit()


# --------------------------------------------------------------------------
# OLG adapters (HTTP JSON)
# --------------------------------------------------------------------------
def olg_get(url: str):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "application/json",
        "x-site-code": "playolg.ca", "x-client-id": OLG_KEY,
        "Referer": "https://www.olg.ca/",
    })
    with urllib.request.urlopen(req, timeout=25, context=ssl_ctx()) as r:
        return json.loads(r.read())


def olg_latest() -> dict[str, dict]:
    """name -> {date, numbers[], bonus} for the most recent draw of each OLG game."""
    out: dict[str, dict] = {}
    try:
        data = olg_get(OLG_FEED)
    except Exception as e:  # noqa: BLE001
        print(f"  ! OLG feed error: {e}", file=sys.stderr)
        return out
    for g in data.get("WinningNumbers", {}).get("game", []):
        reg = g.get("regular")
        if not reg:
            continue
        nums = [int(x) for x in re.findall(r"\d+", reg)]
        bonus = int(g["bonus"]) if g.get("bonus") and str(g["bonus"]).isdigit() else None
        out[g["name"].strip().upper()] = {"date": g.get("drawDate"), "numbers": nums, "bonus": bonus}
    return out


def olg_next_jackpot(product_id: str):
    """(next_draw_date, jackpot) from drawinformation, or (None, None)."""
    try:
        url = f"{OLG_DRAWINFO}?productId={product_id}&startingDrawNumber=0&numberOfDraws=2&ignoreJackpots=false"
        rows = olg_get(url)
        for r in rows if isinstance(rows, list) else []:
            jp = r.get("jackpots")
            date = r.get("drawDate", "")[:10]
            if jp and isinstance(jp, dict):
                dj = jp.get("drawJackpots") or []
                for j in dj:
                    amt = j.get("amount") or j.get("estimatedJackpot")
                    if amt:
                        return date, float(re.sub(r"[^\d.]", "", str(amt)) or 0)
        return (rows[0].get("drawDate", "")[:10] if isinstance(rows, list) and rows else None), None
    except Exception as e:  # noqa: BLE001
        print(f"  ! drawinfo {product_id}: {e}", file=sys.stderr)
        return None, None


# --------------------------------------------------------------------------
# WCLC adapter (Playwright — history)
# --------------------------------------------------------------------------
def wclc_history(wclc_slug: str) -> list[dict]:
    """Drive WCLC's month tabs to collect ~13 months of draws."""
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
        from bs4 import BeautifulSoup  # type: ignore
    except ImportError:
        print("  ! Playwright/bs4 missing — cannot scrape WCLC history.", file=sys.stderr)
        return []

    url = f"https://www.wclc.com/winning-numbers/{wclc_slug}.htm"

    def parse(html: str) -> list[dict]:
        s = BeautifulSoup(html, "html.parser")
        rows = []
        for d in s.select(".pastWinNumDate"):
            box = d.find_parent()
            ul = (box.select_one("ul.pastWinNumbers") if box else None) or \
                 d.find_next("ul", class_="pastWinNumbers")
            if not ul:
                continue
            nums = [int(li.get_text(strip=True)) for li in ul.select("li.pastWinNumber")
                    if li.get_text(strip=True).isdigit()]
            if not nums:
                continue
            bt = ul.select_one("li.pastWinNumberBonus")
            bonus = None
            if bt:
                m = re.search(r"(\d+)", bt.get_text())
                bonus = int(m.group(1)) if m else None
            try:
                dt = datetime.strptime(d.get_text(" ", strip=True), "%A, %B %d, %Y").date().isoformat()
            except ValueError:
                continue
            rows.append({"date": dt, "numbers": nums, "bonus": bonus})
        return rows

    seen: dict[str, dict] = {}
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_context(user_agent=UA, locale="en-CA").new_page()
        try:
            pg.goto(url, wait_until="networkidle", timeout=45000)
            for r in parse(pg.content()):
                seen[r["date"]] = r
            tabs = pg.query_selector_all("a.pastMonthYearWinners")
            for i in range(len(tabs)):
                tabs = pg.query_selector_all("a.pastMonthYearWinners")
                if i >= len(tabs):
                    break
                try:
                    tabs[i].click()
                    pg.wait_for_timeout(1100)
                    for r in parse(pg.content()):
                        seen[r["date"]] = r
                except Exception:  # noqa: BLE001
                    continue
        finally:
            b.close()
    return sorted(seen.values(), key=lambda r: r["date"])


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def scrape_game(conn: sqlite3.Connection, cfg: dict, latest: dict[str, dict]) -> None:
    slug = cfg["slug"]
    total = 0
    if cfg.get("wclc"):
        hist = wclc_history(cfg["wclc"])
        total += upsert_draws(conn, slug, hist, source="wclc")
        print(f"  {slug}: {len(hist)} draws from WCLC")
    # Merge the OLG latest draw (fills the freshest draw / Ontario 49's only source)
    l = latest.get(cfg["olg_name"].upper())
    if l:
        upsert_draws(conn, slug, [l], source="olg-feed")
        print(f"  {slug}: latest {l['date']} {l['numbers']} from OLG feed")
    # Next draw + jackpot
    if cfg.get("product"):
        nd, jp = olg_next_jackpot(cfg["product"])
        set_meta(conn, slug, nd, jp)
    cnt = conn.execute("SELECT COUNT(*), MIN(draw_date) FROM draws WHERE game_id=?", (slug,)).fetchone()
    print(f"  {slug}: total {cnt[0]} draws, data since {cnt[1]}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape Canadian draw lotteries -> SQLite")
    ap.add_argument("--game", help="scrape a single live game by slug")
    args = ap.parse_args()

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)
    try:
        print("→ OLG latest feed...")
        latest = olg_latest()
        print(f"  got latest for {len(latest)} OLG games")
        games = [g for g in LIVE if not args.game or g["slug"] == args.game]
        for cfg in games:
            print(f"→ {cfg['slug']}")
            scrape_game(conn, cfg, latest)
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
