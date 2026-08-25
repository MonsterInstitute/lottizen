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
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper


def repo_generated_at() -> datetime:
    """The generatedAt the deployed site *should* be showing. Post-Supabase the
    rankings JSON isn't committed — it's published to the site_json table, and the
    sitemap's <lastmod> is stamped from the NEWEST of the 5 provinces'
    rankings/{province}.json generatedAt at build time (see app/sitemap.ts). So
    the latest published generatedAt across all 5 is the reference the live
    site must match."""
    rows = db.fetch_all("site_json", "path,content",
                        filters=[("like", "path", "rankings/%")])
    if not rows:
        raise RuntimeError("no rankings/*.json in site_json (publish hasn't run yet)")
    stamps = [datetime.fromisoformat(json.loads(r["content"])["generatedAt"].replace("Z", "+00:00")) for r in rows]
    return max(stamps)


def fetch_deployed_lastmod(site_url: str) -> datetime | None:
    """Newest <lastmod> from the live sitemap — the build timestamp of what's
    actually deployed. None if the sitemap can't be fetched/parsed."""
    url = site_url.rstrip("/") + "/sitemap.xml"
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
                    default=float(os.environ.get("MAX_DEPLOY_LAG_HOURS", "12")))
    ap.add_argument("--selftest", action="store_true",
                    help="force a synthetic stale verdict to fire-drill the alert")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        result = {"site": args.site, "deployedLastmod": "2000-01-01T00:00:00+00:00",
                  "repoGeneratedAt": "2000-01-02T00:00:00+00:00",
                  "lagHours": 99999.0, "maxLagHours": args.max_lag_hours,
                  "stale": True, "error": None, "selftest": True}
        print(json.dumps(result, indent=2) if args.json
              else "⚠️  DEPLOYMENT STALE (selftest fire-drill)\n")
        return 0

    error = None
    deployed = None
    repo = None
    try:
        repo = repo_generated_at()
    except Exception as e:
        error = f"repo rankings unreadable: {type(e).__name__}: {e}"
    try:
        deployed = fetch_deployed_lastmod(args.site)
        if deployed is None and error is None:
            error = "sitemap had no parseable <lastmod>"
    except Exception as e:  # network, DNS, HTTP, TLS
        error = error or f"{type(e).__name__}: {e}"

    # Compare the deployed build's data timestamp to what the repo has committed —
    # NOT to wall-clock. This is independent of the time of day the check runs
    # (deployed==repo the moment a build succeeds; the gap only grows when deploys
    # stop). `now` compares would false-positive on off-hours runs because the
    # sitemap's <lastmod> (rankings.generatedAt) only advances once per day.
    lag_hours = None
    if deployed is not None and repo is not None:
        lag_hours = (repo - deployed).total_seconds() / 3600.0

    stale = error is not None or (lag_hours is not None and lag_hours > args.max_lag_hours)

    result = {
        "site": args.site,
        "deployedLastmod": deployed.isoformat() if deployed else None,
        "repoGeneratedAt": repo.isoformat() if repo else None,
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
        print(f"\n⚠️  {error}")
    else:
        print(f"\nRepo committed data (rankings.generatedAt): {repo.isoformat()}")
        print(f"Deployed build (sitemap lastmod):           {deployed.isoformat()}")
        print(f"Deploy trails committed data by:            {lag_hours:.1f}h (threshold {args.max_lag_hours}h)")
    print(f"\n{'⚠️  DEPLOYMENT STALE — live site is behind committed data' if stale else '✅ Deployment is current'}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
