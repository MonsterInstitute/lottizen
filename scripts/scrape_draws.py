#!/usr/bin/env python3
"""
scrape_draws.py — Fetch Canadian draw-lottery winning numbers into SQLite
(Supabase, table `draws`). Adapter pattern, multi-source with
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
import ssl
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper (replaces sqlite3)

ROOT = Path(__file__).resolve().parent.parent
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
    {"slug": "lotto-max", "pick": 7, "max": 52, "wclc": "lotto-max-extra",
     "inception": "lotto-max", "olg_name": "LOTTO MAX", "product": "LMAX"},
    {"slug": "lotto-6-49", "pick": 6, "max": 49, "wclc": "lotto-649-extra",
     "inception": "lotto-649", "olg_name": "LOTTO 6/49", "product": "649"},
    {"slug": "ontario-49", "pick": 6, "max": 49, "wclc": None,
     "inception": None, "olg_name": "ONTARIO 49", "product": "ONT49"},
    {"slug": "daily-grand", "pick": 5, "max": 49, "wclc": "daily-grand-extra",
     "inception": "daily-grand", "olg_name": "DAILY GRAND", "product": "DLYGND"},
    {"slug": "western-max", "pick": 7, "max": 50, "wclc": "western-max-extra",
     "inception": "western-max", "olg_name": None, "product": None},
    {"slug": "western-6-49", "pick": 6, "max": 49, "wclc": "western-649-extra",
     "inception": "western-649", "olg_name": None, "product": None},
    # OLG-only games — latest via OLG feed (no WCLC/inception source)
    {"slug": "lottario", "pick": 6, "max": 45, "wclc": None,
     "inception": None, "olg_name": "LOTTARIO", "product": "LOTT"},
    {"slug": "megadice", "pick": 6, "max": 39, "wclc": None,
     "inception": None, "olg_name": "MEGADICE LOTTO", "product": None},
    # BCLC — latest only via PlayNow JSON (no public history endpoint)
    {"slug": "bc-49", "pick": 6, "max": 49, "wclc": None, "inception": None,
     "olg_name": None, "product": None, "playnow": "BC49"},
]


def playnow_latest(key: str):
    """Latest draw for a PlayNow game key (SIX49/BC49/LMAX/DGRD)."""
    try:
        data = json.loads(http_bytes("https://www.playnow.com/services2/lotto/draw/latest",
                                     {"User-Agent": UA, "Accept": "application/json"}, timeout=20))
        g = data.get(key)
        if not g or not g.get("drawNbrs"):
            return None
        d = g.get("drawDate", "")  # e.g. "Jul 1, 2026"
        try:
            date = datetime.strptime(d, "%b %d, %Y").date().isoformat()
        except ValueError:
            return None
        return {"date": date, "numbers": sorted(int(x) for x in g["drawNbrs"]),
                "bonus": g.get("bonusNbr")}
    except Exception as e:  # noqa: BLE001
        print(f"  ! playnow {key}: {e}", file=sys.stderr)
        return None


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
# Supabase (schema lives in Postgres; see supabase/migrations/0001_init.sql)
# --------------------------------------------------------------------------
def set_meta(game_id, next_date, jackpot):
    db.upsert_rows("game_meta", [{
        "game_id": game_id, "next_draw_date": next_date,
        "next_jackpot": jackpot, "updated_at": now_iso()}],
        on_conflict="game_id")


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
        # The feed carries the NEXT draw's advertised jackpot + date directly — this is
        # the real source (the drawinformation endpoint returns no amount). `jackpot` is a
        # plain number for growing/fixed-jackpot games and a nested dict for for-life games.
        jp = g.get("jackpot")
        jackpot = float(jp) if isinstance(jp, (int, float)) or (
            isinstance(jp, str) and jp.replace(".", "", 1).isdigit()) else None
        nextdraw = (str(g.get("nextdrawDate") or "")[:10]) or None
        out[g["name"].strip().upper()] = {"date": g.get("drawDate"), "numbers": nums,
                                          "bonus": bonus, "jackpot": jackpot, "nextdraw": nextdraw}
    return out


# Growing-jackpot games worth surfacing an estimate for. Fixed-prize (Ontario 49,
# MegaDice), for-life (Daily Grand), and regional fixed games get a next draw date
# but NO jackpot amount, so the UI shows the date and hides the jackpot row.
OLG_PROGRESSIVE = {"lotto-max", "lotto-6-49", "lottario"}


def apply_olg_meta(cfg, latest):
    """Store the next draw date (+ jackpot for progressive games) from the OLG feed."""
    if not cfg.get("olg_name"):
        return
    l = latest.get(cfg["olg_name"].upper())
    if not l:
        return
    jackpot = l.get("jackpot") if cfg["slug"] in OLG_PROGRESSIVE else None
    if l.get("nextdraw") or jackpot is not None:
        set_meta(cfg["slug"], l.get("nextdraw"), jackpot)


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


def reconcile(game_id, per_date: dict[str, dict]) -> dict:
    """per_date: {date: {source: (main_list, bonus)}}. Store one reconciled row
    per date; return stats. Full-refresh: delete the game's rows then bulk-insert
    the reconciled set (no conflicts after the delete, so jackpot stays NULL just
    as the old upsert_one left it in the backfill path)."""
    db.delete_where("draws", "game_id", game_id)
    verified_n = conflict_n = 0
    src_counter = Counter()
    ts = now_iso()
    rows = []
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
        rows.append({"game_id": game_id, "draw_date": date,
                     "numbers": ",".join(str(x) for x in main), "bonus": bonus,
                     "jackpot": None, "source": best, "verified": verified,
                     "scraped_at": ts})
    db.upsert_rows("draws", rows, on_conflict="game_id,draw_date")
    return {"verified": verified_n, "conflicts": conflict_n, "sources": dict(src_counter)}


def summarize(game_id: str, pick: int, recon: dict) -> None:
    rows = db.fetch_all("draws", "draw_date",
                        filters=[("eq", "game_id", game_id)], order="draw_date")
    dates = [r["draw_date"] for r in rows]
    total = len(dates)
    if not total:
        print(f"  {game_id}: NO DATA")
        return
    # gap detection: consecutive draws > 10 days apart hint at missing draws
    gaps = []
    for a, b in zip(dates, dates[1:]):
        d_a = datetime.fromisoformat(a).date()
        d_b = datetime.fromisoformat(b).date()
        if (d_b - d_a).days > 10:
            gaps.append((a, b, (d_b - d_a).days))
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


def backfill_game(cfg, latest, delay=1.0):
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
    l = latest.get(cfg["olg_name"].upper()) if cfg.get("olg_name") else None
    if l:
        add_source(per_date, "olg-feed", [l])
    if cfg.get("playnow"):
        pn = playnow_latest(cfg["playnow"])
        if pn:
            add_source(per_date, "playnow", [pn])
    if not per_date:
        print(f"  ! no data for {slug}")
        return
    recon = reconcile(slug, per_date)
    apply_olg_meta(cfg, latest)
    summarize(slug, cfg["pick"], recon)


def insert_new(game_id, date, numbers, bonus, source):
    """Insert a draw only if that date isn't already recorded — daily runs must
    never overwrite the reconciled/verified full-history rows (ON CONFLICT DO
    NOTHING). jackpot/bonus2 stay NULL on new rows, as before."""
    db.insert_ignore("draws", [{
        "game_id": game_id, "draw_date": date,
        "numbers": ",".join(str(x) for x in numbers), "bonus": bonus,
        "source": source, "verified": 0, "scraped_at": now_iso()}],
        on_conflict="game_id,draw_date")


def daily_game(cfg, latest):
    slug = cfg["slug"]
    max_date = db.max_draw_date(slug)

    # Each source runs independently: one source erroring (site restructure, timeout)
    # must not stop the others for this game from inserting, or the game from committing.
    def source(label, fn):
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            print(f"  ! {slug} source '{label}': {type(e).__name__}: {e}", file=sys.stderr)

    def _wclc():
        for d in wclc_history(cfg["wclc"]):
            if not max_date or d["date"] > max_date:
                insert_new(slug, d["date"], d["numbers"], d.get("bonus"), "wclc")

    def _olg():
        l = latest.get(cfg["olg_name"].upper())
        if l and (not max_date or l["date"] > max_date):
            insert_new(slug, l["date"], l["numbers"], l.get("bonus"), "olg-feed")

    def _playnow():
        pn = playnow_latest(cfg["playnow"])
        if pn and (not max_date or pn["date"] > max_date):
            insert_new(slug, pn["date"], pn["numbers"], pn.get("bonus"), "playnow")

    if cfg.get("wclc"):
        source("wclc", _wclc)
    if cfg.get("olg_name"):
        source("olg-feed", _olg)
    if cfg.get("playnow"):
        source("playnow", _playnow)
    source("olg-meta", lambda: apply_olg_meta(cfg, latest))
    dates = [r["draw_date"] for r in
             db.fetch_all("draws", "draw_date", filters=[("eq", "game_id", slug)])]
    if dates:
        print(f"  {slug}: {len(dates)} draws, {min(dates)} → {max(dates)}")
    else:
        print(f"  {slug}: 0 draws")


def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape Canadian draw lotteries -> SQLite")
    ap.add_argument("--backfill", action="store_true", help="one-time full-history backfill")
    ap.add_argument("--game", help="restrict to one live game slug")
    args = ap.parse_args()

    CONFLICTS_LOG.parent.mkdir(parents=True, exist_ok=True)
    print("→ OLG latest feed...")
    latest = olg_latest()
    print(f"  got latest for {len(latest)} OLG games")
    games = [g for g in LIVE if not args.game or g["slug"] == args.game]
    failures = []
    for cfg in games:
        # One game's failure must not abort the others — isolate each so a broken
        # adapter or a single slow source can't sink the whole daily refresh.
        try:
            if args.backfill:
                backfill_game(cfg, latest)
            else:
                print(f"→ daily {cfg['slug']}")
                daily_game(cfg, latest)
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {cfg['slug']}: {type(e).__name__}: {e}", file=sys.stderr)
            failures.append(cfg["slug"])
    if failures:
        print(f"⚠ {len(failures)} game(s) failed: {', '.join(failures)} "
              f"(others still refreshed)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
