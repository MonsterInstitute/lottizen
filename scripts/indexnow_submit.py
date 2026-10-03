#!/usr/bin/env python3
"""indexnow_submit.py — tell IndexNow engines (Bing, Yandex, Seznam, Naver;
DuckDuckGo and others use Bing's index) which pages changed. Google does not
take part in IndexNow; this neither helps nor hurts with Google.

Only pages whose content actually changed are submitted. A URL goes out when
its sitemap <lastmod> has moved past the lastmod we last submitted for it
(state in Supabase `indexnow_urls`, migration 0016), or when it is new to the
sitemap. lastmod in app/sitemap.ts is the real content-change date, never the
build time, so a daily rebuild with no new draw submits nothing. IndexNow
penalises re-submitting unchanged URLs, and eight workflows rebuild the site
each day, so the state table is what keeps this polite.

Submitting before the new build is live would get the old page crawled. So
the "expected" sitemap is the one this run just built locally
(.next/server/app/sitemap.xml.body), and we poll the LIVE sitemap until it
shows the same lastmod for each changed URL. URLs that aren't live by
--wait seconds are left for the next run (not recorded as submitted).

Usage:
  python scripts/indexnow_submit.py --trigger "Daily draw results"   # changed pages
  python scripts/indexnow_submit.py --all --trigger initial           # every sitemap URL once
  python scripts/indexnow_submit.py --dry-run                         # show what would go

The key is public by design: IndexNow verifies ownership by fetching
https://lottizen.com/<key>.txt, which lives in public/.

Exit 0 on success or nothing to do; 1 if the endpoint rejected a submission.
Workflows run this step with continue-on-error: it is never worth failing a
data refresh over.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import certifi

sys.path.insert(0, os.path.dirname(__file__))
import db  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = os.environ.get("SITE_URL", "https://lottizen.com").rstrip("/")
HOST = SITE.split("://", 1)[1]
ENDPOINT = "https://api.indexnow.org/indexnow"
LOCAL_SITEMAP = ROOT / ".next" / "server" / "app" / "sitemap.xml.body"
BATCH = 10_000  # protocol maximum per POST
CTX = ssl.create_default_context(cafile=certifi.where())


def key() -> str:
    keys = [p.stem for p in (ROOT / "public").glob("*.txt") if re.fullmatch(r"[0-9a-f]{32}", p.stem)]
    if len(keys) != 1:
        raise SystemExit(f"expected exactly one IndexNow key file public/<32 hex>.txt, found {keys}")
    return keys[0]


def parse_sitemap(xml: str) -> dict[str, str | None]:
    """url -> lastmod (normalised to UTC ISO seconds) or None."""
    out: dict[str, str | None] = {}
    for block in re.findall(r"<url>(.*?)</url>", xml, re.S):
        loc = re.search(r"<loc>(.*?)</loc>", block)
        if not loc:
            continue
        lm = re.search(r"<lastmod>(.*?)</lastmod>", block)
        out[loc.group(1).strip()] = norm(lm.group(1).strip()) if lm else None
    return out


def norm(ts: str | None) -> str | None:
    if not ts:
        return None
    d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def live_sitemap() -> dict[str, str | None]:
    req = urllib.request.Request(f"{SITE}/sitemap.xml", headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
        return parse_sitemap(r.read().decode("utf-8"))


def submitted_state() -> dict[str, str | None]:
    return {r["url"]: norm(r["lastmod"]) for r in db.fetch_all("indexnow_urls", "url,lastmod")}


def wait_until_live(expected: dict[str, str | None], wait: int) -> set[str]:
    """Poll the live sitemap until every expected URL shows at least the expected lastmod."""
    deadline = time.time() + wait
    while True:
        try:
            live = live_sitemap()
        except Exception as e:  # noqa: BLE001
            print(f"  live sitemap fetch failed: {e}", file=sys.stderr)
            live = {}
        # >= not ==: another workflow may have published newer data in between.
        ready = {u for u, lm in expected.items()
                 if u in live and (lm is None or (live[u] or "") >= lm)}
        if len(ready) == len(expected) or time.time() >= deadline:
            return ready
        print(f"  {len(ready)}/{len(expected)} changed URLs live; waiting for the deploy…", flush=True)
        time.sleep(20)


def post(urls: list[str], k: str) -> int:
    body = json.dumps({"host": HOST, "key": k, "keyLocation": f"{SITE}/{k}.txt", "urlList": urls}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, method="POST",
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"  IndexNow HTTP {e.code}: {e.read()[:300]!r}", file=sys.stderr)
        return e.code


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="submit every sitemap URL (initial push)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--trigger", default=os.environ.get("GITHUB_WORKFLOW", "manual"))
    ap.add_argument("--wait", type=int, default=600, help="seconds to wait for the deploy to go live")
    args = ap.parse_args()

    k = key()
    if LOCAL_SITEMAP.exists():
        expected_all = parse_sitemap(LOCAL_SITEMAP.read_text())
        print(f"local build sitemap: {len(expected_all)} URLs")
    else:
        expected_all = live_sitemap()
        print(f"no local build; using the live sitemap: {len(expected_all)} URLs")

    state = submitted_state()
    if args.all:
        changed = dict(expected_all)
    else:
        changed = {u: lm for u, lm in expected_all.items()
                   if u not in state or (lm is not None and (state[u] is None or lm > state[u]))}
    print(f"{len(changed)} URL(s) new or changed since last submission ({len(state)} tracked)")
    if not changed:
        return 0
    if args.dry_run:
        for u in sorted(changed)[:50]:
            print("  ", u, changed[u])
        return 0

    ready = wait_until_live(changed, args.wait) if LOCAL_SITEMAP.exists() else set(changed)
    if len(ready) < len(changed):
        print(f"  {len(changed) - len(ready)} URL(s) not live after {args.wait}s; leaving them for the next run")
    urls = sorted(ready)
    if not urls:
        return 0

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    worst = 200
    for i in range(0, len(urls), BATCH):
        chunk = urls[i:i + BATCH]
        status = post(chunk, k)
        db.get_client().table("indexnow_batches").insert(
            {"trigger": args.trigger, "url_count": len(chunk), "http_status": status}).execute()
        print(f"  POST {len(chunk)} URL(s) -> HTTP {status}")
        if status in (200, 202):
            db.upsert_rows("indexnow_urls",
                           [{"url": u, "lastmod": changed[u], "submitted_at": now} for u in chunk],
                           on_conflict="url")
        else:
            worst = status
    # 200 = accepted, 202 = accepted, key validation pending. 403 = key file not
    # found/invalid, 422 = URL not on this host, 429 = too many requests.
    return 0 if worst in (200, 202) else 1


if __name__ == "__main__":
    raise SystemExit(main())
