import rankingsData from "@/data/rankings.json";
import type { Game, Rankings } from "@/lib/types";

/**
 * Build-time data access. rankings.json is produced by the Python pipeline
 * (scripts/scrape_olg.py -> scripts/calculate_rankings.py) and read here at
 * build time so every page is statically generated (SSG).
 */
const rankings = rankingsData as Rankings;

/** Price buckets the /price/[price] pages are generated for (OLG instant prices). */
export const PRICE_POINTS = [2, 3, 4, 5, 10, 20, 30, 50, 100] as const;

export function getRankings(): Rankings {
  return rankings;
}

export function getGames(): Game[] {
  return rankings.games;
}

export function getGameBySlug(slug: string): Game | undefined {
  return rankings.games.find((g) => g.slug === slug);
}

export function getAllSlugs(): string[] {
  return rankings.games.map((g) => g.slug);
}

/** Games at a given ticket price, still ranked by value score (desc). */
export function getGamesByPrice(price: number): Game[] {
  return rankings.games
    .filter((g) => Math.round(g.price) === price)
    .sort((a, b) => b.valueScore - a.valueScore);
}

/** Price points that actually have at least one game (for nav + static params). */
export function getActivePricePoints(): number[] {
  const present = new Set(rankings.games.map((g) => Math.round(g.price)));
  return PRICE_POINTS.filter((p) => present.has(p));
}

export function getTopPick(): Game {
  return rankings.games[0];
}

/** Related games for a detail page: same price first, then next best value. */
export function getRelatedGames(slug: string, limit = 4): Game[] {
  const game = getGameBySlug(slug);
  if (!game) return [];
  const samePrice = rankings.games.filter(
    (g) => g.slug !== slug && Math.round(g.price) === Math.round(game.price),
  );
  const rest = rankings.games.filter(
    (g) => g.slug !== slug && Math.round(g.price) !== Math.round(game.price),
  );
  return [...samePrice, ...rest].slice(0, limit);
}
