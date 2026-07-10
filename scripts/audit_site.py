#!/usr/bin/env python3
"""
audit_site.py — Whole-site correctness audit for Lottizen.

Cross-checks three sources of truth against each other, with NO human eyeballing:
  * config/games.ts   — declared price / pool / draw days / flags per game
  * data/lottizen.db  — actual scraped draws (coverage + freshness)
  * data/stats/*.json + data/draws/*.json — the numbers the site renders from
  * .next/server/app/**/*.html — the actually-built static pages

For every LIVE game it checks:
  1. Data layer     — DB draw count, stats era count, latest-draw freshness vs the
                      game's own draw schedule (stale => daily scrape is broken).
  2. Stats logic    — redundant All-time/Window toggle and hot/cold/pairs cards
                      rendered off a tiny sample.
  3. Metadata       — config price / pool / draw days vs what the page renders.
  4. Completeness   — all expected page types present in the build; no empty pages.
  5. Display        — money format ($1000K), "TBA", operator-name truncation,
                      "1 draws" plural errors, and stray undefined/NaN/null.

Output: findings grouped by severity as  game -> page -> problem -> severity,
plus a summary. Exit code is non-zero when any CRITICAL/HIGH finding exists, so a
CI step can fail the daily workflow and open an issue.

Freshness is handled separately and is NON-blocking: `--freshness` judges each
live game's newest stored draw against its own schedule (config drawDays), using
the DB as the source of truth rather than trusting any scrape exit code. Stale
data drives a GitHub issue via the watchdog workflow, never a deploy block —
because a stale morning is exactly when we still want to push last-good data.

Usage:  python3 scripts/audit_site.py              (human table, deploy gate)
        python3 scripts/audit_site.py --json        (machine-readable)
        python3 scripts/audit_site.py --freshness   (freshness only, non-blocking)
        python3 scripts/audit_site.py --freshness --json
"""
from __future__ import annotations

import html as _html
import json
import re
import sqlite3
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "lottizen.db"
STATS_DIR = ROOT / "data" / "stats"
DRAWS_DIR = ROOT / "data" / "draws"
CONFIG = ROOT / "config" / "games.ts"
APP = ROOT / ".next" / "server" / "app"

CRITICAL, HIGH, MEDIUM, LOW = "CRITICAL", "HIGH", "MEDIUM", "LOW"
SEV_ORDER = {CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3}
WEEKDAY = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
           "Friday": 4, "Saturday": 5, "Sunday": 6}
# drawCount below this makes ranking cards (hot/cold/pairs) statistically hollow.
THIN_RANKING = 30

findings: list[dict] = []


def add(game: str, page: str, problem: str, severity: str) -> None:
    findings.append({"game": game, "page": page, "problem": problem, "severity": severity})


# --------------------------------------------------------------------------
# config/games.ts parsing (one game object per line)
# --------------------------------------------------------------------------
def _field(line, key, cast=str):
    m = re.search(rf'\b{key}:\s*"([^"]*)"', line)
    if m:
        return m.group(1)
    m = re.search(rf'\b{key}:\s*([\d.]+|true|false)', line)
    if not m:
        return None
    v = m.group(1)
    if v in ("true", "false"):
        return v == "true"
    return cast(v) if cast in (int, float) else v


def load_config() -> list[dict]:
    text = CONFIG.read_text()
    games = []
    for line in text.splitlines():
        s = line.strip()
        if not (s.startswith("CA({") or s.startswith("US({") or s.startswith("EU({")):
            continue
        country = "CA" if s.startswith("CA(") else "US" if s.startswith("US(") else "EU"
        country_slug = {"CA": "canada", "US": "usa", "EU": "europe"}[country]
        default_currency = {"CA": "CAD", "US": "USD", "EU": "EUR"}[country]
        slug = _field(s, "slug")
        if not slug:
            continue
        dd = re.search(r'drawDays:\s*\[([^\]]*)\]', s)
        draw_days = re.findall(r'"([^"]+)"', dd.group(1)) if dd else []
        games.append({
            "slug": slug,
            "name": _field(s, "name"),
            "country": country,
            "countrySlug": country_slug,
            "agency": _field(s, "agency"),
            "operator": _field(s, "operator"),
            "price": _field(s, "price", float),
            "currency": _field(s, "currency") or default_currency,
            "pick": _field(s, "pick", int),
            "max": _field(s, "max", int),
            "bonusMax": _field(s, "bonusMax", int),
            "hasBonus": _field(s, "hasBonus") if "hasBonus:" in s else True,
            "format": _field(s, "format") or "lotto",
            "drawDays": draw_days,
            "statsFrom": _field(s, "statsFrom"),
            "progressive": bool(_field(s, "progressive")) if "progressive:" in s else False,
            "live": bool(_field(s, "live")) if "live:" in s else False,
        })
    return games


