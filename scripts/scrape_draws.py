#!/usr/bin/env python3
"""
scrape_draws.py — Fetch Canadian draw-lottery winning numbers into SQLite
(data/lottizen.db, table `draws`). Adapter pattern, multi-source with
cross-validation.

Sources (verified 2026-07):
  * WCLC "since inception" PDFs  (FULL history — the authoritative backfill)
      /display-on/display-on-downloads/<game>-since-inception.htm?channel=print
      Text-extractable PDF, one row per draw: "<Month D, YYYY> n1..nk bonus [GPD]".
      Lotto 6/49 -> back to 1982-06-12; Lotto Max -> back to 2009-09-25.
  * WCLC month pages (Playwright)   ~13 recent months — used to corroborate.
  * OLG feeds/winning-numbers       latest draw per OLG game (incl. Ontario 49).
  * OLG drawinformation             next draw date + jackpot.

Reconciliation: for each (game, date) we gather every source, keep the highest-
priority source's numbers, mark `verified=1` when another source agrees, and log
disagreements to data/conflicts.log for manual review. `source`/`verified` are
stored per draw.

Modes:
  --backfill        one-time full history: PDFs + WCLC recent + OLG, reconcile,
                    replace the game's rows, print a summary. Polite (delays).
  (default)         daily/incremental: OLG latest + WCLC recent, upsert only.
  --game <slug>     restrict to one game.

Usage:
  python3 scripts/scrape_draws.py --backfill --game lotto-6-49
  python3 scripts/scrape_draws.py --backfill
  python3 scripts/scrape_draws.py                # daily latest
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sqlite3
import ssl
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "lottizen.db"
CONFLICTS_LOG = ROOT / "data" / "conflicts.log"

OLG_FEED = "https://gateway.www.olg.ca/feeds/winning-numbers"
OLG_DRAWINFO = "https://gateway.www.olg.ca/bede-middleware/lottery/drawinformation"
OLG_KEY = "9c92a16d25b542048aa93a397093efe2"
WCLC_INCEPTION = "https://www.wclc.com/display-on/display-on-downloads/{slug}-since-inception.htm?channel=print"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# Higher = more authoritative when two sources disagree.
SOURCE_PRIORITY = {"wclc-inception": 3, "wclc": 2, "olg-feed": 1, "lotterycanada": 1}

# Live games + their scrape config (mirrors config/games.ts).
LIVE = [
    {"slug": "lotto-max", "pick": 7, "max": 50, "wclc": "lotto-max-extra",
     "inception": "lotto-max", "olg_name": "LOTTO MAX", "product": "LMAX"},
    {"slug": "lotto-6-49", "pick": 6, "max": 49, "wclc": "lotto-649-extra",
     "inception": "lotto-649", "olg_name": "LOTTO 6/49", "product": "649"},
    {"slug": "ontario-49", "pick": 6, "max": 49, "wclc": None,
     "inception": None, "olg_name": "ONTARIO 49", "product": "ONT49"},
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
            draw_date  TEXT NOT NULL,
            numbers    TEXT NOT NULL,
            bonus      INTEGER,
            jackpot    REAL,
            source     TEXT NOT NULL,
            verified   INTEGER NOT NULL DEFAULT 0,
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
    # add `verified` if the table pre-existed without it
    cols = {r[1] for r in conn.execute("PRAGMA table_info(draws)")}
    if "verified" not in cols:
        conn.execute("ALTER TABLE draws ADD COLUMN verified INTEGER NOT NULL DEFAULT 0")
    conn.commit()


def upsert_one(conn, game_id, date, numbers, bonus, source, verified, jackpot=None):
    conn.execute(
        """INSERT INTO draws (game_id, draw_date, numbers, bonus, jackpot, source, verified, scraped_at)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(game_id, draw_date) DO UPDATE SET
             numbers=excluded.numbers, bonus=excluded.bonus,
             jackpot=COALESCE(excluded.jackpot, draws.jackpot),
             source=excluded.source, verified=excluded.verified,
             scraped_at=excluded.scraped_at""",
        (game_id, date, ",".join(str(x) for x in numbers), bonus, jackpot,
         source, verified, now_iso()),
    )


def set_meta(conn, game_id, next_date, jackpot):
    conn.execute(
        """INSERT INTO game_meta (game_id, next_draw_date, next_jackpot, updated_at)
           VALUES (?,?,?,?)
           ON CONFLICT(game_id) DO UPDATE SET
             next_draw_date=excluded.next_draw_date, next_jackpot=excluded.next_jackpot,
             updated_at=excluded.updated_at""",
        (game_id, next_date, jackpot, now_iso()),
    )


# --------------------------------------------------------------------------
# Adapters
# --------------------------------------------------------------------------
def http_bytes(url: str, headers: dict, timeout=45) -> bytes:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx()) as r:
        return r.read()


def olg_get(url: str):
    return json.loads(http_bytes(url, {
        "User-Agent": UA, "Accept": "application/json",
        "x-site-code": "playolg.ca", "x-client-id": OLG_KEY, "Referer": "https://www.olg.ca/",
    }, timeout=25))


def olg_latest() -> dict[str, dict]:
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
        nums = sorted(int(x) for x in re.findall(r"\d+", reg))
        bonus = int(g["bonus"]) if g.get("bonus") and str(g["bonus"]).isdigit() else None
        out[g["name"].strip().upper()] = {"date": g.get("drawDate"), "numbers": nums, "bonus": bonus}
    return out


def olg_next_jackpot(product_id: str):
    try:
        url = f"{OLG_DRAWINFO}?productId={product_id}&startingDrawNumber=0&numberOfDraws=2&ignoreJackpots=false"
        rows = olg_get(url)
        for r in rows if isinstance(rows, list) else []:
            jp, date = r.get("jackpots"), r.get("drawDate", "")[:10]
            if jp and isinstance(jp, dict):
                for j in jp.get("drawJackpots") or []:
                    amt = j.get("amount") or j.get("estimatedJackpot")
                    if amt:
                        return date, float(re.sub(r"[^\d.]", "", str(amt)) or 0)
        return (rows[0].get("drawDate", "")[:10] if isinstance(rows, list) and rows else None), None
    except Exception as e:  # noqa: BLE001
        print(f"  ! drawinfo {product_id}: {e}", file=sys.stderr)
        return None, None


DATE_RE = re.compile(r"^([A-Z][a-z]+ \d{1,2}, \d{4})\s+(.+)$")


def inception_pdf(inception_slug: str, pick: int, mx: int) -> list[dict]:
    """Full-history draws from the WCLC 'since inception' PDF."""
    try:
        import pdfplumber  # type: ignore
    except ImportError:
        print("  ! pdfplumber missing — cannot read inception PDF.", file=sys.stderr)
        return []
    url = WCLC_INCEPTION.format(slug=inception_slug)
    print(f"  downloading inception PDF: {url}")
    raw = http_bytes(url, {"User-Agent": UA})
    draws = []
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        for page in pdf.pages:
            for line in (page.extract_text() or "").splitlines():
                m = DATE_RE.match(line.strip())
                if not m:
                    continue
                try:
                    d = datetime.strptime(m.group(1), "%B %d, %Y").date().isoformat()
                except ValueError:
                    continue
                toks = [int(x) for x in re.findall(r"\d+", m.group(2))]
                if len(toks) < pick + 1:
                    continue
                main = sorted(toks[:pick])
                if main[0] < 1 or main[-1] > mx or len(set(main)) != pick:
                    continue  # sanity guard against mis-parsed rows
                draws.append({"date": d, "numbers": main, "bonus": toks[pick]})
    return draws


def wclc_history(wclc_slug: str) -> list[dict]:
    """~13 months of recent draws by driving WCLC's month tabs (Playwright)."""
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
        from bs4 import BeautifulSoup  # type: ignore
    except ImportError:
        return []
    url = f"https://www.wclc.com/winning-numbers/{wclc_slug}.htm"

    def parse(html):
        s = BeautifulSoup(html, "html.parser")
        rows = []
        for d in s.select(".pastWinNumDate"):
            box = d.find_parent()
            ul = (box.select_one("ul.pastWinNumbers") if box else None) or \
                 d.find_next("ul", class_="pastWinNumbers")
            if not ul:
                continue
            nums = sorted(int(li.get_text(strip=True)) for li in ul.select("li.pastWinNumber")
                          if li.get_text(strip=True).isdigit())
            if not nums:
                continue
            bt = ul.select_one("li.pastWinNumberBonus")
            bonus = int(re.search(r"(\d+)", bt.get_text()).group(1)) if bt and re.search(r"\d", bt.get_text()) else None
            try:
                dt = datetime.strptime(d.get_text(" ", strip=True), "%A, %B %d, %Y").date().isoformat()
            except ValueError:
                continue
            rows.append({"date": dt, "numbers": nums, "bonus": bonus})
        return rows

    seen = {}
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
                    pg.wait_for_timeout(1000)
                    for r in parse(pg.content()):
                        seen[r["date"]] = r
                except Exception:  # noqa: BLE001
                    continue
        finally:
            b.close()
    return list(seen.values())


