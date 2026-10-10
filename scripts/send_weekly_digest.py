#!/usr/bin/env python3
"""send_weekly_digest.py — Sunday weekly email: this week's results across a
subscriber's followed games, current jackpot snapshots (a point-in-time
snapshot, not a trend — see NOTE below), data highlights, and one guide
recommendation. Run by weekly-digest.yml (Sundays), after a normal daily
build so data/draws/*.json + data/stats/*.json are current.

NOTE on "jackpot trend": the brief asks for a jackpot trend, but the per-draw
`jackpot` field in data/draws/*.json is null for every draw in the current
dataset — jackpot history was never scraped, only the current
next-draw estimate. Faking a trend from a single number would violate the
"every number must come from real data" rule this whole feature is built on
(see the Phase 3 news brief's same constraint). So game_sections below just
carries this week's real draws; a genuine trend needs a new data source
(snapshotting next_jackpot over time) — flagged for a future pass, not
silently faked here.

Idempotent via the same claim_send()-before-sending pattern as
send_draw_emails.py (email_log unique index on subscriber_id/type/game_slug/
sent_date; weekly digests use game_slug='').
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper
from game_meta import GAME_META  # noqa: E402
from email_templates import weekly_digest_email  # noqa: E402
from mailer import claim_send, deliver  # noqa: E402 — the single Resend path

ROOT = Path(__file__).resolve().parent.parent
DRAWS_DIR = ROOT / "data" / "draws"
STATS_DIR = ROOT / "data" / "stats"
GUIDES_DIR = ROOT / "content" / "guides"
SITE_URL = "https://lottizen.com"
COUNTRY_SLUG = {"CA": "canada", "US": "usa", "EU": "europe"}


def today_toronto():
    return datetime.now(ZoneInfo("America/Toronto")).date()


def load_json_cache(directory: Path) -> dict:
    cache = {}
    for slug in GAME_META:
        p = directory / f"{slug}.json"
        if p.exists():
            cache[slug] = json.loads(p.read_text())
    return cache


def build_game_sections(followed_slugs: list[str], draws_cache: dict, week_start: str) -> list[dict]:
    sections = []
    for slug in followed_slugs:
        d = draws_cache.get(slug)
        meta = GAME_META.get(slug)
        if not d or not meta:
            continue
        week_draws = [x for x in d["draws"] if x["date"] >= week_start]
        if not week_draws:
            continue
        sections.append(
            {"name": meta["name"], "url": f"{SITE_URL}/{COUNTRY_SLUG[meta['country']]}/{slug}", "draws": week_draws}
        )
    return sections


def build_highlights(followed_slugs: list[str], stats_cache: dict) -> list[str]:
    highlights = []
    for slug in followed_slugs:
        s = stats_cache.get(slug)
        meta = GAME_META.get(slug)
        if not s or not meta or s.get("format") == "digit":
            continue
        agg = s.get("aggregate", {})
        hot = agg.get("hot") or []
        if hot:
            ns = next((n for n in s.get("numbers", []) if n["n"] == hot[0]), None)
            if ns:
                highlights.append(f"{meta['name']}: number {hot[0]} is the hottest right now ({ns['count']} appearances).")
        longest = max(s.get("numbers", []), key=lambda n: n.get("currentGap") or 0, default=None)
        if longest and (longest.get("currentGap") or 0) >= 20:
            highlights.append(f"{meta['name']}: number {longest['n']} hasn't appeared in {longest['currentGap']} draws.")
    return highlights[:4]


def pick_guide(country: str | None) -> dict | None:
    """One guide recommendation, matched loosely to the subscriber's region
    and rotated by day-of-year so it's not identical every single week."""
    if not GUIDES_DIR.exists():
        return None
    candidates = []
    for f in sorted(GUIDES_DIR.glob("*.md")):
        text = f.read_text()
        m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
        if not m:
            continue
        try:
            fm = yaml.safe_load(m.group(1)) or {}
        except Exception:  # noqa: BLE001 — a malformed guide should never break the digest
            continue
        if fm.get("draft"):
            continue
        if country and fm.get("country") not in (country, "ALL", None):
            continue
        if fm.get("title"):
            candidates.append({"slug": f.stem, "title": fm["title"]})
    if not candidates:
        return None
    idx = datetime.now().timetuple().tm_yday % len(candidates)
    g = candidates[idx]
    return {"title": g["title"], "url": f"{SITE_URL}/guides/{g['slug']}"}


