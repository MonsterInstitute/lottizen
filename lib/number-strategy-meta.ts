/**
 * Client-safe strategy metadata: ids, labels, and copy only.
 *
 * Deliberately separate from lib/number-strategies.ts, which holds the actual
 * generation and backtest implementations. The generator UI is a client
 * component and needs the labels, and importing the implementation module
 * would bundle every algorithm into the browser — pointless weight, and it
 * would put back on the client exactly what was just moved off it.
 *
 * HONESTY CONSTRAINT (CLAUDE.md): no blurb here may say or imply a strategy
 * improves the odds of winning. `avoid-dates` may only claim reduced jackpot
 * SPLITTING, which is real.
 */
export type Strategy = "quick" | "weighted" | "hot" | "cold" | "avoid-popular" | "avoid-dates";

export const STRATEGIES: {
  id: Strategy;
  label: string;
  blurb: string;
  /** false = free for everyone, no quota. */
  metered: boolean;
}[] = [
  {
    id: "quick",
    label: "Quick Pick",
    blurb: "Pure random, exactly like the store terminal.",
    metered: false,
  },
  {
    id: "weighted",
    label: "Frequency-weighted",
    blurb: "Leans toward numbers drawn more often in this game's recorded history.",
    metered: true,
  },
  {
    id: "hot",
    label: "Hot numbers",
    blurb: "Built from the most-drawn numbers of the last 50 draws.",
    metered: true,
  },
  {
    id: "cold",
    label: "Cold numbers",
    blurb: "Built from the numbers absent longest from recent draws.",
    metered: true,
  },
  {
    id: "avoid-popular",
    label: "Avoid common combinations",
    blurb: "Skips patterns huge numbers of players use — straight lines, all-even, all-odd, tight runs.",
    metered: true,
  },
  {
    id: "avoid-dates",
    label: "Avoid calendar numbers",
    blurb:
      "Keeps picks above 31, outside the date range most players choose. Doesn't change your chance of winning — it means fewer people to split a jackpot with if you do.",
    metered: true,
  },
];

export function isStrategy(v: string): v is Strategy {
  return STRATEGIES.some((s) => s.id === v);
}

export function isMetered(s: Strategy): boolean {
  return STRATEGIES.find((x) => x.id === s)?.metered ?? true;
}
