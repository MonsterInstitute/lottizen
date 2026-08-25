#!/usr/bin/env python3
"""billing_health.py — daily end-to-end verification of the Stripe billing
pipeline and Lottizen Plus feature gating, against the real production app
and database. Never a mock: every assertion exercises the actual deployed
webhook handler, the actual entitlement check, and the actual DB rows.

Three independent checks, each skipped gracefully (not failed) if its
credential isn't configured yet:

  1. TEST-MODE FULL FLOW  (needs STRIPE_TEST_SECRET_KEY)
     Creates a real test-mode Stripe subscription for a dedicated test
     subscriber -> a real webhook delivery hits
     https://lottizen.com/api/billing/webhook (a second, test-mode
     WebhookEndpoint object was registered at the same URL for this;
     app/api/billing/webhook/route.ts tries STRIPE_WEBHOOK_SECRET_TEST as a
     fallback when live-secret verification fails) -> asserts tier flips to
     'plus' in Supabase -> cancels -> asserts it drops back to 'free'.
     Cleans up every Stripe test object each run, in a `finally`.

  2. LIVE READ-ONLY HEALTH  (needs STRIPE_LIVE_RESTRICTED_KEY)
     Product/price/webhook-endpoint sanity against the real live account.
     Never creates a charge, customer, or subscription.

  3. PLUS FEATURE GATING  (needs SUPABASE_SERVICE_ROLE_KEY, already in CI)
     Forces a test subscriber's tier directly in the DB (bypassing Stripe
     entirely, so this runs even without any Stripe key) and hits the real
     site with a real session cookie to confirm Plus-only content renders
     for 'plus' and stays gated for 'free'. Also exercises the free-tier
     one-province favourite limit (app/api/account/scratch-favourites) so a
     regression there is caught automatically going forward.

Writes billing_health_problems.json (consumed by scripts/health_issues.sh
to open/close GitHub issues) and billing_health_result.json (consumed by
scripts/build_health_report.py for the weekly digest).
"""
from __future__ import annotations

import json
import os
import re
import secrets
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
import db  # noqa: E402

SITE = os.environ.get("SITE_URL", "https://lottizen.com").rstrip("/")
SESSION_COOKIE = "lottizen_session"
TEST_EMAIL = "billing-health-test@lottizen.com"
PLUS_GATING_EMAIL = "plus-gating-test@lottizen.com"
FREE_GATING_EMAIL = "free-gating-test@lottizen.com"

problems: list[dict] = []
results: dict = {
    "checkedAt": datetime.now(timezone.utc).isoformat(),
    "testFlow": None,
    "liveHealth": None,
    "plusGating": None,
}


def log(*a) -> None:
    print(*a, flush=True)


def add_problem(title: str, body: str) -> None:
    problems.append({"title": title, "body": body})
    log(f"❌ {title}")


def http(path: str, method: str = "GET", cookie: str | None = None, body: bytes | None = None,
         headers: dict | None = None) -> tuple[int | None, str, dict]:
    """Plain HTTP call against the live site. Returns (status, text, response_headers)."""
    req = urllib.request.Request(SITE + path, method=method, data=body)
    req.add_header("User-Agent", "lottizen-billing-health/1.0")
    if cookie:
        req.add_header("Cookie", f"{SESSION_COOKIE}={cookie}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
            return r.status, r.read().decode("utf-8", "replace"), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), dict(e.headers)
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}: {e}", {}


def new_token() -> str:
    return secrets.token_hex(24)


# ============================================================================
# Shared: get-or-create a test subscriber row directly in Supabase
# ============================================================================
def get_or_create_subscriber(email: str, tier: str = "free") -> str:
    client = db.get_client()
    rows = client.table("subscribers").select("id").eq("email", email).execute().data
    if rows:
        sub_id = rows[0]["id"]
        client.table("subscribers").update({"tier": tier}).eq("id", sub_id).execute()
        return sub_id
    row = {
        "email": email,
        "country": "CA",
        "frequency": "instant",
        "tier": tier,
        "magic_token": new_token(),
        "confirmed_at": datetime.now(timezone.utc).isoformat(),
    }
    inserted = client.table("subscribers").insert(row).execute().data
    return inserted[0]["id"]