def subscribers_for_digest() -> list[dict]:
    """Every confirmed, subscribed member who asked for weekly mail — no tier
    gate.

    This used to require tier == "plus". That was wrong on two counts: the
    preferences UI offers "weekly"/"both" to free subscribers with no
    indication it won't be honoured, so a free user could opt in and silently
    receive nothing (that is what happened, and it read as the whole email
    system being broken); and the digest is a retention tool, not a
    monetisation one. Plus differentiates on instant alerts and the analysis
    tools instead."""
    subs = db.fetch_all("subscribers", "*")
    return [
        s
        for s in subs
        if s.get("confirmed_at")
        and not s.get("unsubscribed_at")
        and s.get("frequency") in ("weekly", "both")
    ]


def followed_games_by_subscriber(ids: list[str]) -> dict[str, list[str]]:
    if not ids:
        return {}
    rows = db.fetch_all("subscriber_games", "subscriber_id,game_slug", filters=[("in_", "subscriber_id", ids)])
    out: dict[str, list[str]] = {}
    for r in rows:
        out.setdefault(r["subscriber_id"], []).append(r["game_slug"])
    return out


TORONTO = ZoneInfo("America/Toronto")

# Region (subscribers.province) -> the draw games a subscriber there gets in
# the digest when they follow none: national games + that region's own
# (mirrors HERO_GAMES in app/page.tsx).
NATIONAL = ["lotto-max", "lotto-6-49", "daily-grand"]
REGION_GAMES = {
    "ontario": NATIONAL + ["ontario-49", "lottario"], "quebec": NATIONAL, "british-columbia": NATIONAL + ["bc-49"],
    "alberta": NATIONAL + ["western-max", "western-6-49"], "saskatchewan": NATIONAL + ["western-max", "western-6-49"],
    "manitoba": NATIONAL + ["western-max", "western-6-49"], "territories": NATIONAL + ["western-max", "western-6-49"],
    "atlantic": NATIONAL, "western": NATIONAL + ["western-max", "western-6-49"],
}
CODE_REGION = {"ON": "ontario", "QC": "quebec", "BC": "british-columbia", "AB": "alberta", "SK": "saskatchewan",
               "MB": "manitoba", "NS": "atlantic", "NB": "atlantic", "PE": "atlantic", "NL": "atlantic",
               "YT": "territories", "NT": "territories", "NU": "territories"}
REGION_LABEL = {"ontario": "Ontario", "quebec": "Quebec", "british-columbia": "British Columbia", "alberta": "Alberta",
                "saskatchewan": "Saskatchewan", "manitoba": "Manitoba", "territories": "the territories",
                "atlantic": "Atlantic Canada"}
PROV_TZ = {"ON": "America/Toronto", "QC": "America/Toronto", "BC": "America/Vancouver", "AB": "America/Edmonton",
           "SK": "America/Regina", "MB": "America/Winnipeg", "NS": "America/Halifax", "NB": "America/Moncton",
           "PE": "America/Halifax", "NL": "America/St_Johns"}
PROV_SLUG = {"ON": "ontario", "QC": "quebec", "BC": "british-columbia", "AB": "alberta", "SK": "saskatchewan",
             "MB": "manitoba", "NS": "nova-scotia", "NB": "new-brunswick", "PE": "prince-edward-island",
             "NL": "newfoundland-and-labrador", "YT": "yukon", "NT": "northwest-territories", "NU": "nunavut"}


