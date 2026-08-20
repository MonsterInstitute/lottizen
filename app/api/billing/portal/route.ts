import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { absUrl } from "@/lib/site";
import { getSubscription } from "@/lib/supabase-admin";

/** POST /api/billing/portal — Stripe's hosted Customer Portal for
 *  self-service upgrade/downgrade/cancel/payment-method updates, per
 *  Stripe's recommended pairing for subscription management. */
export async function POST() {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ ok: false, error: "Billing isn't configured yet." }, { status: 501 });

  const subscription = await getSubscription(subscriber.id);
  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ ok: false, error: "No billing account on file yet." }, { status: 404 });
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: absUrl("/dashboard"),
    });
    return NextResponse.json({ ok: true, url: portal.url });
  } catch (e) {
    console.error("[billing/portal] error:", e);
    return NextResponse.json({ ok: false, error: "Couldn't open billing portal. Try again shortly." }, { status: 500 });
  }
}
