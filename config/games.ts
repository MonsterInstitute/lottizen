/**
 * Canadian + US draw-lottery registry — source of truth for which games exist,
 * their rules, country/region, and which are "live". A game is *shown as live*
 * only when it also has scraped data (see getPlayableSlugs in lib/draws.ts);
 * this flag marks intent.
 */

export type Country = "CA" | "US";
export type Agency =
  | "National" | "OLG" | "WCLC" | "BCLC" | "Loto-Québec" | "ALC"
  | "Multi-State" | "NY Lottery";
/** Which page set a game supports. lotto/keno get full number statistics;
 *  digit/special get overview + results + faq only. */
export type GameFormat = "lotto" | "keno" | "digit" | "special";

export interface GameConfig {
  slug: string;
  name: string;
  country: Country;
  agency: Agency;
  region: string;
  pick: number;
  max: number;
  hasBonus: boolean;
  bonusLabel?: string;
  bonusMax?: number;
  drawDays: string[];
  price: number;
  currency: "CAD" | "USD";
  blurb: string;
  format: GameFormat;
  /** Rules-matrix change date; statistics default to draws on/after it. */
  statsFrom?: string;
  sources?: { wclcSlug?: string; olgFeedName?: string; olgProductId?: string; nyDataset?: string };
  live: boolean;
}

const CA = (g: Partial<GameConfig>): GameConfig =>
  ({ country: "CA", currency: "CAD", format: "lotto", hasBonus: true, live: false, ...g } as GameConfig);
const US = (g: Partial<GameConfig>): GameConfig =>
  ({ country: "US", currency: "USD", format: "lotto", hasBonus: true, live: false, ...g } as GameConfig);