def charity_for(region: str, data: dict, now) -> dict | None:
    """This week's deadlines and the biggest open 50/50 pot in a region."""
    from datetime import datetime as dt, timezone as tzn
    codes = {"AB", "SK", "MB"} if region == "western" else {c for c, r in CODE_REGION.items() if r == region}
    if not codes or not data:
        return None
    week = now + timedelta(days=7)
    deadlines, pots = [], []
    for l in data.get("lotteries", []):
        provs = set(l.get("provinces") or [l["province"]])
        e = l.get("current")
        if not (provs & codes) or not e or e.get("status") not in ("on_sale", "sold_out"):
            continue
        url = f"{SITE_URL}/charity/{PROV_SLUG.get(l['province'], 'canada')}/{l['id']}"
        if l["kind"] in ("5050", "catch_the_ace"):
            if e.get("status") == "on_sale" and e.get("jackpot"):
                pots.append((e["jackpot"], {"name": l["name"], "url": url, "amount": f"${e['jackpot']:,.0f}"}))
            continue
        cands = [(d["name"], d["cutoff"]) for d in e.get("draws") or [] if d.get("cutoff")]
        if e.get("salesClose"):
            cands.append(("Final", e["salesClose"]))
        for name, cut in sorted(cands, key=lambda x: x[1]):
            t = dt.fromisoformat(cut.replace("Z", "+00:00"))
            if now <= t <= week:
                lt = t.astimezone(ZoneInfo(PROV_TZ.get(l["province"], "America/Toronto")))
                deadlines.append({"name": l["name"], "url": url, "deadline": name,
                                  "when": lt.strftime("%A, %B ") + str(lt.day)})
                break
    pots.sort(key=lambda x: -x[0])
    return {"label": REGION_LABEL.get(region, region), "deadlines": deadlines[:6], "pot": pots[0][1] if pots else None}


def main() -> int:
    today = today_toronto()
    week_start = (today - timedelta(days=7)).isoformat()
    draws_cache = load_json_cache(DRAWS_DIR)
    stats_cache = load_json_cache(STATS_DIR)

    subs = subscribers_for_digest()
    if not subs:
        print("No weekly-digest subscribers.")
        return 0
    followed = followed_games_by_subscriber([s["id"] for s in subs])
    # This week's pick / skip per province (scripts/weekly_picks.py), prefetched
    # from site_json like draws/stats. Missing file = no pick section.
    picks_path = Path(__file__).resolve().parent.parent / "data" / "picks" / "canada.json"
    picks = json.loads(picks_path.read_text()).get("provinces", {}) if picks_path.exists() else {}
    charity_path = Path(__file__).resolve().parent.parent / "data" / "charity" / "index.json"
    charity_data = json.loads(charity_path.read_text()) if charity_path.exists() else {}
    from datetime import datetime as _dt, timezone as _tz
    now_utc = _dt.now(_tz.utc)

    sent, skipped, failed, no_games = 0, 0, 0, 0
    for sub in subs:
        slugs = followed.get(sub["id"], [])
        region = sub.get("province") or CODE_REGION.get(sub.get("signup_province") or "")
        province_picks = picks.get(region or "")
        charity = charity_for(region, charity_data, now_utc) if region else None
        if charity and not (charity["deadlines"] or charity["pot"]):
            charity = None
        # The digest is by province: with a known province and no followed
        # games, this week's results for the province's own games.
        if not slugs and region:
            slugs = REGION_GAMES.get(region, NATIONAL)
        # One with neither a province nor followed games gets nothing to read.
        if not slugs and not province_picks and not charity:
            no_games += 1
            continue
        log_id = claim_send(sub["id"], "weekly_digest")
        if not log_id:
            skipped += 1
            continue

        sections = build_game_sections(slugs, draws_cache, week_start)
        highlights = build_highlights(slugs, stats_cache)
        guide = pick_guide(sub.get("country"))
        preferences_url = f"{SITE_URL}/subscribe/preferences?token={sub['magic_token']}"
        unsubscribe_url = f"{SITE_URL}/api/subscribe/unsubscribe?token={sub['magic_token']}"
        subject, html = weekly_digest_email(
            game_sections=sections,
            highlights=highlights,
            guide=guide,
            preferences_url=preferences_url,
            unsubscribe_url=unsubscribe_url,
            province_picks=province_picks,
            charity=charity,
        )
        if deliver(log_id, sub["email"], subject, html, unsubscribe_url=unsubscribe_url):
            sent += 1
        else:
            failed += 1

    print(
        f"\nDone: {sent} sent, {skipped} already sent this week, "
        f"{no_games} skipped (no followed games and no province), {failed} failed/no-key."
    )
    # See the matching comment in send_draw_emails.py: continue-on-error on
    # the workflow step already keeps a bad send from blocking anything, but
    # a real failure (not just "no key yet") needs to surface as a failed
    # step in the Actions UI, not disappear behind an always-0 exit code.
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
