import latestJson from "@/data/draws/_latest.json";
import lottoMaxDraws from "@/data/draws/lotto-max.json";
import lotto649Draws from "@/data/draws/lotto-6-49.json";
import ontario49Draws from "@/data/draws/ontario-49.json";
import dailyGrandDraws from "@/data/draws/daily-grand.json";
import westernMaxDraws from "@/data/draws/western-max.json";
import western649Draws from "@/data/draws/western-6-49.json";
import lottoMaxStats from "@/data/stats/lotto-max.json";
import lotto649Stats from "@/data/stats/lotto-6-49.json";
import ontario49Stats from "@/data/stats/ontario-49.json";
import dailyGrandStats from "@/data/stats/daily-grand.json";
import westernMaxStats from "@/data/stats/western-max.json";
import western649Stats from "@/data/stats/western-6-49.json";
import { LIVE_GAMES, getLiveGame } from "@/config/games";

export interface Draw {
  date: string;
  numbers: number[];
  bonus: number | null;
  jackpot: number | null;
}
export interface DrawsFile {
  game: string;
  dataSince: string | null;
  drawCount: number;
  nextDraw: string | null;
  nextJackpot: number | null;
  generatedAt: string;
  draws: Draw[];
}
export interface Partner {
  n: number;
  count: number;
}
export interface NumberStat {
  n: number;
  count: number;
  frequency: number;
  lastDate: string | null;
  drawsAgo: number;
  currentGap: number;
  maxGap: number;
  hot: boolean;
  cold: boolean;
  partners: Partner[];
}
export interface Aggregate {
  hot: number[];
  cold: number[];
  mostFrequent: Partner[];
  leastFrequent: Partner[];
  oddEven: { avgOdd: number; avgEven: number; dist: { odd: number; count: number }[] };
  highLow: { avgLow: number; avgHigh: number };
  sum: { avg: number; min: number; max: number; buckets: { range: string; count: number }[] };
  consecutive: { drawsWith: number; pct: number };
  topPairs: { a: number; b: number; count: number }[];
  frequencyChart: { n: number; count: number }[];
}
export interface StatsFile {
  game: string;
  dataSince: string | null;
  drawCount: number;
  pick: number;
  max: number;
  generatedAt: string;
  numbers: NumberStat[];
  aggregate: Aggregate;
}
export interface LatestGame {
  slug: string;
  latestDate: string;
  numbers: number[];
  bonus: number | null;
  nextDraw: string | null;
  nextJackpot: number | null;
  drawCount: number;
  dataSince: string | null;
}

const DRAWS: Record<string, DrawsFile> = {
  "lotto-max": lottoMaxDraws as DrawsFile,
  "lotto-6-49": lotto649Draws as DrawsFile,
  "ontario-49": ontario49Draws as DrawsFile,
  "daily-grand": dailyGrandDraws as DrawsFile,
  "western-max": westernMaxDraws as DrawsFile,
  "western-6-49": western649Draws as DrawsFile,
};
const STATS: Record<string, StatsFile> = {
  "lotto-max": lottoMaxStats as StatsFile,
  "lotto-6-49": lotto649Stats as StatsFile,
  "ontario-49": ontario49Stats as StatsFile,
  "daily-grand": dailyGrandStats as StatsFile,
  "western-max": westernMaxStats as StatsFile,
  "western-6-49": western649Stats as StatsFile,
};

export function getDraws(slug: string): DrawsFile | undefined {
  return DRAWS[slug];
}
export function getStats(slug: string): StatsFile | undefined {
  return STATS[slug];
}
export function getNumberStat(slug: string, n: number): NumberStat | undefined {
  return STATS[slug]?.numbers.find((x) => x.n === n);
}
export function getLatestAll(): LatestGame[] {
  return (latestJson as { games: LatestGame[] }).games;
}
export function getLatestGeneratedAt(): string {
  return (latestJson as { generatedAt: string }).generatedAt;
}

/** Live game slugs that actually have a stats file with draws. */
export function getPlayableSlugs(): string[] {
  return LIVE_GAMES.filter((g) => (STATS[g.slug]?.drawCount ?? 0) > 0).map((g) => g.slug);
}

/** Years present in a game's history (desc), for /results/[year]. */
export function getResultYears(slug: string): number[] {
  const d = DRAWS[slug];
  if (!d) return [];
  const years = new Set(d.draws.map((x) => Number(x.date.slice(0, 4))));
  return [...years].sort((a, b) => b - a);
}

export function getDrawsByYear(slug: string, year: number): Draw[] {
  return getDraws(slug)?.draws.filter((d) => d.date.startsWith(String(year))) ?? [];
}

/** Combine registry config + latest data for a live game. */
export function liveGameCard(slug: string) {
  const cfg = getLiveGame(slug);
  const latest = getLatestAll().find((g) => g.slug === slug);
  const stats = STATS[slug];
  return cfg && stats ? { cfg, latest, stats } : undefined;
}
