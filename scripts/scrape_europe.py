#!/usr/bin/env python3
"""
scrape_europe.py — Backfill + daily refresh for the European draw games:
EuroMillions, EuroJackpot, UK Lotto. Writes into the shared `draws` table.

Two-secondary-ball games (EuroMillions Lucky Stars, EuroJackpot Euro numbers) use
the extra `bonus2` column: `bonus` holds the smaller secondary, `bonus2` the larger
(both sorted). UK Lotto is single-bonus (bonus2 NULL).

OFFICIAL "latest" sources (verified 2026-10-03) — run every day, required:
  EuroMillions
    - nl-xml   national-lottery.co.uk/results/euromillions/draw-history/xml
               (Allwyn, UK operator; latest draw only)
    - jsc-pt   jogossantacasa.pt/web/SCCartazResult/euroMilhoes
               (Jogos Santa Casa, Portugal's operator; latest draw, server HTML:
               "Data do Sorteio - DD/MM/YYYY" then <li>n n n n n + s s</li>)
  EuroJackpot
    - lotto-de lotto.de/api/stats/entities.eurojackpot/last
               (Deutscher Lotto- und Totoblock, JSON; drawDate is epoch ms at
               00:00 Europe/Berlin of the draw day, i.e. the PREVIOUS day in UTC —
               always convert in Europe/Berlin)
    - veikkaus veikkaus.fi/api/draw-results/v1/games/EJACKPOT/draws/by-week/<ISO week>
               (Veikkaus, Finland's operator, JSON; we read the last 3 ISO weeks,
               which also back-fills a missed run)
  UK Lotto
    - nl-xml   national-lottery.co.uk/results/lotto/draw-history/xml
               Allwyn is UK Lotto's only official publisher, so there is no
               independent official backup; the third-party archive below is it.

THIRD-PARTY year archives — history for --backfill; in daily mode an optional
gap-filler/cross-check with a short timeout. Since 2026-10-01 all of these time
out from GitHub Actions runners (they work from other networks), so in CI they
are expected to fail and only produce warnings:
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
    - CROSS-CHECK / FRESHNESS  lotto.net/eurojackpot/results/YYYY
        <div class="date"><span>WD</span> Month Dayth Year</div> then
        <li class="ball ball"><span>N</span></li> ×5 / <li class="ball euro"> ×2
        (independent markup — a change on one source can't break both)
  UK Lotto
    - PRIMARY history  lottery.co.uk/lotto/results/archive-YYYY  (1994-11-19 →)
        <div class="result small lotto-ball">N</div> ×6
        <div class="result small lotto-bonus-ball">N</div>
    - CROSS-CHECK / FRESHNESS national-lottery.co.uk/results/lotto/draw-history/xml

Failure visibility: every fetch is recorded. The run exits 1 (after writing
everything it could) when a game has no working official source, or when more
than MAX_REQUIRED_FAILURES official sources failed; see report_and_exit_code().
A source that returns a page we can't parse counts as failed, not empty.

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
import json
import re
import ssl
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper (replaces sqlite3)
from ci_report import annotate, summary  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONFLICTS = ROOT / "data" / "conflicts.log"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# Higher = more trusted when readings conflict. The official national-lottery.co.uk
# feed wins ties; it also stays current when lottery.co.uk's CDN serves a stale archive.
SOURCE_PRIORITY = {"nl-xml": 4, "jsc-pt": 4, "lotto-de": 4, "veikkaus": 4,
                   "em-history": 3, "ej-net": 3, "lotto-net": 3, "lottery-couk": 2}

# More than this many failed OFFICIAL sources fails the run, even if every game
# still had one working source. One failure is a warning (a single operator
# having a bad morning); two means something systematic.
MAX_REQUIRED_FAILURES = 1

# One record per fetch: {game, source, url, required, ok, rows, error}.
OUTCOMES: list[dict] = []

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


LAST_FETCH_ERROR: str | None = None


def fetch(url: str, retries: int = 3, timeout: float = 30, encoding: str = "utf-8") -> str | None:
    """GET with retry/backoff. 404 → None (year not published). Transient network
    errors (timeout / reset) retry, then give up returning None so one flaky year
    never aborts a multi-decade backfill. The reason for the last failure is left
    in LAST_FETCH_ERROR (None after a success or a 404)."""
    global LAST_FETCH_ERROR
    LAST_FETCH_ERROR = None
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xml,application/json,*/*"})
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx()) as r:
                return r.read().decode(encoding, "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == retries:
                LAST_FETCH_ERROR = f"HTTP {e.code}"
                print(f"    ! {url}: HTTP {e.code} (giving up)", file=sys.stderr)
                return None
        except Exception as e:  # timeout, reset, DNS … — retry then skip
            if attempt == retries:
                reason = getattr(e, "reason", None) or e
                LAST_FETCH_ERROR = f"{type(e).__name__}: {reason}"
                print(f"    ! {url}: {LAST_FETCH_ERROR} (giving up after {retries})", file=sys.stderr)
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


_MONTHS = {m: i for i, m in enumerate(
    ("January February March April May June July August September October "
     "November December").split(), 1)}


def parse_lotto_net(html: str, cfg) -> list[dict]:
    """lotto.net EuroJackpot archive — the independent second source. Each draw is a
    `<div class="date"><span>Weekday</span> Month Dayth Year</div>` block followed by
    `<li class="ball ball"><span>N</span></li>` ×5 mains and
    `<li class="ball euro"><span>N</span></li>` ×2 euros. Splitting on the date div
    scopes each block to one draw. Structurally unlike euro-jackpot.net, so a markup
    change on one source can't silently break both."""
    out = []
    for block in re.split(r'<div class="date">', html)[1:]:
        dm = re.search(r'</span>\s*([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)\s+(\d{4})', block)
        if not dm:
            continue
        mon = _MONTHS.get(dm.group(1))
        if not mon:
            continue
        d = f"{int(dm.group(3)):04d}-{mon:02d}-{int(dm.group(2)):02d}"
        main = sorted(int(x) for x in re.findall(r'<li class="ball ball">\s*<span>(\d+)</span>', block))[:cfg["pick"]]
        euro = sorted(int(x) for x in re.findall(r'<li class="ball euro">\s*<span>(\d+)</span>', block))[:cfg["secs"]]
        if valid(cfg, main, euro):
            out.append({"date": d, "main": main, "secs": euro})
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


