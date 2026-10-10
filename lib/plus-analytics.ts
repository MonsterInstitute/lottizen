/**
 * Derived scratch-ticket analytics shown on every /scratch/[province] board:
 * remaining prize money, goal-mode rankings, and the budget planner. (The
 * filename is historical — these were Lottizen Plus features until Plus was
 * retired on 2026-10-09. They are free for everyone now.)
 *
 * HONESTY CONSTRAINT (CLAUDE.md; same principle as the 3 province scoring
 * methods — see /methodology): everything here describes how much prize
 * money is still unclaimed, measured from what each agency publishes. None
 * of it is an odds figure, and none of it invents a number the data can't
 * support:
 *
 *   - No literal "N tickets remain": that needs each game's total printed
 *     ticket count, which NO Canadian scratch agency publishes — only
 *     per-tier PRIZE counts.
 *   - No odds estimates. A "1 in N now" figure would be an odds claim, so the
 *     old launch-vs-now odds comparison was removed. The launch-vs-now
 *     comparison that remains is the share of printed prize money still
 *     unclaimed today against 100% at launch.
 *   - The Value Score is never presented as "expected value" or "cents back
 *     per dollar": it is scaled by a payout rate — OLG's published per-game
 *     rate, an assumed 62% where an agency publishes none
 *     (scripts/calculate_rankings.py).
 *   - Remaining-share figures are only computed where scoringMethod ===
 *     "retention" (OLG/BCLC/Quebec, which publish printed AND remaining
 *     counts). WCLC/ALC report "unsupported", honestly, with the reason.
 */
import type { Game } from "@/lib/types";

export interface RemainingValueEstimate {
  supported: boolean;
  reason?: string;
  /** % of the printed prize money (valued tiers, by dollar amount) still
   *  unclaimed. 100% at launch by definition. */
  pctPrizeMoneyRemaining?: number;
  /** % of valued prizes (by head-count) still unclaimed. */
  pctPrizesRemaining?: number;
}

export function estimateRemainingValue(g: Game): RemainingValueEstimate {
  if (g.scoringMethod === "remaining_value_index") {
    return {
      supported: false,
      reason: "WCLC never publishes a printed total for any tier, so there's no launch baseline to compare against.",
    };
  }
  if (g.scoringMethod === "top_prize_fraction") {
    return {
      supported: false,
      reason: "ALC only discloses counts for the top prize tier, not the full prize table, so a whole-game figure isn't supported.",
    };
  }
  const scored = g.prizeTiers.filter((t) => t.amount > 0 && t.total > 0);
  const countTotal = scored.reduce((s, t) => s + t.total, 0);
  const countRemaining = scored.reduce((s, t) => s + t.remaining, 0);
  const moneyTotal = scored.reduce((s, t) => s + t.total * t.amount, 0);
  const moneyRemaining = scored.reduce((s, t) => s + t.remaining * t.amount, 0);
  if (countTotal <= 0 || moneyTotal <= 0) return { supported: false, reason: "No valued prize tiers to measure from." };
  return {
    supported: true,
    pctPrizeMoneyRemaining: Math.round((moneyRemaining / moneyTotal) * 1000) / 10,
    pctPrizesRemaining: Math.round((countRemaining / countTotal) * 1000) / 10,
  };
}

export type GoalMode = "overall" | "jackpot" | "mid" | "small";

export const GOAL_MODES: { id: GoalMode; label: string; blurb: string }[] = [
  { id: "overall", label: "Value Score", blurb: "Highest Value Score — the default ranking." },
  { id: "jackpot", label: "Top prizes", blurb: "Most top-prize money still unclaimed." },
  { id: "mid", label: "Mid prizes", blurb: "Most prize money in $500–$10,000 prizes still unclaimed." },
  { id: "small", label: "Small prizes", blurb: "Most unclaimed prizes worth 1–5× the ticket price." },
];

function jackpotScore(g: Game): number {
  return g.topPrizeAmount * g.topPrizesRemaining;
}

function midPrizeScore(g: Game): number {
  return g.prizeTiers
    .filter((t) => t.amount >= 500 && t.amount <= 10000)
    .reduce((s, t) => s + t.remaining * t.amount, 0);
}

function smallPrizeScore(g: Game): number {
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
    case "small":
      return smallPrizeScore(g);
    case "overall":
    default:
      return g.valueScore;
  }
}

export function rankByGoalMode(games: Game[], mode: GoalMode): Game[] {
  return [...games].sort((a, b) => goalModeScore(b, mode) - goalModeScore(a, mode));
}

// ---------------------------------------------------------------------------
// Budget planner — fills a spend with the highest-Value-Score tickets that
// fit, via an unbounded knapsack over score-weighted dollars. The objective
// is a RANKING device only: it is never shown to users as a dollar figure,
// because a Value Score is not an expected return (see header). For each
// ticket price present, only the single highest-valueScore game at that
// price can ever be worth including (any other game at the same price is
// dominated), so the search space collapses to one "representative" game per
// price point before the DP runs. Budget and prices are whole dollars — small integers
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

  // dp[b] = best score-weighted spend achievable with up to $b; take[b] =
  // which game the last improving step at $b used (for reconstruction).
  const dp = new Array<number>(B + 1).fill(0);
  const take = new Array<Game | null>(B + 1).fill(null);
  for (let b = 1; b <= B; b++) {
    for (const g of items) {
      const p = Math.round(g.price);
      if (p > b) continue;
      // Score-weighted dollars: price × valueScore. Internal objective only.
      const weight = p * g.valueScore;
      const candidate = dp[b - p] + weight;
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
  };
}
