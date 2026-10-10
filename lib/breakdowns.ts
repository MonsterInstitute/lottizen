/**
 * data/breakdowns/<game>.json (scripts/publish_breakdowns.py): the published
 * prize breakdowns behind /news/did-anyone-win-<game> and the per-draw pages
 * /news/<game>-results-<date>. Only the six games whose operator publishes a
 * breakdown; for others "did anyone win" isn't a fact Lottizen holds.
 */
import lottoMax from "@/data/breakdowns/lotto-max.json";
import lotto649 from "@/data/breakdowns/lotto-6-49.json";
import dailyGrand from "@/data/breakdowns/daily-grand.json";
import bc49 from "@/data/breakdowns/bc-49.json";
import westernMax from "@/data/breakdowns/western-max.json";
import western649 from "@/data/breakdowns/western-6-49.json";

export interface BreakdownTier {
  code: string;
  label: string;
  winners: number | null;
  prize: number | null;
  prizeLabel: string | null;
}
export interface BreakdownDraw {
  date: string;
  numbers: number[] | null;
  bonus: number | null;
  sourceUrl: string | null;
  source: string;
  tiers: BreakdownTier[];
}
export interface GameBreakdowns {
  slug: string;
  name: string;
  generatedAt: string;
  nextDraw: string | null;
  nextJackpot: number | null;
  topWins: { date: string; winners: number }[];
  breakdownsSince: string | null;
  draws: BreakdownDraw[];
}

const ALL: GameBreakdowns[] = [lottoMax, lotto649, dailyGrand, bc49, westernMax, western649] as GameBreakdowns[];

/** Top prizes that are annuities: the breakdown's figure is a lump-sum
 *  option, so pages name the prize instead of an amount. */
export const ANNUITY_TOP: Record<string, string> = { "daily-grand": "$1,000 a day for life" };

export const DID_ANYONE_WIN_PREFIX = "did-anyone-win-";
/** Per-draw pages stay in the sitemap (and self-canonical) this long, then
 *  point their canonical at the game's evergreen "Did anyone win?" page. */
export const DRAW_PAGE_FRESH_DAYS = 30;

export function allBreakdowns(): GameBreakdowns[] {
  return ALL.filter((g) => g.draws.length > 0);
}
export function breakdownsFor(slug: string): GameBreakdowns | undefined {
  return ALL.find((g) => g.slug === slug);
}
export function drawPageSlug(game: string, date: string): string {
  return `${game}-results-${date}`;
}
export function parseDrawPageSlug(slug: string): { game: GameBreakdowns; draw: BreakdownDraw } | undefined {
  const m = slug.match(/^(.+)-results-(\d{4}-\d{2}-\d{2})$/);
  if (!m) return undefined;
  const game = breakdownsFor(m[1]);
  const draw = game?.draws.find((d) => d.date === m[2]);
  return game && draw ? { game, draw } : undefined;
}