def create_session(subscriber_id: str) -> str:
    client = db.get_client()
    token = new_token()
    client.table("sessions").insert({
        "subscriber_id": subscriber_id,
        "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
    }).execute()
    return token


def poll_tier(subscriber_id: str, expect: str, timeout_s: int = 90, interval_s: int = 3) -> tuple[bool, str]:
    client = db.get_client()
    deadline = time.time() + timeout_s
    last = "?"
    while time.time() < deadline:
        rows = client.table("subscribers").select("tier").eq("id", subscriber_id).execute().data
        last = rows[0]["tier"] if rows else "?"
        if last == expect:
            return True, last
        time.sleep(interval_s)
    return False, last


# ============================================================================
# 1. Test-mode full flow
# ============================================================================
def check_test_flow() -> None:
    key = os.environ.get("STRIPE_TEST_SECRET_KEY")
    if not key:
        log("skip: test-mode full flow (STRIPE_TEST_SECRET_KEY not set)")
        results["testFlow"] = {"skipped": True}
        return

    import stripe
    stripe.api_key = key

    subscriber_id = get_or_create_subscriber(TEST_EMAIL, tier="free")
    client = db.get_client()
    # Clean slate: drop any subscription row left from a previous run.
    client.table("subscriptions").delete().eq("subscriber_id", subscriber_id).execute()

    customer = None
    price = None
    outcome = {"upgraded": False, "downgraded": False, "error": None}
    try:
        customer = stripe.Customer.create(email=TEST_EMAIL, metadata={"subscriber_id": subscriber_id, "source": "billing_health"})
        pm = stripe.PaymentMethod.create(type="card", card={"token": "tok_visa"})
        stripe.PaymentMethod.attach(pm.id, customer=customer.id)
        stripe.Customer.modify(customer.id, invoice_settings={"default_payment_method": pm.id})

        price = stripe.Price.create(
            unit_amount=300, currency="cad", recurring={"interval": "month"},
            product_data={"name": "Lottizen Plus (billing_health test)"},
        )
        sub = stripe.Subscription.create(
            customer=customer.id, items=[{"price": price.id}], default_payment_method=pm.id,
            metadata={"subscriber_id": subscriber_id},
        )
        # Creation only fires customer.subscription.created, which our handler
        # ignores by design (mirrors real Checkout, which relies on
        # checkout.session.completed / .updated) — force a genuine .updated
        # event so the real webhook handler runs.
        stripe.Subscription.modify(sub.id, metadata={"subscriber_id": subscriber_id, "ping": new_token()[:8]})

        ok, tier = poll_tier(subscriber_id, "plus")
        outcome["upgraded"] = ok
        if not ok:
            add_problem(
                "Billing health: test subscribe did not upgrade tier",
                f"Created a real test-mode Stripe subscription ({sub.id}) for subscriber {subscriber_id} "
                f"and forced a customer.subscription.updated event. After 40s, subscribers.tier is still "
                f"'{tier}', expected 'plus'. Either the test-mode webhook isn't reaching "
                f"/api/billing/webhook (check the we_... test endpoint status and "
                f"STRIPE_WEBHOOK_SECRET_TEST in Vercel), or the handler logic itself broke.",
            )

        stripe.Subscription.delete(sub.id)
        ok2, tier2 = poll_tier(subscriber_id, "free")
        outcome["downgraded"] = ok2
        if not ok2:
            add_problem(
                "Billing health: test cancel did not downgrade tier",
                f"Canceled the test subscription ({sub.id}). After 40s, subscribers.tier is still "
                f"'{tier2}', expected 'free'. The customer.subscription.deleted event may not be "
                f"reaching the webhook, or syncSubscription()'s status handling regressed.",
            )
    except Exception as e:  # noqa: BLE001
        outcome["error"] = f"{type(e).__name__}: {e}"
        add_problem("Billing health: test-mode flow raised an exception", outcome["error"])
    finally:
        try:
            if customer:
                stripe.Customer.delete(customer.id)
        except Exception:
            pass
        try:
            client.table("subscriptions").delete().eq("subscriber_id", subscriber_id).execute()
            client.table("subscribers").update({"tier": "free"}).eq("id", subscriber_id).execute()
        except Exception:
            pass

    results["testFlow"] = outcome
    if outcome["upgraded"] and outcome["downgraded"]:
        log("OK: test-mode subscribe -> webhook -> plus -> cancel -> free, full round trip verified")


