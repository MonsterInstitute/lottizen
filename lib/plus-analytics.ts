/**
 * Lottizen Plus's derived-analytics formulas: estimated remaining value,
 * goal-mode rankings, the budget optimizer, and launch-vs-now odds.
 *
 * HONESTY CONSTRAINT (same principle as the 3 province scoring methods —
 * see /methodology): none of these invent a number the underlying data
 * can't support. In particular, a literal "N tickets remain" count would
 * require knowing each game's total printed ticket count, which NO
 * Canadian scratch agency publishes — only per-tier PRIZE counts. So:
 *
 *   - "estimated remaining value" is the retention formula's own
 *     count_remaining/count_total fraction, reframed as a % of the print
 *     run still in circulation (a real, defensible proxy — not a ticket
 *     count), plus the existing valueScore's cents-per-dollar reading.
 *     Only meaningful where scoringMethod === "retention" (OLG/BCLC/
 *     Quebec) — WCLC/ALC report unsupported, honestly, same as the
 *     methodology page already does for those two.
 *   - "launch vs now odds" needs a REAL published overall-odds figure
 *     (Game.launchOddsN, "1 in N" of winning ANY prize). Currently only
 *     ALC's adapter scrapes this (from its catalog's chanceOfWinning
 *     field) — OLG/BCLC/Quebec's feeds don't include it, so this is
 *     unsupported there too, until a future adapter pass adds it.
 */
import type { Game } from "@/lib/types";

export interface RemainingValueEstimate {
  supported: boolean;
  reason?: string;
  /** % of this game's total prize pool (by head-count) still unclaimed. */
  pctRemaining?: number;
  /** Expected prize value remaining, in cents per $1 spent. */
  evPerDollarCents?: number;
}

export function estimateRemainingValue(g: Game): RemainingValueEstimate {
  if (g.scoringMethod === "remaining_value_index") {
    return {
      supported: false,
      reason: "WCLC never publishes a printed total for any tier, so there's no baseline to estimate a remaining fraction against.",
    };
  }
  if (g.scoringMethod === "top_prize_fraction") {
    return {
      supported: false,
      reason: "ALC only discloses counts for the top prize tier, not the full prize table, so a whole-game remaining estimate isn't supported.",
    };
  }
  const scored = g.prizeTiers.filter((t) => t.amount > 0 && t.total > 0);
  const countTotal = scored.reduce((s, t) => s + t.total, 0);
  const countRemaining = scored.reduce((s, t) => s + t.remaining, 0);
  if (countTotal <= 0) return { supported: false, reason: "No valued prize tiers to estimate from." };
  return {
    supported: true,
    pctRemaining: Math.round((countRemaining / countTotal) * 1000) / 10,
    evPerDollarCents: Math.round(g.valueScore),
  };
}

export interface OddsComparison {
  supported: boolean;
  reason?: string;
  launchOddsN?: number;
  /** Estimated current odds of winning ANY prize, "1 in N", scaled by how
   * depleted the disclosed prize pool is relative to launch. Only as
   * precise as the launch odds input and the remaining-fraction estimate
   * above — presented as an estimate, not a guarantee. */
  nowOddsN?: number;
}

export function launchVsNowOdds(g: Game): OddsComparison {
  if (!g.launchOddsN || g.launchOddsN <= 0) {
    return {
      supported: false,
      reason: `${g.agency} doesn't publish this game's launch odds in its public feed, so there's nothing to compare against.`,
    };
  }
  const est = estimateRemainingValue(g);
  if (!est.supported || !est.pctRemaining) {
    // ALC is the one agency with real launchOddsN today, and it's also
    // the top-tier-only province — still show launch odds alone even
    // though the "now" side can't be estimated from top-tier data alone.
    return { supported: true, launchOddsN: g.launchOddsN };
  }
  const fraction = est.pctRemaining / 100;
  return {
    supported: true,
    launchOddsN: g.launchOddsN,
    nowOddsN: fraction > 0 ? Math.round((g.launchOddsN / fraction) * 10) / 10 : undefined,
  };
}

export type GoalMode = "overall" | "jackpot" | "mid" | "breakeven";

