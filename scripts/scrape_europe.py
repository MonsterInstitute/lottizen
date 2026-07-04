#!/usr/bin/env python3
"""
scrape_europe.py — Backfill + daily refresh for the European draw games:
EuroMillions, EuroJackpot, UK Lotto. Writes into the shared `draws` table.

Two-secondary-ball games (EuroMillions Lucky Stars, EuroJackpot Euro numbers) use
the extra `bonus2` column: `bonus` holds the smaller secondary, `bonus2` the larger
(both sorted). UK Lotto is single-bonus (bonus2 NULL).

Sources (verified 2026-07, plain server-rendered HTML unless noted):
  EuroMillions
    - PRIMARY history  euro-millions.com/results-history-YYYY  (2004-02-13 →)
        <tr class="resultRow"> … <li class="resultBall ball small">N</li> ×5
                                 <li class="resultBall lucky-star small">N</li> ×2
    - CROSS-CHECK       lottery.co.uk/euromillions/results/archive-YYYY
    - FRESHNESS (latest only) national-lottery.co.uk/results/euromillions/draw-history/xml
  EuroJackpot
    - PRIMARY history  euro-jackpot.net/en/results-archive-YYYY  (2012-03-23 →)
        <tr> …/results/DD-MM-YYYY… <li class="ball"><span>N</span></li> ×5
                                   <li class="euro"><span>N</span></li> ×2
  UK Lotto
    - PRIMARY history  lottery.co.uk/lotto/results/archive-YYYY  (1994-11-19 →)
        <div class="result small lotto-ball">N</div> ×6
        <div class="result small lotto-bonus-ball">N</div>
    - CROSS-CHECK / FRESHNESS national-lottery.co.uk/results/lotto/draw-history/xml

Multi-source: every source writes with its own `source` tag; reconcile() keeps the
highest-priority reading per (game,date), sets verified=1 when ≥2 sources agree on
the full number set, and appends any disagreement to data/conflicts.log.

Usage:
  python3 scripts/scrape_europe.py --backfill          # full history, all games
  python3 scripts/scrape_europe.py --backfill --game euromillions
  python3 scripts/scrape_europe.py                     # daily: current year + latest
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
CONFLICTS = ROOT / "data" / "conflicts.log"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# Higher = more trusted when readings conflict. The official national-lottery.co.uk
# feed wins ties; it also stays current when lottery.co.uk's CDN serves a stale archive.
SOURCE_PRIORITY = {"nl-xml": 4, "em-history": 3, "ej-net": 3, "lottery-couk": 2}

# slug -> config. pick/max/sec_max validate parsed rows; `since` bounds the backfill.
GAMES = {
    "euromillions": {"pick": 5, "max": 50, "secs": 2, "sec_max": 12, "since": 2004},
    "eurojackpot": {"pick": 5, "max": 50, "secs": 2, "sec_max": 12, "since": 2012},
    "uk-lotto": {"pick": 6, "max": 59, "secs": 1, "sec_max": 59, "since": 1994},
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ssl_ctx() -> ssl.SSLContext:
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


def fetch(url: str, retries: int = 3) -> str | None:
    """GET with retry/backoff. 404 → None (year not published). Transient network
    errors (timeout / reset) retry, then give up returning None so one flaky year
    never aborts a multi-decade backfill."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xml,*/*"})
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30, context=ssl_ctx()) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == retries:
                print(f"    ! {url}: HTTP {e.code} (giving up)", file=sys.stderr)
                return None
        except Exception as e:  # timeout, reset, DNS … — retry then skip
            if attempt == retries:
                print(f"    ! {url}: {type(e).__name__} (giving up after {retries})", file=sys.stderr)
                return None
        time.sleep(1.5 * attempt)
    return None


def dmy(s: str) -> str | None:
    """'31-12-2004' -> '2004-12-31'."""
    m = re.match(r"(\d{2})-(\d{2})-(\d{4})", s)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def valid(cfg, main, secs) -> bool:
    return (len(main) == cfg["pick"] and len(set(main)) == cfg["pick"]
            and all(1 <= x <= cfg["max"] for x in main)
            and len(secs) == cfg["secs"] and len(set(secs)) == cfg["secs"]
            and all(1 <= x <= cfg["sec_max"] for x in secs))


