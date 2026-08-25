/**
 * Data contracts shared between the Python data pipeline
 * (scripts/calculate_rankings.py -> data/rankings/{province}.json) and the
 * Next.js build. Keep these in sync with calculate_rankings.py.
 */
import type { DataCompleteness, Province, ScoringMethod } from "@/config/scratch";

export interface PrizeTier {
  /** Prize amount in CAD. Top-tier "for life" prizes use their lump-sum equivalent. */
  amount: number;
  /** Human label, e.g. "$2,500/WK FOR LIFE" or "$1,000,000". */
  label: string;
  /** Prizes at this tier when the game was printed. WCLC never publishes this
   * (stored as the sentinel 0 — never a real count; see scoringMethod). */
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
  agency: string;
  province: Province;
  price: number;
  launchDate?: string | null;
  prizeTiers: PrizeTier[];

  // ---- derived by calculate_rankings.py; meaning depends on scoringMethod ----
  /** Label of the top (highest-value) prize tier, e.g. "$1,000/WK FOR LIFE". */
  topPrizeLabel: string;
  /** Dollar value of the top prize (lump-sum equivalent for "for life"). */
  topPrizeAmount: number;
  /** Top-tier prizes printed / still unclaimed. For WCLC, topPrizesTotal is
   * always 0 (sentinel — never a real printed count). For ALC these are
   * summed across the game's disclosed top-tier row(s) only. */
  topPrizesTotal: number;
  topPrizesRemaining: number;
  /** Number of prize tiers this agency lists for this game. */
  prizeTierCount: number;
  /** Σ (remaining × amount) across valued/disclosed tiers, CAD. For ALC this
   * covers only the top tier(s), not the whole game. */
  remainingPrizePool: number;
  /** Σ (total × amount) across valued tiers, CAD (launch pool). Null for
   * WCLC — no printed totals exist to sum. */
  printedPrizePool: number | null;
  /**
   * (remaining_pool/printed_pool) ÷ (count_remaining/count_total); >1 = good
   * value left. Only meaningful when scoringMethod === "retention" — null
   * otherwise (WCLC/ALC use a different measurement entirely).
   */
  valueRetention: number | null;
  /**
   * The ranking metric — units and scale depend on scoringMethod:
   *   retention             → NOMINAL_RTP × valueRetention × 100 (≈0-150 typical)
   *   remaining_value_index → raw CAD of remaining prize value per $1 ticket
   *                           (WCLC; NOT comparable to the other two methods)
   *   top_prize_fraction    → % of top prizes still unclaimed, 0-100 (ALC)
   * Always comparable WITHIN a province; only "retention" games are
   * comparable ACROSS provinces. See /methodology.
   */
  valueScore: number;
  /** Which formula produced valueScore for this game — see /methodology. */
  scoringMethod: ScoringMethod;
  /** WCLC only: Σ remaining count across disclosed tiers (display aid, since
   * there's no printed total to pair it with). */
  countRemaining?: number;
  rank: number;
  scrapedAt: string;
}

export interface Rankings {
  generatedAt: string;
  /** "<agency>-live" once a scraper has run; "sample" for seeded demo data. */
  source: string;
  currency: "CAD";
  agency: string;
  province: Province;
  provinceLabel: string;
  scoringMethod: ScoringMethod;
  dataCompleteness: DataCompleteness;
  gameCount: number;
  games: Game[];
}