# ============================================================================
# 2. Live read-only health
# ============================================================================
LIVE_PRODUCT_ID = "prod_V8RPpKPiFIxF1n"
LIVE_PRICE_MONTHLY = "price_1U8AWZPu9rinb13hy3i6k4fE"
LIVE_PRICE_ANNUAL = "price_1U8AWZPu9rinb13hX368t6KM"
LIVE_WEBHOOK_ID = "we_1U8AXQPu9rinb13hk1TBZfDG"


def check_live_health() -> None:
    key = os.environ.get("STRIPE_LIVE_RESTRICTED_KEY")
    if not key:
        log("skip: live read-only health (STRIPE_LIVE_RESTRICTED_KEY not set)")
        results["liveHealth"] = {"skipped": True}
        return

    import stripe
    stripe.api_key = key
    out = {"skipped": False, "ok": True, "checks": []}

    def check(name: str, cond: bool, detail: str) -> None:
        out["checks"].append({"name": name, "ok": cond, "detail": detail})
        if not cond:
            out["ok"] = False
            add_problem(f"Billing health: live check failed — {name}", detail)

    try:
        product = stripe.Product.retrieve(LIVE_PRODUCT_ID)
        check("product active", product.active, f"Product {LIVE_PRODUCT_ID} active={product.active}")

        monthly = stripe.Price.retrieve(LIVE_PRICE_MONTHLY)
        check("monthly price $3 CAD", monthly.unit_amount == 300 and monthly.currency == "cad",
              f"Monthly price is {monthly.unit_amount} {monthly.currency}, expected 300 cad")

        annual = stripe.Price.retrieve(LIVE_PRICE_ANNUAL)
        check("annual price $30 CAD", annual.unit_amount == 3000 and annual.currency == "cad",
              f"Annual price is {annual.unit_amount} {annual.currency}, expected 3000 cad")

        endpoint = stripe.WebhookEndpoint.retrieve(LIVE_WEBHOOK_ID)
        check("webhook enabled", endpoint.status == "enabled",
              f"Webhook {LIVE_WEBHOOK_ID} status={endpoint.status} "
              "(Stripe auto-disables an endpoint after sustained delivery failures, so this is the "
              "best signal the public API exposes — per-delivery logs aren't available outside the Dashboard)")
    except Exception as e:  # noqa: BLE001
        out["ok"] = False
        add_problem("Billing health: live check raised an exception", f"{type(e).__name__}: {e}")

    results["liveHealth"] = out
    if out["ok"]:
        log("OK: live product/price/webhook all healthy")


