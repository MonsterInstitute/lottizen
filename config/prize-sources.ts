/**
 * Which draw games we can state a prize amount for, and on whose authority.
 *
 * The wallet checks a ticket by looking up the operator's own published prize
 * breakdown for that draw (`prize_breakdowns`, supabase/migrations/0015). Where
 * no operator publishes one in a form we can read, we do not check the ticket
 * at all — we do not mark it "no win", and we never estimate what a tier paid.
 * That gap has to be visible in the UI rather than showing up as a ticket that
 * sits at "waiting for the draw" forever with no explanation.
 *
 * VERIFIED 2026-09-04. Mirrors GAMES / NO_SOURCE in
 * scripts/scrape_prize_breakdowns.py — the scraper and this list must move
 * together, or the wallet will promise a check that never runs.
 */
export type PrizeSource = {
  /** Operator whose published figures we store. */
  operator: string;
  /** Where the numbers come from, for the methodology page and disclaimers. */
  url: string;
};

export const PRIZE_BREAKDOWN_SOURCE: Record<string, PrizeSource> = {
  "lotto-max": { operator: "BCLC (PlayNow)", url: "https://www.playnow.com/lottery/#/lotto/lottomax" },
  "lotto-6-49": { operator: "BCLC (PlayNow)", url: "https://www.playnow.com/lottery/#/lotto/lotto649" },
  "daily-grand": { operator: "BCLC (PlayNow)", url: "https://www.playnow.com/lottery/#/lotto/dailygrand" },
  "bc-49": { operator: "BCLC (PlayNow)", url: "https://www.playnow.com/lottery/#/lotto/bc49" },
  "western-max": { operator: "WCLC", url: "https://www.wclc.com/winning-numbers/western-max-extra.htm" },
  "western-6-49": { operator: "WCLC", url: "https://www.wclc.com/winning-numbers/western-649-extra.htm" },
};

/**
 * Live draw games with no readable breakdown source, and why. OLG publishes
 * its payouts only inside a client-rendered page with no feed behind it: the
 * winning-numbers feed carries no prize data, and every plausible middleware
 * path 404s (probed 2026-09-04).
 */
export const NO_PRIZE_SOURCE: Record<string, string> = {
  "ontario-49": "OLG doesn't publish a prize breakdown we can read",
  lottario: "OLG doesn't publish a prize breakdown we can read",
  megadice: "OLG doesn't publish a prize breakdown we can read",
};

/** True when a ticket on this game can be checked against published figures. */
export function hasPrizeSource(gameSlug: string | null | undefined): boolean {
  return Boolean(gameSlug && PRIZE_BREAKDOWN_SOURCE[gameSlug]);
}
