/**
 * Single source of truth for Free vs Lottizen Pro — names, prices, and
 * feature lists. Every price, limit, or feature bullet shown anywhere in the
 * product (dashboard upgrade banner, scratch paywall, pricing copy, Stripe
 * checkout) should read from here, not be hand-typed in a component.
 *
 * Stripe price IDs come from env vars (set once a Stripe account/product
 * exists — see lib/stripe.ts) rather than being hardcoded, so switching
 * a test price for a live one never touches application code.
 */
export const PLANS = {
  free: {
    id: "free" as const,
    name: "Free",
    priceLabel: "Free",
    limits: {
      followedGames: 3,
      savedCombinations: 1,
    },
    features: [
      "Basic result pages",
      "Follow up to 3 games",
      "1 saved number combination",
      "Basic draw-result emails",
      "Top 3 Ontario scratch tickets",
    ],
  },
  pro: {
    id: "pro" as const,
    name: "Lottizen Pro",
    priceMonthly: 4.99,
    priceAnnual: 39.99,
    priceMonthlyLabel: "$4.99/month",
    priceAnnualLabel: "$39.99/year",
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ID_MONTHLY || null,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_ANNUAL || null,
    limits: {
      followedGames: Infinity,
      savedCombinations: Infinity,
    },
    features: [
      "Follow unlimited games",
      "Unlimited saved number combinations",
      "Automatic checking for every saved combination",
      "Personalized draw-result emails",
      "Custom alert preferences",
      "Weekly personal digest",
      "Full Ontario scratch ranking with filters",
      "Detailed prize-tier breakdowns",
      "Favourite-game tracking",
      "Ranking-change alerts",
      "Reduced advertising",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && (PLANS.pro.stripePriceIdMonthly || PLANS.pro.stripePriceIdAnnual),
  );
}
