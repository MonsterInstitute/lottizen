/**
 * Stripe client. Returns null when STRIPE_SECRET_KEY isn't set — every
 * caller must check for that and respond with a clear "not configured yet"
 * message (501), never fabricate a successful checkout. See
 * docs/rapidapi-style setup notes in the final report for the env vars this
 * needs before it does anything.
 *
 * Per Stripe's own security guidance, prefer a restricted API key (`rk_...`)
 * with only the Checkout/Billing/Webhook permissions this app actually
 * needs over a full secret key (`sk_...`).
 */
import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) {
    cached = new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
  }
  return cached;
}
