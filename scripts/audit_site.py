#!/usr/bin/env python3
"""
audit_site.py — Whole-site correctness audit for Lottizen.

Cross-checks three sources of truth against each other, with NO human eyeballing:
  * config/games.ts   — declared price / pool / draw days / flags per game
  * Supabase `draws` table — actual scraped draws (coverage + freshness)
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

The /api docs page (app/api/page.tsx) gets the same build-completeness
treatment as /guides: audit_api_docs() checks it exists, renders real content,
and documents every v1 endpoint — blocking, part of the main deploy gate.
The v1 endpoints themselves (app/api/v1/**/route.ts) are request-time route
handlers, not build output, so they can't be checked from .next/server/app —
`--api-health` instead curls a live site (local dev/start or production) and
reports pass/fail per endpoint. Once the RapidAPI proxy-secret gate is on in
production (see docs/rapidapi/rapidapi-secret.md), a direct/unauthenticated
`401` is the *healthy* result, not a failure; pass `--secret <value>` to
instead simulate the RapidAPI proxy and expect real `200`s. Like
--freshness, it's NON-blocking: a reachability blip shouldn't fail the
build, it should just be visible.

Usage:  python3 scripts/audit_site.py              (human table, deploy gate)
        python3 scripts/audit_site.py --json        (machine-readable)
        python3 scripts/audit_site.py --freshness   (freshness only, non-blocking)
        python3 scripts/audit_site.py --freshness --json
        python3 scripts/audit_site.py --api-health                  (checks https://lottizen.com)
        python3 scripts/audit_site.py --api-health --site http://localhost:3000
        python3 scripts/audit_site.py --api-health --secret <RAPIDAPI_PROXY_SECRET>  (simulates the RapidAPI proxy; expects 200s)
        python3 scripts/audit_site.py --api-health --json
"""
from __future__ import annotations

import html as _html
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper (replaces sqlite3)

ROOT = Path(__file__).resolve().parent.parent
STATS_DIR = ROOT / "data" / "stats"
DRAWS_DIR = ROOT / "data" / "draws"
CONFIG = ROOT / "config" / "games.ts"
GUIDES_CONTENT = ROOT / "content" / "guides"
APP = ROOT / ".next" / "server" / "app"
API_DOCS_PAGE = APP / "api.html"
API_ENDPOINT_ANCHORS = [
    "get-games", "get-game", "get-latest", "get-draws",
    "get-statistics", "get-scratch-ontario", "get-scratch-ontario-slug",
]

# /subscribe/preferences is a client-rendered shell (fetches with a ?token=
# after mount), so it has little server-rendered text by design — unlike the
# other two, its min_chars is 0 and it's checked for presence only.
SUBSCRIBE_PAGES = {
    "subscribe": {"min_chars": 400, "must_contain": ["subscribe"]},
    "subscribe/preferences": {"min_chars": 0, "must_contain": []},
    "subscribe/unsubscribed": {"min_chars": 100, "must_contain": ["unsubscribed"]},
}

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

    audit_guides()
    audit_api_docs()
    audit_subscribe_pages()


# --------------------------------------------------------------------------
# Guides (long-form content layer)
# --------------------------------------------------------------------------
def guide_slugs() -> list[str]:
    """Non-draft guide slugs from content/guides/*.md (frontmatter `draft: true`
    is excluded, matching lib/guides.ts)."""
    if not GUIDES_CONTENT.exists():
        return []
    out = []
    for f in sorted(GUIDES_CONTENT.glob("*.md")):
        if re.search(r"^draft:\s*true\b", f.read_text(), re.M):
            continue
        out.append(f.stem)
    return out