# --------------------------------------------------------------------------
# Reconciliation + logging
# --------------------------------------------------------------------------
def log_conflict(game_id, date, src_a, a, src_b, b) -> None:
    line = (f"{now_iso()}\t{game_id}\t{date}\t"
            f"{src_a}={'-'.join(map(str, a))}\t{src_b}={'-'.join(map(str, b))}\n")
    with open(CONFLICTS_LOG, "a") as f:
        f.write(line)


def reconcile(conn, game_id, per_date: dict[str, dict]) -> dict:
    """per_date: {date: {source: (main_list, bonus)}}. Store one reconciled row
    per date; return stats."""
    conn.execute("DELETE FROM draws WHERE game_id=?", (game_id,))
    verified_n = conflict_n = 0
    src_counter = Counter()
    for date, srcs in per_date.items():
        best = max(srcs, key=lambda s: SOURCE_PRIORITY.get(s, 0))
        main, bonus = srcs[best]
        agree = [s for s, (m, _) in srcs.items() if s != best and m == main]
        for s, (m, _) in srcs.items():
            if s != best and m != main:
                log_conflict(game_id, date, best, main, s, m)
                conflict_n += 1
        verified = 1 if agree else 0
        verified_n += verified
        src_counter[best] += 1
        upsert_one(conn, game_id, date, main, bonus, best, verified)
    conn.commit()
    return {"verified": verified_n, "conflicts": conflict_n, "sources": dict(src_counter)}


