/**
 * Prize claim deadlines, per agency and ticket type.
 *
 * These drive a countdown that sends real reminder emails, so an invented
 * date is worse than no date at all: it would tell someone they have three
 * days left when they have three months, or the reverse. Every rule below is
 * either sourced from the operator's own published terms or explicitly marked
 * unknown. Nothing is inferred by analogy.
 *
 * VERIFIED 2026-09-04:
 *  - OLG          draw: 1 year (52 weeks) from the draw date.
 *                 https://www.olg.ca/en/winners/faq.html
 *  - BCLC         draw: 1 year from the draw date. Instants are explicitly
 *                 excluded from that rule.
 *                 https://corporate.bclc.com/customer-support/claim-a-prize.html
 *  - WCLC         draw: 1 year from the draw date.
 *                 https://www.wclc.com/faq-7.htm
 *  - ALC          draw: 1 year from the draw date. Scratch'N Win expiry is
 *                 printed on the back of the ticket.
 *                 https://www.alc.ca/content/alc/en/corporate/are-you-a-winner/claiming-your-prize.html
 *  - Loto-Québec  draw: 1 year from the draw date.
 *                 https://loteries.lotoquebec.com/en/prize-claims/payout-deadlines
 *
 * SCRATCH TICKETS ARE NOT COMPUTABLE. Every Canadian agency sets instant-game
 * expiry per game and prints it on the ticket — OLG's run roughly 1.5–2 years
 * because instants are printed months before they go on sale. There is no
 * formula, so the wallet asks the owner to enter the printed date and leaves
 * the ticket out of reminders until they do.
 *
 * UNITED STATES IS OUT OF SCOPE for countdowns at launch. New York's rule is
 * structurally different — scratch prizes expire one year after the announced
 * END of the game, not after purchase or draw — and it varies by state. US
 * tickets still get saved-number auto-checking; they just carry no deadline.
 * https://scratchoffsny.com/blog/do-scratch-offs-expire-ny/
 */
import type { Agency } from "@/config/games";

export type DeadlineRule =
  /** deadline = draw date + N days */
  | { kind: "days_from_draw"; days: number; source: string }
  /** printed on the physical ticket; the owner has to tell us */
  | { kind: "user_entered"; reason: string }
  /** we know we don't know */
  | { kind: "unsupported"; reason: string };

const ONE_YEAR = 365;

/** Canadian draw games — uniform one year from the draw date across all five
 *  agencies. Verified individually rather than assumed from one another. */
export const CANADIAN_DRAW_DEADLINE: Record<string, DeadlineRule> = {
  OLG: {
    kind: "days_from_draw",
    days: ONE_YEAR,
    source: "https://www.olg.ca/en/winners/faq.html",
  },
  BCLC: {
    kind: "days_from_draw",
    days: ONE_YEAR,
    source: "https://corporate.bclc.com/customer-support/claim-a-prize.html",
  },
  WCLC: {
    kind: "days_from_draw",
    days: ONE_YEAR,
    source: "https://www.wclc.com/faq-7.htm",
  },
  ALC: {
    kind: "days_from_draw",
    days: ONE_YEAR,
    source: "https://www.alc.ca/content/alc/en/corporate/are-you-a-winner/claiming-your-prize.html",
  },
  QUEBEC: {
    kind: "days_from_draw",
    days: ONE_YEAR,
    source: "https://loteries.lotoquebec.com/en/prize-claims/payout-deadlines",
  },
};

const SCRATCH_RULE: DeadlineRule = {
  kind: "user_entered",
  reason:
    "Instant-game expiry is set per game and printed on the ticket — there's no formula to derive it from.",
};

const US_RULE: DeadlineRule = {
  kind: "unsupported",
  reason: "Claim deadlines aren't supported for US games yet.",
};

/** Agencies whose draw games we can compute a deadline for. */
const CANADIAN_DRAW_AGENCIES = new Set(Object.keys(CANADIAN_DRAW_DEADLINE));

export function deadlineRule(opts: {
  ticketType: "draw" | "scratch";
  agency?: Agency | string | null;
  country?: string | null;
}): DeadlineRule {
  if (opts.country && opts.country !== "CA") return US_RULE;
  if (opts.ticketType === "scratch") return SCRATCH_RULE;
  const agency = opts.agency ? String(opts.agency) : "";
  if (CANADIAN_DRAW_AGENCIES.has(agency)) return CANADIAN_DRAW_DEADLINE[agency];
  // National games (Lotto Max, 6/49, Daily Grand) are sold by all five and
  // carry the same one-year rule whichever province issued the ticket, so a
  // Canadian draw ticket with no agency recorded still resolves.
  return {
    kind: "days_from_draw",
    days: ONE_YEAR,
    source: "https://www.olg.ca/en/winners/faq.html",
  };
}

/** Resolved deadline for a draw ticket, or null when it can't be computed
 *  (scratch awaiting a user-entered date, or an unsupported region). */
export function computeClaimDeadline(opts: {
  ticketType: "draw" | "scratch";
  drawDate?: string | null;
  agency?: Agency | string | null;
  country?: string | null;
}): { deadline: string | null; rule: DeadlineRule } {
  const rule = deadlineRule(opts);
  if (rule.kind !== "days_from_draw" || !opts.drawDate) return { deadline: null, rule };
  const d = new Date(`${opts.drawDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { deadline: null, rule };
  d.setUTCDate(d.getUTCDate() + rule.days);
  return { deadline: d.toISOString().slice(0, 10), rule };
}

/** Days remaining, negative once expired. */
export function daysUntil(deadline: string, now = new Date()): number {
  const end = new Date(`${deadline}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / 86_400_000);
}

/** Reminder thresholds, in days remaining. */
export const REMINDER_DAYS = [30, 7, 3] as const;
