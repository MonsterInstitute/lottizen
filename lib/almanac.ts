/**
 * Citable figures for /data/canada-lottery-almanac and /press, computed at
 * build time from the same data the rest of the site shows, so a quoted
 * number always matches the live pages it links to.
 *
 * Honesty rules (CLAUDE.md) shape what is and isn't here:
 *  - Scratch figures describe prize money still unclaimed, measured directly
 *    from what each agency publishes. They say nothing about the odds of any
 *    ticket winning. The site's Value Score is NOT quoted as an "expected
 *    value": it applies an assumed 62% payout rate (calculate_rankings.py),
 *    which no agency publishes per game.
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
  games: number;
  /** Games still on sale whose top prize tier has 0 remaining. */
  topPrizesGone: Game[];
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

export function scratchFacts(): { provinces: ProvinceScratchFacts[]; totalGames: number; totalTopGone: number; asOf: string } {
  const rankings = getAllRankings();
  const provinces = PROVINCES.map((p) => {
    const r = rankings.find((x) => x.province === p.slug);
    const games = r?.games ?? [];
    const topPrizesGone = games
      .filter((g) => g.topPrizesTotal !== undefined && g.topPrizesRemaining === 0)
      .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
    const facts: ProvinceScratchFacts = {
      slug: p.slug,
      label: p.label,
      agency: p.agency === "QUEBEC" ? "Loto-Québec" : p.agency, // config uses the scraper's code
      method: p.scoringMethod,
      games: games.length,
      topPrizesGone,
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
