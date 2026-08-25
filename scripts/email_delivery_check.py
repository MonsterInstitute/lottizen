#!/usr/bin/env python3
"""email_delivery_check.py — daily regression guard for the exact failure mode
found 2026-08-25: send_draw_emails.py's date check could silently never match,
so real draws happened and subscribers existed, but zero emails ever sent —
with no error anywhere, because there was nothing to error on.

Reuses the real sender scripts' own eligibility functions (imported directly,
not reimplemented) so this can never drift from what they actually consider
"should have sent" — it flags the gap between that expectation and what
email_log actually recorded, for `yesterday` (Toronto), which is the same
window send_draw_emails.py itself now checks after today's fix.

Three checks, each producing a `problems` entry (consumed by
scripts/health_issues.sh):
  1. draw_result: any live game whose latest draw is `yesterday` AND has at
     least one eligible follower, but zero draw_result rows logged for it.
  2. weekly_digest: on the day after the Sunday digest run, any eligible
     (confirmed, not unsubscribed, plus tier, weekly/both frequency)
     subscriber exists but zero weekly_digest rows were logged that Sunday.
  3. total silence: zero rows of ANY type logged across the last 3 days,
     despite at least one confirmed subscriber existing — catches a total
     outage (Resend key revoked, Supabase down) that the per-type checks
     might individually miss.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(__file__))
import db  # noqa: E402
import send_draw_emails as sde  # noqa: E402
import send_weekly_digest as swd  # noqa: E402

problems: list[dict] = []
results: dict = {"checkedAt": None, "drawResult": {}, "weeklyDigest": {}, "totalSilence": {}}


def log(*a) -> None:
    print(*a, flush=True)


def add_problem(title: str, body: str) -> None:
    problems.append({"title": f"Email delivery: {title}", "body": body})
    log(f"❌ {title}")


def toronto_today() -> "datetime.date":
    return datetime.now(ZoneInfo("America/Toronto")).date()


def check_draw_result(yesterday: str) -> None:
    client = db.get_client()
    checked, missing = 0, []
    for slug, meta in sde.GAME_META.items():
        path = sde.DRAWS_DIR / f"{slug}.json"
        if not path.exists():
            continue
        d = json.loads(path.read_text())
        draws = d.get("draws") or []
        if not draws or draws[0]["date"] != yesterday:
            continue
        subs = sde.subscribers_following(slug)
        if not subs:
            continue
        checked += 1
        rows = client.table("email_log").select("id").eq("type", "draw_result").eq("game_slug", slug) \
            .in_("sent_date", [yesterday, (datetime.fromisoformat(yesterday) + timedelta(days=1)).date().isoformat()]).execute().data
        if not rows:
            missing.append({"slug": slug, "name": meta["name"], "followers": len(subs)})
    results["drawResult"] = {"gamesChecked": checked, "missing": len(missing)}
    if missing:
        add_problem(
            "draw result emails silently skipped",
            f"{len(missing)} game(s) drew on {yesterday} with real followers, but no draw_result "
            f"email_log rows exist for them: {missing}. This is exactly the failure mode fixed "
            f"2026-08-25 (date check never matching) — if it's back, check for a similar regression.",
        )
    elif checked:
        log(f"OK: {checked} game(s) drew {yesterday} with followers, all have draw_result log rows")


def check_weekly_digest(today) -> None:
    # weekly-digest.yml runs Sundays; check the day after so a same-day
    # timing/ordering wrinkle never produces a false alarm.
    if today.weekday() != 0:  # Monday
        log("skip: weekly digest check (only runs the Monday after a Sunday digest)")
        results["weeklyDigest"] = {"skipped": True}
        return
    last_sunday = (today - timedelta(days=1)).isoformat()
    eligible = swd.subscribers_for_digest()
    client = db.get_client()
    rows = client.table("email_log").select("id").eq("type", "weekly_digest").eq("sent_date", last_sunday).execute().data
    results["weeklyDigest"] = {"eligible": len(eligible), "logged": len(rows)}
    if eligible and not rows:
        add_problem(
            "weekly digest silently skipped",
            f"{len(eligible)} eligible subscriber(s) existed for the {last_sunday} weekly digest, "
            f"but zero weekly_digest email_log rows were recorded for that date.",
        )
    elif eligible:
        log(f"OK: {last_sunday} weekly digest — {len(eligible)} eligible, {len(rows)} logged")
    else:
        log(f"no eligible weekly-digest subscribers as of {last_sunday} — nothing expected")


def check_total_silence(today) -> None:
    client = db.get_client()
    confirmed = client.table("subscribers").select("id").not_.is_("confirmed_at", "null") \
        .is_("unsubscribed_at", "null").limit(1).execute().data
    if not confirmed:
        log("skip: total-silence check (no active confirmed subscribers at all)")
        results["totalSilence"] = {"skipped": True}
        return
    window_start = (today - timedelta(days=3)).isoformat()
    rows = client.table("email_log").select("id").gte("sent_date", window_start).limit(1).execute().data
    results["totalSilence"] = {"hasActiveSubscribers": True, "anyLogsInWindow": bool(rows)}
    if not rows:
        add_problem(
            "zero emails of any type logged in 3 days",
            f"At least one confirmed, subscribed subscriber exists, but email_log has zero rows of "
            f"any type since {window_start}. Possible total outage — check RESEND_API_KEY validity, "
            f"Supabase connectivity, and whether the daily workflows are actually completing their "
            f"send steps.",
        )
    else:
        log(f"OK: at least one email logged in the last 3 days ({window_start} onward)")


def main() -> int:
    results["checkedAt"] = datetime.now(ZoneInfo("America/Toronto")).isoformat()
    today = toronto_today()
    yesterday = (today - timedelta(days=1)).isoformat()
    log(f"=== email_delivery_check.py — {results['checkedAt']} (yesterday={yesterday}) ===")

    check_draw_result(yesterday)
    check_weekly_digest(today)
    check_total_silence(today)

    with open("email_delivery_problems.json", "w") as f:
        json.dump(problems, f, indent=2)
    with open("email_delivery_result.json", "w") as f:
        json.dump(results, f, indent=2)

    if problems:
        log(f"\n{len(problems)} problem(s) found — see email_delivery_problems.json")
        return 1
    log("\nAll email delivery checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
