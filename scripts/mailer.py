"""mailer.py — the one way this repo sends an email from Python.

send_draw_emails.py and send_weekly_digest.py each carried a byte-identical
copy of this, and send_claim_reminders.py would have made three. Both details
below were found the hard way and are exactly the kind of thing that gets
fixed in one copy and not the others, so they live here once.

  * RFC 8058 one-click unsubscribe headers. Gmail and Yahoo require them of
    bulk senders, and their absence is a documented spam-placement factor —
    diagnosed 2026-08-26, when Resend reported "delivered" to Gmail for every
    send while the mail never reached an inbox. The URL must accept POST (see
    app/api/subscribe/unsubscribe/route.ts). CLAUDE.md makes this
    non-negotiable for every bulk send.

  * A real User-Agent. Cloudflare, in front of api.resend.com, answers
    Python's default "Python-urllib/x.y" with a bare 403 (error 1010) that
    looks nothing like a Resend error.

claim_send() writes the email_log row BEFORE the send call, on purpose: it
claims the (subscriber, type, key, day) slot so a workflow re-run can never
double-send. It records intent, NOT delivery — never cite an email_log row as
proof an email arrived (CLAUDE.md).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402

RESEND_API_URL = "https://api.resend.com/emails"
FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "Lottizen <newsletter@mail.lottizen.com>")


def unsubscribe_headers(unsubscribe_url: str) -> dict:
    return {
        "List-Unsubscribe": f"<{unsubscribe_url}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }


def send_email(to: str, subject: str, html: str, unsubscribe_url: str | None = None) -> bool:
    """True only when Resend accepted the message. A missing RESEND_API_KEY
    logs and returns False — safe to wire in before the key exists."""
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        print(f"  [skip] RESEND_API_KEY not set — would send to {to}: {subject}")
        return False
    body = {"from": FROM_EMAIL, "to": to, "subject": subject, "html": html}
    if unsubscribe_url:
        body["headers"] = unsubscribe_headers(unsubscribe_url)
    req = urllib.request.Request(
        RESEND_API_URL, data=json.dumps(body).encode(), method="POST",
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
    """Atomically claim today's (subscriber, type, game_slug) send slot. True
    only for the call that actually inserted the row — i.e. the one that is
    allowed to send. `game_slug` is just the uniqueness key: the claim-reminder
    sweep passes a claim id there so several prizes can each be reminded about
    on the same day."""
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