def audit_guides() -> None:
    """Completeness of the /guides/ layer in the build: hub present and links each
    guide; every guide page built, non-empty, with Article JSON-LD and no stray
    render artifacts. A missing/empty guide page fails the deploy gate."""
    slugs = guide_slugs()
    if not slugs:
        return

    hub = APP / "guides.html"
    if not hub.exists():
        add("(guides)", "hub", "Guides hub /guides missing from build output.", HIGH)
    else:
        raw = hub.read_text(errors="replace")
        missing = [s for s in slugs if f"/guides/{s}" not in raw]
        if missing:
            add("(guides)", "hub",
                f"Hub doesn't link {len(missing)} guide(s): {', '.join(missing[:4])}"
                f"{'…' if len(missing) > 4 else ''}.", MEDIUM)

    for slug in slugs:
        p = APP / "guides" / f"{slug}.html"
        if not p.exists():
            add(f"guide:{slug}", "guides", "Guide page missing from build output.", HIGH)
            continue
        raw = p.read_text(errors="replace")
        txt = page_text(p)
        if len(txt) < 600:
            add(f"guide:{slug}", "guides",
                f"Guide renders only {len(txt)} chars of text — build/markdown issue.", HIGH)
        if '"@type":"Article"' not in raw:
            add(f"guide:{slug}", "guides", "Guide missing Article JSON-LD.", MEDIUM)
        if 'class="guide-toc' not in raw:
            add(f"guide:{slug}", "guides", "Guide missing its table of contents (render issue).", LOW)
        for tok in ("undefined", "NaN"):
            if re.search(rf"(^|\s)\b{tok}\b", txt):
                add(f"guide:{slug}", "guides", f"Stray '{tok}' rendered in guide text.", HIGH)


# --------------------------------------------------------------------------
# /api developer docs page (app/api/page.tsx)
# --------------------------------------------------------------------------
def audit_api_docs() -> None:
    """Completeness of the /api docs page in the build: the page exists,
    renders substantial content, documents every v1 endpoint (by anchor id),
    and links out to RapidAPI. Mirrors audit_guides()'s pattern for a single
    hand-written page rather than a content-driven collection.

    Note: "null" is deliberately NOT flagged as a stray token here (unlike
    the per-game DISPLAY ANOMALIES check) — the page's response-envelope and
    JSON examples legitimately render the literal text `null` (e.g.
    `"meta": null`). audit_guides() makes the same exception for prose."""
    if not API_DOCS_PAGE.exists():
        add("(api-docs)", "page", "/api docs page missing from build output.", HIGH)
        return
    raw = API_DOCS_PAGE.read_text(errors="replace")
    txt = page_text(API_DOCS_PAGE)
    if len(txt) < 1500:
        add("(api-docs)", "page", f"/api renders only {len(txt)} chars of text — build/content issue.", HIGH)
    missing = [a for a in API_ENDPOINT_ANCHORS if f'id="{a}"' not in raw]
    if missing:
        add("(api-docs)", "page",
            f"/api doesn't document {len(missing)} endpoint(s): {', '.join(missing)}.", HIGH)
    if "RapidAPI" not in txt:
        add("(api-docs)", "page", "/api doesn't mention RapidAPI (missing CTA/auth section).", MEDIUM)
    for tok in ("undefined", "NaN"):
        if re.search(rf"(^|\s)\b{tok}\b", txt):
            add("(api-docs)", "page", f"Stray '{tok}' rendered on /api.", HIGH)


# --------------------------------------------------------------------------
# /subscribe pages (app/subscribe/**)
# --------------------------------------------------------------------------
def audit_subscribe_pages() -> None:
    """Build-completeness for the subscription flow's static pages. The API
    routes behind them (app/api/subscribe/**) are request-time route
    handlers like app/api/v1/**, not build output — no equivalent local
    check exists for those yet; verify manually (create → confirm →
    preferences → unsubscribe) after each deploy."""
    for slug, rule in SUBSCRIBE_PAGES.items():
        p = APP / f"{slug}.html"
        if not p.exists():
            add("(subscribe)", slug, "Page missing from build output.", HIGH)
            continue
        txt = page_text(p)
        if len(txt) < rule["min_chars"]:
            add("(subscribe)", slug, f"Renders only {len(txt)} chars of text — build/content issue.", HIGH)
        for phrase in rule["must_contain"]:
            if phrase.lower() not in txt.lower():
                add("(subscribe)", slug, f"Missing expected content: '{phrase}'.", MEDIUM)
        for tok in ("undefined", "NaN"):
            if re.search(rf"(^|\s)\b{tok}\b", txt):
                add("(subscribe)", slug, f"Stray '{tok}' rendered.", HIGH)