# --------------------------------------------------------------------------
# Parsers — each returns list[{date, main[], secs[]}]
# --------------------------------------------------------------------------
def parse_euromillions(html: str, cfg) -> list[dict]:
    out = []
    for row in re.findall(r'<tr class="resultRow.*?</tr>', html, re.DOTALL):
        dm = re.search(r'/results/(\d{2}-\d{2}-\d{4})', row)
        main = [int(x) for x in re.findall(r'<li class="resultBall ball small">(\d+)</li>', row)]
        stars = [int(x) for x in re.findall(r'<li class="resultBall lucky-star small">(\d+)</li>', row)]
        if dm and valid(cfg, main, stars):
            out.append({"date": dmy(dm.group(1)), "main": sorted(main), "secs": sorted(stars)})
    return out


def parse_eurojackpot(html: str, cfg) -> list[dict]:
    out = []
    for row in re.findall(r"<tr\b[^>]*>.*?</tr>", html, re.DOTALL):
        dm = re.search(r'/results/(\d{2}-\d{2}-\d{4})', row)
        main = [int(x) for x in re.findall(r'<li class="ball"><span>(\d+)</span></li>', row)]
        euros = [int(x) for x in re.findall(r'<li class="euro"><span>(\d+)</span></li>', row)]
        if dm and valid(cfg, main, euros):
            out.append({"date": dmy(dm.group(1)), "main": sorted(main), "secs": sorted(euros)})
    return out


def parse_lottery_couk(html: str, cfg, prefix: str) -> list[dict]:
    """lottery.co.uk archive: rows link to /<game>/results-DD-MM-YYYY, numbers in
    <div class="result small <prefix>-ball"> / -bonus-ball / -lucky-star."""
    # Rows are striped: alternating <tr> and <tr class="..."> — a bare-<tr> pattern
    # silently drops half. Match both (same gotcha as the OLG history scraper).
    out = []
    for row in re.findall(r"<tr\b[^>]*>.*?</tr>", html, re.DOTALL):
        dm = re.search(r'/[a-z-]+/results-(\d{2}-\d{2}-\d{4})', row)
        if not dm:
            continue
        main, secs = [], []
        for cls, n in re.findall(r'<div class="result small ([^"]*)">(\d+)</div>', row):
            if "bonus" in cls or "star" in cls or "lucky" in cls:
                secs.append(int(n))
            elif "ball" in cls:
                main.append(int(n))
        if valid(cfg, main, secs):
            out.append({"date": dmy(dm.group(1)), "main": sorted(main), "secs": sorted(secs)})
    return out


def parse_nl_xml(xml: str, cfg) -> list[dict]:
    """Official national-lottery.co.uk feed — the latest draw only. Balls live in a
    sibling <balls> block (not inside <draw>); the first block is the newest draw."""
    dm = re.search(r"<draw-date>(\d{4}-\d{2}-\d{2})</draw-date>", xml)
    bm = re.search(r"<balls>(.*?)</balls>", xml, re.DOTALL)
    if not dm or not bm:
        return []
    main = sorted(int(x) for x in re.findall(r'<ball number="\d+">(\d+)</ball>', bm.group(1)))[:cfg["pick"]]
    secs = sorted(int(x) for x in re.findall(r'<bonus-ball[^>]*>(\d+)</bonus-ball>', bm.group(1)))[:cfg["secs"]]
    d = {"date": dm.group(1), "main": main, "secs": secs}
    return [d] if valid(cfg, main, secs) else []


NL_XML = {
    "euromillions": "https://www.national-lottery.co.uk/results/euromillions/draw-history/xml",
    "uk-lotto": "https://www.national-lottery.co.uk/results/lotto/draw-history/xml",
}


# slug -> ordered list of (source_tag, url_template, parser, extra)
def source_plan(slug: str, year: int) -> list[tuple]:
    if slug == "euromillions":
        return [
            ("em-history", f"https://www.euro-millions.com/results-history-{year}", parse_euromillions, None),
            ("lottery-couk", f"https://www.lottery.co.uk/euromillions/results/archive-{year}", parse_lottery_couk, "euromillions"),
        ]
    if slug == "eurojackpot":
        return [
            ("ej-net", f"https://www.euro-jackpot.net/en/results-archive-{year}", parse_eurojackpot, None),
        ]
    if slug == "uk-lotto":
        return [
            ("lottery-couk", f"https://www.lottery.co.uk/lotto/results/archive-{year}", parse_lottery_couk, "lotto"),
        ]
    return []


# --------------------------------------------------------------------------
# DB
# --------------------------------------------------------------------------
def ensure_schema(conn):
    cols = {r[1] for r in conn.execute("PRAGMA table_info(draws)")}
    if "bonus2" not in cols:
        conn.execute("ALTER TABLE draws ADD COLUMN bonus2 INTEGER")
        conn.commit()
        print("  + added draws.bonus2 column")


