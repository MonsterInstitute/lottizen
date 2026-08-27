/**
 * Server-side number-selection strategies.
 *
 * HONESTY CONSTRAINT (see CLAUDE.md): none of these improve the odds of
 * winning, and no copy anywhere may say they do. Lottery draws are
 * independent; weighting a pick toward historically frequent numbers does not
 * make those numbers more likely to appear next. What these strategies
 * genuinely offer is (a) a way to pick that isn't the terminal's own RNG, and
 * (b) for `avoid-dates` only, a real reduction in the chance of SPLITTING a
 * jackpot, because a large share of players choose calendar dates and so
 * cluster on 1–31.
 *
 * Lives server-side rather than in the browser because the free-tier monthly
 * quota has to be counted somewhere the user can't edit — see
 * lib/feature-quota.ts.
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

/** Per-number draw counts, newest-first draw list. */
export interface HistoryInput {
  /** number -> times drawn across the whole recorded history */
  frequency: Record<number, number>;
  /** newest-first list of past draws' main numbers */
  recent: number[][];
}

function sampleWithoutReplacement(pool: number[], weights: number[], k: number): number[] {
  const p = [...pool];
  const w = [...weights];
  const out: number[] = [];
  for (let i = 0; i < k && p.length; i++) {
    const total = w.reduce((s, x) => s + x, 0);
    let r = Math.random() * total;
    let idx = 0;
    while (idx < p.length - 1 && (r -= w[idx]) > 0) idx++;
    out.push(p[idx]);
    p.splice(idx, 1);
    w.splice(idx, 1);
  }
  return out.sort((a, b) => a - b);
}

function plainRandom(max: number, pick: number): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  return sampleWithoutReplacement(pool, pool.map(() => 1), pick);
}

/** Straight runs, all-even/all-odd, and other shapes a lot of players choose.
 *  Rejecting them doesn't improve odds — it lowers the chance of sharing. */
function looksCommon(nums: number[]): boolean {
  const s = [...nums].sort((a, b) => a - b);
  const consecutive = s.every((n, i) => i === 0 || n === s[i - 1] + 1);
  if (consecutive) return true;
  const allEven = s.every((n) => n % 2 === 0);
  const allOdd = s.every((n) => n % 2 === 1);
  if (allEven || allOdd) return true;
  const sameDecade = new Set(s.map((n) => Math.floor((n - 1) / 10))).size === 1;
  if (sameDecade) return true;
  // Arithmetic progression (5,10,15,20…) — another very common hand-picked shape.
  const gap = s[1] - s[0];
  if (s.every((n, i) => i === 0 || n - s[i - 1] === gap)) return true;
  return false;
}

export function generate(
  strategy: Strategy,
  max: number,
  pick: number,
  history: HistoryInput | null,
): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);

  switch (strategy) {
    case "quick":
      return plainRandom(max, pick);

    case "weighted": {
      if (!history) return plainRandom(max, pick);
      // +1 so a never-drawn number still has a nonzero chance of selection.
      const weights = pool.map((n) => (history.frequency[n] ?? 0) + 1);
      return sampleWithoutReplacement(pool, weights, pick);
    }

    case "hot":
    case "cold": {
      if (!history) return plainRandom(max, pick);
      const window = history.recent.slice(0, 50);
      const counts = new Map<number, number>(pool.map((n) => [n, 0]));
      for (const draw of window) for (const n of draw) counts.set(n, (counts.get(n) ?? 0) + 1);
      const ordered = [...counts.entries()].sort((a, b) =>
        strategy === "hot" ? b[1] - a[1] : a[1] - b[1],
      );
      // Draw from the leading third rather than taking the top `pick`
      // outright, so repeat runs don't return an identical set every time.
      const shortlist = ordered.slice(0, Math.max(pick * 3, Math.ceil(max / 3))).map(([n]) => n);
      return sampleWithoutReplacement(shortlist, shortlist.map(() => 1), pick);
    }

    case "avoid-popular": {
      for (let attempt = 0; attempt < 40; attempt++) {
        const candidate = plainRandom(max, pick);
        if (!looksCommon(candidate)) return candidate;
      }
      return plainRandom(max, pick); // give up rather than loop forever
    }

    case "avoid-dates": {
      // Numbers above 31 only. Falls back to the full pool for games whose
      // matrix is too small for that to be possible (e.g. a 5/35 game where
      // there aren't `pick` numbers above 31).
      const highs = pool.filter((n) => n > 31);
      if (highs.length < pick) return plainRandom(max, pick);
      return sampleWithoutReplacement(highs, highs.map(() => 1), pick);
    }
  }
}

// ============================================================================
// Backtest
// ============================================================================
export interface BacktestResult {
  drawsChecked: number;
  firstDrawDate: string;
  lastDrawDate: string;
  /** matched-count -> how many draws hit exactly that many */
  distribution: Record<number, number>;
  bestMatch: number;
  bestMatchDates: string[];
  /** Ticket price × drawsChecked, when the game's price is known. */
  totalSpent: number | null;
  currency: string;
}

/**
 * Counts how often a combination matched, across the whole recorded history.
 *
 * Deliberately reports NO dollar figure for winnings. Canadian lotto prize
 * tiers below the fixed low tiers are pari-mutuel — the payout for "4 of 6"
 * depends on that draw's pool and how many others matched — and we do not
 * scrape historical prize breakdowns. Inventing a "you would have won $X"
 * would violate the project's honesty constraint (see CLAUDE.md), so the
 * result carries match counts and real spend only.
 */
export function backtest(
  numbers: number[],
  draws: { date: string; numbers: number[] }[],
  price: number | null,
  currency: string,
): BacktestResult {
  const set = new Set(numbers);
  const distribution: Record<number, number> = {};
  let bestMatch = 0;
  let bestMatchDates: string[] = [];

  for (const d of draws) {
    let matched = 0;
    for (const n of d.numbers) if (set.has(n)) matched++;
    distribution[matched] = (distribution[matched] ?? 0) + 1;
    if (matched > bestMatch) {
      bestMatch = matched;
      bestMatchDates = [d.date];
    } else if (matched === bestMatch && bestMatch > 0 && bestMatchDates.length < 5) {
      bestMatchDates.push(d.date);
    }
  }

  const dates = draws.map((d) => d.date).sort();
  return {
    drawsChecked: draws.length,
    firstDrawDate: dates[0] ?? "",
    lastDrawDate: dates[dates.length - 1] ?? "",
    distribution,
    bestMatch,
    bestMatchDates,
    totalSpent: price != null ? Math.round(price * draws.length * 100) / 100 : null,
    currency,
  };
}
