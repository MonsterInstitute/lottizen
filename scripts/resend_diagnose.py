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
    status, res = call("/emails", "POST", {
        "from": FROM,
        "to": args.to,
        "subject": "Lottizen delivery probe",
        "html": "<p>Automated delivery probe from scripts/resend_diagnose.py. "
                "If you received this, Resend delivery to your address is working.</p>",
    })
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
