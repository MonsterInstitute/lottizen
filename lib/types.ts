/**
 * Data contracts shared between the Python data pipeline
 * (scripts/calculate_rankings.py -> data/rankings.json) and the
 * Next.js build. Keep these in sync with calculate_rankings.py.
 */

export interface PrizeTier {
  /** Prize amount in CAD. Top-tier "for life" prizes use their lump-sum equivalent. */
  amount: number;
  /** Human label, e.g. "$2,500/WK FOR LIFE" or "$1,000,000". */
  label: string;
  /** Prizes at this tier when the game was printed. */
  total: number;
  /** Prizes still unclaimed at scrape time. */
  remaining: number;
  /** True for the game's headline (top) prize tier. */
  isTop?: boolean;
}

export interface Game {
  slug: string;
  name: string;
  gameNumber: string;
  price: number;
  prizeTiers: PrizeTier[];

  // ---- derived by calculate_rankings.py ----
  /** Label of the top (highest-value) prize tier, e.g. "$1,000/WK FOR LIFE". */
  topPrizeLabel: string;
  /** Dollar value of the top prize (lump-sum equivalent for "for life"). */
  topPrizeAmount: number;
  /** Top-tier prizes printed / still unclaimed. */
  topPrizesTotal: number;
  topPrizesRemaining: number;
  /** Number of prize tiers OLG lists for this game. */
  prizeTierCount: number;
  /** Σ (remaining × amount) across valued tiers, CAD. */
  remainingPrizePool: number;
  /** Σ (total × amount) across valued tiers, CAD (launch pool). */
  printedPrizePool: number;
  /** (remaining_pool/printed_pool) ÷ (count_remaining/count_total); >1 = good value left. */
  valueRetention: number;
  /**
   * Value Score = NOMINAL_RTP × valueRetention × 100. Higher = more prize
   * value still on the table per dollar. See /methodology.
   */
  valueScore: number;
  rank: number;
  scrapedAt: string;
}

export interface Rankings {
  generatedAt: string;
  /** "olg-live" once the scraper has run against olg.ca; "sample" for seeded demo data. */
  source: "olg-live" | "sample";
  currency: "CAD";
  province: "ON";
  gameCount: number;
  games: Game[];
}
