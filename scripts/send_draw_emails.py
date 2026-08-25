#!/usr/bin/env python3
"""send_draw_emails.py — instant draw-result emails for subscribers who
follow a game that drew today.

Run at the end of the daily scrape workflows (draws-daily.yml, usa-daily.yml,
europe-daily.yml), after "Build & audit" has populated data/draws/*.json +
data/stats/*.json (fresh for this run's region, last-known-good for the
other two — see PREFETCH_FILL_MISSING in those workflows) and
data/rankings/ontario.json (pulled from Supabase site_json, for the Ontario
scratch top-3 line — the email's scratch teaser stays Ontario-only, one of
5 provinces now tracked; not expanded to the others here).

Idempotent: claims each (subscriber, game, day) send via an INSERT ... ON
CONFLICT DO NOTHING against email_log BEFORE calling Resend (claim_send), so
a workflow re-run never double-sends — a crash after claiming but before the
Resend call just costs that one subscriber a day's email, never a duplicate.

RESEND_API_KEY unset just logs "would send" and doesn't count as a failure,
so this is safe to wire in before the key exists. But a real send error
(e.g. an unverified Resend sending domain — this happened for two weeks
before anyone noticed, see git blame) makes main() exit 1, so it shows up as
a failed step in the Actions UI. That never blocks the pipeline itself —
`continue-on-error: true` on the workflow step already guarantees that —
it's purely so the failure is visible instead of invisible.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper
from game_meta import GAME_META  # noqa: E402
from email_templates import check_saved_numbers, draw_result_email, pick_insight  # noqa: E402

# Free tier's weekly instant-alert cap — see lib/entitlements.ts's
# FREE_WEEKLY_ALERT_LIMIT (kept in sync by hand; small, stable number).
FREE_WEEKLY_ALERT_LIMIT = 7

ROOT = Path(__file__).resolve().parent.parent
DRAWS_DIR = ROOT / "data" / "draws"
STATS_DIR = ROOT / "data" / "stats"
RANKINGS_PATH = ROOT / "data" / "rankings" / "ontario.json"
SITE_URL = "https://lottizen.com"
RESEND_API_URL = "https://api.resend.com/emails"
FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "Lottizen <newsletter@mail.lottizen.com>")

COUNTRY_SLUG = {"CA": "canada", "US": "usa", "EU": "europe"}


def today_toronto() -> str:
    return datetime.now(ZoneInfo("America/Toronto")).date().isoformat()


def yesterday_toronto() -> str:
    return (datetime.now(ZoneInfo("America/Toronto")).date() - timedelta(days=1)).isoformat()


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


def games_drawn_today(today: str, yesterday: str) -> list[dict]:
    """Matches `today` OR `yesterday` — NOT just `today`. This workflow's three
    callers check at different times relative to the actual draw: draws-daily.yml
    and usa-daily.yml run the next MORNING (draw was yesterday evening, Toronto
    time), while europe-daily.yml runs the SAME evening (23:00 UTC, after a
    European evening draw that's still "today" in UTC). A `today`-only check
    silently matched neither the CA/US morning-after case nor almost any real
    draw — send_email() was essentially never reached in production. Widening
    to `today OR yesterday` is still safe against duplicate sends: claim_send()
    already dedupes per (subscriber, type, game, day-of-send), and a stale
    draws[0] naturally ages out of BOTH the today and yesterday window after one
    more day passes, so a scraper that misses a day never causes a stale re-send."""
    out = []
    for slug, meta in GAME_META.items():
        path = DRAWS_DIR / f"{slug}.json"
        if not path.exists():
            continue
        d = json.loads(path.read_text())
        draws = d.get("draws") or []
        if draws and draws[0]["date"] in (today, yesterday):
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


def combinations_for(subscriber_id: str, slug: str) -> list[dict]:
    """All saved combinations (Pro: possibly several) for this subscriber+game."""
    return db.fetch_all(
        "subscriber_numbers",
        "id,numbers,label",
        filters=[("eq", "subscriber_id", subscriber_id), ("eq", "game_slug", slug)],
    )


def record_check(subscriber_id: str, combination_id: int, slug: str, draw_date: str, matched: int, pick: int, bonus_matched: bool | None) -> None:
    """Persist the check result so the dashboard's 'recently checked results'
    reflects it without recomputing. possible_prize is deliberately never a
    dollar amount/tier guess — see lib/prize-language.ts's docstring for why.
    Deduped per (combination_id, draw_date): a re-run never double-writes."""
    possible_prize = "requires_confirmation" if (matched >= 2 or bonus_matched is True or matched == pick) else None
    db.insert_ignore(
        "combination_checks",
        [{
            "subscriber_id": subscriber_id, "combination_id": combination_id, "game_slug": slug,
            "draw_date": draw_date, "matched_main": matched, "pick": pick,
            "bonus_matched": bonus_matched, "possible_prize": possible_prize,
        }],
        on_conflict="combination_id,draw_date",
    )


def weekly_alert_count(subscriber_id: str) -> int:
    """draw_result emails logged for this subscriber in the last 7 days —
    free tier's weekly alert cap (see lib/entitlements.ts's
    FREE_WEEKLY_ALERT_LIMIT). email_log rows are written by claim_send()
    regardless of actual delivery, which is exactly what we want to count
    here: attempts against the cap, not just successful sends."""
    from datetime import timedelta
    since = (datetime.now(ZoneInfo("America/Toronto")).date() - timedelta(days=7)).isoformat()
    rows = db.fetch_all(
        "email_log", "id",
        filters=[("eq", "subscriber_id", subscriber_id), ("eq", "type", "draw_result"), ("gte", "sent_date", since)],
    )
    return len(rows)


def main() -> int:
    today = today_toronto()
    yesterday = yesterday_toronto()
    drawn = games_drawn_today(today, yesterday)
    if not drawn:
        print(f"No live games drew on {today} or {yesterday} (Toronto). Nothing to send.")
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

            is_plus = sub.get("tier") == "plus"
            if not is_plus and weekly_alert_count(sub["id"]) > FREE_WEEKLY_ALERT_LIMIT:
                print(f"  [capped] {sub['email']} hit the free weekly alert limit — skipping send (not the claim).")
                skipped += 1
                continue

            saved_combinations: list[dict] = []
            try:
                for combo in combinations_for(sub["id"], slug):
                    match = check_saved_numbers(combo["numbers"], numbers, len(numbers))
                    # Saved combinations track main numbers only (see
                    # /api/account/combinations — no bonus-number pick field
                    # yet), so there's nothing to compare the drawn bonus
                    # against. None (not applicable), never a guessed value.
                    record_check(sub["id"], combo["id"], slug, latest["date"], match[0], len(numbers), None)
                    saved_combinations.append({"numbers": combo["numbers"], "label": combo.get("label"), "match": match})
            except Exception as e:  # noqa: BLE001 — don't let this block the send
                print(f"  [warn] combination check failed for {sub['email']}: {e}")

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
                is_plus=is_plus,
                saved_combinations=saved_combinations or None,
                scratch_top3=top3 if sub.get("country") == "CA" else None,
                dashboard_url=f"{SITE_URL}/dashboard",
                preferences_url=preferences_url,
                unsubscribe_url=unsubscribe_url,
            )
            if send_email(sub["email"], subject, html):
                sent += 1
            else:
                failed += 1

    print(f"\nDone: {sent} sent, {skipped} already sent today, {failed} failed/skipped (no RESEND_API_KEY).")
    # continue-on-error: true on the workflow step already keeps a bad send
    # from blocking the deploy pipeline — but a real Resend failure (e.g. an
    # unverified sending domain) needs to be VISIBLE, not swallowed. Before
    # this, the step's own exit code was always 0, so a 100%-failing send
    # path looked identical to a quiet day with nothing to send: found only
    # by manually reading workflow logs after a user reported never getting
    # a confirmation email, despite email_log showing "sent" rows the whole
    # time (claim_send() logs the attempt before the Resend call, by design,
    # to make retries idempotent — it was never a delivery record).
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
