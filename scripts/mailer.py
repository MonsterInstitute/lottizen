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
double-send. The row starts as status 'queued'; deliver() / mark_skipped()
then record what actually happened (sent + Resend's message id, skipped +
reason, failed + error). Even 'sent' only means Resend accepted it — delivery
is checked against Resend itself by email_delivery_check.py (CLAUDE.md).

The repo is public and so are its Actions logs: never print a subscriber's
address. Use mask_email() or the subscriber id.
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


# Resend's id for the most recent accepted send — lets a caller look the
# message up afterwards (GET /emails/{id}) to see whether it was delivered —
# and, for the most recent failure, what went wrong.
last_message_id: str | None = None
last_error: str | None = None


def mask_email(email: str | None) -> str:
    """a***@gmail.com — enough to tell addresses apart in a log, not enough
    to read one off a public Actions log."""
    if not email or "@" not in email:
        return "***"
    local, domain = email.rsplit("@", 1)
    return f"{local[:1]}***@{domain}"


def _scrub(text: str) -> str:
    """Resend error bodies can echo the recipient back; mask any address."""
    import re
    return re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", lambda m: mask_email(m.group(0)), text)


def send_email(to: str, subject: str, html: str, unsubscribe_url: str | None = None,
               from_email: str | None = None) -> bool:
    """True only when Resend accepted the message. A missing RESEND_API_KEY
    logs and returns False — safe to wire in before the key exists."""
    global last_message_id, last_error
    last_message_id = last_error = None
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        print(f"  [skip] RESEND_API_KEY not set — would send to {mask_email(to)}: {subject}")
        last_error = "no_resend_key"
        return False
    body = {"from": from_email or FROM_EMAIL, "to": to, "subject": subject, "html": html}
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
            try:
                last_message_id = json.loads(r.read().decode()).get("id")
            except ValueError:
                pass
        return True
    except urllib.error.HTTPError as e:
        last_error = f"Resend {e.code}: {_scrub(e.read().decode(errors='replace'))[:300]}"
        print(f"  [error] {last_error}")
        return False
    except Exception as e:  # noqa: BLE001 — network/timeout, log and move on
        last_error = _scrub(f"{type(e).__name__}: {e}")[:300]
        print(f"  [error] {last_error}")
        return False


def claim_send(subscriber_id: str, type_: str, game_slug: str = "") -> int | None:
    """Atomically claim today's (subscriber, type, game_slug) send slot. The
    new email_log row's id (status 'queued') only for the call that actually
    inserted it — i.e. the one allowed to send; None if the slot was already
    taken. `game_slug` is just the uniqueness key: the claim-reminder sweep
    passes a claim id there so several prizes can each be reminded about on
    the same day."""
    res = (
        db.get_client()
        .table("email_log")
        .upsert(
            {"subscriber_id": subscriber_id, "type": type_, "game_slug": game_slug, "status": "queued"},
            on_conflict="subscriber_id,type,game_slug,sent_date",
            ignore_duplicates=True,
        )
        .execute()
    )
    return res.data[0]["id"] if res.data else None


def _mark(log_id: int, fields: dict) -> None:
    from datetime import datetime, timezone
    try:
        db.get_client().table("email_log").update(
            fields | {"updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", log_id).execute()
    except Exception as e:  # noqa: BLE001 — the send already happened; don't crash the batch over the log
        print(f"  [warn] email_log {log_id} not updated to {fields.get('status')}: {type(e).__name__}")


def mark_skipped(log_id: int, reason: str) -> None:
    _mark(log_id, {"status": "skipped", "skip_reason": reason})


def deliver(log_id: int, to: str, subject: str, html: str, unsubscribe_url: str | None = None) -> bool:
    """send_email() for a claimed slot, recording the outcome on its row."""
    ok = send_email(to, subject, html, unsubscribe_url=unsubscribe_url)
    if ok:
        _mark(log_id, {"status": "sent", "provider_message_id": last_message_id})
    elif last_error == "no_resend_key":
        mark_skipped(log_id, "no_resend_key")
    else:
        _mark(log_id, {"status": "failed", "error": last_error})
    return ok


SENDING_DOMAIN = "@mail.lottizen.com"
# The owner is also a subscriber; these owner-only notifications go to the
# same address and must not be mistaken for subscriber mail.
OWNER_ONLY_SUBJECTS = ("Outreach:", "Press timing:", "Lottizen 日报", "Lottizen 周报", "⚠ ")


def list_sent(since) -> list[dict]:
    """Every message Resend accepted at or after `since` (aware datetime),
    newest first, from this site's sending domain only — the Resend account
    is shared with another project. Each item carries Resend's own
    last_event (delivered / bounced / …). Raises RuntimeError if Resend
    can't be read."""
    import time
    import urllib.parse
    from datetime import datetime
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        raise RuntimeError("RESEND_API_KEY not set")

    def when(m: dict) -> datetime:
        import re
        s = re.sub(r"([+-]\d\d)$", r"\1:00", str(m["created_at"]).replace(" ", "T").replace("Z", "+00:00"))
        s = re.sub(r"\.(\d+)", lambda x: "." + x.group(1)[:6].ljust(6, "0"), s)
        return datetime.fromisoformat(s)

    out: list[dict] = []
    after = None
    for _ in range(200):  # 20,000 messages
        q = {"limit": 100} | ({"after": after} if after else {})
        req = urllib.request.Request("https://api.resend.com/emails?" + urllib.parse.urlencode(q),
                                     headers={"Authorization": f"Bearer {key}", "User-Agent": "lottizen-mailer/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                page = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Resend {e.code}: {_scrub(e.read().decode(errors='replace'))[:160]}") from e
        data = page.get("data") or []
        for m in data:
            m["_at"] = when(m)
            if m["_at"] < since:
                return out
            if SENDING_DOMAIN in (m.get("from") or ""):
                out.append(m)
        if not page.get("has_more") or not data:
            return out
        after = data[-1]["id"]
        time.sleep(0.6)  # Resend allows 2 requests/second
    return out