# --------------------------------------------------------------------------
# Live endpoint health (app/api/v1/**) — NOT build output, so it curls a
# running site (local dev/start, or production) instead of reading .next/.
# --------------------------------------------------------------------------
def _api_get(
    site: str, path: str, secret: str | None = None
) -> tuple[int | None, dict | None, str | None, int | None]:
    """GET site+path, parsed as JSON. Returns (status, body, error, elapsed_ms).
    Attaches X-RapidAPI-Proxy-Secret when `secret` is given (see rapidapi-secret.md)."""
    url = site.rstrip("/") + path
    headers = {"User-Agent": "lottizen-api-health/1.0"}
    if secret:
        headers["X-RapidAPI-Proxy-Secret"] = secret
    req = urllib.request.Request(url, headers=headers)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
            status, raw = r.status, r.read()
        return status, json.loads(raw.decode("utf-8", "replace")), None, round((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        ms = round((time.time() - t0) * 1000)
        try:
            body = json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            body = None
        return e.code, body, None, ms
    except Exception as e:  # network, DNS, TLS, timeout, bad JSON
        return None, None, f"{type(e).__name__}: {e}", round((time.time() - t0) * 1000)


FALLBACK_GAME_SLUG = "lotto-max"
FALLBACK_SCRATCH_SLUG = "bingo-multip"

# (path, required substring, description) — pages that became dynamic for
# Lottizen Pro's per-visitor gating (/dashboard, /scratch) and so have no
# static .html to check the way audit()/audit_subscribe_pages() do; these
# are checked live instead, same reasoning as the /api/v1 endpoint checks.
PAGE_HEALTH_CHECKS = [
    ("/dashboard", "My Lottizen", "anonymous visitor should see the sign-in prompt, not an error"),
    ("/scratch", "Rankings are based on publicly available remaining-prize data", "required disclaimer must render"),
    ("/subscribe", "Winning numbers", "newsletter/account landing page"),
]


def _html_get(site: str, path: str) -> tuple[int | None, str | None, str | None, int | None]:
    """Plain GET returning (status, text, error, elapsed_ms) — for HTML page
    checks, as opposed to _api_get's JSON parsing."""
    url = site.rstrip("/") + path
    req = urllib.request.Request(url, headers={"User-Agent": "lottizen-api-health/1.0"})
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
            status, raw = r.status, r.read()
        return status, raw.decode("utf-8", "replace"), None, round((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), None, round((time.time() - t0) * 1000)
    except Exception as e:  # noqa: BLE001
        return None, None, f"{type(e).__name__}: {e}", round((time.time() - t0) * 1000)


def api_health_main() -> int:
    """Curl every v1 endpoint against a live site and report pass/fail.

    Two modes, selected by whether a RapidAPI proxy secret is supplied:

    - No `--secret`: this is a direct, non-proxied caller — exactly what
      `checkRapidApiSecret` (lib/api.ts) is designed to reject once
      API_REQUIRE_RAPIDAPI_SECRET=true. So once the gate is live, a
      `401 UNAUTHORIZED` is the *healthy* result here, not a failure — see
      rapidapi-secret.md step 5. Slugs for the per-game/per-scratch checks
      then fall back to FALLBACK_GAME_SLUG/FALLBACK_SCRATCH_SLUG (can't
      chain a real slug from a body we're not authorized to read), so those
      routes still get exercised and checked for the same 401 behavior.
    - `--secret <value>` (or env RAPIDAPI_PROXY_SECRET): simulates the
      RapidAPI proxy itself — attaches X-RapidAPI-Proxy-Secret to every
      request, so every check expects a real `200` with data, and slugs are
      chained from the live response bodies as before.

    Before the gate is enabled (or against local dev/start, where it's off
    by default), plain `200` is what's expected either way — `--secret` is
    simply unnecessary, not wrong, in that case.

    Always exits 0 — like --freshness, a reachability blip should be
    visible, not block CI."""
    site = os.environ.get("API_HEALTH_SITE", "https://lottizen.com")
    if "--site" in sys.argv:
        site = sys.argv[sys.argv.index("--site") + 1]
    secret = os.environ.get("RAPIDAPI_PROXY_SECRET")
    if "--secret" in sys.argv:
        secret = sys.argv[sys.argv.index("--secret") + 1]
    as_json = "--json" in sys.argv

    checks: list[dict] = []

    def get(path: str):
        return _api_get(site, path, secret)

    def record(path: str, status, body, error, ms, expect_key="data") -> dict | None:
        ok_200 = error is None and status == 200 and isinstance(body, dict) and expect_key in body
        ok_gated = (
            not secret
            and error is None
            and status == 401
            and isinstance(body, dict)
            and isinstance(body.get("error"), dict)
            and body["error"].get("code") == "UNAUTHORIZED"
        )
        checks.append({"path": path, "status": status, "ok": ok_200 or ok_gated,
                        "ms": ms, "gated": ok_gated, "error": error})
        return body if ok_200 else None

    body = record("/api/v1/games", *get("/api/v1/games"))
    game_slug = body["data"][0]["slug"] if body and body.get("data") else (None if secret else FALLBACK_GAME_SLUG)
    if game_slug:
        for path in (
            f"/api/v1/games/{game_slug}",
            f"/api/v1/games/{game_slug}/latest",
            f"/api/v1/games/{game_slug}/draws?limit=5",
            f"/api/v1/games/{game_slug}/statistics",
        ):
            record(path, *get(path))
    else:
        checks.append({"path": "/api/v1/games/{slug}/*", "status": None, "ok": False, "ms": None,
                        "error": "skipped — /api/v1/games returned no games to chain a slug from"})

    body = record("/api/v1/scratch/ontario", *get("/api/v1/scratch/ontario"))
    scratch_slug = (
        body["data"][0]["slug"] if body and body.get("data") else (None if secret else FALLBACK_SCRATCH_SLUG)
    )
    if scratch_slug:
        path = f"/api/v1/scratch/ontario/{scratch_slug}"
        record(path, *get(path))
    else:
        checks.append({"path": "/api/v1/scratch/ontario/{slug}", "status": None, "ok": False, "ms": None,
                        "error": "skipped — /api/v1/scratch/ontario returned no games to chain a slug from"})

    status, body, error, ms = get("/api/v1/games/not-a-real-game-xyz")
    # An invalid slug should 404 when authorized, but if the gate rejects the
    # request first (no/wrong secret), a 401 is the correct, expected result.
    ok_invalid = error is None and (status == 404 or (not secret and status == 401))
    checks.append({"path": "/api/v1/games/{invalid} (expect 404, or 401 if gated)",
                    "status": status, "ok": ok_invalid, "ms": ms, "error": error})

    for path, needle, _desc in PAGE_HEALTH_CHECKS:
        status, text, error, ms = _html_get(site, path)
        ok = error is None and status == 200 and text is not None and needle in text
        checks.append({"path": f"{path} (page)", "status": status, "ok": ok, "ms": ms, "error": error})

    failed = [c for c in checks if not c["ok"]]
    result = {"site": site, "secretUsed": bool(secret), "generatedAt": datetime.now().isoformat(),
              "checks": checks, "failed": len(failed)}

    if as_json:
        print(json.dumps(result, indent=2))
        return 0

    print("=" * 78)
    mode = "authenticated (--secret provided)" if secret else "direct / unauthenticated"
    print(f"LOTTIZEN API HEALTH — {site}  [{mode}]")
    print("=" * 78)
    print(f"\n{'path':46} {'status':7} {'ms':6} result")
    print("-" * 78)
    for c in checks:
        mark = "OK (gated)" if c.get("gated") else ("OK" if c["ok"] else "FAIL")
        tail = f" — {c['error']}" if c["error"] else ""
        print(f"{c['path'][:45]:46} {str(c['status']):7} {str(c['ms'] or ''):6} {mark}{tail}")
    print()
    if failed:
        print(f"⚠️  {len(failed)} of {len(checks)} endpoint checks failed against {site}.\n")
    else:
        print(f"✅ All {len(checks)} endpoint checks passed against {site}.\n")
    return 0


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
    # Per-game count + latest date via the draw_counts view (~20 rows) instead of
    # pulling all ~95k draws. See supabase/migrations/0003_draw_counts_view.sql.
    return {r["game_id"]: (r["cnt"], r["max_date"])
            for r in db.fetch_all("draw_counts")}


def local_today() -> date:
    """Today's date in America/Toronto — the timezone the site uses for draw dates
    (see lib/format.ts nextDrawDate). Using UTC would, in the evening across the
    Americas (after 00:00 UTC), treat a game's not-yet-published same-day draw as
    already overdue and false-positive. Falls back to UTC if tz data is missing."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Toronto")).date()
    except Exception:
        return date.today()


def freshness_main() -> int:
    """Non-blocking freshness report. Always exits 0 (staleness must never fail a
    step); the watchdog reads the --json output to open issues. Reads only the DB
    and config — no site build required, so it can run as a standalone watchdog."""
    live = [g for g in load_config() if g["live"]]
    stale = check_freshness(live, db_draw_counts(), local_today())
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
    if "--api-health" in sys.argv:
        return api_health_main()
    audit()
    if "--json" in sys.argv:
        print(json.dumps({"generatedAt": datetime.now().isoformat(), "findings": findings}, indent=2))
        return 1 if any(f["severity"] in (CRITICAL, HIGH) for f in findings) else 0
    return report_text()


if __name__ == "__main__":
    raise SystemExit(main())
