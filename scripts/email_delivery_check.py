#!/usr/bin/env python3
"""email_delivery_check.py — daily check that subscriber email actually
went out and arrived, judged against Resend's own records.

History: built 2026-08-25 to catch send_draw_emails.py's date check silently
never matching. Until 2026-10-05 every check compared email_log against
expectations — but email_log rows are written before the send, so a send
that was skipped or failed after its row was written still "passed". It
was checking the log against itself. email_log now records each row's
outcome (migration 0019), and the checks below compare that to Resend.

For `yesterday` (Toronto):
  1. draw_result expectation: a live game drew with eligible followers but
     no draw_result row exists at all (the sender never got that far).
  2. weekly_digest expectation (Mondays): eligible subscribers, zero rows.
  3. outcomes: rows still 'queued' (sender died mid-send), 'failed' rows,
     and 'skipped' for no_resend_key. Other skips (e.g. legacy_not_in_resend)
     are counted, not flagged — they're product rules working.
  4. delivery: every 'sent' row's provider_message_id must exist in
     Resend with last_event delivered/opened/clicked. Bounced, complained,
     still undelivered, or unknown to Resend are each flagged.
  5. total silence: no Lottizen mail delivered to any subscriber in 3 days
     while someone follows a game (outage the per-row checks can't see,
     e.g. nothing was even claimed).

Problems become public GitHub issues: they carry ids and counts, never
addresses.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(__file__))
import db  # noqa: E402
import mailer  # noqa: E402
import send_draw_emails as sde  # noqa: E402
import send_weekly_digest as swd  # noqa: E402

problems: list[dict] = []
results: dict = {"checkedAt": None, "drawResult": {}, "weeklyDigest": {}, "outcomes": {}, "delivery": {},
                 "totalSilence": {}}
DELIVERED = {"delivered", "opened", "clicked"}
BAD = {"bounced", "complained", "failed", "canceled"}


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


def window(day: str) -> tuple[datetime, datetime]:
    tz = ZoneInfo("America/Toronto")
    start = datetime.combine(datetime.fromisoformat(day).date(), datetime.min.time(), tz)
    return start, start + timedelta(days=1)


def check_outcomes_and_delivery(yesterday: str, msgs: list[dict] | None) -> None:
    rows = db.fetch_all("email_log", "id,subscriber_id,type,status,skip_reason,provider_message_id,error,sent_at",
                        filters=[("eq", "sent_date", yesterday)])
    by_status = Counter(r["status"] for r in rows)
    skips = Counter(r["skip_reason"] or "?" for r in rows if r["status"] == "skipped")
    results["outcomes"] = {"rows": len(rows), "byStatus": dict(by_status), "skipReasons": dict(skips)}
    log(f"{yesterday}: {len(rows)} email_log row(s) — {dict(by_status)}; skips {dict(skips)}")

    stuck = [r for r in rows if r["status"] == "queued"]
    if stuck:
        add_problem("sends left unfinished",
                    f"{len(stuck)} email_log row(s) from {yesterday} are still 'queued': the slot was claimed but "
                    f"the sender never recorded an outcome (crash or timeout mid-send). Row ids: "
                    f"{[r['id'] for r in stuck][:30]}")
    failed = [r for r in rows if r["status"] == "failed"]
    if failed:
        errs = Counter((r["error"] or "?")[:120] for r in failed)
        add_problem("sends rejected",
                    f"{len(failed)} send(s) on {yesterday} failed at Resend or the network. Errors: "
                    + "; ".join(f"{n}× {e}" for e, n in errs.most_common(5)))
    if skips.get("no_resend_key"):
        add_problem("RESEND_API_KEY missing in a send step",
                    f"{skips['no_resend_key']} send(s) on {yesterday} were skipped because RESEND_API_KEY "
                    f"wasn't set in the workflow step.")

    sent = [r for r in rows if r["status"] == "sent"]
    if msgs is None:
        results["delivery"] = {"skipped": True}
        if sent:
            add_problem("delivery not verifiable",
                        f"{len(sent)} row(s) marked sent on {yesterday}, but Resend's sent list couldn't be read "
                        f"(see the job log), so delivery is unconfirmed.")
        return
    by_id = {m["id"]: m for m in msgs}
    events = Counter()
    unknown, bad, pending = [], [], []
    for r in sent:
        m = by_id.get(r["provider_message_id"] or "")
        if not m:
            unknown.append(r["id"])
            continue
        ev = m.get("last_event") or "unknown"
        events[ev] += 1
        if ev in BAD:
            bad.append((r["id"], ev))
        elif ev not in DELIVERED:
            pending.append((r["id"], ev))
    results["delivery"] = {"sent": len(sent), "events": dict(events), "notInResend": len(unknown)}
    log(f"delivery of {len(sent)} sent: {dict(events)}; not found in Resend: {len(unknown)}")
    if unknown:
        add_problem("logged as sent but unknown to Resend",
                    f"{len(unknown)} email_log row(s) on {yesterday} say 'sent' but Resend has no message with "
                    f"their id. Row ids: {unknown[:30]}")
    if bad:
        add_problem("bounced or complained",
                    f"{len(bad)} message(s) sent on {yesterday} ended {dict(Counter(e for _, e in bad))} in Resend. "
                    f"Row ids: {[i for i, _ in bad][:30]}")
    if pending:
        add_problem("not delivered after a day",
                    f"{len(pending)} message(s) sent on {yesterday} still aren't delivered "
                    f"({dict(Counter(e for _, e in pending))}). Row ids: {[i for i, _ in pending][:30]}")


def check_total_silence(today, msgs: list[dict] | None) -> None:
    follows = db.fetch_all("subscriber_games", "subscriber_id,game_slug")
    active = {s["id"]: (s["email"] or "").lower() for s in db.fetch_all(
        "subscribers", "id,email,confirmed_at,unsubscribed_at") if s.get("confirmed_at") and not s.get("unsubscribed_at")}
    followers = {f["subscriber_id"] for f in follows} & set(active)
    if not followers:
        log("skip: total-silence check (no active subscriber follows a game)")
        results["totalSilence"] = {"skipped": True}
        return
    if msgs is None:
        results["totalSilence"] = {"skipped": True, "reason": "Resend unreadable"}
        return
    addresses = set(active.values())
    delivered = [m for m in msgs
                 if (m.get("last_event") or "") in DELIVERED
                 and not (m.get("subject") or "").startswith(mailer.OWNER_ONLY_SUBJECTS)
                 and any((t or "").lower() in addresses for t in m.get("to") or [])]
    results["totalSilence"] = {"followers": len(followers), "delivered3d": len(delivered)}
    if not delivered:
        add_problem(
            "nothing delivered to any subscriber in 3 days",
            f"{len(followers)} active subscriber(s) follow at least one game, but Resend shows zero delivered "
            f"Lottizen emails to any subscriber in the last 3 days. Check the send steps, RESEND_API_KEY, the "
            f"sending domain, and skip reasons in email_log.")
    else:
        log(f"OK: {len(delivered)} email(s) delivered to subscribers in the last 3 days (per Resend)")


def main() -> int:
    results["checkedAt"] = datetime.now(ZoneInfo("America/Toronto")).isoformat()
    today = toronto_today()
    yesterday = (today - timedelta(days=1)).isoformat()
    log(f"=== email_delivery_check.py — {results['checkedAt']} (yesterday={yesterday}) ===")

    check_draw_result(yesterday)
    check_weekly_digest(today)
    try:
        # Three days back covers the silence window and yesterday's sends.
        msgs = mailer.list_sent(window((today - timedelta(days=3)).isoformat())[0])
    except Exception as e:  # noqa: BLE001
        log(f"warning: Resend sent list unreadable: {e}")
        msgs = None
    check_outcomes_and_delivery(yesterday, msgs)
    check_total_silence(today, msgs)

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