export const GAMES: GameConfig[] = [
  // ============ CANADA ============
  CA({ slug: "lotto-max", name: "Lotto Max", agency: "National", region: "Canada-wide", pick: 7, max: 50, drawDays: ["Tuesday", "Friday"], price: 5, blurb: "Canada's biggest jackpot game — pick 7 of 50, with jackpots to $70M plus Max Millions.", sources: { wclcSlug: "lotto-max-extra", olgFeedName: "LOTTO MAX", olgProductId: "LMAX" }, live: true }),
  CA({ slug: "lotto-6-49", name: "Lotto 6/49", agency: "National", region: "Canada-wide", pick: 6, max: 49, drawDays: ["Wednesday", "Saturday"], price: 3, blurb: "The classic Canadian lotto since 1982 — pick 6 of 49, with a guaranteed $1M Gold Ball prize.", sources: { wclcSlug: "lotto-649-extra", olgFeedName: "LOTTO 6/49", olgProductId: "649" }, live: true }),
  CA({ slug: "daily-grand", name: "Daily Grand", agency: "National", region: "Canada-wide", pick: 5, max: 49, bonusLabel: "Grand Number", bonusMax: 7, drawDays: ["Monday", "Thursday"], price: 3, blurb: "Win $1,000 a day for life — pick 5 of 49 plus a Grand Number.", sources: { wclcSlug: "daily-grand-extra", olgFeedName: "DAILY GRAND", olgProductId: "DLYGND" }, live: true }),
  CA({ slug: "ontario-49", name: "Ontario 49", agency: "OLG", region: "Ontario", pick: 6, max: 49, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Ontario's own $1 lotto — pick 6 of 49 for a $2 million jackpot.", sources: { olgFeedName: "ONTARIO 49", olgProductId: "ONT49" }, live: true }),
  CA({ slug: "lottario", name: "Lottario", agency: "OLG", region: "Ontario", pick: 6, max: 45, bonusLabel: "Bonus", bonusMax: 45, drawDays: ["Saturday"], price: 1, blurb: "Ontario's Saturday lotto since 1978 — pick 6 of 45.", sources: { olgFeedName: "LOTTARIO", olgProductId: "LOTT" }, live: true }),
  CA({ slug: "megadice", name: "MegaDice Lotto", agency: "OLG", region: "Ontario", pick: 6, max: 45, bonusLabel: "Bonus", bonusMax: 45, drawDays: ["Daily"], price: 1, blurb: "Ontario's daily 6-of-45 lotto.", sources: { olgFeedName: "MEGADICE LOTTO" }, live: true }),
  CA({ slug: "western-max", name: "Western Max", agency: "WCLC", region: "Western Canada", pick: 7, max: 50, drawDays: ["Tuesday", "Friday"], price: 5, blurb: "Western Canada's 7-of-50 lotto, drawn Tuesdays and Fridays.", sources: { wclcSlug: "western-max-extra" }, live: true }),
  CA({ slug: "western-6-49", name: "Western 6/49", agency: "WCLC", region: "Western Canada", pick: 6, max: 49, drawDays: ["Wednesday", "Saturday"], price: 2, blurb: "Western Canada's 6-of-49, drawn Wednesdays and Saturdays.", sources: { wclcSlug: "western-649-extra" }, live: true }),
  // registered, rollout pending (need a workable data source)
  CA({ slug: "encore", name: "Encore", agency: "OLG", region: "Ontario", pick: 7, max: 9, drawDays: ["Daily"], price: 1, hasBonus: false, format: "digit", blurb: "A 7-digit add-on to any Ontario lotto ticket." }),
  CA({ slug: "pick-2", name: "Pick 2", agency: "OLG", region: "Ontario", pick: 2, max: 9, drawDays: ["Daily"], price: 1, hasBonus: false, format: "digit", blurb: "Daily 2-digit game." }),
  CA({ slug: "pick-3", name: "Pick 3", agency: "OLG", region: "Ontario", pick: 3, max: 9, drawDays: ["Daily"], price: 1, hasBonus: false, format: "digit", blurb: "Daily 3-digit game." }),
  CA({ slug: "pick-4", name: "Pick 4", agency: "OLG", region: "Ontario", pick: 4, max: 9, drawDays: ["Daily"], price: 1, hasBonus: false, format: "digit", blurb: "Daily 4-digit game." }),
  CA({ slug: "daily-keno", name: "Daily Keno", agency: "OLG", region: "Ontario", pick: 20, max: 70, drawDays: ["Daily"], price: 1, hasBonus: false, format: "keno", blurb: "Pick up to 10; 20 of 70 drawn." }),
  CA({ slug: "poker-lotto", name: "Poker Lotto", agency: "OLG", region: "Ontario", pick: 5, max: 52, drawDays: ["Daily"], price: 2, hasBonus: false, format: "special", blurb: "A 5-card poker draw." }),
  CA({ slug: "bc-49", name: "BC/49", agency: "BCLC", region: "British Columbia", pick: 6, max: 49, bonusLabel: "Bonus", bonusMax: 49, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "British Columbia's 6-of-49.", live: true }),
  CA({ slug: "quebec-max", name: "Québec Max", agency: "Loto-Québec", region: "Québec", pick: 7, max: 50, drawDays: ["Tuesday", "Friday"], price: 5, blurb: "Québec's 7-of-50 lotto." }),
  CA({ slug: "quebec-49", name: "Québec 49", agency: "Loto-Québec", region: "Québec", pick: 6, max: 49, bonusLabel: "Bonus", bonusMax: 49, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Québec's 6-of-49." }),
  CA({ slug: "grande-vie", name: "La Grande Vie", agency: "Loto-Québec", region: "Québec", pick: 5, max: 49, bonusLabel: "Grand Number", bonusMax: 7, drawDays: ["Monday", "Thursday"], price: 3, blurb: "$1,000 a day for life, Québec edition." }),
  CA({ slug: "atlantic-49", name: "Atlantic 49", agency: "ALC", region: "Atlantic Canada", pick: 6, max: 49, bonusLabel: "Bonus", bonusMax: 49, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Atlantic Canada's 6-of-49." }),
  CA({ slug: "bucko", name: "Bucko", agency: "ALC", region: "Atlantic Canada", pick: 5, max: 41, hasBonus: false, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Atlantic Canada's 5-of-41." }),

  // ============ USA ============
  US({ slug: "powerball", name: "Powerball", agency: "Multi-State", region: "Multi-state (45 jurisdictions)", pick: 5, max: 69, bonusLabel: "Powerball", bonusMax: 26, drawDays: ["Monday", "Wednesday", "Saturday"], price: 2, statsFrom: "2015-10-07", blurb: "America's biggest multi-state jackpot — pick 5 of 69 plus a Powerball of 26.", sources: { nyDataset: "d6yy-54nr" }, live: true }),
  US({ slug: "mega-millions", name: "Mega Millions", agency: "Multi-State", region: "Multi-state (45 jurisdictions)", pick: 5, max: 70, bonusLabel: "Mega Ball", bonusMax: 25, drawDays: ["Tuesday", "Friday"], price: 2, statsFrom: "2017-10-31", blurb: "The other US mega-jackpot — pick 5 of 70 plus a Mega Ball of 25.", sources: { nyDataset: "5xaw-6ayf" }, live: true }),
  US({ slug: "cash4life", name: "Cash4Life", agency: "Multi-State", region: "Multi-state (Northeast)", pick: 5, max: 60, bonusLabel: "Cash Ball", bonusMax: 4, drawDays: ["Daily"], price: 2, blurb: "$1,000 a day for life — pick 5 of 60 plus a Cash Ball of 4.", sources: { nyDataset: "kwxv-fwze" }, live: true }),
  US({ slug: "new-york-lotto", name: "New York Lotto", agency: "NY Lottery", region: "New York", pick: 6, max: 59, bonusLabel: "Bonus", bonusMax: 59, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "New York's flagship 6-of-59 lotto.", sources: { nyDataset: "6nbc-h7bj" }, live: true }),
  US({ slug: "take-5", name: "Take 5", agency: "NY Lottery", region: "New York", pick: 5, max: 39, hasBonus: false, drawDays: ["Daily"], price: 1, blurb: "New York's daily 5-of-39 — evening draw.", sources: { nyDataset: "dg63-4siq" }, live: true }),
  US({ slug: "pick-10", name: "Pick 10", agency: "NY Lottery", region: "New York", pick: 20, max: 80, hasBonus: false, drawDays: ["Daily"], price: 1, format: "keno", blurb: "New York's daily keno — 20 of 80 drawn, match 10.", sources: { nyDataset: "bycu-cw7c" }, live: true }),
  US({ slug: "numbers", name: "Numbers", agency: "NY Lottery", region: "New York", pick: 3, max: 9, hasBonus: false, drawDays: ["Daily"], price: 0.5, format: "digit", blurb: "New York's daily 3-digit game — pick a 3-digit number, straight or boxed.", sources: { nyDataset: "hsys-3def" }, live: true }),
  US({ slug: "win-4", name: "Win 4", agency: "NY Lottery", region: "New York", pick: 4, max: 9, hasBonus: false, drawDays: ["Daily"], price: 0.5, format: "digit", blurb: "New York's daily 4-digit game — pick a 4-digit number, straight or boxed.", sources: { nyDataset: "hsys-3def" }, live: true }),
];

export const COUNTRIES: { code: Country; slug: string; name: string }[] = [
  { code: "CA", slug: "canada", name: "Canada" },
  { code: "US", slug: "usa", name: "United States" },
];

export function countrySlug(code: Country): string {
  return code === "US" ? "usa" : "canada";
}
export function countryFromSlug(slug: string): Country | undefined {
  return COUNTRIES.find((c) => c.slug === slug)?.code;
}
export function countryName(code: Country): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? "";
}
export function gamePath(g: GameConfig): string {
  return `/${countrySlug(g.country)}/${g.slug}`;
}

export const LIVE_GAMES = GAMES.filter((g) => g.live);
export function getGame(slug: string): GameConfig | undefined {
  return GAMES.find((g) => g.slug === slug);
}
export function getLiveGame(slug: string): GameConfig | undefined {
  return LIVE_GAMES.find((g) => g.slug === slug);
}
export function gamesForCountry(code: Country): GameConfig[] {
  return GAMES.filter((g) => g.country === code);
}

/** Coarse region bucket for hub grouping. */
export function regionBucket(g: GameConfig): string {
  switch (g.agency) {
    case "National":
    case "Multi-State":
      return "National";
    case "OLG":
      return "Ontario";
    case "WCLC":
      return "Western Canada";
    case "BCLC":
      return "British Columbia";
    case "Loto-Québec":
      return "Québec";
    case "ALC":
      return "Atlantic";
    case "NY Lottery":
      return "New York";
    default:
      return "Other";
  }
}

/** Map a Vercel province/state code (ON, BC, QC, NY…) to a region bucket. */
export function bucketForRegionCode(code: string): string | null {
  const m: Record<string, string> = {
    ON: "Ontario",
    BC: "British Columbia",
    AB: "Western Canada",
    SK: "Western Canada",
    MB: "Western Canada",
    QC: "Québec",
    NS: "Atlantic",
    NB: "Atlantic",
    PE: "Atlantic",
    NL: "Atlantic",
    NY: "New York",
  };
  return m[code] ?? null;
}

/** Games grouped by agency within a country, for the country overview. */
export function gamesByAgency(code: Country): { agency: Agency; games: GameConfig[] }[] {
  const order: Agency[] = ["National", "Multi-State", "NY Lottery", "OLG", "WCLC", "BCLC", "Loto-Québec", "ALC"];
  return order
    .map((agency) => ({ agency, games: GAMES.filter((g) => g.country === code && g.agency === agency) }))
    .filter((grp) => grp.games.length > 0);
}
