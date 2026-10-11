#!/usr/bin/env python3
"""What Bing knows about a sample of our URLs (Bing Webmaster API GetUrlInfo):
discovery date, last crawl and the HTTP status it got. Bing's IndexNow
report itself is dashboard-only; this is the API's view of whether submitted
URLs were picked up.

  python scripts/bing_url_check.py [--match REGEX] [--limit N]

URLs come from Supabase indexnow_urls (most recently submitted first).
Needs BING_WEBMASTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
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
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import certifi

sys.path.insert(0, os.path.dirname(__file__))
import db  # noqa: E402

API = "https://ssl.bing.com/webmaster/api.svc/json"
SITE = os.environ.get("SITE_URL", "https://lottizen.com").rstrip("/") + "/"
CTX = ssl.create_default_context(cafile=certifi.where())


def call(method: str, **params) -> dict:
    url = f"{API}/{method}?" + urllib.parse.urlencode({"siteUrl": SITE, "apikey": os.environ["BING_WEBMASTER_API_KEY"], **params})
    try:
        with urllib.request.urlopen(url, timeout=30, context=CTX) as r:
            return json.loads(r.read().decode()).get("d") or {}
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.read().decode()[:200]}"}


def day(v) -> str:
    m = re.search(r"\((-?\d+)", str(v or ""))
    if not m or int(m.group(1)) <= 0:
        return "-"
    return datetime.fromtimestamp(int(m.group(1)) / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--match", default="")
    ap.add_argument("--limit", type=int, default=15)
    a = ap.parse_args()
    rows = sorted(db.fetch_all("indexnow_urls", "url,submitted_at"), key=lambda r: r["submitted_at"] or "", reverse=True)
    urls = [r for r in rows if re.search(a.match, r["url"])][: a.limit]
    print(f"submission quota: {call('GetUrlSubmissionQuota')}")
    # The homepage is a control: if Bing shows nothing for it either, the
    # API isn't returning crawl data, not "Bing hasn't seen these".
    urls = [{"url": SITE, "submitted_at": "(control)"}] + urls
    seen = 0
    for r in urls:
        time.sleep(2)  # GetUrlInfo throttles back-to-back calls (ThrottleHost)
        d = call("GetUrlInfo", url=r["url"])
        found = day(d.get("DiscoveryDate")) != "-" or day(d.get("LastCrawledDate")) != "-"
        seen += found
        print(f"{r['url'].removeprefix(SITE.rstrip('/'))}  submitted {r['submitted_at'][:16]}  "
              f"discovered {day(d.get('DiscoveryDate'))}  crawled {day(d.get('LastCrawledDate'))}  "
              f"http {d.get('HttpStatus', '-')}{'  ' + d['error'] if 'error' in d else ''}")
    print(f"{seen}/{len(urls)} known to Bing (incl. the homepage control)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
