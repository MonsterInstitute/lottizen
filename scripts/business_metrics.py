#!/usr/bin/env python3
"""business_metrics.py — append this week's business metrics to
reports/metrics-history.csv, the long-running record of how the site is
doing. Run weekly by seo-health.yml just before build_health_report.py.

The CSV is append-only: one row per ISO date, never rewritten except to
refresh the automated columns of *today's* row on a re-run. An unbroken
weekly series is the point — a gap can't be backfilled later, because none
of these sources keep their own history (GSC keeps 16 months, Supabase and
Stripe only know "now").

Every column is either measured or left blank. Blank means "not measured
this run", never zero — a metric we can't read honestly is not estimated:

  subscribers_confirmed   Supabase: confirmed, not unsubscribed, real addresses
  subscribers_total       Supabase: every signup ever, including unconfirmed
  plus_db                 Supabase: subscribers.tier = 'plus' (entitlement state)
  plus_active_stripe      Stripe live: subscriptions with status 'active'
  plus_trialing_stripe    Stripe live: subscriptions with status 'trialing'
  mrr                     Stripe live: active subs normalised to a month, in
                          the minor unit's major currency (yearly / 12);
                          excludes trialing and ignores coupons
  mrr_currency            currency of `mrr` (Plus is priced in one currency)
  gsc_pages_with_impr_28d GSC API (via seo_health_result.json): distinct pages
                          with >=1 impression over the trailing 28 days
  gsc_impressions_28d     GSC API: impressions over the same window
  gsc_clicks_28d          GSC API: clicks over the same window
  indexnow_urls_7d        Supabase indexnow_batches: URLs accepted by IndexNow
                          (HTTP 200/202) in the last 7 days — what we sent,
                          not what any engine indexed
  sitemap_urls            URLs in the live sitemap.xml (tracks SITEMAP_TIER)
  bing_in_index           Bing Webmaster API GetCrawlStats, latest day's InIndex.
                          Needs the BING_WEBMASTER_API_KEY secret (Bing Webmaster
                          Tools → Settings → API access); blank without it
  gsc_indexed_manual      MANUAL — the Search Console API does not expose the
                          Page indexing report's "Indexed" count; copy it from
                          GSC → Indexing → Pages when you can
  api_subscribers_manual  MANUAL — RapidAPI has no provider API for subscriber
                          counts; copy it from the RapidAPI provider dashboard

Manual columns are never overwritten by the script, so a value typed into
today's row survives a re-run.

Internal test accounts (any @lottizen.com address — billing_health.py's
subscribe/cancel and Plus-gating fixtures) are excluded from every count.
"""
from __future__ import annotations

import csv
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "reports" / "metrics-history.csv"
INTERNAL_DOMAIN = "@lottizen.com"

COLUMNS = [
    "date",
    "subscribers_confirmed",
    "subscribers_total",
    "plus_db",
    "plus_active_stripe",
    "plus_trialing_stripe",
    "mrr",
    "mrr_currency",
    "gsc_pages_with_impr_28d",
    "gsc_impressions_28d",
    "gsc_clicks_28d",
    "indexnow_urls_7d",
    "sitemap_urls",
    "bing_in_index",
    "gsc_indexed_manual",
    "api_subscribers_manual",
    "notes",
]
MANUAL = {"gsc_indexed_manual", "api_subscribers_manual"}


def supabase_metrics() -> dict:
    try:
        import db
        client = db.get_client()
        rows: list[dict] = []
        start = 0
        while True:  # page past PostgREST's default 1000-row cap
            page = (
                client.table("subscribers")
                .select("email,tier,confirmed_at,unsubscribed_at")
                .range(start, start + 999)
                .execute()
                .data
            )
            rows.extend(page)
            if len(page) < 1000:
                break
            start += 1000
    except Exception as e:  # noqa: BLE001
        print(f"warning: Supabase metrics unavailable: {e}", file=sys.stderr)
        return {}
    real = [r for r in rows if not (r.get("email") or "").lower().endswith(INTERNAL_DOMAIN)]
    return {
        "subscribers_total": len(real),
        "subscribers_confirmed": sum(1 for r in real if r.get("confirmed_at") and not r.get("unsubscribed_at")),
        "plus_db": sum(1 for r in real if r.get("tier") == "plus"),
    }


