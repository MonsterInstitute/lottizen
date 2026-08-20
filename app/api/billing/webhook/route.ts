import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { findSubscriberByStripeCustomerId, setSubscriberTier, upsertSubscriptionByStripeId } from "@/lib/supabase-admin";

/**
 * POST /api/billing/webhook — Stripe subscription lifecycle events. Returns
 * 501 immediately if STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET aren't set
 * (nothing to verify against). Every event is signature-verified before any
 * processing — see stripe-best-practices' webhook security section.
 *
 * Tier logic: Stripe only reports a subscription as anything other than
 * 'active'/'trialing' once billing has actually stopped — a
 * cancel_at_period_end cancellation stays 'active' (with that flag set)
 * until the paid period genuinely ends, then flips to 'canceled'. So a
 * simple "active/trialing -> pro, anything else -> free" is correct here;
 * lib/entitlements.ts's effectiveTier() adds a defensive extra check
 * (current_period_end) for the rare case a webhook is delayed. A payment
 * failure (past_due/unpaid/incomplete) always resolves to 'free' — never
 * grants Pro.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Billing not configured." }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    console.error("[billing/webhook] signature verification failed:", e);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriberId = (session.metadata?.subscriber_id || session.client_reference_id) ?? undefined;
        if (subscriberId && session.subscription && session.customer) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await syncSubscription(sub, subscriberId, session.customer as string);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const subscriberId = sub.metadata?.subscriber_id;
        const resolvedId = subscriberId || (await findSubscriberByStripeCustomerId(sub.customer as string))?.id;
        if (resolvedId) await syncSubscription(sub, resolvedId, sub.customer as string);
        break;
      }
      default:
        break; // other event types (invoices, payment methods, ...) not needed yet
    }
  } catch (e) {
    console.error("[billing/webhook] handler error:", e);
    return NextResponse.json({ error: "Webhook handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function syncSubscription(sub: Stripe.Subscription, subscriberId: string, customerId: string) {
  const periodEndSec = sub.items.data[0]?.current_period_end;
  await upsertSubscriptionByStripeId(sub.id, {
    subscriber_id: subscriberId,
    stripe_customer_id: customerId,
    status: sub.status,
    plan: sub.items.data[0]?.price.recurring?.interval === "year" ? "annual" : "monthly",
    current_period_end: periodEndSec ? new Date(periodEndSec * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  });
  const tier = sub.status === "active" || sub.status === "trialing" ? "pro" : "free";
  await setSubscriberTier(subscriberId, tier);
}
