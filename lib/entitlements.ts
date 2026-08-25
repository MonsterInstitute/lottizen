/**
 * Server-side entitlement checks. The effective tier is computed from the
 * subscription row's actual Stripe-reported status, not just the cached
 * `subscribers.tier` flag — so "cancelled but still active until period
 * end" resolves correctly even if a sync webhook is delayed.
 */
import type { SubscriptionRow } from "@/lib/supabase-admin";
import { PLANS } from "@/lib/plans";

export type Tier = "free" | "plus";

/** Effective tier right now. `subscription` is the row from `subscriptions`
 *  (null if the subscriber has never started a checkout). A trial counts
 *  as Plus (status "trialing") — the 7-day trial requires a card up front,
 *  so trialing subscribers have already committed to pay unless they cancel. */
export function effectiveTier(subscription: SubscriptionRow | null): Tier {
  if (!subscription) return "free";
  const periodEndMs = subscription.current_period_end ? new Date(subscription.current_period_end).getTime() : 0;
  const stillWithinPeriod = periodEndMs > Date.now();

  if (subscription.status === "active" || subscription.status === "trialing") return "plus";
  // Cancelled but Stripe still bills through the period end (cancel_at_period_end)
  // — access must not disappear early. Also covers a cancellation that
  // happened mid-period without cancel_at_period_end explicitly set.
  if (subscription.status === "canceled" && stillWithinPeriod) return "plus";
  // past_due / incomplete / unpaid / incomplete_expired / 'none' -> free.
  // A payment failure must never grant Plus access.
  return "free";
}

export function maxFollowedGames(tier: Tier): number {
  return tier === "plus" ? Infinity : PLANS.free.limits.followedGames;
}

export function maxSavedCombinations(tier: Tier): number {
  return tier === "plus" ? Infinity : PLANS.free.limits.savedCombinations;
}

export function isPlus(tier: Tier): boolean {
  return tier === "plus";
}

/** Free tier's weekly instant-alert cap — enforced in
 *  scripts/send_draw_emails.py (Python), documented here so the number has
 *  one home. Naturally rarely hit given the 3-game follow limit, but real
 *  and enforced, not just implied by the follow cap. */
export const FREE_WEEKLY_ALERT_LIMIT = 7;