export const GOAL_MODES: { id: GoalMode; label: string; blurb: string }[] = [
  { id: "overall", label: "Best Overall", blurb: "Highest Value Score — the default ranking." },
  { id: "jackpot", label: "Jackpot Hunt", blurb: "Most top-prize money still unclaimed." },
  { id: "mid", label: "Mid Prize", blurb: "Most $500–$10,000 prizes still unclaimed." },
  { id: "breakeven", label: "Breakeven", blurb: "Most low-tier \"win your money back\" prizes still unclaimed, relative to ticket price." },
];

function jackpotScore(g: Game): number {
  return g.topPrizeAmount * g.topPrizesRemaining;
}

function midPrizeScore(g: Game): number {
  return g.prizeTiers
    .filter((t) => t.amount >= 500 && t.amount <= 10000)
    .reduce((s, t) => s + t.remaining * t.amount, 0);
}

function breakevenScore(g: Game): number {
  if (g.price <= 0) return 0;
  return g.prizeTiers
    .filter((t) => t.amount >= g.price && t.amount <= g.price * 5)
    .reduce((s, t) => s + t.remaining, 0);
}

export function goalModeScore(g: Game, mode: GoalMode): number {
  switch (mode) {
    case "jackpot":
      return jackpotScore(g);
    case "mid":
      return midPrizeScore(g);
    case "breakeven":
      return breakevenScore(g);
    case "overall":
    default:
      return g.valueScore;
  }
}

export function rankByGoalMode(games: Game[], mode: GoalMode): Game[] {
  return [...games].sort((a, b) => goalModeScore(b, mode) - goalModeScore(a, mode));
}

// ---------------------------------------------------------------------------
// Budget optimizer — unbounded knapsack. For each ticket price present,
// only the single highest-valueScore game at that price can ever be worth
// including (any other game at the same price is dominated), so the
// search space collapses to one "representative" game per price point
// before the DP runs. Budget and prices are whole dollars — small integers
// in practice (union of prices across all 5 provinces tops out at $100),
// so an O(budget × distinct prices) DP is instant.
// ---------------------------------------------------------------------------
export interface OptimizerLine {
  game: Game;
  count: number;
}

export interface OptimizerResult {
  lines: OptimizerLine[];
  totalSpent: number;
  totalExpectedValue: number;
}

export function optimizeBudget(games: Game[], budget: number): OptimizerResult {
  const byPrice = new Map<number, Game>();
  for (const g of games) {
    const p = Math.round(g.price);
    if (p <= 0 || p > budget) continue;
    const existing = byPrice.get(p);
    if (!existing || g.valueScore > existing.valueScore) byPrice.set(p, g);
  }
  const items = [...byPrice.values()];
  const B = Math.max(0, Math.floor(budget));

  // dp[b] = best total expected $ value spendable with up to $b; take[b] =
  // which game the last improving step at $b used (for reconstruction).
  const dp = new Array<number>(B + 1).fill(0);
  const take = new Array<Game | null>(B + 1).fill(null);
  for (let b = 1; b <= B; b++) {
    for (const g of items) {
      const p = Math.round(g.price);
      if (p > b) continue;
      // Expected $ value of one ticket ≈ price × (valueScore / 100) — the
      // same "cents of value per dollar" reading used across the site.
      const evPerTicket = p * (g.valueScore / 100);
      const candidate = dp[b - p] + evPerTicket;
      if (candidate > dp[b] + 1e-9) {
        dp[b] = candidate;
        take[b] = g;
      }
    }
  }

  const counts = new Map<string, OptimizerLine>();
  let spent = 0;
  let b = B;
  while (b > 0) {
    const g = take[b];
    if (!g) {
      b -= 1;
      continue;
    }
    const p = Math.round(g.price);
    const key = `${g.agency}:${g.slug}`;
    const line = counts.get(key) ?? { game: g, count: 0 };
    line.count += 1;
    counts.set(key, line);
    spent += p;
    b -= p;
  }
  return {
    lines: [...counts.values()].sort((a, b2) => b2.count * b2.game.price - a.count * a.game.price),
    totalSpent: spent,
    totalExpectedValue: Math.round(dp[B] * 100) / 100,
  };
}