def load_agency_operator() -> dict:
    text = CONFIG.read_text()
    m = re.search(r'AGENCY_OPERATOR[^=]*=\s*\{(.*?)\};', text, re.DOTALL)
    out = {}
    if m:
        # key may be quoted ("Loto-Québec") or bare (National); value is quoted.
        for kq, kb, val in re.findall(r'(?:"([^"]+)"|([A-Za-z-]+)):\s*"([^"]+)"', m.group(1)):
            out[kq or kb] = val
    return out


def operator_name(g: dict, agency_op: dict) -> str | None:
    return g["operator"] or agency_op.get(g["agency"])


# --------------------------------------------------------------------------
# HTML helpers
# --------------------------------------------------------------------------
_TAG = re.compile(r"<[^>]+>")
_SCRIPT = re.compile(r"<(script|style)\b.*?</\1>", re.DOTALL | re.IGNORECASE)
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


def page_text(path: Path) -> str:
    """Visible text of a built page: scripts/styles/comments/tags stripped,
    entities decoded, whitespace collapsed."""
    raw = path.read_text(errors="replace")
    raw = _SCRIPT.sub(" ", raw)
    raw = _COMMENT.sub("", raw)
    raw = _TAG.sub(" ", raw)
    return re.sub(r"\s+", " ", _html.unescape(raw)).strip()


def overview(g):
    return APP / g["countrySlug"] / f"{g['slug']}.html"


def sub(g, *parts):
    return APP / g["countrySlug"] / g["slug"] / Path(*parts)


# --------------------------------------------------------------------------
# Schedule freshness
# --------------------------------------------------------------------------
def schedule_gap(draw_days) -> int | None:
    if is_daily(draw_days):
        return 1
    days = sorted(WEEKDAY[d] for d in draw_days if d in WEEKDAY)
    if not days:
        return None
    return max(((days[(i + 1) % len(days)] - days[i]) % 7) or 7 for i in range(len(days)))


def is_daily(draw_days) -> bool:
    return any(re.search(r"daily|night", d, re.I) for d in draw_days) or len(draw_days) >= 7


def most_recent_due(draw_days, today: date) -> date | None:
    """The most recent scheduled draw date *strictly before* today.

    "Strictly before today" is the freshness contract: draws happen in the
    evening and the scrape runs the next morning, so a draw dated today is not
    yet due — but yesterday's (or earlier) draw must already be in the data.
    This gives a natural ~1-day grace and flags anything staler than that.
    """
    if is_daily(draw_days):
        return today - timedelta(days=1)
    wd = {WEEKDAY[d] for d in draw_days if d in WEEKDAY}
    if not wd:
        return None
    d = today - timedelta(days=1)
    for _ in range(14):
        if d.weekday() in wd:
            return d
        d -= timedelta(days=1)
    return None


def missing_draw_dates(draw_days, db_latest: date, due: date) -> list[str]:
    """Scheduled draw dates in (db_latest, due] that are absent from the data —
    i.e. the draws we should have but don't. Newest first, capped for sanity."""
    wd = {WEEKDAY[d] for d in draw_days if d in WEEKDAY}
    out, d = [], due
    for _ in range(60):
        if d <= db_latest:
            break
        if is_daily(draw_days) or d.weekday() in wd:
            out.append(d.isoformat())
        d -= timedelta(days=1)
    return out


