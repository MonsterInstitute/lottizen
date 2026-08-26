#!/usr/bin/env python3
"""resend_diagnose.py — answer "why didn't the email arrive?" with Resend's own
records instead of inference.

Built 2026-08-26 after a subscriber reported never receiving any mail, while
every layer we could see locally looked healthy: subscriber confirmed, workflow
green, script reporting "1 sent", Resend returning HTTP 200, and DNS (SPF/DKIM/
MX on send.mail.lottizen.com) fully correct. HTTP 200 from Resend only means
"accepted for delivery" — it says nothing about what happened afterward
(delivered / bounced / spam-blocked / suppressed).

The gap that made this un-debuggable: send_draw_emails.py and
send_weekly_digest.py both discard Resend's response body, so the message id
that GET /emails/{id} needs was never recorded anywhere. This script gets it
first-hand by sending a fresh probe and following it to a terminal state.

Usage (via .github/workflows/resend-diagnose.yml, workflow_dispatch):
    python scripts/resend_diagnose.py --to someone@example.com

Reports: domain verification status, the probe's accepted id, and its delivery
status polled to completion. Sends exactly one real email, to the address given.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.resend.com"
FROM = os.environ.get("RESEND_FROM_EMAIL", "Lottizen <newsletter@mail.lottizen.com>")
UA = "lottizen-mailer/1.0"  # Cloudflare 403s Python's default UA — see send_draw_emails.py


def call(path: str, method: str = "GET", body: dict | None = None) -> tuple[int, dict | str]:
    key = os.environ["RESEND_API_KEY"]
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        f"{API}{path}", data=data, method=method,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw
    except Exception as e:  # noqa: BLE001
        return 0, f"{type(e).__name__}: {e}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--to", required=True, help="address to send the probe to")
    ap.add_argument("--template", action="store_true",
                    help="send the REAL draw-result template (with List-Unsubscribe headers) "
                         "instead of a plain probe, to isolate content/headers as the variable")
    args = ap.parse_args()

    print("=" * 70)
    print("1. SENDING DOMAINS")
    print("=" * 70)
    status, domains = call("/domains")
    if status != 200:
        print(f"  ERROR {status}: {domains}")
        return 1
    for d in (domains.get("data") or []):
        print(f"  {d.get('name')}  status={d.get('status')}  region={d.get('region')}  created={d.get('created_at','')[:10]}")
        for rec in (d.get("records") or []):
            print(f"      [{rec.get('status'):>8}] {rec.get('record'):<6} {rec.get('name')}")
    print()

    print("=" * 70)
    print(f"2. PROBE SEND -> {args.to}")
    print("=" * 70)
    if args.template:
        # Exercise the real production template + headers, so a difference in
        # outcome versus the plain probe points at content or headers rather
        # than at the account/domain/address.
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from email_templates import draw_result_email  # noqa: PLC0415

        unsub = "https://lottizen.com/api/subscribe/unsubscribe?token=diagnostic-probe"
        subject, html = draw_result_email(
            game_name="Lotto Max", game_url="https://lottizen.com/canada/lotto-max",
            draw_date="2026-08-25", numbers=[1, 4, 15, 18, 24, 25, 51], bonus=13, bonus2=None,
            jackpot_won=None, next_draw=None, next_jackpot=None, currency="CAD",
            insight=None, is_plus=False, saved_combinations=None, scratch_top3=None,
            dashboard_url="https://lottizen.com/dashboard",
            preferences_url="https://lottizen.com/subscribe/preferences?token=diagnostic-probe",
            unsubscribe_url=unsub,
        )
        body = {
            "from": FROM, "to": args.to, "subject": f"[probe] {subject}", "html": html,
            "headers": {
                "List-Unsubscribe": f"<{unsub}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
        }
        print("  mode: REAL draw-result template + List-Unsubscribe headers")
    else:
        body = {
            "from": FROM, "to": args.to, "subject": "Lottizen delivery probe",
            "html": "<p>Automated delivery probe from scripts/resend_diagnose.py. "
                    "If you received this, Resend delivery to your address is working.</p>",
        }
        print("  mode: plain probe")
    status, res = call("/emails", "POST", body)
    print(f"  POST /emails -> {status}: {res}")
    if status not in (200, 202) or not isinstance(res, dict) or not res.get("id"):
        print("  Send was not accepted — stopping here; the failure is at submission, not delivery.")
        return 1
    msg_id = res["id"]
    print()

    print("=" * 70)
    print(f"3. DELIVERY STATUS OF {msg_id}")
    print("=" * 70)
    terminal = {"delivered", "bounced", "complained", "failed", "canceled"}
    last = None
    for attempt in range(12):  # ~60s
        time.sleep(5)
        status, detail = call(f"/emails/{msg_id}")
        if status != 200:
            print(f"  GET -> {status}: {detail}")
            break
        last = detail.get("last_event") or detail.get("status")
        print(f"  t+{(attempt + 1) * 5:>3}s  last_event={last}")
        if last in terminal:
            break
    print()
    print("=" * 70)
    print(f"VERDICT: final state = {last!r}")
    if last == "delivered":
        print("  Resend delivered it to the receiving server. If it's not in the")
        print("  inbox, it was filtered AFTER acceptance — check spam/promotions.")
    elif last == "bounced":
        print("  Rejected by the receiving server. Full reason in the JSON above.")
    elif last in ("sent", None):
        print("  Accepted but no delivery confirmation yet — usually transient;")
        print("  re-run, and check the Resend dashboard's Emails log for this id.")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
