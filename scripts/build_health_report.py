#!/usr/bin/env python3
"""build_health_report.py — assembles reports/health-weekly.md from the
outputs of this week's health checks: data freshness, deploy status, SEO
health (scripts/seo_health.py), and billing health
(scripts/billing_health.py). Run at the end of seo-health.yml (the weekly-
cadence workflow) after downloading billing-health's latest artifact.

Every JSON input is optional — a missing file renders as "not available
this run" rather than failing the report, since the point of this report is
to always land even if one upstream check didn't run.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(path: str) -> dict | None:
    p = Path(path)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def run_json(cmd: list[str]) -> dict | None:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=True).stdout
        return json.loads(out)
    except Exception as e:  # noqa: BLE001
        print(f"warning: {' '.join(cmd)} failed: {e}", file=sys.stderr)
        return None


def fmt_bool(ok: bool) -> str:
    return "✅ OK" if ok else "❌ problem"


def section_freshness(freshness: dict | None) -> str:
    if freshness is None:
        return "## Data freshness\n\nNot available this run.\n"
    stale = freshness.get("stale", [])
    stale_scratch = freshness.get("staleScratch", [])
    lines = ["## Data freshness\n"]
    if not stale and not stale_scratch:
        lines.append("✅ All draw games and all 5 scratch agencies are current.\n")
    else:
        if stale:
            lines.append(f"⚠️ {len(stale)} draw game(s) behind schedule:\n")
            for s in stale:
                lines.append(f"- **{s['name']}** — latest `{s['latest']}`, due `{s['due']}` ({s['daysLate']}d late)")
        if stale_scratch:
            lines.append(f"\n⚠️ {len(stale_scratch)} scratch agenc(y/ies) stale:\n")
            for s in stale_scratch:
                lines.append(f"- **{s['agency']}** — {s.get('reason') or s['latest']}")
    return "\n".join(lines) + "\n"


def section_deploy(deploy: dict | None) -> str:
    if deploy is None:
        return "## Deployment\n\nNot available this run.\n"
    if deploy.get("error"):
        return f"## Deployment\n\n⚠️ Could not check: {deploy['error']}\n"
    stale = deploy.get("stale")
    lag = deploy.get("lagHours")
    return (
        "## Deployment\n\n"
        f"{fmt_bool(not stale)} — live sitemap last rebuilt `{deploy.get('deployedLastmod')}` "
        f"({lag:.1f}h ago, threshold {deploy.get('maxLagHours')}h)\n"
    )


def section_seo(seo: dict | None, seo_problems: list | None) -> str:
    if seo is None:
        return "## SEO health\n\nNot available this run.\n"
    n_problems = len(seo_problems or [])
    lines = [f"## SEO health\n\n{fmt_bool(n_problems == 0)} — {n_problems} problem(s) this run\n"]
    sm = seo.get("sitemap", {})
    lines.append(
        f"- Sitemap: {sm.get('totalUrls', '?')} URLs, {sm.get('distinctLastmods', '?')} distinct lastmod "
        f"dates, {sm.get('sampledLive', '?')}/{sm.get('sampledTotal', '?')} sampled URLs live"
    )
    lg = seo.get("linkGraph", {})
    if lg.get("skipped"):
        lines.append("- Link graph: skipped (no local build)")
    else:
        lines.append(
            f"- Link graph: {lg.get('totalPages', '?')} pages, {lg.get('reached', '?')} reached from home, "
            f"{lg.get('orphans', '?')} orphan(s), {lg.get('brokenInternalLinks', '?')} broken internal link(s), "
            f"deepest reached {lg.get('deepestReached', '?')} clicks"
        )
    sd = seo.get("structuredData", {})
    lines.append(f"- Structured data: {sd.get('blocksChecked', '?')} JSON-LD blocks checked, {sd.get('errors', '?')} error(s)")
    gsc = seo.get("gsc", {})
    if gsc.get("skipped"):
        lines.append("- GSC: not integrated yet — skipped, no impact on the other checks")
    else:
        lines.append(
            f"- GSC ({gsc.get('windowStart')} → {gsc.get('windowEnd')}): "
            f"**{gsc.get('pagesWithImpressions28d', '?')} distinct pages with impressions** (28d) · "
            f"{gsc.get('clicks', '?')} clicks, {gsc.get('impressions', '?')} impressions, "
            f"avg position {gsc.get('position', 0):.1f}"
        )
        lines.append(
            "  \n  _(The Search Console API doesn't expose the Coverage report's per-type indexed "
            "count publicly — \"distinct pages with ≥1 impression in the trailing 28 days\" is the "
            "closest automatable proxy for real indexing.)_"
        )
    if seo_problems:
        lines.append("\n**Problems:**")
        for p in seo_problems[:15]:
            lines.append(f"- {p['title'].replace('SEO health: ', '')}")
        if len(seo_problems) > 15:
            lines.append(f"- …and {len(seo_problems) - 15} more")
    return "\n".join(lines) + "\n"


def section_billing(billing: dict | None, billing_problems: list | None) -> str:
    if billing is None:
        return "## Billing & Plus feature health\n\nNot available this run (no billing-health artifact found).\n"
    n_problems = len(billing_problems or [])
    lines = [f"## Billing & Plus feature health\n\n{fmt_bool(n_problems == 0)} — {n_problems} problem(s) on {billing.get('checkedAt', '?')[:10]}\n"]

    tf = billing.get("testFlow") or {}
    if tf.get("skipped"):
        lines.append("- Test-mode subscribe/cancel round trip: skipped (no test key configured)")
    else:
        lines.append(
            f"- Test-mode subscribe → webhook → plus → cancel → free: "
            f"upgrade {fmt_bool(tf.get('upgraded', False))}, downgrade {fmt_bool(tf.get('downgraded', False))}"
        )

    lh = billing.get("liveHealth") or {}
    if lh.get("skipped"):
        lines.append("- Live product/price/webhook health: skipped (no live key configured)")
    else:
        lines.append(f"- Live product/price/webhook health: {fmt_bool(lh.get('ok', False))}")

    pg = billing.get("plusGating") or {}
    if pg:
        lines.append(f"- Plus feature gating (budget optimizer, goal ranking, cross-province follow limit): {fmt_bool(pg.get('ok', False))}")

    if billing_problems:
        lines.append("\n**Problems:**")
        for p in billing_problems[:15]:
            lines.append(f"- {p['title'].replace('Billing health: ', '')}")
    return "\n".join(lines) + "\n"


def section_email_delivery(email: dict | None, email_problems: list | None) -> str:
    if email is None:
        return "## Email delivery\n\nNot available this run (no email-delivery-watchdog artifact found).\n"
    n_problems = len(email_problems or [])
    lines = [f"## Email delivery\n\n{fmt_bool(n_problems == 0)} — {n_problems} problem(s) on {email.get('checkedAt', '?')[:10]}\n"]
    dr = email.get("drawResult") or {}
    if dr.get("skipped"):
        lines.append("- Draw-result: skipped")
    else:
        lines.append(f"- Draw-result: {dr.get('gamesChecked', 0)} game(s) with real drawn+followed activity checked, {dr.get('missing', 0)} missing")
    wd = email.get("weeklyDigest") or {}
    if wd.get("skipped"):
        lines.append("- Weekly digest: not checked today (only runs the Monday after a Sunday digest)")
    else:
        lines.append(f"- Weekly digest: {wd.get('eligible', 0)} eligible, {wd.get('logged', 0)} logged")
    ts = email.get("totalSilence") or {}
    if not ts.get("skipped"):
        lines.append(f"- Any send in the last 3 days: {fmt_bool(ts.get('anyLogsInWindow', False))}")
    if email_problems:
        lines.append("\n**Problems:**")
        for p in email_problems[:10]:
            lines.append(f"- {p['title'].replace('Email delivery: ', '')}")
    return "\n".join(lines) + "\n"


def section_watch() -> str:
    return (
        "## Watching: number-page content similarity\n\n"
        "907 number-detail pages score 76–86% textually similar within the same game once digits are "
        "masked (same sentence template, different stats) — flagged 2026-08-25 alongside the homepage "
        "geo-redirect fix as a possible contributor to low indexing, but left unchanged: the redirect was "
        "the much stronger suspect (Googlebot never saw real homepage content at all), and fixing content "
        "templating is expensive to redo if it turns out not to be the bottleneck.\n\n"
        "**Plan**: watch the GSC \"distinct pages with impressions\" trend above for 2–3 weeks post-fix. "
        "If indexing recovers, this was never a content-quality problem. If it plateaus well below 2000 "
        "once the redirect fix has had time to take effect, revisit consolidating or diversifying the "
        "number-page template.\n"
    )


def main() -> int:
    os.chdir(ROOT)
    now = datetime.now(timezone.utc).isoformat()

    freshness = run_json([sys.executable, "scripts/audit_site.py", "--freshness", "--json"])
    deploy = run_json([sys.executable, "scripts/check_deploy_freshness.py", "--json"])
    seo = load(os.environ.get("SEO_RESULT", "seo_health_result.json"))
    seo_problems = load(os.environ.get("SEO_PROBLEMS", "seo_health_problems.json"))
    billing = load(os.environ.get("BILLING_RESULT", "billing_health_result.json"))
    billing_problems = load(os.environ.get("BILLING_PROBLEMS", "billing_health_problems.json"))
    email = load(os.environ.get("EMAIL_RESULT", "email_delivery_result.json"))
    email_problems = load(os.environ.get("EMAIL_PROBLEMS", "email_delivery_problems.json"))

    parts = [
        f"# Lottizen Health — Weekly Report\n\nGenerated {now}\n",
        section_freshness(freshness),
        section_deploy(deploy),
        section_seo(seo, seo_problems),
        section_billing(billing, billing_problems),
        section_email_delivery(email, email_problems),
        section_watch(),
    ]
    report = "\n".join(parts)

    out_path = ROOT / "reports" / "health-weekly.md"
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(report)
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
