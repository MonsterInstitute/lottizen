/**
 * Single source of truth for Free vs Lottizen Plus — names, prices, and
 * feature lists. Every price, limit, or feature bullet shown anywhere in the
 * product (dashboard upgrade banner, scratch paywall, pricing copy, Stripe
 * checkout) should read from here, not be hand-typed in a component.
 *
 * "Plus" was the tier's original planned name (see the reserved-but-unused
 * `subscribers.tier` comment in supabase/migrations/0004_subscribers.sql,
 * predating this build) — this file replaces an earlier "Lottizen Pro"
 * naming/pricing pass with the actual product: Canada's scratch-ticket
 * intelligence layer, $3/mo or $30/yr CAD, one tier only.
 *
 * Stripe price IDs come from env vars (set once the Stripe product/prices
 * exist — see lib/stripe.ts) rather than being hardcoded, so switching a
 * test price for a live one never touches application code.
 */
export const PLANS = {
  free: {
    id: "free" as const,
    name: "Free",
    priceLabel: "Free",
    limits: {
      // Free scratch-favouriting is locked to one province (see
      // lib/supabase-admin.ts's addScratchFavourite — the FIRST favourite
      // a free subscriber saves establishes their locked province; later
      // attempts in a different province are blocked with an upgrade
      // prompt, since there's no separate "home province" field to ask
      // for at signup).
      followedGames: 3,
      savedCombinations: 1,
      // Ticket wallet: one at a time, so the whole loop (log it, watch it get
      // checked, see the countdown) is genuinely usable before paying.
      wallettickets: 1,
    },
    features: [
      "Value Score rankings for all 5 provinces",
      "Full prize-tier detail & remaining counts",
      "Follow scratch tickets in your home province",
      "1 saved number combination",
      "Basic draw-result emails",
    ],
  },
  plus: {
    id: "plus" as const,
    name: "Lottizen Plus",
    priceMonthly: 3.0,
    priceAnnual: 30.0,
    priceMonthlyLabel: "$3.00 CAD/month",
    priceAnnualLabel: "$30.00 CAD/year",
    annualSavingsLabel: "Save 17%",
    trialDays: 7,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ID_MONTHLY || null,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_ANNUAL || null,
    limits: {
      followedGames: Infinity,
      savedCombinations: Infinity,
      wallettickets: Infinity,
    },
    features: [
      "Follow scratch tickets across all 5 provinces (428 games)",
      "“Top prize claimed” alerts for tickets you follow",
      "New-ticket-launch alerts (freshest prize pools first)",
      "Ranking-drop alerts for tickets you follow",
      "Estimated remaining tickets & real expected value per dollar",
      "Budget optimizer — best combination for what you're spending",
      "Goal-mode rankings: Best Overall, Jackpot Hunt, Mid Prize, Breakeven",
      "Launch-vs-now odds comparison, per ticket",
      "Unlimited saved number combinations, all 19 draw games",
      "Automatic checking for every saved combination",
      "Personalized draw-result emails",
      "Reduced advertising",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && (PLANS.plus.stripePriceIdMonthly || PLANS.plus.stripePriceIdAnnual),
  );
}
