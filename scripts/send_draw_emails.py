#!/usr/bin/env python3
"""send_draw_emails.py — instant draw-result emails for subscribers who
follow a game that drew today.

Run at the end of the daily scrape workflows (draws-daily.yml, usa-daily.yml,
europe-daily.yml), after "Build & audit" has populated data/draws/*.json +
data/stats/*.json (fresh for this run's region, last-known-good for the
other two — see PREFETCH_FILL_MISSING in those workflows) and data/rankings.json
(pulled from Supabase site_json, for the Ontario scratch top-3 line).

Idempotent: claims each (subscriber, game, day) send via an INSERT ... ON
CONFLICT DO NOTHING against email_log BEFORE calling Resend (claim_send), so
a workflow re-run never double-sends — a crash after claiming but before the
Resend call just costs that one subscriber a day's email, never a duplicate.

Never fails the workflow: RESEND_API_KEY unset just logs "would send" and
exits 0 (see send_email), so this is safe to wire in before the key exists.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper
from game_meta import GAME_META  # noqa: E402
from email_templates import check_saved_numbers, draw_result_email, pick_insight  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DRAWS_DIR = ROOT / "data" / "draws"
STATS_DIR = ROOT / "data" / "stats"
RANKINGS_PATH = ROOT / "data" / "rankings.json"
SITE_URL = "https://lottizen.com"
RESEND_API_URL = "https://api.resend.com/emails"
FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "Lottizen <newsletter@lottizen.com>")

COUNTRY_SLUG = {"CA": "canada", "US": "usa", "EU": "europe"}


def today_toronto() -> str:
    return datetime.now(ZoneInfo("America/Toronto")).date().isoformat()


def send_email(to: str, subject: str, html: str) -> bool:
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        print(f"  [skip] RESEND_API_KEY not set — would send to {to}: {subject}")
        return False
    payload = json.dumps({"from": FROM_EMAIL, "to": to, "subject": subject, "html": html}).encode()
    req = urllib.request.Request(
        RESEND_API_URL, data=payload, method="POST",
        # A real User-Agent matters here: Cloudflare (in front of api.resend.com)
        # returns a bare 403 (error code 1010) for Python's default
        # "Python-urllib/x.y" UA, with no indication it's a UA block — found
        # during manual QA. Discovered live: without this, api.resend.com
        # rejects every send with an opaque Cloudflare 403, not a Resend error.
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
    except Exception as e:  # noqa: BLE001 — network/timeout, log and move on
        print(f"  [error] {type(e).__name__}: {e}")
        return False


def claim_send(subscriber_id: str, type_: str, game_slug: str = "") -> bool:
    """Atomically claim today's (subscriber, type, game) send slot — True only
    for the call that actually inserted the row (safe to send)."""
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


def games_drawn_today(today: str) -> list[dict]:
    out = []
    for slug, meta in GAME_META.items():
        path = DRAWS_DIR / f"{slug}.json"
        if not path.exists():
            continue
        d = json.loads(path.read_text())
        draws = d.get("draws") or []
        if draws and draws[0]["date"] == today:
            out.append({"slug": slug, "meta": meta, "draws_file": d, "latest": draws[0]})
    return out


def scratch_top3() -> list[dict]:
    if not RANKINGS_PATH.exists():
        return []
    d = json.loads(RANKINGS_PATH.read_text())
    return sorted(d.get("games", []), key=lambda g: g["rank"])[:3]


def subscribers_following(slug: str) -> list[dict]:
    sg = db.fetch_all("subscriber_games", "subscriber_id", filters=[("eq", "game_slug", slug)])
    ids = list({r["subscriber_id"] for r in sg})
    if not ids:
        return []
    subs = db.fetch_all("subscribers", "*", filters=[("in_", "id", ids)])
    return [
        s
        for s in subs
        if s.get("confirmed_at") and not s.get("unsubscribed_at") and s.get("frequency") in ("instant", "both")
    ]


def saved_numbers_for(subscriber_id: str, slug: str) -> list[int] | None:
    rows = db.fetch_all(
        "subscriber_numbers",
        "numbers",
        filters=[("eq", "subscriber_id", subscriber_id), ("eq", "game_slug", slug)],
    )
    return rows[0]["numbers"] if rows else None


def main() -> int:
    today = today_toronto()
    drawn = games_drawn_today(today)
    if not drawn:
        print(f"No live games drew on {today} (Toronto). Nothing to send.")
        return 0

    top3 = scratch_top3()
    sent, skipped, failed = 0, 0, 0

    for game in drawn:
        slug, meta, draws_file, latest = game["slug"], game["meta"], game["draws_file"], game["latest"]
        stats_path = STATS_DIR / f"{slug}.json"
        stats = json.loads(stats_path.read_text()) if stats_path.exists() else None
        numbers = latest["numbers"]
        bonus, bonus2 = latest.get("bonus"), latest.get("bonus2")
        insight = pick_insight(stats, numbers) if stats and stats.get("format") != "digit" else None
        game_url = f"{SITE_URL}/{COUNTRY_SLUG[meta['country']]}/{slug}"

        subs = subscribers_following(slug)
        if not subs:
            continue
        print(f"{meta['name']} ({slug}): {len(subs)} subscriber(s) following, drew {today}")

        for sub in subs:
            if not claim_send(sub["id"], "draw_result", slug):
                skipped += 1
                continue

            saved_numbers = None
            saved_match = None
            try:
                saved_numbers = saved_numbers_for(sub["id"], slug)
                if saved_numbers:
                    saved_match = check_saved_numbers(saved_numbers, numbers, len(numbers))
            except Exception as e:  # noqa: BLE001 — don't let this block the send
                print(f"  [warn] saved-numbers lookup failed for {sub['email']}: {e}")

            preferences_url = f"{SITE_URL}/subscribe/preferences?token={sub['magic_token']}"
            unsubscribe_url = f"{SITE_URL}/api/subscribe/unsubscribe?token={sub['magic_token']}"
            subject, html = draw_result_email(
                game_name=meta["name"],
                game_url=game_url,
                draw_date=latest["date"],
                numbers=numbers,
                bonus=bonus,
                bonus2=bonus2,
                jackpot_won=None,  # not scraped — never claim a winner without real data
                next_draw=draws_file.get("nextDraw"),
                next_jackpot=draws_file.get("nextJackpot") if meta.get("progressive") else None,
                currency=meta["currency"],
                insight=insight,
                saved_numbers=saved_numbers,
                saved_match=saved_match,
                scratch_top3=top3 if sub.get("country") == "CA" else None,
                preferences_url=preferences_url,
                unsubscribe_url=unsubscribe_url,
            )
            if send_email(sub["email"], subject, html):
                sent += 1
            else:
                failed += 1

    print(f"\nDone: {sent} sent, {skipped} already sent today, {failed} failed/skipped (no RESEND_API_KEY).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
