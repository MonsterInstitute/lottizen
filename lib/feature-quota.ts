/**
 * Monthly free-run quota for Plus features that free users get a taste of.
 *
 * Product rule: a free subscriber gets ONE full run per calendar month of each
 * metered feature, then sees the upgrade prompt. Deliberately not zero —
 * the generator pages rank in search on snippets that mention stats-weighted
 * picks, so a visitor arriving from Google has to be able to actually use the
 * thing once rather than hit a wall on a promise the page just made.
 *
 * Enforced here, server-side, because the client cannot be trusted with a
 * quota: number generation used to run entirely in the browser, where any
 * gate was cosmetic and legible straight out of the JS bundle.
 */
import { bumpFeatureUsage, getFeatureUsage, getSubscription } from "@/lib/supabase-admin";
import { effectiveTier } from "@/lib/entitlements";

export type MeteredFeature = "weighted_generator" | "backtest";

export const FREE_MONTHLY_RUNS = 1;

/** 'YYYY-MM' in America/Toronto — the timezone every other date boundary in
 *  this project uses (see email_log.sent_date). */
export function currentPeriod(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

export interface QuotaVerdict {
  allowed: boolean;
  isPlus: boolean;
  /** Runs left this month for a free user; null when unlimited (Plus). */
  runsLeft: number | null;
  period: string;
}

/** Read-only: what would happen if they ran it now. Used to render the UI
 *  state (locked / "1 free run left") without consuming anything. */
export async function checkQuota(
  subscriberId: string,
  feature: MeteredFeature,
): Promise<QuotaVerdict> {
  const period = currentPeriod();
  const subscription = await getSubscription(subscriberId);
  if (effectiveTier(subscription) === "plus") {
    return { allowed: true, isPlus: true, runsLeft: null, period };
  }
  const used = (await getFeatureUsage(subscriberId, feature, period))?.used_count ?? 0;
  const runsLeft = Math.max(0, FREE_MONTHLY_RUNS - used);
  return { allowed: runsLeft > 0, isPlus: false, runsLeft, period };
}

/**
 * Consume one run. Returns the verdict as of BEFORE consumption, so a caller
 * that gets `allowed: false` knows to refuse without having incremented.
 *
 * Not race-free in the strict sense — two simultaneous requests from the same
 * free user could each read used_count = 0. Accepted: the downside is one
 * extra free generation, and the alternative (a Postgres function or a
 * SELECT ... FOR UPDATE) is real complexity for an outcome nobody is
 * meaningfully harmed by. The unique index still guarantees exactly one row
 * per (subscriber, feature, month), so the count can never fork.
 */
export async function consumeQuota(
  subscriberId: string,
  feature: MeteredFeature,
): Promise<QuotaVerdict> {
  const verdict = await checkQuota(subscriberId, feature);
  if (verdict.isPlus || !verdict.allowed) return verdict;

  const current = await getFeatureUsage(subscriberId, feature, verdict.period);
  await bumpFeatureUsage(subscriberId, feature, verdict.period, (current?.used_count ?? 0) + 1);
  return verdict;
}