def check_freshness(live: list[dict], db_counts: dict, today: date) -> list[dict]:
    """Per-game staleness judged by *actual data in the DB*, not any scrape exit
    code. A game is stale when its newest stored draw predates the most recent
    due draw — meaning the daily scrape silently failed to append a real draw.

    Returns one record per stale game (empty list = everything fresh). This is
    intentionally NOT part of the deploy-gate blocking set: stale data is exactly
    when we still want to push (to deliver whatever fresh draws we *did* get and
    to keep last-good data live) — so it drives an alert/issue, never a block.
    """
    stale = []
    for g in live:
        cnt, latest = db_counts.get(g["slug"], (0, None))
        if not latest:
            continue  # 0-draws is handled as CRITICAL in the deploy-gate audit
        due = most_recent_due(g["drawDays"], today)
        if due is None:
            continue
        db_latest = date.fromisoformat(latest)
        if db_latest >= due:
            continue
        missing = missing_draw_dates(g["drawDays"], db_latest, due)
        stale.append({
            "slug": g["slug"],
            "name": g["name"],
            "drawDays": g["drawDays"],
            "latest": latest,
            "due": due.isoformat(),
            "daysLate": (today - db_latest).days,
            "missing": missing,
        })
    return stale


# --------------------------------------------------------------------------
# The audit
# --------------------------------------------------------------------------
def audit():
    games = load_config()
    agency_op = load_agency_operator()
    live = [g for g in games if g["live"]]
    if not APP.exists():
        add("(build)", "-", f"No build output at {APP} — run `npm run build` first.", CRITICAL)
        return
    db_counts = db_draw_counts()

    for g in live:
        slug, name = g["slug"], g["name"]
        cnt = db_counts.get(slug, (0, None))[0]
        stats_path = STATS_DIR / f"{slug}.json"
        draws_path = DRAWS_DIR / f"{slug}.json"
        stats = json.loads(stats_path.read_text()) if stats_path.exists() else None
        draws = json.loads(draws_path.read_text()) if draws_path.exists() else None

        # ---- 1. DATA LAYER ----
        if cnt == 0:
            add(name, "data", "0 draws in DB — game is live but has no scraped data.", CRITICAL)
        elif cnt < 10:
            add(name, "data", f"Only {cnt} draw(s) in DB — shallow history (no full backfill source).", MEDIUM)
        if stats is None:
            add(name, "statistics", "No stats JSON generated.", HIGH)
        # NOTE: staleness is deliberately NOT flagged here. Blocking the deploy on
        # stale data is backwards — it would stop us pushing whatever fresh draws
        # we *did* get and keep last-good data from shipping. Freshness is checked
        # separately (check_freshness / `--freshness` mode) and drives a GitHub
        # issue via the watchdog, never a deploy block. See module docstring.

        if stats is None:
            continue
        dc = stats.get("drawCount", 0)
        ws = stats.get("aggregate", {}).get("windowSize", 0)

        # ---- 2. STATS PAGE LOGIC ----
        stats_html = sub(g, "statistics.html")
        stxt = page_text(stats_html) if stats_html.exists() else ""
        if stats_html.exists() and g["format"] != "digit":
            # redundant toggle: all-time == window when drawCount <= windowSize
            if dc <= ws and "All-time" in stxt and f"Last {ws} draws" in stxt:
                add(name, "statistics",
                    f"Renders All-time / 'Last {ws} draws' toggle but drawCount ({dc}) <= "
                    f"window ({ws}) — the two views are identical.", MEDIUM)
            # ranking cards off a tiny sample
            if dc < THIN_RANKING and ("Hot numbers" in stxt or "Most common pairs" in stxt):
                sev = HIGH if dc < 10 else MEDIUM
                add(name, "statistics",
                    f"Renders hot/cold/pairs cards from only {dc} draw(s) — not statistically "
                    f"meaningful.", sev)

        # ---- 3. METADATA CONSISTENCY (config vs rendered overview) ----
        ov = overview(g)
        if not ov.exists():
            add(name, "overview", "Overview page missing from build output.", HIGH)
        else:
            otxt = page_text(ov)
            m = re.search(r"Ticket price\s*[$€£]([\d.]+)\s*(CAD|USD|EUR|GBP)", otxt)
            if m:
                rp, rc = float(m.group(1)), m.group(2)
                if abs(rp - g["price"]) > 0.001:
                    add(name, "overview",
                        f"Ticket price mismatch: config ${g['price']:.2f} vs page ${rp:.2f}.", HIGH)
                if rc != g["currency"]:
                    add(name, "overview", f"Currency mismatch: config {g['currency']} vs page {rc}.", HIGH)
            else:
                add(name, "overview", "Could not find a 'Ticket price $X' row to verify.", LOW)
            if g["format"] != "digit":
                mp = re.search(r"numbers from 1 to (\d+)", otxt)
                if mp and int(mp.group(1)) != g["max"]:
                    add(name, "overview",
                        f"Number pool mismatch: config max {g['max']} vs page 'to {mp.group(1)}'.", HIGH)
            dd_str = ", ".join(g["drawDays"])
            if f"Draw days {dd_str}" not in otxt:
                add(name, "overview", f"Draw-days row doesn't match config ({dd_str}).", MEDIUM)
            # The rendered "Next draw" weekday must be one of the game's draw days —
            # catches a stale/bad scraped date showing a non-draw-day (e.g. a Saturday
            # game showing Sunday). Daily/nightly games draw every day, so skip them.
            is_daily = any(re.search(r"daily|night", d, re.I) for d in g["drawDays"]) or len(g["drawDays"]) >= 7
            nd = re.search(r"Next draw\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b", otxt)
            if nd and not is_daily:
                wd = {"Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday",
                      "Fri": "Friday", "Sat": "Saturday", "Sun": "Sunday"}[nd.group(1)]
                if wd not in g["drawDays"]:
                    add(name, "overview",
                        f"Next-draw date falls on a {wd}, but {name} only draws {'/'.join(g['drawDays'])}.", HIGH)
            # operator-name truncation in the disclaimer
            op = operator_name(g, agency_op)
            if op and "not affiliated with" in otxt and op not in otxt:
                add(name, "overview",
                    f"Disclaimer doesn't render the full operator name ('{op}').", HIGH)
            if re.search(r"affiliated with (National|Multi-State)\b", otxt):
                add(name, "overview", "Disclaimer shows a UI bucket ('National'/'Multi-State'), "
                    "not the real operator name.", HIGH)

        # ---- 4. PAGE COMPLETENESS ----
        expected = {
            "overview": ov,
            "results": sub(g, "results.html"),
            "statistics": stats_html,
            "faq": sub(g, "faq.html"),
        }
        if g["format"] != "digit":
            expected["generator"] = sub(g, "generator.html")
            expected["number/1"] = sub(g, "number", "1.html")
            if g["max"]:
                expected[f"number/{g['max']}"] = sub(g, "number", f"{g['max']}.html")
        for label, p in expected.items():
            if not p.exists():
                add(name, label, "Expected page missing from build output.", HIGH)
        # results year pages
        rdir = sub(g, "results")
        if rdir.exists() and not list(rdir.glob("*.html")):
            add(name, "results/[year]", "No per-year results pages generated.", MEDIUM)
        # empty results page (no draw rows)
        rp = sub(g, "results.html")
        if rp.exists() and 'class="rdate"' not in rp.read_text(errors="replace"):
            add(name, "results", "Results page has no draw rows (empty data page).", HIGH)

        # ---- 5. DISPLAY ANOMALIES (scan built pages) ----
        pages = {"overview": ov, "statistics": stats_html,
                 "results": sub(g, "results.html"), "faq": sub(g, "faq.html")}
        if g["format"] != "digit":
            pages["generator"] = sub(g, "generator.html")
            pages["number/1"] = sub(g, "number", "1.html")
        for label, p in pages.items():
            if not p.exists():
                continue
            t = page_text(p)
            if re.search(r"\$\d{4,}(\.\d+)?[KMB]\b", t):
                bad = re.search(r"\$\d{4,}(?:\.\d+)?[KMB]\b", t).group(0)
                add(name, label, f"Malformed compact money value '{bad}' (e.g. should roll to next unit).", MEDIUM)
            if re.search(r"\bTBA\b", t):
                add(name, label, "'TBA' shown to users.", MEDIUM)
            if re.search(r"(^|[^0-9])1 draws\b", t):
                add(name, label, "Plural bug: 'ā1 draws' should be '1 draw'.".replace("ā", ""), MEDIUM)
            for tok in ("undefined", "NaN", "null"):
                if re.search(rf"(^|\s)\b{tok}\b", t):
                    add(name, label, f"Stray '{tok}' rendered in page text.", HIGH)

    # ---- home page: jackpot money format + TBA ----
    home = APP / "index.html"
    if home.exists():
        t = page_text(home)
        if re.search(r"\bTBA\b", t):
            add("(home)", "/", "'TBA' shown on the home page.", MEDIUM)
        if re.search(r"\$\d{4,}(\.\d+)?[KMB]\b", t):
            bad = re.search(r"\$\d{4,}(?:\.\d+)?[KMB]\b", t).group(0)
            add("(home)", "/", f"Malformed compact money value '{bad}'.", MEDIUM)


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------
def report_text() -> int:
    findings.sort(key=lambda f: (SEV_ORDER[f["severity"]], f["game"], f["page"]))
    by_sev = {s: [f for f in findings if f["severity"] == s] for s in (CRITICAL, HIGH, MEDIUM, LOW)}
    print("=" * 78)
    print(f"LOTTIZEN SITE AUDIT — {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 78)
    if not findings:
        print("\n✅ No issues found. All live games clean across data, pages, metadata, display.\n")
        return 0
    for sev in (CRITICAL, HIGH, MEDIUM, LOW):
        rows = by_sev[sev]
        if not rows:
            continue
        print(f"\n### {sev}  ({len(rows)})")
        print(f"{'game':22} {'page':16} problem")
        print("-" * 78)
        for f in rows:
            print(f"{f['game'][:21]:22} {f['page'][:15]:16} {f['problem']}")
    print("\n" + "-" * 78)
    print("SUMMARY: " + " · ".join(
        f"{s}={len(by_sev[s])}" for s in (CRITICAL, HIGH, MEDIUM, LOW)))
    blocking = len(by_sev[CRITICAL]) + len(by_sev[HIGH])
    print(f"Blocking (CRITICAL+HIGH): {blocking}")
    return 1 if blocking else 0


def db_draw_counts() -> dict:
    conn = sqlite3.connect(DB_PATH)
    counts = {r[0]: (r[1], r[2]) for r in conn.execute(
        "SELECT game_id, COUNT(*), MAX(draw_date) FROM draws GROUP BY game_id")}
    conn.close()
    return counts


def freshness_main() -> int:
    """Non-blocking freshness report. Always exits 0 (staleness must never fail a
    step); the watchdog reads the --json output to open issues. Reads only the DB
    and config — no site build required, so it can run as a standalone watchdog."""
    live = [g for g in load_config() if g["live"]]
    stale = check_freshness(live, db_draw_counts(), date.today())
    if "--selftest" in sys.argv:
        # Fire-drill: inject a synthetic stale game so the watchdog's issue
        # open/close path can be exercised end-to-end on demand, without touching
        # real data. The canary disappears on the next normal run, which then
        # auto-closes its issue — proving recovery too.
        stale = stale + [{
            "slug": "selftest-canary", "name": "SELFTEST canary",
            "drawDays": ["Daily"], "latest": "2000-01-01", "due": "2000-01-02",
            "daysLate": 9999, "missing": ["2000-01-02"],
        }]
    if "--json" in sys.argv:
        print(json.dumps({"generatedAt": datetime.now().isoformat(), "stale": stale}, indent=2))
        return 0
    print("=" * 78)
    print(f"LOTTIZEN FRESHNESS CHECK — {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 78)
    if not stale:
        print(f"\n✅ All {len(live)} live games are current with their draw schedule.\n")
        return 0
    print(f"\n⚠️  {len(stale)} of {len(live)} live games are STALE "
          f"(newest stored draw is behind the schedule):\n")
    print(f"{'game':22} {'latest':12} {'due':12} missing")
    print("-" * 78)
    for s in stale:
        print(f"{s['name'][:21]:22} {s['latest']:12} {s['due']:12} {', '.join(s['missing']) or '—'}")
    print()
    return 0


def main() -> int:
    if "--freshness" in sys.argv:
        return freshness_main()
    audit()
    if "--json" in sys.argv:
        print(json.dumps({"generatedAt": datetime.now().isoformat(), "findings": findings}, indent=2))
        return 1 if any(f["severity"] in (CRITICAL, HIGH) for f in findings) else 0
    return report_text()


if __name__ == "__main__":
    raise SystemExit(main())