def local_date(epoch_ms: int, tz: str) -> str:
    """Draw day in the operator's own timezone. lotto.de stamps 00:00 Berlin of
    the draw day, which is still the previous day in UTC."""
    return datetime.fromtimestamp(epoch_ms / 1000, ZoneInfo(tz)).date().isoformat()


def parse_lotto_de(text: str, cfg) -> list[dict]:
    """lotto.de JSON, latest EuroJackpot draw. drawNumberType 0 = main, 1 = Euro."""
    d = json.loads(text)
    nums = d.get("drawNumbersCollection") or []
    main = sorted(int(n["drawNumber"]) for n in nums if n.get("drawNumberType") == 0)
    euro = sorted(int(n["drawNumber"]) for n in nums if n.get("drawNumberType") == 1)
    if not d.get("drawDate") or not valid(cfg, main, euro):
        return []
    return [{"date": local_date(d["drawDate"], "Europe/Berlin"), "main": main, "secs": euro}]


def parse_veikkaus(text: str, cfg) -> list[dict]:
    """Veikkaus draw-results JSON for one ISO week (0–2 EuroJackpot draws).
    results[0].primary = 5 mains, .secondary = 2 Euro numbers, as strings.
    Draws without results yet (not drawn) are skipped."""
    out = []
    for dr in json.loads(text):
        res = (dr.get("results") or [{}])[0]
        main = sorted(int(x) for x in res.get("primary") or [])
        euro = sorted(int(x) for x in res.get("secondary") or [])
        if dr.get("drawTime") and valid(cfg, main, euro):
            out.append({"date": local_date(dr["drawTime"], "Europe/Helsinki"), "main": main, "secs": euro})
    return out


