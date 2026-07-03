/**
 * Canadian draw-lottery registry — the source of truth for which games exist,
 * their rules, and which are "live" (have a scraped data pipeline + pages).
 *
 * `live: true` games get full SSG pages under /canada/[slug]/. Others are
 * registered for the /canada overview and future rollout. Scraper adapters
 * mirror the `sources` here (scripts/scrape_draws.py).
 */

export type Agency = "National" | "OLG" | "WCLC" | "BCLC" | "Loto-Québec" | "ALC";

export interface GameConfig {
  slug: string;
  name: string;
  agency: Agency;
  /** Regions where the game is offered. */
  region: string;
  /** Main draw: pick `pick` numbers from 1..`max`. */
  pick: number;
  max: number;
  /** Bonus/complementary number drawn from the same 1..max pool. */
  hasBonus: boolean;
  drawDays: string[];
  price: number;
  blurb: string;
  /** Data sources the scraper uses. */
  sources?: {
    wclcSlug?: string; // wclc.com/winning-numbers/<slug>.htm  (history)
    olgFeedName?: string; // name in OLG feeds/winning-numbers  (latest)
    olgProductId?: string; // OLG drawinformation productId    (jackpots)
  };
  live: boolean;
}

export const GAMES: GameConfig[] = [
  // ---------------- LIVE (end-to-end) ----------------
  {
    slug: "lotto-max",
    name: "Lotto Max",
    agency: "National",
    region: "Canada-wide",
    pick: 7,
    max: 50,
    hasBonus: true,
    drawDays: ["Tuesday", "Friday"],
    price: 5,
    blurb:
      "Canada's biggest jackpot game — pick 7 of 50, with jackpots that grow to $70M plus Max Millions.",
    sources: { wclcSlug: "lotto-max-extra", olgFeedName: "LOTTO MAX", olgProductId: "LMAX" },
    live: true,
  },
  {
    slug: "lotto-6-49",
    name: "Lotto 6/49",
    agency: "National",
    region: "Canada-wide",
    pick: 6,
    max: 49,
    hasBonus: true,
    drawDays: ["Wednesday", "Saturday"],
    price: 3,
    blurb:
      "The classic Canadian lotto since 1982 — pick 6 of 49, with a guaranteed $1M Gold Ball prize every draw.",
    sources: { wclcSlug: "lotto-649-extra", olgFeedName: "LOTTO 6/49", olgProductId: "649" },
    live: true,
  },
  {
    slug: "ontario-49",
    name: "Ontario 49",
    agency: "OLG",
    region: "Ontario",
    pick: 6,
    max: 49,
    hasBonus: true,
    drawDays: ["Wednesday", "Saturday"],
    price: 1,
    blurb:
      "Ontario's own $1 lotto — pick 6 of 49 for a $2 million jackpot, drawn Wednesdays and Saturdays.",
    sources: { olgFeedName: "ONTARIO 49", olgProductId: "ONT49" },
    live: true,
  },

  // ---------------- PLANNED (registered, rollout next) ----------------
  { slug: "daily-grand", name: "Daily Grand", agency: "National", region: "Canada-wide", pick: 5, max: 49, hasBonus: true, drawDays: ["Monday", "Thursday"], price: 3, blurb: "Win $1,000 a day for life. Pick 5 of 49 plus a Grand Number.", sources: { wclcSlug: "daily-grand-extra", olgFeedName: "DAILY GRAND", olgProductId: "DLYGND" }, live: false },
  { slug: "lottario", name: "Lottario", agency: "OLG", region: "Ontario", pick: 6, max: 45, hasBonus: true, drawDays: ["Saturday"], price: 1, blurb: "Ontario's Saturday lotto — pick 6 of 45.", sources: { olgFeedName: "LOTTARIO", olgProductId: "LOTT" }, live: false },
  { slug: "encore", name: "Encore", agency: "OLG", region: "Ontario", pick: 7, max: 9, hasBonus: false, drawDays: ["Daily"], price: 1, blurb: "A 7-digit add-on to any Ontario lotto ticket.", sources: { olgFeedName: "ENCORE" }, live: false },
  { slug: "pick-2", name: "Pick 2", agency: "OLG", region: "Ontario", pick: 2, max: 9, hasBonus: false, drawDays: ["Daily"], price: 1, blurb: "Daily 2-digit game.", sources: { olgFeedName: "PICK 2" }, live: false },
  { slug: "pick-3", name: "Pick 3", agency: "OLG", region: "Ontario", pick: 3, max: 9, hasBonus: false, drawDays: ["Daily"], price: 1, blurb: "Daily 3-digit game.", sources: { olgFeedName: "PICK 3" }, live: false },
  { slug: "pick-4", name: "Pick 4", agency: "OLG", region: "Ontario", pick: 4, max: 9, hasBonus: false, drawDays: ["Daily"], price: 1, blurb: "Daily 4-digit game.", sources: { olgFeedName: "PICK 4" }, live: false },
  { slug: "daily-keno", name: "Daily Keno", agency: "OLG", region: "Ontario", pick: 20, max: 70, hasBonus: false, drawDays: ["Daily"], price: 1, blurb: "Pick up to 10; 20 of 70 drawn.", sources: { olgFeedName: "DAILY KENO" }, live: false },
  { slug: "poker-lotto", name: "Poker Lotto", agency: "OLG", region: "Ontario", pick: 5, max: 52, hasBonus: false, drawDays: ["Daily"], price: 2, blurb: "A 5-card poker draw.", sources: { olgFeedName: "POKER LOTTO" }, live: false },
  { slug: "megadice", name: "MegaDice Lotto", agency: "OLG", region: "Ontario", pick: 6, max: 45, hasBonus: true, drawDays: ["Daily"], price: 1, blurb: "Daily 6 of 45 lotto.", sources: { olgFeedName: "MEGADICE LOTTO" }, live: false },

  { slug: "western-max", name: "Western Max", agency: "WCLC", region: "Western Canada", pick: 7, max: 50, hasBonus: true, drawDays: ["Tuesday", "Friday"], price: 5, blurb: "Western Canada's 7 of 50 lotto.", sources: { wclcSlug: "western-max-extra" }, live: false },
  { slug: "western-6-49", name: "Western 6/49", agency: "WCLC", region: "Western Canada", pick: 6, max: 49, hasBonus: true, drawDays: ["Wednesday", "Saturday"], price: 2, blurb: "Western Canada's 6 of 49.", sources: { wclcSlug: "western-649-extra" }, live: false },
  { slug: "bc-49", name: "BC/49", agency: "BCLC", region: "British Columbia", pick: 6, max: 49, hasBonus: true, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "British Columbia's 6 of 49.", live: false },

  { slug: "quebec-max", name: "Québec Max", agency: "Loto-Québec", region: "Québec", pick: 7, max: 50, hasBonus: true, drawDays: ["Tuesday", "Friday"], price: 5, blurb: "Québec's 7 of 50 lotto.", live: false },
  { slug: "quebec-49", name: "Québec 49", agency: "Loto-Québec", region: "Québec", pick: 6, max: 49, hasBonus: true, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Québec's 6 of 49.", live: false },
  { slug: "grande-vie", name: "La Grande Vie", agency: "Loto-Québec", region: "Québec", pick: 5, max: 49, hasBonus: true, drawDays: ["Monday", "Thursday"], price: 3, blurb: "$1,000 a day for life, Québec edition.", live: false },
  { slug: "banco", name: "Banco", agency: "Loto-Québec", region: "Québec", pick: 20, max: 70, hasBonus: false, drawDays: ["Daily"], price: 1, blurb: "Québec's daily keno-style game.", live: false },

  { slug: "atlantic-49", name: "Atlantic 49", agency: "ALC", region: "Atlantic Canada", pick: 6, max: 49, hasBonus: true, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Atlantic Canada's 6 of 49.", live: false },
  { slug: "bucko", name: "Bucko", agency: "ALC", region: "Atlantic Canada", pick: 5, max: 41, hasBonus: false, drawDays: ["Wednesday", "Saturday"], price: 1, blurb: "Atlantic Canada's 5 of 41.", live: false },
  { slug: "keno-atlantic", name: "Keno Atlantic", agency: "ALC", region: "Atlantic Canada", pick: 20, max: 70, hasBonus: false, drawDays: ["Daily"], price: 1, blurb: "Atlantic Canada's daily keno.", live: false },
];

export const LIVE_GAMES = GAMES.filter((g) => g.live);

export function getGame(slug: string): GameConfig | undefined {
  return GAMES.find((g) => g.slug === slug);
}

export function getLiveGame(slug: string): GameConfig | undefined {
  return LIVE_GAMES.find((g) => g.slug === slug);
}

/** Games grouped by operating agency, for the /canada overview. */
export function gamesByAgency(): { agency: Agency; games: GameConfig[] }[] {
  const order: Agency[] = ["National", "OLG", "WCLC", "BCLC", "Loto-Québec", "ALC"];
  return order
    .map((agency) => ({ agency, games: GAMES.filter((g) => g.agency === agency) }))
    .filter((grp) => grp.games.length > 0);
}