def existing(conn, slug) -> dict[str, tuple]:
    """date -> (numbers, bonus, bonus2, source, verified)."""
    return {r[0]: (r[1], r[2], r[3], r[4], r[5]) for r in conn.execute(
        "SELECT draw_date, numbers, bonus, bonus2, source, verified FROM draws WHERE game_id=?", (slug,))}


def log_conflict(slug, dprev, dnew):
    with CONFLICTS.open("a") as f:
        f.write(f"{now_iso()} EUROPE {slug} {dnew['date']}: "
                f"{dprev[3]}={dprev[0]}+{dprev[1]}/{dprev[2]} vs "
                f"{dnew['source']}={','.join(map(str,dnew['main']))}+{'/'.join(map(str,dnew['secs']))}\n")


def upsert(conn, slug, d):
    """Reconcile one reading against what's stored: keep higher-priority source,
    flag verified when a second independent source agrees, log real conflicts."""
    have = existing(conn, slug).get(d["date"])
    b1 = d["secs"][0] if d["secs"] else None
    b2 = d["secs"][1] if len(d["secs"]) > 1 else None
    nums = ",".join(str(x) for x in d["main"])
    if have is None:
        conn.execute(
            "INSERT INTO draws (game_id, draw_date, numbers, bonus, bonus2, source, verified, scraped_at) "
            "VALUES (?,?,?,?,?,?,0,?)",
            (slug, d["date"], nums, b1, b2, d["source"], now_iso()))
        return "new"
    prev_nums, prev_b1, prev_b2, prev_src, prev_ver = have
    agree = (prev_nums == nums and prev_b1 == b1 and prev_b2 == b2)
    if agree:
        if prev_src != d["source"] and not prev_ver:  # confirmed by a second source
            conn.execute("UPDATE draws SET verified=1 WHERE game_id=? AND draw_date=?", (slug, d["date"]))
            return "verified"
        return "dup"
    # disagreement — log it, keep the higher-priority reading
    log_conflict(slug, have, d)
    if SOURCE_PRIORITY.get(d["source"], 0) > SOURCE_PRIORITY.get(prev_src, 0):
        conn.execute(
            "UPDATE draws SET numbers=?, bonus=?, bonus2=?, source=?, verified=0, scraped_at=? "
            "WHERE game_id=? AND draw_date=?",
            (nums, b1, b2, d["source"], now_iso(), slug, d["date"]))
        return "override"
    return "conflict"


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------
def run_game(conn, slug, cfg, years, delay):
    tally = {"new": 0, "verified": 0, "dup": 0, "override": 0, "conflict": 0}
    for year in years:
        for src, url, parser, extra in source_plan(slug, year):
            html = fetch(url)
            if html is None:
                continue
            rows = parser(html, cfg, extra) if extra is not None else parser(html, cfg)
            for r in rows:
                r["source"] = src
                tally[upsert(conn, slug, r)] += 1
            conn.commit()
            print(f"    {year} [{src}]: {len(rows)} parsed", flush=True)
            time.sleep(delay)
    # Freshness + official cross-check: national-lottery.co.uk XML (latest draw only).
    # Keeps UK Lotto current even when lottery.co.uk's CDN serves a stale archive page.
    if slug in NL_XML:
        xml = fetch(NL_XML[slug])
        if xml:
            for r in parse_nl_xml(xml, cfg):
                r["source"] = "nl-xml"
                tally[upsert(conn, slug, r)] += 1
            conn.commit()
    conn.commit()
    cnt, lo, hi, ver = conn.execute(
        "SELECT COUNT(*), MIN(draw_date), MAX(draw_date), SUM(verified) FROM draws WHERE game_id=?",
        (slug,)).fetchone()
    print(f"✓ {slug}: {cnt} draws · {lo} → {hi} · {ver or 0} cross-verified · "
          f"(+{tally['new']} new, {tally['verified']} newly-verified, "
          f"{tally['override']} overrides, {tally['conflict']} conflicts)\n", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="fetch every year from the game's start")
    ap.add_argument("--game", help="restrict to one slug")
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    conn = sqlite3.connect(DB_PATH)
    ensure_schema(conn)
    this_year = date.today().year
    games = {k: v for k, v in GAMES.items() if not args.game or k == args.game}
    for slug, cfg in games.items():
        years = range(cfg["since"], this_year + 1) if args.backfill else [this_year]
        print(f"→ {slug} ({'backfill ' + str(cfg['since']) if args.backfill else 'latest'}–{this_year})", flush=True)
        run_game(conn, slug, cfg, years, args.delay)
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