def parse_jsc_pt(html: str, cfg) -> list[dict]:
    """Jogos Santa Casa (Portugal) EuroMillions result page, latest draw:
    'Data do Sorteio - 02/10/2026' then the sorted key '<li>7 8 10 22 35 + 2 10</li>'."""
    dm = re.search(r"Data do Sorteio\s*-\s*(\d{2})/(\d{2})/(\d{4})", html)
    if not dm:
        return []
    km = re.search(r'<ul class="colums">\s*<li>\s*([\d ]+?)\s*\+\s*([\d ]+?)\s*</li>', html[dm.end():])
    if not km:
        return []
    main = sorted(int(x) for x in km.group(1).split())
    stars = sorted(int(x) for x in km.group(2).split())
    if not valid(cfg, main, stars):
        return []
    return [{"date": f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}", "main": main, "secs": stars}]


NL_XML = {
    "euromillions": "https://www.national-lottery.co.uk/results/euromillions/draw-history/xml",
    "uk-lotto": "https://www.national-lottery.co.uk/results/lotto/draw-history/xml",
}


def official_plan(slug: str) -> list[tuple]:
    """(source_tag, [urls], parser, encoding) — the required daily sources."""
    if slug == "euromillions":
        return [
            ("nl-xml", [NL_XML["euromillions"]], parse_nl_xml, "utf-8"),
            ("jsc-pt", ["https://www.jogossantacasa.pt/web/SCCartazResult/euroMilhoes"], parse_jsc_pt, "latin-1"),
        ]
    if slug == "eurojackpot":
        today = date.today()
        weeks = []
        for back in (0, 7, 14):
            y, w, _ = (today - timedelta(days=back)).isocalendar()
            weeks.append(f"https://www.veikkaus.fi/api/draw-results/v1/games/EJACKPOT/draws/by-week/{y}-W{w:02d}")
        return [
            ("lotto-de", ["https://www.lotto.de/api/stats/entities.eurojackpot/last"], parse_lotto_de, "utf-8"),
            ("veikkaus", weeks, parse_veikkaus, "utf-8"),
        ]
    if slug == "uk-lotto":
        return [("nl-xml", [NL_XML["uk-lotto"]], parse_nl_xml, "utf-8")]
    return []


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
            ("lotto-net", f"https://www.lotto.net/eurojackpot/results/{year}", parse_lotto_net, None),
        ]
    if slug == "uk-lotto":
        return [
            ("lottery-couk", f"https://www.lottery.co.uk/lotto/results/archive-{year}", parse_lottery_couk, "lotto"),
        ]
    return []


# --------------------------------------------------------------------------
# DB
# --------------------------------------------------------------------------
def existing(slug) -> dict[str, tuple]:
    """date -> (numbers, bonus, bonus2, source, verified). Fetched once per game;
    run_game keeps the returned map in sync as it writes, so reconciliation still
    sees rows inserted earlier in the same run (as the old per-call SELECT did)."""
    return {r["draw_date"]: (r["numbers"], r["bonus"], r["bonus2"], r["source"], r["verified"])
            for r in db.fetch_all("draws", "draw_date,numbers,bonus,bonus2,source,verified",
                                  filters=[("eq", "game_id", slug)])}


def log_conflict(slug, dprev, dnew):
    with CONFLICTS.open("a") as f:
        f.write(f"{now_iso()} EUROPE {slug} {dnew['date']}: "
                f"{dprev[3]}={dprev[0]}+{dprev[1]}/{dprev[2]} vs "
                f"{dnew['source']}={','.join(map(str,dnew['main']))}+{'/'.join(map(str,dnew['secs']))}\n")


