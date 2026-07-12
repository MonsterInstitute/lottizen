#!/usr/bin/env python3
"""check_deploy_freshness.py — verify the DEPLOYED site reflects the committed data.

Every other freshness check (audit_site.py --freshness, the watchdog) reads the
committed repo/DB, so a broken *deployment* is completely invisible to them: the
data can be perfectly fresh in git while the live site is frozen at an old build.
That is exactly the Jul 2026 incident — Vercel stopped completing builds, so the
site stayed on a two-day-old snapshot even though every data commit landed.

This closes that blind spot. The site is fully static (SSG), and its sitemap's
<lastmod> is stamped at build time from rankings.generatedAt — so a healthy site,
which rebuilds on every data push, always has a <lastmod> within the last day.
A <lastmod> older than the threshold means deployments have stopped.

Exit 0 always (non-blocking); prints a human report, and with --json emits a
machine-readable verdict the watchdog uses to open a "Deployment stale" issue.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import urllib.request
from datetime import datetime, timezone


def fetch_deployed_lastmod(site_url: str) -> datetime | None:
    """Newest <lastmod> from the live sitemap — the build timestamp of what's
    actually deployed. None if the sitemap can't be fetched/parsed."""
    url = site_url.rstrip("/") + "/sitemap/0.xml"
    req = urllib.request.Request(url, headers={"User-Agent": "lottizen-deploy-check/1.0"})
    # Public read-only probe; skip cert verification (matches the scrapers' ssl_ctx
    # and avoids CA-bundle issues on bare runners/macOS).
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
        xml = r.read().decode("utf-8", "replace")
    stamps = re.findall(r"<lastmod>([^<]+)</lastmod>", xml)
    if not stamps:
        return None
    parsed = []
    for s in stamps:
        try:
            parsed.append(datetime.fromisoformat(s.strip().replace("Z", "+00:00")))
        except ValueError:
            continue
    return max(parsed) if parsed else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default=os.environ.get("SITE_URL", "https://lottizen.com"))
    ap.add_argument("--max-lag-hours", type=float,
                    default=float(os.environ.get("MAX_DEPLOY_LAG_HOURS", "18")))
    ap.add_argument("--now", help="override 'now' as ISO 8601, for testing")
    ap.add_argument("--selftest", action="store_true",
                    help="force a synthetic stale verdict to fire-drill the alert")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        result = {"site": args.site, "deployedLastmod": "2000-01-01T00:00:00+00:00",
                  "checkedAt": datetime.now(timezone.utc).isoformat() if not args.now else args.now,
                  "lagHours": 99999.0, "maxLagHours": args.max_lag_hours,
                  "stale": True, "error": None, "selftest": True}
        print(json.dumps(result, indent=2) if args.json
              else "⚠️  DEPLOYMENT STALE (selftest fire-drill)\n")
        return 0

    now = (datetime.fromisoformat(args.now.replace("Z", "+00:00"))
           if args.now else datetime.now(timezone.utc))

    error = None
    deployed = None
    try:
        deployed = fetch_deployed_lastmod(args.site)
        if deployed is None:
            error = "sitemap had no parseable <lastmod>"
    except Exception as e:  # network, DNS, HTTP, TLS
        error = f"{type(e).__name__}: {e}"

    lag_hours = None
    if deployed is not None:
        lag_hours = (now - deployed).total_seconds() / 3600.0

    # Stale if the deployed build is older than the threshold, OR the site is
    # unreachable (a down/erroring site is also a deployment problem worth an alert).
    stale = error is not None or (lag_hours is not None and lag_hours > args.max_lag_hours)

    result = {
        "site": args.site,
        "deployedLastmod": deployed.isoformat() if deployed else None,
        "checkedAt": now.isoformat(),
        "lagHours": round(lag_hours, 1) if lag_hours is not None else None,
        "maxLagHours": args.max_lag_hours,
        "stale": stale,
        "error": error,
    }

    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    print("=" * 70)
    print(f"DEPLOY FRESHNESS — {args.site}")
    print("=" * 70)
    if error:
        print(f"\n⚠️  Could not read deployed freshness: {error}")
    else:
        print(f"\nDeployed build (sitemap lastmod): {deployed.isoformat()}")
        print(f"Now:                              {now.isoformat()}")
        print(f"Deployed build age:               {lag_hours:.1f}h (threshold {args.max_lag_hours}h)")
    print(f"\n{'⚠️  DEPLOYMENT STALE — live site is not rebuilding' if stale else '✅ Deployment is current'}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
