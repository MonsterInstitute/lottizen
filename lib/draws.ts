import { RAW_DRAWS, RAW_STATS } from "@/lib/game-data";
import latestJson from "@/data/draws/_latest.json";
import {
  LIVE_GAMES,
  getLiveGame,
  getGame,
  countrySlug,
  countryFromSlug,
  COUNTRIES,
  type Country,
  type GameConfig,
} from "@/config/games";

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
export interface BonusStats {
  label: string;
  max: number;
  chart: { n: number; count: number }[];
  hot: number[];
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
  bonus?: BonusStats;
}
export interface StatsFile {
  game: string;
  dataSince: string | null;
  drawCount: number;
  allTimeDrawCount: number;
  statsFrom: string | null;
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

export interface DigitStatsFile {
  game: string;
  format: "digit";
  positions: number;
  dataSince: string | null;
  drawCount: number;
  allTimeDrawCount: number;
  generatedAt: string;
  positional: { pos: number; digits: { d: number; count: number }[] }[];
  overall: { d: number; count: number }[];
  hotDigits: number[];
  topCombos: { combo: string; count: number }[];
  sum: { avg: number; min: number; max: number };
}

const DRAWS = RAW_DRAWS as Record<string, DrawsFile>;
const STATS = RAW_STATS as Record<string, StatsFile>;

export function getDraws(slug: string): DrawsFile | undefined {
  return DRAWS[slug];
}
export function getStats(slug: string): StatsFile | undefined {
  return STATS[slug];
}
export function getDigitStats(slug: string): DigitStatsFile | undefined {
  const s = RAW_STATS[slug];
  return s && s.format === "digit" ? (s as DigitStatsFile) : undefined;
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
export function hasData(slug: string): boolean {
  return (STATS[slug]?.drawCount ?? 0) > 0;
}

/** Live game slugs (optionally within a country) that have scraped data. */
export function getPlayableSlugs(country?: Country): string[] {
  return LIVE_GAMES.filter((g) => (!country || g.country === country) && hasData(g.slug)).map(
    (g) => g.slug,
  );
}

/** Resolve a game that is playable in the given country URL slug (else undefined). */
export function resolveGame(countryUrlSlug: string, gameSlug: string): GameConfig | undefined {
  const code = countryFromSlug(countryUrlSlug);
  const g = getGame(gameSlug);
  if (!code || !g || g.country !== code || !g.live || !hasData(g.slug)) return undefined;
  return g;
}

/** [{ country, game }] for every playable game — for generateStaticParams. */
export function countryGameParams(): { country: string; game: string }[] {
  const out: { country: string; game: string }[] = [];
  for (const c of COUNTRIES) for (const g of getPlayableSlugs(c.code)) out.push({ country: c.slug, game: g });
  return out;
}
export function countryGameYearParams(): { country: string; game: string; year: string }[] {
  const out: { country: string; game: string; year: string }[] = [];
  for (const { country, game } of countryGameParams())
    for (const y of getResultYears(game)) out.push({ country, game, year: String(y) });
  return out;
}
/** Playable games that use the number-pool template (excludes positional-digit games). */
export function countryGamePoolParams(): { country: string; game: string }[] {
  return countryGameParams().filter(({ game }) => getGame(game)?.format !== "digit");
}
export function countryGameNumberParams(): { country: string; game: string; n: string }[] {
  const out: { country: string; game: string; n: string }[] = [];
  for (const { country, game } of countryGamePoolParams()) {
    const s = getStats(game);
    if (!s || typeof s.max !== "number") continue;
    for (let n = 1; n <= s.max; n++) out.push({ country, game, n: String(n) });
  }
  return out;
}

export function getResultYears(slug: string): number[] {
  const d = DRAWS[slug];
  if (!d) return [];
  const years = new Set(d.draws.map((x) => Number(x.date.slice(0, 4))));
  return [...years].sort((a, b) => b - a);
}
export function getDrawsByYear(slug: string, year: number): Draw[] {
  return getDraws(slug)?.draws.filter((d) => d.date.startsWith(String(year))) ?? [];
}
export function liveGameCard(slug: string) {
  const cfg = getLiveGame(slug);
  const l = getLatestAll().find((g) => g.slug === slug);
  const stats = STATS[slug];
  return cfg && stats ? { cfg, latest: l, stats } : undefined;
}
