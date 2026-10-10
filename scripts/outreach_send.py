#!/usr/bin/env python3
"""Send the partnership drafts in docs/outreach/ as plain-text business email,
and find replies to them.

  python scripts/outreach_send.py info            domains + receiving status (no send)
  python scripts/outreach_send.py send FILE...    send each draft once (Idempotency-Key)
  python scripts/outreach_send.py replies         replies received from the partner domains

A draft is: header lines (To:, CC:, Subject:, parenthetical notes), a line
"---", then the body. Markdown bold is stripped so the mail reads as typed.

The owner's address (Reply-To) comes from a secret, never an input or a log
line: Actions logs are public. Replies also reach REPLY_WATCH (a Resend
receiving address) so the daily report can tell the owner one arrived.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.resend.com"
FROM = "The Lottizen Team <press@lottizen.com>"
PARTNER_DOMAINS = ("rafflebox.ca", "rafflenexus.com")


def call(method: str, path: str, body: dict | None = None, headers: dict | None = None) -> dict:
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
                                          "Content-Type": "application/json", "User-Agent": "lottizen-ops",
                                          **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            t = r.read().decode()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Resend {method} {path} → {e.code}: {e.read().decode()[:300]}") from None


def mask(addr: str) -> str:
    local, _, dom = addr.partition("@")
    return f"{local[:1]}***@{dom}"


def parse(path: Path) -> dict:
    head, _, body = path.read_text().partition("\n---\n")
    h = {}
    for line in head.splitlines():
        m = re.match(r"(To|CC|Subject):\s*(.+)", line)
        if m:
            h[m.group(1).lower()] = m.group(2).strip()
    body = re.sub(r"\*\*(.+?)\*\*", r"\1", body).strip() + "\n"
    return {"to": [a.strip() for a in h["to"].split(",")],
            "cc": [a.strip() for a in h.get("cc", "").split(",") if a.strip()],
            "subject": h["subject"], "text": body}


def info() -> None:
    for d in call("GET", "/domains").get("data", []):
        print(f"domain {d.get('name')}: status={d.get('status')} capabilities={d.get('capabilities')}")
    try:
        got = call("GET", "/emails/receiving?limit=100").get("data", [])
        doms = sorted({a.split("@")[-1] for e in got for a in (e.get("to") or [])})
        print(f"receiving API ok: {len(got)} received; recipient domains {doms}")
    except RuntimeError as e:
        print(f"receiving API: {e}")
    o, r = os.environ.get("OWNER", ""), os.environ.get("OPS", "")
    print(f"OUTREACH_EMAIL={mask(o) if o else '-'} OPS_REPORT_EMAIL={mask(r) if r else '-'} same={o == r}")
    print(f"REPLY_WATCH set={bool(os.environ.get('REPLY_WATCH'))}")


def send(files: list[str]) -> int:
    owner = os.environ["OWNER"]
    reply_to = [owner] + ([os.environ["REPLY_WATCH"]] if os.environ.get("REPLY_WATCH") else [])
    bad = 0
    for f in files:
        m = parse(Path(f))
        key = "outreach-" + hashlib.sha256((f + m["subject"]).encode()).hexdigest()[:32]
        payload = {"from": FROM, "to": m["to"], "subject": m["subject"], "text": m["text"], "reply_to": reply_to}
        if m["cc"]:
            payload["cc"] = m["cc"]
        try:
            r = call("POST", "/emails", payload, {"Idempotency-Key": key})
            print(f"sent {Path(f).name} → to={m['to']} cc={m['cc']} id={r.get('id')}")
        except RuntimeError as e:
            bad += 1
            print(f"FAILED {Path(f).name}: {e}")
    return 1 if bad else 0


def replies() -> list[dict]:
    """Received emails whose sender is at a partner domain, newest first."""
    got = call("GET", "/emails/receiving?limit=100").get("data", [])
    out = []
    for e in got:
        frm = (e.get("from") or "").lower()
        dom = next((d for d in PARTNER_DOMAINS if frm.rstrip(">").endswith("@" + d) or frm.rstrip(">").endswith("." + d)), None)
        if dom:
            out.append({"domain": dom, "subject": e.get("subject"), "at": e.get("created_at")})
    return out


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "info"
    if mode == "info":
        info()
        return 0
    if mode == "send":
        return send(sys.argv[2:])
    if mode == "replies":
        for r in replies():
            print(f"{r['at']}  {r['domain']}  {r['subject']}")
        return 0
    raise SystemExit(f"unknown mode {mode}")


if __name__ == "__main__":
    sys.exit(main())
