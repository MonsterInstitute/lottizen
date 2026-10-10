/**
 * DORMANT since 2026-10-09. Lottizen Plus is retired: every feature it
 * included is free for everyone, there are no tier limits, and nothing in the
 * product reads a plan's limits or feature list any more.
 *
 * What remains is only what the dormant Stripe pipeline needs to keep
 * compiling (app/api/billing/checkout, the webhook, lib/stripe.ts): the plan
 * id, the trial length, and the Stripe price IDs, which come from env vars so
 * a test price can be swapped for a live one without touching code. Nothing
 * here is rendered to users — do not reintroduce prices or feature bullets in
 * product copy from this file.
 */
export const PLANS = {
  plus: {
    id: "plus" as const,
    name: "Lottizen Plus",
    // The prices the (dormant) Stripe products were created with, CAD.
    priceMonthly: 3.0,
    priceAnnual: 30.0,
    trialDays: 7,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ID_MONTHLY || null,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_ANNUAL || null,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && (PLANS.plus.stripePriceIdMonthly || PLANS.plus.stripePriceIdAnnual),
  );
}
