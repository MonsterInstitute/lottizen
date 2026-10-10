/**
 * Build-time access to data/charity/index.json (scripts/charity_publish.py):
 * Canadian charity lotteries — hospital/charity home lotteries, 50/50s,
 * Catch the Ace and community raffles — by licensing province.
 *
 * Every number here is one the lottery itself published on its official
 * site or rules page (CLAUDE.md: never invent a number). A field the lottery
 * doesn't publish is null, and the pages leave it out.
 */
import data from "@/data/charity/index.json";

export type CharityKind = "home" | "5050" | "catch_the_ace" | "raffle";

export interface CharityDraw {
  name: string;
  /** Last moment to buy and still be in this draw (ISO). */
  cutoff: string | null;
  drawDate: string | null;
  prize: string | null;
  prizeValue: number | null;
}

export interface CharityEdition {
  edition: string;
  title: string | null;
  status: "upcoming" | "on_sale" | "sold_out" | "closed" | "drawn" | null;
  licenceNo: string | null;
  ticketCap: number | null;
  prizeCount: number | null;
  prizeValue: number | null;
  grandPrize: string | null;
  grandPrizeValue: number | null;
  odds: { label: string; text: string }[];
  priceTiers: { tickets: number; price: number; label?: string | null }[];
  draws: CharityDraw[];
  salesOpen: string | null;
  salesClose: string | null;
  drawDate: string | null;
  jackpot: number | null;
  jackpotAt: string | null;
  soldOut: boolean | null;
  sourceUrl: string | null;
  scrapedAt: string;
  /** Daily snapshots, oldest first (50/50 pot growth). */
  history: { date: string; jackpot: number | null; soldOut: boolean | null }[];
}

export interface CharityResult {
  edition: string;
  drawName: string;
  drawDate: string | null;
  winningNumbers: string[];
  prize: string | null;
  prizeValue: number | null;
  sourceUrl: string | null;
}

export interface CharityLottery {
  id: string;
  name: string;
  kind: CharityKind;
  phase: number;
  operator: string | null;
  /** Licensing province, 2-letter code. Only someone physically in this
   *  province can buy a ticket. */
  province: string;
  licenceAuthority: string | null;
  platform: string | null;
  url: string | null;
  rulesUrl: string | null;
  buyUrl: string | null;
  resultsUrl: string | null;
  team: string | null;
  current: CharityEdition | null;
  editions: CharityEdition[];
  results: CharityResult[];
}

export interface CharityFile {
  generatedAt: string;
  lotteries: CharityLottery[];
}

export const KIND_LABEL: Record<CharityKind, string> = {
  home: "Home lottery",
  "5050": "50/50",
  catch_the_ace: "Catch the Ace",
  raffle: "Raffle",
};

/** Province pages: URL slug ↔ licensing code. */
export const CHARITY_PROVINCES = [
  { code: "ON", slug: "ontario", name: "Ontario", region: "ontario" },
  { code: "QC", slug: "quebec", name: "Quebec", region: "quebec" },
  { code: "BC", slug: "british-columbia", name: "British Columbia", region: "british-columbia" },
  { code: "AB", slug: "alberta", name: "Alberta", region: "alberta" },
  { code: "SK", slug: "saskatchewan", name: "Saskatchewan", region: "saskatchewan" },
  { code: "MB", slug: "manitoba", name: "Manitoba", region: "manitoba" },
  { code: "NS", slug: "nova-scotia", name: "Nova Scotia", region: "atlantic" },
  { code: "NB", slug: "new-brunswick", name: "New Brunswick", region: "atlantic" },
  { code: "PE", slug: "prince-edward-island", name: "Prince Edward Island", region: "atlantic" },
  { code: "NL", slug: "newfoundland-and-labrador", name: "Newfoundland and Labrador", region: "atlantic" },
  { code: "YT", slug: "yukon", name: "Yukon", region: "territories" },
  { code: "NT", slug: "northwest-territories", name: "Northwest Territories", region: "territories" },
  { code: "NU", slug: "nunavut", name: "Nunavut", region: "territories" },
] as const;
export type CharityProvince = (typeof CHARITY_PROVINCES)[number];

export const provinceByCode = (code: string) => CHARITY_PROVINCES.find((p) => p.code === code);
export const provinceBySlug = (slug: string) => CHARITY_PROVINCES.find((p) => p.slug === slug);

export function getCharity(): CharityFile {
  return data as unknown as CharityFile;
}

export function getCharityLotteries(): CharityLottery[] {
  return getCharity().lotteries;
}

export function getCharityLottery(id: string): CharityLottery | undefined {
  return getCharityLotteries().find((l) => l.id === id);
}

export function lotteryPath(l: Pick<CharityLottery, "id" | "province">): string {
  return `/charity/${provinceByCode(l.province)?.slug ?? "canada"}/${l.id}`;
}

/** Open for sale now (on sale or sold out but not yet drawn). */
export function isOpen(l: CharityLottery): boolean {
  const s = l.current?.status;
  return s === "on_sale" || s === "upcoming" || s === "sold_out";
}

/** The next deadline still ahead: the earliest draw cutoff or sales close in the future. */
export function nextDeadline(e: CharityEdition, now = new Date()): { name: string; at: string } | null {
  const t = now.getTime();
  const cands = [
    ...e.draws.filter((d) => d.cutoff).map((d) => ({ name: `${d.name} deadline`, at: d.cutoff! })),
    ...(e.salesClose ? [{ name: "Final deadline", at: e.salesClose }] : []),
  ].filter((c) => new Date(c.at).getTime() > t);
  cands.sort((a, b) => a.at.localeCompare(b.at));
  return cands[0] ?? null;
}

/** How many published draws a ticket bought before `at` is entered in. */
export function drawsEligible(e: CharityEdition, at: string): number {
  return e.draws.filter((d) => !d.cutoff || d.cutoff >= at).length;
}