# ============================================================================
# 3. Plus feature gating
# ============================================================================
def check_plus_gating() -> None:
    out = {"ok": True, "checks": []}

    def check(name: str, cond: bool, detail: str) -> None:
        out["checks"].append({"name": name, "ok": cond, "detail": detail})
        if not cond:
            out["ok"] = False
            add_problem(f"Billing health: Plus gating failed — {name}", detail)

    client = db.get_client()

    plus_id = get_or_create_subscriber(PLUS_GATING_EMAIL, tier="plus")
    free_id = get_or_create_subscriber(FREE_GATING_EMAIL, tier="free")
    for sid in (plus_id, free_id):
        client.table("sessions").delete().eq("subscriber_id", sid).execute()
        client.table("scratch_favourites").delete().eq("subscriber_id", sid).execute()
    # effectiveTier() (lib/entitlements.ts) reads the `subscriptions` row's real
    # Stripe-shaped status, not the cached subscribers.tier flag — a bare tier
    # flag is not enough to actually unlock Plus gating, discovered by this
    # script's first run. Give the plus test subscriber a genuine 'active'
    # subscription row (no real Stripe object behind it — entitlements.ts never
    # calls Stripe, it only reads this table) and make sure the free subscriber
    # has none.
    client.table("subscriptions").delete().eq("subscriber_id", plus_id).execute()
    client.table("subscriptions").delete().eq("subscriber_id", free_id).execute()
    client.table("subscriptions").insert({
        "subscriber_id": plus_id,
        "stripe_subscription_id": f"sub_test_gating_{plus_id[:8]}",
        "stripe_customer_id": f"cus_test_gating_{plus_id[:8]}",
        "status": "active",
        "plan": "monthly",
        "current_period_end": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "cancel_at_period_end": False,
    }).execute()
    plus_token = create_session(plus_id)
    free_token = create_session(free_id)

    try:
        status, body, _ = http("/scratch/ontario", cookie=plus_token)
        check("plus sees Budget optimizer", status == 200 and "Budget optimizer" in body,
              f"GET /scratch/ontario with a plus session: status={status}, "
              f"'Budget optimizer' present={'Budget optimizer' in body if body else False}")

        status, body, _ = http("/scratch/ontario", cookie=free_token)
        check("free does NOT see Budget optimizer", status == 200 and "Budget optimizer" not in body,
              f"GET /scratch/ontario with a free session: status={status}, "
              f"'Budget optimizer' incorrectly present={'Budget optimizer' in body if body else False}")
        check("free sees upgrade CTA", status == 200 and "Explore Lottizen Plus" in body,
              f"GET /scratch/ontario with a free session should show the upgrade CTA; status={status}")

        # Cross-province favourite limit: plus can follow a 2nd province, free cannot.
        body1 = json.dumps({"agency": "OLG", "gameSlug": _first_favouritable_slug("ontario")}).encode()
        status, _, _ = http("/api/account/scratch-favourites", method="POST", cookie=plus_token, body=body1,
                             headers={"Content-Type": "application/json"})
        body2 = json.dumps({"agency": "BCLC", "gameSlug": _first_favouritable_slug("british-columbia")}).encode()
        status2, resp2, _ = http("/api/account/scratch-favourites", method="POST", cookie=plus_token, body=body2,
                                  headers={"Content-Type": "application/json"})
        check("plus can follow a 2nd province", status == 200 and status2 == 200,
              f"plus favourite province 1 status={status}, province 2 status={status2}, body={resp2[:200]}")

        body1f = json.dumps({"agency": "OLG", "gameSlug": _first_favouritable_slug("ontario")}).encode()
        statusf, _, _ = http("/api/account/scratch-favourites", method="POST", cookie=free_token, body=body1f,
                              headers={"Content-Type": "application/json"})
        body2f = json.dumps({"agency": "BCLC", "gameSlug": _first_favouritable_slug("british-columbia")}).encode()
        status2f, resp2f, _ = http("/api/account/scratch-favourites", method="POST", cookie=free_token, body=body2f,
                                    headers={"Content-Type": "application/json"})
        check("free is blocked on a 2nd province (LIMIT_REACHED)", statusf == 200 and status2f == 403,
              f"free favourite province 1 status={statusf}, province 2 status={status2f} (expected 403), body={resp2f[:200]}")
    finally:
        for sid in (plus_id, free_id):
            client.table("sessions").delete().eq("subscriber_id", sid).execute()
            client.table("scratch_favourites").delete().eq("subscriber_id", sid).execute()
            client.table("subscriptions").delete().eq("subscriber_id", sid).execute()

    results["plusGating"] = out
    if out["ok"]:
        log("OK: Plus feature gating (budget optimizer, upgrade CTA, cross-province limit) all correct")


def _first_favouritable_slug(province: str) -> str:
    """Reads a real, currently-live game slug for `province` straight out of the
    page's own ItemList JSON-LD (/api/v1 needs a RapidAPI proxy secret this
    script doesn't have) so this never hardcodes a ticket name that can rotate
    out of the lineup."""
    _, body, _ = http(f"/scratch/{province}")
    m = re.search(rf'/scratch/{re.escape(province)}/([a-z0-9-]+)"', body or "")
    return m.group(1) if m else "unknown"


# ============================================================================
def main() -> int:
    log(f"=== billing_health.py — {results['checkedAt']} ===")
    check_test_flow()
    check_live_health()
    check_plus_gating()

    with open("billing_health_problems.json", "w") as f:
        json.dump(problems, f, indent=2)
    with open("billing_health_result.json", "w") as f:
        json.dump(results, f, indent=2)

    if problems:
        log(f"\n{len(problems)} problem(s) found — see billing_health_problems.json")
        return 1
    log("\nAll configured billing-health checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