def upsert(slug, d, have_map):
    """Reconcile one reading against what's stored: keep higher-priority source,
    flag verified when a second independent source agrees, log real conflicts.
    `have_map` is the in-memory {date: (...)} cache; kept in sync after each write."""
    have = have_map.get(d["date"])
    b1 = d["secs"][0] if d["secs"] else None
    b2 = d["secs"][1] if len(d["secs"]) > 1 else None
    nums = ",".join(str(x) for x in d["main"])
    if have is None:
        db.upsert_rows("draws", [{
            "game_id": slug, "draw_date": d["date"], "numbers": nums,
            "bonus": b1, "bonus2": b2, "source": d["source"],
            "verified": 0, "scraped_at": now_iso()}],
            on_conflict="game_id,draw_date")
        have_map[d["date"]] = (nums, b1, b2, d["source"], 0)
        return "new"
    prev_nums, prev_b1, prev_b2, prev_src, prev_ver = have
    agree = (prev_nums == nums and prev_b1 == b1 and prev_b2 == b2)
    if agree:
        if prev_src != d["source"] and not prev_ver:  # confirmed by a second source
            db.update_row("draws", {"verified": 1},
                          {"game_id": slug, "draw_date": d["date"]})
            have_map[d["date"]] = (prev_nums, prev_b1, prev_b2, prev_src, 1)
            return "verified"
        return "dup"
    # disagreement — log it, keep the higher-priority reading
    log_conflict(slug, have, d)
    if SOURCE_PRIORITY.get(d["source"], 0) > SOURCE_PRIORITY.get(prev_src, 0):
        db.update_row("draws",
                      {"numbers": nums, "bonus": b1, "bonus2": b2,
                       "source": d["source"], "verified": 0, "scraped_at": now_iso()},
                      {"game_id": slug, "draw_date": d["date"]})
        have_map[d["date"]] = (nums, b1, b2, d["source"], 0)
        return "override"
    return "conflict"


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------
def record(slug, src, url, required, rows, text):
    """Log one fetch. A page that came back but parsed to nothing is a failure
    too — that is what a layout change looks like."""
    if text is None:
        ok, err = (LAST_FETCH_ERROR is None), LAST_FETCH_ERROR  # None+no error = 404
        if ok and required:
            ok, err = False, "HTTP 404"
    elif not rows:
        ok, err = False, "fetched but parsed 0 draws (layout or schema change?)"
    else:
        ok, err = True, None
    OUTCOMES.append({"game": slug, "source": src, "url": url, "required": required,
                     "ok": ok, "rows": len(rows), "error": err})


def run_game(slug, cfg, years, delay, backfill):
    tally = {"new": 0, "verified": 0, "dup": 0, "override": 0, "conflict": 0}
    have_map = existing(slug)  # fetch once; upsert keeps it in sync as it writes

    # 1) Official latest sources — required, every run.
    for src, urls, parser, enc in official_plan(slug):
        got = 0
        failures = []
        for url in urls:
            text = fetch(url, encoding=enc)
            try:
                rows = parser(text, cfg) if text else []
            except Exception as e:  # noqa: BLE001 — malformed JSON etc.
                rows, text = [], None
                globals()["LAST_FETCH_ERROR"] = f"parse error: {type(e).__name__}: {e}"
            if text is None and LAST_FETCH_ERROR:
                failures.append(LAST_FETCH_ERROR)
            for r in rows:
                r["source"] = src
                tally[upsert(slug, r, have_map)] += 1
            got += len(rows)
        # Multi-URL sources (Veikkaus weeks) count once: ok if any week parsed.
        OUTCOMES.append({"game": slug, "source": src, "url": urls[0], "required": True,
                         "ok": got > 0, "rows": got,
                         "error": None if got else (failures[0] if failures else "fetched but parsed 0 draws (layout or schema change?)")})
        print(f"    [{src}] official: {got} parsed", flush=True)

    # 2) Third-party year archives: full history on --backfill; otherwise a quick,
    #    optional gap-filler (short timeout, one try — they block CI IPs).
    for year in years:
        for src, url, parser, extra in source_plan(slug, year):
            html = fetch(url, retries=3 if backfill else 1, timeout=30 if backfill else 10)
            rows = (parser(html, cfg, extra) if extra is not None else parser(html, cfg)) if html else []
            if year == years[-1]:  # the current year is the one that must parse
                record(slug, src, url, False, rows, html)
            if html is None:
                continue
            for r in rows:
                r["source"] = src
                tally[upsert(slug, r, have_map)] += 1
            print(f"    {year} [{src}]: {len(rows)} parsed", flush=True)
            time.sleep(delay)
    # Summary from the in-memory map (kept current with every write above).
    dates = list(have_map)
    cnt = len(dates)
    lo = min(dates) if dates else None
    hi = max(dates) if dates else None
    ver = sum(v[4] for v in have_map.values())
    print(f"✓ {slug}: {cnt} draws · {lo} → {hi} · {ver or 0} cross-verified · "
          f"(+{tally['new']} new, {tally['verified']} newly-verified, "
          f"{tally['override']} overrides, {tally['conflict']} conflicts)\n", flush=True)
    return hi


