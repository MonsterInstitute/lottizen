import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { PLANS, isBillingConfigured } from "@/lib/plans";
import { absUrl } from "@/lib/site";
import { getSubscription } from "@/lib/supabase-admin";

/**
 * POST /api/billing/checkout {plan: "monthly"|"annual"} — creates a Stripe
 * Checkout Session (mode: "subscription") and returns its URL for the
 * client to redirect to. Returns 501 (not 200 with a fake success) when
 * Stripe isn't configured — see lib/plans.ts's isBillingConfigured().
 *
 * Follows Stripe's current guidance: no `payment_method_types` (let Stripe
 * pick eligible methods dynamically), Checkout Session + Billing APIs for
 * subscriptions rather than a manual PaymentIntent/renewal loop.
 */
export async function POST(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  if (!isBillingConfigured()) {
    return NextResponse.json({ ok: false, error: "Billing isn't configured yet." }, { status: 501 });
  }
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ ok: false, error: "Billing isn't configured yet." }, { status: 501 });

  let body: { plan?: "monthly" | "annual" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const priceId = body.plan === "annual" ? PLANS.pro.stripePriceIdAnnual : PLANS.pro.stripePriceIdMonthly;
  if (!priceId) {
    return NextResponse.json({ ok: false, error: "That plan isn't available yet." }, { status: 400 });
  }

  try {
    const existing = await getSubscription(subscriber.id);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: existing?.stripe_customer_id ?? undefined,
      customer_email: existing?.stripe_customer_id ? undefined : subscriber.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: absUrl("/dashboard?upgraded=1"),
      cancel_url: absUrl("/dashboard?upgrade_cancelled=1"),
      client_reference_id: subscriber.id,
      metadata: { subscriber_id: subscriber.id },
      subscription_data: { metadata: { subscriber_id: subscriber.id } },
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    console.error("[billing/checkout] error:", e);
    return NextResponse.json({ ok: false, error: "Couldn't start checkout. Try again shortly." }, { status: 500 });
  }
}