def stripe_metrics() -> dict:
    key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not key.startswith(("sk_live_", "rk_live_")):
        print("skip: Stripe metrics (no live key in STRIPE_SECRET_KEY)", file=sys.stderr)
        return {}
    try:
        import stripe
        stripe.api_key = key
        active = trialing = 0
        mrr_minor = 0.0
        currencies: set[str] = set()
        for status in ("active", "trialing"):
            for sub in stripe.Subscription.list(status=status, limit=100).auto_paging_iter():
                email = ""
                if isinstance(sub.get("customer"), str):
                    try:
                        email = (stripe.Customer.retrieve(sub["customer"]).get("email") or "").lower()
                    except Exception:  # noqa: BLE001
                        pass
                if email.endswith(INTERNAL_DOMAIN):
                    continue
                if status == "trialing":
                    trialing += 1
                    continue
                active += 1
                for item in sub["items"]["data"]:
                    price = item["price"]
                    rec = price.get("recurring") or {}
                    per = {"day": 365 / 12, "week": 52 / 12, "month": 1, "year": 1 / 12}.get(rec.get("interval"), 0)
                    per /= rec.get("interval_count") or 1
                    mrr_minor += (price.get("unit_amount") or 0) * (item.get("quantity") or 1) * per
                    currencies.add(price.get("currency", ""))
    except Exception as e:  # noqa: BLE001
        print(f"warning: Stripe metrics unavailable: {e}", file=sys.stderr)
        return {}
    out = {"plus_active_stripe": active, "plus_trialing_stripe": trialing, "mrr": f"{mrr_minor / 100:.2f}"}
    if len(currencies) == 1:
        out["mrr_currency"] = currencies.pop().upper()
    elif currencies:  # summing across currencies would be a made-up number
        out.pop("mrr")
        out["notes"] = "MRR not summed: subscriptions in several currencies " + ",".join(sorted(currencies))
    return out


def gsc_metrics() -> dict:
    p = Path(os.environ.get("SEO_RESULT", "seo_health_result.json"))
    try:
        gsc = json.loads(p.read_text()).get("gsc") or {}
    except Exception:  # noqa: BLE001
        return {}
    if gsc.get("skipped", True):
        return {}
    return {
        "gsc_pages_with_impr_28d": gsc.get("pagesWithImpressions28d"),
        "gsc_impressions_28d": gsc.get("impressions"),
        "gsc_clicks_28d": gsc.get("clicks"),
    }


def indexnow_metrics() -> dict:
    try:
        import db
        from datetime import timedelta
        since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        rows = db.fetch_all("indexnow_batches", "url_count,http_status",
                            filters=[("gte", "submitted_at", since)])
    except Exception as e:  # noqa: BLE001
        print(f"warning: IndexNow metrics unavailable: {e}", file=sys.stderr)
        return {}
    return {"indexnow_urls_7d": sum(r["url_count"] for r in rows if r["http_status"] in (200, 202))}


def sitemap_metrics() -> dict:
    import re
    import ssl
    import urllib.request
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
        site = os.environ.get("SITE_URL", "https://lottizen.com").rstrip("/")
        with urllib.request.urlopen(f"{site}/sitemap.xml", timeout=30, context=ctx) as r:
            return {"sitemap_urls": len(re.findall(r"<loc>", r.read().decode()))}
    except Exception as e:  # noqa: BLE001
        print(f"warning: sitemap count unavailable: {e}", file=sys.stderr)
        return {}


def bing_metrics() -> dict:
    """Bing Webmaster API. GetCrawlStats returns daily rows; InIndex is the
    number of the site's pages in Bing's index that day."""
    key = os.environ.get("BING_WEBMASTER_API_KEY")
    if not key:
        print("skip: Bing metrics (BING_WEBMASTER_API_KEY not set)", file=sys.stderr)
        return {}
    import ssl
    import urllib.parse
    import urllib.request
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
        site = os.environ.get("SITE_URL", "https://lottizen.com").rstrip("/") + "/"
        url = ("https://ssl.bing.com/webmaster/api.svc/json/GetCrawlStats?"
               + urllib.parse.urlencode({"siteUrl": site, "apikey": key}))
        with urllib.request.urlopen(url, timeout=30, context=ctx) as r:
            rows = json.loads(r.read().decode()).get("d") or []
        rows = [x for x in rows if x.get("InIndex") is not None]
        if not rows:
            return {}
        import re

        def ms(row: dict) -> int:  # Bing dates look like "/Date(1790892000000-0700)/"
            m = re.search(r"\((-?\d+)", row.get("Date") or "")
            return int(m.group(1)) if m else 0
        latest = max(rows, key=ms)
        return {"bing_in_index": latest["InIndex"]}
    except Exception as e:  # noqa: BLE001
        print(f"warning: Bing metrics unavailable: {e}", file=sys.stderr)
        return {}


def read_rows() -> list[dict]:
    if not CSV_PATH.exists():
        return []
    with CSV_PATH.open(newline="") as f:
        return list(csv.DictReader(f))


def write_rows(rows: list[dict]) -> None:
    CSV_PATH.parent.mkdir(exist_ok=True)
    with CSV_PATH.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in COLUMNS})


def main() -> int:
    today = datetime.now(timezone.utc).date().isoformat()
    measured: dict = {}
    for source in (supabase_metrics, stripe_metrics, gsc_metrics, indexnow_metrics, sitemap_metrics, bing_metrics):
        measured.update(source())

    rows = read_rows()
    existing = next((r for r in rows if r.get("date") == today), None)
    row = existing if existing is not None else {"date": today}
    for col in COLUMNS:
        if col in MANUAL or col == "date":
            continue
        if col in measured and measured[col] is not None:
            row[col] = measured[col]
        elif existing is None:
            row[col] = ""
    if existing is None:
        rows.append(row)
    rows.sort(key=lambda r: r.get("date", ""))
    write_rows(rows)
    print(f"{'updated' if existing else 'appended'} {today} in {CSV_PATH.relative_to(ROOT)}: "
          + ", ".join(f"{k}={v}" for k, v in measured.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