def summarize(conn, game_id: str, pick: int, recon: dict) -> None:
    rows = conn.execute(
        "SELECT draw_date FROM draws WHERE game_id=? ORDER BY draw_date", (game_id,)
    ).fetchall()
    dates = [r[0] for r in rows]
    total = len(dates)
    if not total:
        print(f"  {game_id}: NO DATA")
        return
    # gap detection: consecutive draws > 10 days apart hint at missing draws
    gaps = []
    for a, b in zip(dates, dates[1:]):
        da = datetime.fromisoformat(a).date()
        db = datetime.fromisoformat(b).date()
        if (db - da).days > 10:
            gaps.append((a, b, (db - da).days))
    gaps.sort(key=lambda g: -g[2])
    print(f"\n  ── {game_id} summary ──")
    print(f"     draws:      {total}")
    print(f"     range:      {dates[0]} → {dates[-1]}")
    print(f"     sources:    {recon['sources']}")
    print(f"     verified:   {recon['verified']} (cross-checked by ≥2 sources)")
    print(f"     conflicts:  {recon['conflicts']} (see data/conflicts.log)")
    if gaps:
        print(f"     gaps >10d:  {len(gaps)} — largest: " +
              ", ".join(f"{a}→{b} ({d}d)" for a, b, d in gaps[:3]))
    else:
        print("     gaps >10d:  none")


# --------------------------------------------------------------------------
# Flows
# --------------------------------------------------------------------------
def add_source(per_date, source, draws):
    for d in draws:
        if d.get("numbers"):
            per_date[d["date"]][source] = (d["numbers"], d.get("bonus"))


def backfill_game(conn, cfg, latest, delay=1.0):
    slug = cfg["slug"]
    per_date: dict[str, dict] = defaultdict(dict)
    print(f"→ backfill {slug}")
    if cfg.get("inception"):
        pdf = inception_pdf(cfg["inception"], cfg["pick"], cfg["max"])
        add_source(per_date, "wclc-inception", pdf)
        print(f"  inception PDF: {len(pdf)} draws")
        time.sleep(delay)
    if cfg.get("wclc"):
        recent = wclc_history(cfg["wclc"])
        add_source(per_date, "wclc", recent)
        print(f"  WCLC recent: {len(recent)} draws")
        time.sleep(delay)
    l = latest.get(cfg["olg_name"].upper())
    if l:
        add_source(per_date, "olg-feed", [l])
    if not per_date:
        print(f"  ! no data for {slug}")
        return
    recon = reconcile(conn, slug, per_date)
    if cfg.get("product"):
        nd, jp = olg_next_jackpot(cfg["product"])
        set_meta(conn, slug, nd, jp)
    summarize(conn, slug, cfg["pick"], recon)


def daily_game(conn, cfg, latest):
    slug = cfg["slug"]
    if cfg.get("wclc"):
        for d in wclc_history(cfg["wclc"]):
            upsert_one(conn, slug, d["date"], d["numbers"], d.get("bonus"), "wclc", 0)
    l = latest.get(cfg["olg_name"].upper())
    if l:
        upsert_one(conn, slug, l["date"], l["numbers"], l.get("bonus"), "olg-feed", 0)
    if cfg.get("product"):
        nd, jp = olg_next_jackpot(cfg["product"])
        set_meta(conn, slug, nd, jp)
    conn.commit()
    cnt = conn.execute("SELECT COUNT(*), MIN(draw_date), MAX(draw_date) FROM draws WHERE game_id=?", (slug,)).fetchone()
    print(f"  {slug}: {cnt[0]} draws, {cnt[1]} → {cnt[2]}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape Canadian draw lotteries -> SQLite")
    ap.add_argument("--backfill", action="store_true", help="one-time full-history backfill")
    ap.add_argument("--game", help="restrict to one live game slug")
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
            if args.backfill:
                backfill_game(conn, cfg, latest)
            else:
                print(f"→ daily {cfg['slug']}")
                daily_game(conn, cfg, latest)
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
