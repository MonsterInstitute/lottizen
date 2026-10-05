#!/usr/bin/env python3
"""email_log_backfill.py — one-off: give every email_log row written before
migration 0019 (2026-10-05) a real outcome, from Resend's own sent list.

Before 0019 a row only meant "slot claimed"; whether the email then went out
was never recorded (the free weekly alert cap, for one, skipped sends after
claiming). The migration left every existing row at the column default,
'queued'. This matches each one to the Resend message it produced:

  * matched     -> status 'sent', provider_message_id = Resend's id. Match =
                   same recipient, created within [-2 min, +15 min] of the
                   row's sent_at, nearest first, each message used once.
  * unmatched, and the row is inside Resend's history -> status 'skipped',
                   skip_reason 'legacy_not_in_resend': Resend never accepted
                   it. Whether it was skipped (cap, no key) or rejected wasn't
                   recorded back then; not inventing a reason.
  * unmatched, older than Resend's oldest message -> left 'queued' and
                   reported: nothing to check it against.

    python scripts/email_log_backfill.py            # dry run: report only
    python scripts/email_log_backfill.py --apply

Run from email-log-backfill.yml (needs RESEND_API_KEY). Prints counts and
row ids only — no addresses (public Actions logs).
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
import mailer  # noqa: E402



def parse(ts: str) -> datetime:
    import re
    s = re.sub(r"([+-]\d\d)$", r"\1:00", ts.replace(" ", "T").replace("Z", "+00:00"))
    s = re.sub(r"\.(\d+)", lambda m: "." + m.group(1)[:6].ljust(6, "0"), s)
    return datetime.fromisoformat(s)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    rows = [r for r in db.fetch_all("email_log", "id,subscriber_id,type,sent_at,status")
            if r["status"] == "queued" and parse(r["sent_at"]) < datetime.now(timezone.utc) - timedelta(hours=1)]
    if not rows:
        print("nothing to backfill")
        return 0
    emails = {s["id"]: (s["email"] or "").lower() for s in db.fetch_all("subscribers", "id,email")}
    oldest_row = min(parse(r["sent_at"]) for r in rows)
    msgs = mailer.list_sent(oldest_row - timedelta(days=1))
    oldest_msg = min((m["_at"] for m in msgs), default=None)
    print(f"{len(rows)} legacy row(s) from {oldest_row:%Y-%m-%d}; {len(msgs)} Resend message(s) back to "
          f"{oldest_msg:%Y-%m-%d %H:%M}Z" if oldest_msg else f"{len(rows)} legacy row(s); Resend returned no messages")

    by_to: dict[str, list[dict]] = {}
    for m in msgs:
        for t in m.get("to") or []:
            by_to.setdefault(t.lower(), []).append(m)
    used: set[str] = set()
    sent, skipped, unknown = [], [], []
    for r in sorted(rows, key=lambda r: r["sent_at"]):
        at = parse(r["sent_at"])
        cands = [m for m in by_to.get(emails.get(r["subscriber_id"], ""), [])
                 if m["id"] not in used and at - timedelta(minutes=2) <= m["_at"] <= at + timedelta(minutes=15)]
        if cands:
            m = min(cands, key=lambda m: abs((m["_at"] - at).total_seconds()))
            used.add(m["id"])
            sent.append((r, m["id"]))
        elif oldest_msg and at >= oldest_msg:
            skipped.append(r)
        else:
            unknown.append(r)

    print(f"match: {len(sent)} sent, {len(skipped)} never reached Resend, {len(unknown)} older than Resend's history")
    for label, group in (("sent", [r for r, _ in sent]), ("not in Resend", skipped), ("unverifiable", unknown)):
        if group:
            print(f"  {label:14} by type: " + ", ".join(f"{k} {v}" for k, v in Counter(r['type'] for r in group).most_common()))
    if unknown:
        print("  unverifiable row ids: " + ",".join(str(r["id"]) for r in unknown))
    if not a.apply:
        print("dry run — pass --apply to write")
        return 0

    client = db.get_client()
    now = datetime.now(timezone.utc).isoformat()
    for r, mid in sent:
        client.table("email_log").update({"status": "sent", "provider_message_id": mid, "updated_at": now}) \
            .eq("id", r["id"]).execute()
    for r in skipped:
        client.table("email_log").update({"status": "skipped", "skip_reason": "legacy_not_in_resend", "updated_at": now}) \
            .eq("id", r["id"]).execute()
    print(f"applied: {len(sent)} -> sent, {len(skipped)} -> skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
