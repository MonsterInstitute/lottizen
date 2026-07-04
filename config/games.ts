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
  /** True when the top prize is a growing jackpot worth surfacing an estimate for.
   *  Fixed-prize, for-life, and pari-mutuel games leave this false so the UI shows
   *  the next draw date but no "estimated jackpot" row (never a stale "TBA"). */
  progressive?: boolean;
  /** Full legal operator name for disclaimers, overriding the per-agency default
   *  (see AGENCY_OPERATOR). Used where the agency bucket isn't the real operator. */
  operator?: string;
  /** Audit provenance: what was verified/corrected and when. Keeps the hand-entered
   *  static metadata honest — every non-obvious value should trace to a source here. */
  notes?: string;
  sources?: { wclcSlug?: string; olgFeedName?: string; olgProductId?: string; nyDataset?: string };
  live: boolean;
}

const CA = (g: Partial<GameConfig>): GameConfig =>
  ({ country: "CA", currency: "CAD", format: "lotto", hasBonus: true, live: false, ...g } as GameConfig);
const US = (g: Partial<GameConfig>): GameConfig =>
  ({ country: "US", currency: "USD", format: "lotto", hasBonus: true, live: false, ...g } as GameConfig);

export const GAMES: GameConfig[] = [
  // ============ CANADA ============
  CA({ slug: "lotto-max", name: "Lotto Max", agency: "National", region: "Canada-wide", pick: 7, max: 52, bonusLabel: "Bonus", bonusMax: 52, drawDays: ["Tuesday", "Friday"], price: 6, progressive: true, statsFrom: "2019-05-14", blurb: "Canada's biggest jackpot game — pick 7 of 52, with jackpots to $90M plus Max Millions.", notes: "Matrix history (verified 2026-07): 7/49 at launch → 7/50 on 2019-05-14 (added Tuesday draws; first 7/50 draw 2019-05-14, matches the data) → 7/52 on 2026-04-14 (price $5→$6, cap $80M→$90M, MaxPlus $100K prizes). statsFrom=2019-05-14 pins number stats to the modern 50/52-ball era (~740 draws), excluding only the 7/49 era; numbers 51–52 joined the pool in Apr 2026 and read as newer. Sources: en.wikipedia.org/wiki/Lotto_Max, wclc.com/games/lotto-max.htm.", sources: { wclcSlug: "lotto-max-extra", olgFeedName: "LOTTO MAX", olgProductId: "LMAX" }, live: true }),
  CA({ slug: "lotto-6-49", name: "Lotto 6/49", agency: "National", region: "Canada-wide", pick: 6, max: 49, bonusLabel: "Bonus", bonusMax: 49, drawDays: ["Wednesday", "Saturday"], price: 3, progressive: true, blurb: "The classic Canadian lotto since 1982 — pick 6 of 49, with a guaranteed $1M Gold Ball prize.", notes: "Post-2022 format (verified 2026-07): $3 buys the Classic 6/49 draw (fixed $5M jackpot, Bonus from 1–49) plus a separate Gold Ball draw guaranteeing $1M or the growing Gold Ball jackpot. OLG feed reports the Classic jackpot.", sources: { wclcSlug: "lotto-649-extra", olgFeedName: "LOTTO 6/49", olgProductId: "649" }, live: true }),
  CA({ slug: "daily-grand", name: "Daily Grand", agency: "National", region: "Canada-wide", pick: 5, max: 49, bonusLabel: "Grand Number", bonusMax: 7, drawDays: ["Monday", "Thursday"], price: 3, blurb: "Win $1,000 a day for life — pick 5 of 49 plus a Grand Number.", notes: "For-life fixed prize ($1,000/day or $7M lump sum), not a growing jackpot — no jackpot row shown. Verified 2026-07.", sources: { wclcSlug: "daily-grand-extra", olgFeedName: "DAILY GRAND", olgProductId: "DLYGND" }, live: true }),
  CA({ slug: "ontario-49", name: "Ontario 49", agency: "OLG", region: "Ontario", pick: 6, max: 49, bonusLabel: "Bonus", bonusMax: 49, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Ontario's own $1 lotto — pick 6 of 49 for a $2 million jackpot.", notes: "Fixed $2M jackpot (not growing) — Bonus drawn from 1–49. Verified olg.ca 2026-07.", sources: { olgFeedName: "ONTARIO 49", olgProductId: "ONT49" }, live: true }),
  CA({ slug: "lottario", name: "Lottario", agency: "OLG", region: "Ontario", pick: 6, max: 45, bonusLabel: "Bonus", bonusMax: 45, drawDays: ["Saturday"], price: 1, progressive: true, blurb: "Ontario's Saturday lotto since 1978 — pick 6 of 45.", notes: "Jackpot starts at $250K and grows until won; $1 buys two lines; also a same-night Early Bird draw ($50K). Verified olg.ca 2026-07.", sources: { olgFeedName: "LOTTARIO", olgProductId: "LOTT" }, live: true }),
  CA({ slug: "megadice", name: "MegaDice Lotto", agency: "OLG", region: "Ontario", pick: 6, max: 39, bonusLabel: "Bonus", bonusMax: 39, drawDays: ["Daily"], price: 2, blurb: "Ontario's nightly 6-of-39 lotto.", notes: "Corrected 2026-07 (olg.ca): now $2 and 6-of-39 (config had $1 / 6-of-45). Bonus from 1–39. Fixed $100K top prize, drawn nightly.", sources: { olgFeedName: "MEGADICE LOTTO" }, live: true }),
  CA({ slug: "western-max", name: "Western Max", agency: "WCLC", region: "Western Canada", pick: 7, max: 50, bonusLabel: "Bonus", bonusMax: 50, drawDays: ["Tuesday", "Friday"], price: 2, statsFrom: "2019-05-14", blurb: "Western Canada's 7-of-50 lotto, drawn Tuesdays and Fridays.", notes: "Corrected 2026-07 (wclc.com): $2 for three 7/50 selections (config had $5). Matrix: 7/49 until 2019-05-14, then 7/50 (first 50-ball draw 2019-05-14, confirmed in the data — 324 prior draws maxed at 49). Followed the national 2019 change but NOT the 2026 move to 7/52 — still 7/50. statsFrom=2019-05-14 excludes the older 7/49 draws from number stats. Fixed $2M top prize + Western Millions, not a growing jackpot.", sources: { wclcSlug: "western-max-extra" }, live: true }),
  CA({ slug: "western-6-49", name: "Western 6/49", agency: "WCLC", region: "Western Canada", pick: 6, max: 49, bonusLabel: "Bonus", bonusMax: 49, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Western Canada's 6-of-49, drawn Wednesdays and Saturdays.", notes: "Corrected 2026-07 (wclc.com): $1 per play (config had $2). Bonus from 1–49. Fixed $2M jackpot, no Gold Ball (that's the national game).", sources: { wclcSlug: "western-649-extra" }, live: true }),
  // registered, rollout pending (need a workable data source)
  CA({ slug: "encore", name: "Encore", agency: "OLG", region: "Ontario", pick: 7, max: 9, drawDays: ["Daily"], price: 1, hasBonus: false, format: "digit", blurb: "A 7-digit add-on to any Ontario lotto ticket.", notes: "$1 add-on, 22 ways to win, top $1M. Verified olg.ca 2026-07." }),
  CA({ slug: "pick-2", name: "Pick 2", agency: "OLG", region: "Ontario", pick: 2, max: 9, drawDays: ["Daily"], price: 2, hasBonus: false, format: "digit", blurb: "Twice-daily 2-digit game.", notes: "Corrected 2026-07 (olg.ca): fixed $2 per play (config had $1), top prize $99. Draws twice daily (midday + evening)." }),
  CA({ slug: "pick-3", name: "Pick 3", agency: "OLG", region: "Ontario", pick: 3, max: 9, drawDays: ["Daily"], price: 1, hasBonus: false, format: "digit", blurb: "Twice-daily 3-digit game.", notes: "$1 minimum play (also $2/$5/$10). Draws twice daily (midday + evening). Verified olg.ca 2026-07." }),
  CA({ slug: "pick-4", name: "Pick 4", agency: "OLG", region: "Ontario", pick: 4, max: 9, drawDays: ["Daily"], price: 1, hasBonus: false, format: "digit", blurb: "Twice-daily 4-digit game.", notes: "Draws twice daily (midday + evening). Verified olg.ca 2026-07." }),
  CA({ slug: "daily-keno", name: "Daily Keno", agency: "OLG", region: "Ontario", pick: 20, max: 70, drawDays: ["Daily"], price: 1, hasBonus: false, format: "keno", blurb: "Pick up to 10; 20 of 70 drawn.", notes: "$1 minimum play; draws twice daily (midday + evening). Verified olg.ca 2026-07." }),
  CA({ slug: "poker-lotto", name: "Poker Lotto", agency: "OLG", region: "Ontario", pick: 5, max: 52, drawDays: ["Daily"], price: 2, hasBonus: false, format: "special", blurb: "A 5-card poker draw.", notes: "$2 per hand (optional +$1 ALL IN); instant win + nightly draw. Verified olg.ca 2026-07." }),
  CA({ slug: "bc-49", name: "BC/49", agency: "BCLC", region: "British Columbia", pick: 6, max: 49, bonusLabel: "Bonus", bonusMax: 49, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "British Columbia's 6-of-49.", notes: "All fields verified correct 2026-07 (playnow.com/bclc.com). Fixed $2M jackpot; optional $1 Extra add-on is separate.", live: true }),
  CA({ slug: "quebec-max", name: "Québec Max", agency: "Loto-Québec", region: "Québec", pick: 7, max: 52, bonusLabel: "Complementary", bonusMax: 52, drawDays: ["Tuesday", "Friday"], price: 3, blurb: "Québec's 7-of-52 lotto.", notes: "Corrected 2026-07 (lotoquebec.com): Apr 14, 2026 overhaul mirroring national Lotto Max — $5→$3, 7/50→7/52, Complementary number from 1–52. Fixed $2M top prize. Not yet live (no data source)." }),
  CA({ slug: "quebec-49", name: "Québec 49", agency: "Loto-Québec", region: "Québec", pick: 6, max: 49, bonusLabel: "Bonus", bonusMax: 49, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Québec's 6-of-49.", notes: "Verified correct 2026-07 (lotoquebec.com)." }),
  CA({ slug: "grande-vie", name: "La Grande Vie", agency: "Loto-Québec", region: "Québec", pick: 5, max: 49, bonusLabel: "Grand Number", bonusMax: 7, drawDays: ["Monday", "Thursday"], price: 3, blurb: "$1,000 a day for life, Québec edition.", notes: "Verified correct 2026-07 (lotoquebec.com). For-life fixed prize." }),
  CA({ slug: "atlantic-49", name: "Atlantic 49", agency: "ALC", region: "Atlantic Canada", pick: 6, max: 49, bonusLabel: "Bonus", bonusMax: 49, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Atlantic Canada's 6-of-49.", notes: "Verified correct 2026-07 (alc.ca)." }),
  CA({ slug: "bucko", name: "Bucko", agency: "ALC", region: "Atlantic Canada", pick: 5, max: 41, hasBonus: false, drawDays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], price: 1, blurb: "Atlantic Canada's nightly 5-of-41.", notes: "Corrected 2026-07 (alc.ca): draws nightly (every day), not Wed & Sat. $20K top prize." }),

  // ============ USA ============
  US({ slug: "powerball", name: "Powerball", agency: "Multi-State", region: "Multi-state (45 jurisdictions)", pick: 5, max: 69, bonusLabel: "Powerball", bonusMax: 26, drawDays: ["Monday", "Wednesday", "Saturday"], price: 2, progressive: true, statsFrom: "2015-10-07", blurb: "America's biggest multi-state jackpot — pick 5 of 69 plus a Powerball of 26.", notes: "Verified correct 2026-07 (powerball.com): $2, 5/69 + Powerball 1–26, Mon/Wed/Sat, $20M start, no cap. powerball.com's estimate API is bot-walled, so no jackpot estimate is scraped — the UI shows the next draw date only.", sources: { nyDataset: "d6yy-54nr" }, live: true }),
  US({ slug: "mega-millions", name: "Mega Millions", agency: "Multi-State", operator: "the Mega Millions consortium", region: "Multi-state (45 jurisdictions)", pick: 5, max: 70, bonusLabel: "Mega Ball", bonusMax: 24, drawDays: ["Tuesday", "Friday"], price: 5, progressive: true, statsFrom: "2017-10-31", blurb: "The other US mega-jackpot — pick 5 of 70 plus a Mega Ball of 24.", notes: "Corrected 2026-07 (megamillions.com): Apr 8, 2025 overhaul — price $2→$5 with a built-in random 2×–10× multiplier (old $1 Megaplier retired), Mega Ball pool 1–25→1–24, min jackpot reset $20M→$50M. Main 5/70 unchanged so statsFrom stays 2017-10-31; a few pre-2025 Mega Balls of 25 fall outside the 1–24 bonus chart.", sources: { nyDataset: "5xaw-6ayf" }, live: true }),
  US({ slug: "cash4life", name: "Cash4Life", agency: "Multi-State", region: "Multi-state (Northeast)", pick: 5, max: 60, bonusLabel: "Cash Ball", bonusMax: 4, drawDays: ["Daily"], price: 2, blurb: "$1,000 a day for life — pick 5 of 60 plus a Cash Ball of 4.", notes: "RETIRED — final draw 2026-02-21 (NY data stops there); MUSL replaced Cash4Life and Lucky for Life with 'Millionaire for Life' on 2026-02-22. Set live=false; historical results retained but no longer presented as a current game.", sources: { nyDataset: "kwxv-fwze" }, live: false }),
  US({ slug: "new-york-lotto", name: "New York Lotto", agency: "NY Lottery", region: "New York", pick: 6, max: 59, bonusLabel: "Bonus", bonusMax: 59, drawDays: ["Wednesday", "Saturday"], price: 1, progressive: true, blurb: "New York's flagship 6-of-59 lotto.", notes: "Verified 2026-07 (nylottery.ny.gov): $1 buys two plays; pari-mutuel jackpot starts $2M and rolls. No official next-estimate feed, so the UI shows the next draw date without a jackpot estimate.", sources: { nyDataset: "6nbc-h7bj" }, live: true }),
  US({ slug: "take-5", name: "Take 5", agency: "NY Lottery", region: "New York", pick: 5, max: 39, hasBonus: false, drawDays: ["Daily"], price: 1, blurb: "New York's twice-daily 5-of-39 — we track the evening draw.", notes: "Verified 2026-07 (nylottery.ny.gov): twice daily (midday 2:30pm + evening 10:30pm ET) since 2022; data uses the evening draw. Pari-mutuel, no fixed jackpot.", sources: { nyDataset: "dg63-4siq" }, live: true }),
  US({ slug: "pick-10", name: "Pick 10", agency: "NY Lottery", region: "New York", pick: 20, max: 80, hasBonus: false, drawDays: ["Daily"], price: 1, format: "keno", blurb: "New York's daily keno — 20 of 80 drawn, match 10.", notes: "Verified 2026-07 (nylottery.ny.gov): once daily (evening 8:30pm ET). Fixed prizes, match 10 = $500K.", sources: { nyDataset: "bycu-cw7c" }, live: true }),
  US({ slug: "numbers", name: "Numbers", agency: "NY Lottery", region: "New York", pick: 3, max: 9, hasBonus: false, drawDays: ["Daily"], price: 0.5, format: "digit", blurb: "New York's twice-daily 3-digit game — straight or boxed, evening draw tracked.", notes: "Verified 2026-07 (nylottery.ny.gov): twice daily (midday + evening); data uses the evening draw. 50¢ base play.", sources: { nyDataset: "hsys-3def" }, live: true }),
  US({ slug: "win-4", name: "Win 4", agency: "NY Lottery", region: "New York", pick: 4, max: 9, hasBonus: false, drawDays: ["Daily"], price: 0.5, format: "digit", blurb: "New York's twice-daily 4-digit game — straight or boxed, evening draw tracked.", notes: "Verified 2026-07 (nylottery.ny.gov): twice daily (midday + evening); data uses the evening draw. 50¢ base play.", sources: { nyDataset: "hsys-3def" }, live: true }),
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

/** Full legal operator name per agency, for "not affiliated with …" disclaimers.
 *  The `agency` field is a UI grouping bucket ("National", "Multi-State") — not a
 *  real corporate name — so disclaimers must resolve to the actual operator. */
export const AGENCY_OPERATOR: Record<Agency, string> = {
  National: "the Interprovincial Lottery Corporation",
  OLG: "the Ontario Lottery and Gaming Corporation (OLG)",
  WCLC: "the Western Canada Lottery Corporation (WCLC)",
  BCLC: "the British Columbia Lottery Corporation (BCLC)",
  "Loto-Québec": "Loto-Québec",
  ALC: "the Atlantic Lottery Corporation (ALC)",
  "Multi-State": "the Multi-State Lottery Association (MUSL)",
  "NY Lottery": "the New York Lottery",
};

/** The full operator legal name for a game — per-game override, else the agency
 *  default. Use this (not `agency`) in disclaimers and "prizes set by …" copy. */
export function operatorName(g: GameConfig): string {
  return g.operator ?? AGENCY_OPERATOR[g.agency];
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
