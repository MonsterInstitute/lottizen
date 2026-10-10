/**
 * Citable figures for /data/canada-lottery-almanac and /press, computed at
 * build time from the same data the rest of the site shows, so a quoted
 * number always matches the live pages it links to.
 *
 * Honesty rules (CLAUDE.md) shape what is and isn't here:
 *  - Scratch figures describe prize money still unclaimed, measured directly
 *    from what each agency publishes. They say nothing about the odds of any
 *    ticket winning. The site's Value Score is NOT quoted as an "expected
 *    value": it is scaled by a payout rate — OLG's published per-game rate, or
 *    an assumed 62% where an agency publishes none (calculate_rankings.py).
 *  - Share-of-prize-money comparisons only use OLG, BCLC and Loto-Québec,
 *    the three agencies that publish printed AND remaining counts. WCLC and
 *    ALC publish less, so they appear only in the measures their data
 *    supports.
 *  - Number frequencies are historical counts over a stated period. Every
 *    number has the same chance in every draw.
 */
import { gamesForCountry, type GameConfig } from "@/config/games";
import { PROVINCES } from "@/config/scratch";
import { getAllRankings } from "@/lib/data";
import { getDraws, getStats, hasData } from "@/lib/draws";
import type { Game } from "@/lib/types";

export interface ProvinceScratchFacts {
  slug: string;
  label: string;
  agency: string;
  method: string;
  /** Games on the agency's prize list — includes games that stopped selling
   *  but still have claimable prizes. Never call this "on sale". */
  games: number;
  /** Whether this agency gives a reliable on-sale signal (its catalog). */
  onSaleKnown: boolean;
  /** Games in the agency's current catalog (only when onSaleKnown). */
  onSale: number;
  /** Listed games whose top prize tier has 0 remaining (on sale or not). */
  topPrizesGone: Game[];
  /** Of those, the ones still on sale (only meaningful when onSaleKnown). */
  topPrizesGoneOnSale: Game[];
  /** Only for full-data agencies (printed + remaining for every listed tier). */
  share?: {
    medianPct: number;
    highest: { game: Game; pct: number };
    lowest: { game: Game; pct: number };
  };
}