def report_and_exit_code(latest: dict[str, str | None]) -> int:
    """Annotate every failed source, write a run summary, and decide the exit code."""
    failed_req = [o for o in OUTCOMES if o["required"] and not o["ok"]]
    failed_opt = [o for o in OUTCOMES if not o["required"] and not o["ok"]]
    blocked = sorted({o["game"] for o in OUTCOMES if o["required"]}
                     - {o["game"] for o in OUTCOMES if o["required"] and o["ok"]})

    for o in failed_req:
        annotate("error", f"Official source failed: {o['game']} [{o['source']}]", f"{o['url']} — {o['error']}")
    for o in failed_opt:
        annotate("warning", f"Third-party source failed: {o['game']} [{o['source']}]", f"{o['url']} — {o['error']}")
    for g in blocked:
        annotate("error", f"{g}: no working official source",
                 f"{g} cannot update this run; last-good data kept (latest stored draw {latest.get(g)}).")

    lines = ["### European draw sources", "",
             "| Game | Source | Kind | Result |", "|---|---|---|---|"]
    for o in OUTCOMES:
        res = f"✅ {o['rows']} draw(s)" if o["ok"] else f"❌ {o['error']}"
        lines.append(f"| {o['game']} | {o['source']} | {'official' if o['required'] else 'third-party'} | {res} |")
    lines.append("")
    lines.append("Latest stored draw: " + ", ".join(f"{g} `{d}`" for g, d in latest.items()))
    summary("\n".join(lines))

    if blocked or len(failed_req) > MAX_REQUIRED_FAILURES:
        print(f"✗ FAILING THE RUN: {len(failed_req)} official source(s) failed"
              f"{'; no working source for ' + ', '.join(blocked) if blocked else ''}. "
              f"Last-good data was kept.", file=sys.stderr)
        return 1
    if failed_req:
        print(f"⚠ {len(failed_req)} official source failed but every game still had another "
              f"(threshold {MAX_REQUIRED_FAILURES}); not failing the run.", file=sys.stderr)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="fetch every year from the game's start")
    ap.add_argument("--game", help="restrict to one slug")
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    CONFLICTS.parent.mkdir(parents=True, exist_ok=True)
    this_year = date.today().year
    games = {k: v for k, v in GAMES.items() if not args.game or k == args.game}
    latest: dict[str, str | None] = {}
    for slug, cfg in games.items():
        years = range(cfg["since"], this_year + 1) if args.backfill else [this_year]
        print(f"→ {slug} ({'backfill ' + str(cfg['since']) if args.backfill else 'latest'}–{this_year})", flush=True)
        latest[slug] = run_game(slug, cfg, years, args.delay, args.backfill)
    return report_and_exit_code(latest)


if __name__ == "__main__":
    raise SystemExit(main())
