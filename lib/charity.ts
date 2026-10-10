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
  /** 50/50: the winner's share in percent where the vendor publishes it (60 for a 60/40 draw). */
  percentPrize: number | null;
  /** 50/50: a published guaranteed minimum pot. */
  guarantee: number | null;
  /** Rules-page sentences on which draws a ticket bought by each deadline is entered in, verbatim. */
  eligibility: string[];
  /** The exact text each figure was read from. */
  quotes: Record<string, string>;
  /** Daily snapshots, oldest first (50/50 pot growth). */
  history: { date: string; jackpot: number | null; soldOut: boolean | null }[];
}

export interface CharityResult {
  edition: string;
  drawName: string;
  /** The game / period the draw belonged to ("Leafs vs Bruins – Oct 17"). */
  event: string | null;
  /** 50/50: total pot of that draw (prizeValue is the winner's share). */
  pot: number | null;
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
  /** Every province it is licensed in (Jays Care: ON, AB, NS, NB, PE). */
  provinces: string[];
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
  /** Lotto Max's published odds per play, from OLG's page, for comparisons. */
  drawGame?: { name: string; price: number; anyPrize: string; jackpot: string; quotes: string[]; sourceUrl: string } | null;
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

const PROVINCE_TZ: Record<string, string> = {
  ON: "America/Toronto", QC: "America/Toronto", BC: "America/Vancouver", AB: "America/Edmonton", SK: "America/Regina",
  MB: "America/Winnipeg", NS: "America/Halifax", NB: "America/Moncton", PE: "America/Halifax", NL: "America/St_Johns",
  YT: "America/Whitehorse", NT: "America/Yellowknife", NU: "America/Iqaluit",
};

/** A deadline in the lottery's own province time: "Fri, Oct 23, 2026, 11:59 p.m. ET". */
export function fmtDeadline(iso: string, province: string, withTime = true): string {
  const tz = PROVINCE_TZ[province] ?? "America/Toronto";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-CA", { timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (!withTime) return date;
  const time = d
    .toLocaleTimeString("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" })
    .replace("a.m.", "a.m.")
    .replace(/\s+/g, " ");
  return `${date}, ${time}`;
}

/** The deadline's local calendar date (YYYY-MM-DD) in the lottery's province. */
export function localDate(iso: string, province: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: PROVINCE_TZ[province] ?? "America/Toronto" });
}

export const provinceByCode = (code: string) => CHARITY_PROVINCES.find((p) => p.code === code);
export const provinceBySlug = (slug: string) => CHARITY_PROVINCES.find((p) => p.slug === slug);

/** Home-region keys (components/home/regions.ts) a lottery is sold in. */
export function regionsOf(l: Pick<CharityLottery, "provinces" | "province">): string[] {
  const codes = l.provinces?.length ? l.provinces : [l.province];
  return [...new Set(codes.map((c) => provinceByCode(c)?.region).filter((r): r is NonNullable<typeof r> => Boolean(r)))];
}

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
    ...(e.salesClose ? [{ name: e.draws.length ? "Final deadline" : "Sales close", at: e.salesClose }] : []),
  ].filter((c) => new Date(c.at).getTime() > t);
  cands.sort((a, b) => a.at.localeCompare(b.at));
  return cands[0] ?? null;
}

/** How many published draws a ticket bought before `at` is entered in. */
export function drawsEligible(e: CharityEdition, at: string): number {
  return e.draws.filter((d) => !d.cutoff || d.cutoff >= at).length;
}

/** Lotteries licensed in a province (by code), open ones first, by deadline. */
export function lotteriesIn(code: string): CharityLottery[] {
  const list = getCharityLotteries().filter((l) => (l.provinces?.length ? l.provinces : [l.province]).includes(code));
  return list.sort((a, b) => {
    const oa = isOpen(a) ? 0 : 1;
    const ob = isOpen(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const da = a.current ? nextDeadline(a.current)?.at ?? a.current.salesClose ?? "9" : "9";
    const db = b.current ? nextDeadline(b.current)?.at ?? b.current.salesClose ?? "9" : "9";
    return da.localeCompare(db) || a.name.localeCompare(b.name);
  });
}

/** Pages: whole days from now to an ISO instant (≥ 0), in Toronto days. */
export function daysUntil(iso: string, now = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86400000));
}

export function displayName(l: CharityLottery): string {
  return l.name;
}