/** Share of a game's published prize money (in the tiers the agency lists) still unclaimed. */
export function unclaimedSharePct(g: Game): number | null {
  if (!g.printedPrizePool || g.printedPrizePool <= 0 || g.remainingPrizePool == null) return null;
  return Math.round((g.remainingPrizePool / g.printedPrizePool) * 1000) / 10;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

export function scratchFacts(): {
  provinces: ProvinceScratchFacts[];
  totalGames: number;
  totalTopGone: number;
  /** On-sale figures, over the agencies with a reliable on-sale signal only. */
  onSaleAgencies: string[];
  totalOnSale: number;
  totalTopGoneOnSale: number;
  asOf: string;
} {
  const rankings = getAllRankings();
  const provinces = PROVINCES.map((p) => {
    const r = rankings.find((x) => x.province === p.slug);
    const games = r?.games ?? [];
    const topPrizesGone = games
      .filter((g) => g.topPrizesTotal !== undefined && g.topPrizesRemaining === 0)
      .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
    const onSaleKnown = games.some((g) => g.onSale === true || g.onSale === false);
    const facts: ProvinceScratchFacts = {
      slug: p.slug,
      label: p.label,
      agency: p.agency === "QUEBEC" ? "Loto-Québec" : p.agency, // config uses the scraper's code
      method: p.scoringMethod,
      games: games.length,
      onSaleKnown,
      onSale: games.filter((g) => g.onSale === true).length,
      topPrizesGone,
      topPrizesGoneOnSale: topPrizesGone.filter((g) => g.onSale === true),
    };
    if (p.scoringMethod === "retention") {
      const withShare = games
        .map((g) => ({ game: g, pct: unclaimedSharePct(g) }))
        .filter((x): x is { game: Game; pct: number } => x.pct !== null);
      if (withShare.length) {
        const sorted = [...withShare].sort((a, b) => b.pct - a.pct);
        facts.share = { medianPct: median(withShare.map((x) => x.pct)), highest: sorted[0], lowest: sorted.at(-1)! };
      }
    }
    return facts;
  });
  const asOf = rankings.map((r) => r.generatedAt).sort().at(-1) ?? "";
  return {
    provinces,
    totalGames: provinces.reduce((s, p) => s + p.games, 0),
    totalTopGone: provinces.reduce((s, p) => s + p.topPrizesGone.length, 0),
    onSaleAgencies: provinces.filter((p) => p.onSaleKnown).map((p) => p.agency),
    totalOnSale: provinces.reduce((s, p) => s + (p.onSaleKnown ? p.onSale : 0), 0),
    totalTopGoneOnSale: provinces.reduce((s, p) => s + (p.onSaleKnown ? p.topPrizesGoneOnSale.length : 0), 0),
    asOf,
  };
}

export interface DrawGameFacts {
  game: GameConfig;
  archiveSince: string | null;
  archiveDraws: number;
  /** Frequency period: the game's current rules (matrix) only. */
  statsFrom: string;
  statsDraws: number;
  most: { numbers: number[]; count: number };
  least: { numbers: number[]; count: number };
  /** Numbers that joined the pool partway through the period (Lotto Max 51/52),
   * left out of most/least because they've had fewer draws to appear in. */
  excluded?: { numbers: number[]; since: string };
}

function extremes(list: { n: number; count: number }[], pick: "max" | "min") {
  if (!list.length) return { numbers: [], count: 0 };
  const target = pick === "max" ? Math.max(...list.map((x) => x.count)) : Math.min(...list.map((x) => x.count));
  return { numbers: list.filter((x) => x.count === target).map((x) => x.n).sort((a, b) => a - b), count: target };
}

export function drawGameFacts(country: "CA" | "US" | "EU" = "CA"): DrawGameFacts[] {
  return gamesForCountry(country)
    .filter((g) => g.live && hasData(g.slug) && g.format === "lotto")
    .flatMap((g) => {
      const stats = getStats(g.slug);
      const draws = getDraws(g.slug);
      if (!stats) return [];
      // frequencyChart has every number in the matrix (including never-drawn
      // ones at 0), unlike the top-10 mostFrequent / leastFrequent lists.
      const added = new Set(stats.poolAdded?.numbers ?? []);
      const chart = stats.aggregate.frequencyChart.filter((x) => !added.has(x.n));
      return [{
        game: g,
        archiveSince: draws?.dataSince ?? null,
        archiveDraws: draws?.drawCount ?? 0,
        statsFrom: stats.statsFrom ?? stats.dataSince ?? "",
        statsDraws: stats.drawCount,
        most: extremes(chart, "max"),
        least: extremes(chart, "min"),
        excluded: stats.poolAdded ? { numbers: stats.poolAdded.numbers, since: stats.poolAdded.since } : undefined,
      }];
    })
    .sort((a, b) => (a.archiveSince ?? "9999").localeCompare(b.archiveSince ?? "9999"));
}

export interface PriceComparison {
  province: string;
  label: string;
  agency: string;
  /** $20 vs $5 tickets on sale: median published payout rate and median share
   *  of printed prize money still unclaimed. Only where the agency publishes a
   *  payout rate per game and prints full prize counts. */
  rows: { price: number; games: number; medianPayout: number; medianShareLeft: number }[];
}

/** The "$20 vs four $5" comparison, per agency where the data supports it. */
export function priceComparisons(): PriceComparison[] {
  const out: PriceComparison[] = [];
  for (const p of PROVINCES) {
    const games = (getAllRankings().find((r) => r.province === p.slug)?.games ?? []).filter((g) => g.onSale === true);
    const rows = [20, 5].map((price) => {
      const gs = games.filter((g) => g.price === price);
      const pays = gs.map((g) => g.publishedPayoutPct).filter((x): x is number => x != null);
      const shares = gs.map(unclaimedSharePct).filter((x): x is number => x != null);
      return { price, games: gs.length, medianPayout: pays.length >= 3 ? median(pays) : NaN, medianShareLeft: shares.length >= 3 ? median(shares) : NaN };
    });
    if (rows.every((r) => Number.isFinite(r.medianPayout) && Number.isFinite(r.medianShareLeft))) {
      out.push({ province: p.slug, label: p.label, agency: p.agency === "QUEBEC" ? "Loto-Québec" : p.agency, rows });
    }
  }
  return out;
}
