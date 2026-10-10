#!/usr/bin/env python3
"""Turn on Resend open + click tracking for the sending domain, and check
that it works.

  python scripts/resend_tracking.py enable --to "$OPS_REPORT_EMAIL"
      PATCH /domains/{id} {open_tracking, click_tracking}, read it back, then
      send one HTML test email to the owner and print its message id.
  python scripts/resend_tracking.py check --id <message id>
      Print that message's last_event (opened/clicked once it's been opened).

The address comes from a secret (never an input): Actions logs are public.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.resend.com"
DOMAIN = "mail.lottizen.com"


def call(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
                                          "Content-Type": "application/json", "User-Agent": "lottizen-ops"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            t = r.read().decode()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Resend {method} {path} → {e.code}: {e.read().decode()[:300]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["enable", "check"])
    ap.add_argument("--to")
    ap.add_argument("--id")
    a = ap.parse_args()
    if a.mode == "check":
        m = call("GET", f"/emails/{a.id}")
        print(f"message {a.id}: last_event={m.get('last_event')} created_at={m.get('created_at')}")
        return 0

    doms = call("GET", "/domains").get("data", [])
    d = next((x for x in doms if x.get("name") == DOMAIN), None)
    if not d:
        raise SystemExit(f"{DOMAIN} not found among {[x.get('name') for x in doms]}")
    before = call("GET", f"/domains/{d['id']}")
    print(f"before: open_tracking={before.get('open_tracking')} click_tracking={before.get('click_tracking')}")
    import time
    for body in ({"open_tracking": True, "click_tracking": True}, {"openTracking": True, "clickTracking": True}):
        resp = call("PATCH", f"/domains/{d['id']}", body)
        time.sleep(4)
        cur = call("GET", f"/domains/{d['id']}")
        print(f"PATCH {list(body)} → {resp}; now open={cur.get('open_tracking')} click={cur.get('click_tracking')}")
        if cur.get("open_tracking"):
            break
    print("capabilities:", call("GET", f"/domains/{d['id']}").get("capabilities"))
    after = call("GET", f"/domains/{d['id']}")
    print(f"after:  open_tracking={after.get('open_tracking')} click_tracking={after.get('click_tracking')}")
    print("domain keys:", sorted(after.keys()))
    if not a.to or os.environ.get("NO_SEND"):
        return 0
    html = ("<p>Open tracking test from Lottizen ops.</p><p>Opening this email should record an "
            "<b>opened</b> event in Resend. <a href=\"https://lottizen.com/charity\">This link</a> records a click.</p>")
    sent = call("POST", "/emails", {"from": f"Lottizen Ops <ops@{DOMAIN}>", "to": [a.to],
                                    "subject": "Lottizen: open tracking test", "html": html})
    print(f"test email sent, message id: {sent.get('id')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
