#!/usr/bin/env python3
"""
scrape_olg_history.py — Full(ish)-history backfill for the OLG-only games that
have no public archive on olg.ca: Ontario 49, Lottario, MegaDice. Source is
ca.lottonumbers.com, which publishes clean server-rendered year pages.

Source (verified 2026-07): https://ca.lottonumbers.com/<region>/<game>/numbers/<YEAR>
Each year page is an HTML table of draw rows:
    <td ... date-row><strong>Weekday</strong><br>Month DD YYYY</td>
    <td ... balls-row><ul class="balls">
        <li class="ball ...">N</li> ... (main)  <li class="... bonus-ball">N</li>
    </ul></td>
    <td ... data-title="Early Bird/Encore Numbers"> ... </td>   <-- ignored
Only the FIRST balls-row cell (the winning numbers) is parsed; main = the non-
bonus <li>, bonus = the bonus-ball <li>. Later columns (Early Bird, Encore) are
skipped. Coverage: Ontario 49 & Lottario from 2010, MegaDice from 2013.

Daily freshness stays with scrape_draws.py (OLG feed). This fills deep history.

Usage:  python3 scripts/scrape_olg_history.py [--game lottario] [--delay 1.5]
"""
from __future__ import annotations

import argparse
import re
import sqlite3
import ssl
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "lottizen.db"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0.0.0 Safari/537.36")
URL = "https://ca.lottonumbers.com/{path}/numbers/{year}"

# slug -> (site path, pick, max pool, first year available on the source)
GAMES = {
    "ontario-49": ("ontario/ontario-49", 6, 49, 2010),
    "lottario":   ("ontario/lottario",   6, 45, 2010),
    "megadice":   ("ontario/megadice-lotto", 6, 39, 2013),
}

# Match <tr> AND <tr class="winnerRow"> etc. — jackpot-winner rows carry a class
# attribute; a bare-<tr> pattern silently drops them (~19/yr on recent pages).
ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.DOTALL)
DATE_RE = re.compile(r"date-row[^>]*>.*?<br>\s*([A-Z][a-z]+ \d{1,2} \d{4})", re.DOTALL)
CELL_RE = re.compile(r'<td[^>]*balls-row[^>]*>(.*?)</td>', re.DOTALL)
LI_RE = re.compile(r'<li class="([^"]*)">(\d+)</li>')


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ssl_ctx() -> ssl.SSLContext:
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


def fetch_year(path: str, year: int) -> str | None:
    req = urllib.request.Request(URL.format(path=path, year=year), headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30, context=ssl_ctx()) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def parse_rows(html: str, pick: int, mx: int) -> list[dict]:
    out = []
    for row in ROW_RE.findall(html):
        dm = DATE_RE.search(row)
        if not dm:
            continue  # month-header or non-draw row
        cell = CELL_RE.search(row)  # FIRST balls-row = Winning Numbers only
        if not cell:
            continue
        main, bonus = [], None
        for cls, n in LI_RE.findall(cell.group(1)):
            if "bonus-ball" in cls:
                bonus = int(n)
            elif "number-part" not in cls:
                main.append(int(n))
        main = sorted(main[:pick])
        # sanity: exactly `pick` distinct numbers within the pool
        if len(main) != pick or len(set(main)) != pick or main[0] < 1 or main[-1] > mx:
            continue
        try:
            d = datetime.strptime(dm.group(1), "%B %d %Y").date().isoformat()
        except ValueError:
            continue
        out.append({"date": d, "numbers": main, "bonus": bonus})
    return out


def upsert(conn, game, d):
    conn.execute(
        """INSERT INTO draws (game_id, draw_date, numbers, bonus, source, verified, scraped_at)
           VALUES (?,?,?,?,?,0,?)
           ON CONFLICT(game_id, draw_date) DO UPDATE SET
             numbers=excluded.numbers, bonus=excluded.bonus,
             source=excluded.source, scraped_at=excluded.scraped_at""",
        (game, d["date"], ",".join(str(x) for x in d["numbers"]), d["bonus"],
         "lottonumbers", now_iso()),
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", help="restrict to one slug")
    ap.add_argument("--delay", type=float, default=1.5)
    args = ap.parse_args()
    conn = sqlite3.connect(DB_PATH)
    this_year = date.today().year
    games = {k: v for k, v in GAMES.items() if not args.game or k == args.game}
    for slug, (path, pick, mx, first) in games.items():
        total = 0
        print(f"→ {slug} ({path}) {first}–{this_year}", flush=True)
        for year in range(first, this_year + 1):
            html = fetch_year(path, year)
            if html is None:
                print(f"    {year}: 404", flush=True)
                continue
            rows = parse_rows(html, pick, mx)
            for d in rows:
                upsert(conn, slug, d)
            total += len(rows)
            print(f"    {year}: {len(rows)} draws", flush=True)
            conn.commit()
            time.sleep(args.delay)
        cnt, lo, hi = conn.execute(
            "SELECT COUNT(*), MIN(draw_date), MAX(draw_date) FROM draws WHERE game_id=?",
            (slug,)).fetchone()
        print(f"✓ {slug}: +{total} parsed · {cnt} total · {lo} → {hi}\n", flush=True)
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
