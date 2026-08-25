import ontarioData from "@/data/rankings/ontario.json";
import bcData from "@/data/rankings/british-columbia.json";
import westernData from "@/data/rankings/western.json";
import atlanticData from "@/data/rankings/atlantic.json";
import quebecData from "@/data/rankings/quebec.json";
import { PRICE_POINTS, PROVINCES, type Province } from "@/config/scratch";
import type { Game, Rankings } from "@/lib/types";

/**
 * Build-time data access. data/rankings/{province}.json is produced by the
 * Python pipeline (scripts/scrape_*.py -> scripts/calculate_rankings.py) and
 * read here at build time so every page is statically generated (SSG).
 */
const RANKINGS_BY_PROVINCE: Record<Province, Rankings> = {
  ontario: ontarioData as Rankings,
  "british-columbia": bcData as Rankings,
  western: westernData as Rankings,
  atlantic: atlanticData as Rankings,
  quebec: quebecData as Rankings,
};

export { PRICE_POINTS };

export function getAllProvinceSlugs(): Province[] {
  return PROVINCES.map((p) => p.slug);
}

export function getRankings(province: Province): Rankings {
  return RANKINGS_BY_PROVINCE[province];
}

/** Every province's Rankings, in the canonical PROVINCES order — for the
 * national /scratch overview page. */
export function getAllRankings(): Rankings[] {
  return PROVINCES.map((p) => RANKINGS_BY_PROVINCE[p.slug]);
}

export function getGames(province: Province): Game[] {
  return getRankings(province).games;
}

export function getGameBySlug(province: Province, slug: string): Game | undefined {
  return getRankings(province).games.find((g) => g.slug === slug);
}

export function getAllSlugs(province: Province): string[] {
  return getRankings(province).games.map((g) => g.slug);
}

/** Games at a given ticket price in one province, still ranked by value score (desc). */
export function getGamesByPrice(province: Province, price: number): Game[] {
  return getRankings(province)
    .games.filter((g) => Math.round(g.price) === price)
    .sort((a, b) => b.valueScore - a.valueScore);
}

/** Price points that actually have at least one game in this province. */
export function getActivePricePoints(province: Province): number[] {
  const present = new Set(getRankings(province).games.map((g) => Math.round(g.price)));
  return PRICE_POINTS.filter((p) => present.has(p));
}

export function getTopPick(province: Province): Game {
  return getRankings(province).games[0];
}

/** Related games for a detail page: same price first, then next best value —
 * always within the same province (prize-tier data isn't comparable across
 * scoring methods). */
export function getRelatedGames(province: Province, slug: string, limit = 4): Game[] {
  const games = getRankings(province).games;
  const game = games.find((g) => g.slug === slug);
  if (!game) return [];
  const samePrice = games.filter(
    (g) => g.slug !== slug && Math.round(g.price) === Math.round(game.price),
  );
  const rest = games.filter(
    (g) => g.slug !== slug && Math.round(g.price) !== Math.round(game.price),
  );
  return [...samePrice, ...rest].slice(0, limit);
}
