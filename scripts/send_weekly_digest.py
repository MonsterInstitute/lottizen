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
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper
from game_meta import GAME_META  # noqa: E402
from email_templates import weekly_digest_email  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DRAWS_DIR = ROOT / "data" / "draws"
STATS_DIR = ROOT / "data" / "stats"
GUIDES_DIR = ROOT / "content" / "guides"
SITE_URL = "https://lottizen.com"
RESEND_API_URL = "https://api.resend.com/emails"
FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "Lottizen <newsletter@lottizen.com>")
COUNTRY_SLUG = {"CA": "canada", "US": "usa", "EU": "europe"}


def today_toronto():
    return datetime.now(ZoneInfo("America/Toronto")).date()


def send_email(to: str, subject: str, html: str) -> bool:
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        print(f"  [skip] RESEND_API_KEY not set — would send to {to}: {subject}")
        return False
    payload = json.dumps({"from": FROM_EMAIL, "to": to, "subject": subject, "html": html}).encode()
    req = urllib.request.Request(
        RESEND_API_URL, data=payload, method="POST",
        # See the matching comment in send_draw_emails.py: Cloudflare (in
        # front of api.resend.com) blocks Python's default UA with an opaque
        # 403, found during manual QA.
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": "lottizen-mailer/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            r.read()
        return True
    except urllib.error.HTTPError as e:
        print(f"  [error] Resend {e.code}: {e.read().decode(errors='replace')[:300]}")
        return False
    except Exception as e:  # noqa: BLE001
        print(f"  [error] {type(e).__name__}: {e}")
        return False


def claim_send(subscriber_id: str, type_: str, game_slug: str = "") -> bool:
    res = (
        db.get_client()
        .table("email_log")
        .upsert(
            {"subscriber_id": subscriber_id, "type": type_, "game_slug": game_slug},
            on_conflict="subscriber_id,type,game_slug,sent_date",
            ignore_duplicates=True,
        )
        .execute()
    )
    return bool(res.data)


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
    subs = db.fetch_all("subscribers", "*")
    return [
        s
        for s in subs
        if s.get("confirmed_at") and not s.get("unsubscribed_at") and s.get("frequency") in ("weekly", "both")
    ]


def followed_games_by_subscriber(ids: list[str]) -> dict[str, list[str]]:
    if not ids:
        return {}
    rows = db.fetch_all("subscriber_games", "subscriber_id,game_slug", filters=[("in_", "subscriber_id", ids)])
    out: dict[str, list[str]] = {}
    for r in rows:
        out.setdefault(r["subscriber_id"], []).append(r["game_slug"])
    return out


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

    sent, skipped, failed, no_games = 0, 0, 0, 0
    for sub in subs:
        slugs = followed.get(sub["id"], [])
        if not slugs:
            no_games += 1
            continue
        if not claim_send(sub["id"], "weekly_digest"):
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
        )
        if send_email(sub["email"], subject, html):
            sent += 1
        else:
            failed += 1

    print(
        f"\nDone: {sent} sent, {skipped} already sent this week, "
        f"{no_games} skipped (no followed games), {failed} failed/no-key."
    )
    # See the matching comment in send_draw_emails.py: continue-on-error on
    # the workflow step already keeps a bad send from blocking anything, but
    # a real failure (not just "no key yet") needs to surface as a failed
    # step in the Actions UI, not disappear behind an always-0 exit code.
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
