/**
 * The wallet ledger — what you have put in against what has come back.
 *
 * Pure arithmetic over rows the owner entered or the operator published. It
 * computes nothing it cannot source, and the shape of the result is built so
 * the UI cannot accidentally present a partial figure as a complete one:
 *
 *   * `spentCents` counts only tickets with a price recorded. `ticketsUnpriced`
 *     is returned alongside it precisely so the screen can say how much of the
 *     picture is missing, rather than quietly treating an unpriced ticket as
 *     free.
 *   * `wonCents` counts only prizes with a confirmed amount — either the
 *     operator's published breakdown or a figure the owner typed in.
 *     `claimsWithoutAmount` is everything we know was won but cannot value
 *     (a game with no published breakdown, a Daily Grand tier that depends on
 *     a ball we don't hold). Those are never estimated into the total; they
 *     are reported as a count so the net figure is honest about what it
 *     leaves out. See CLAUDE.md.
 *
 * This is a record of the tickets someone chose to log, not a statement of
 * their lifetime lottery results, and every surface presenting it says so.
 * It also carries no advice: knowing what you have spent does not change the
 * odds of anything, and nothing here should ever be framed as if it did.
 */
export interface LedgerTicket {
  cost_cents: number | null;
}

export interface LedgerClaim {
  amount_cents: number | null;
  amount_source: string;
  claimed_at: string | null;
}

export interface LedgerSummary {
  /** Total of every ticket with a recorded price. */
  spentCents: number;
  ticketsPriced: number;
  /** Logged tickets with no price recorded — excluded from spentCents. */
  ticketsUnpriced: number;

  /** Confirmed prize money already collected. */
  collectedCents: number;
  /** Confirmed prize money won but not yet collected. */
  outstandingCents: number;
  /** collectedCents + outstandingCents. */
  wonCents: number;
  /** Prizes with no confirmed amount, at all. Never folded into a total. */
  claimsWithoutAmount: number;

  /** wonCents − spentCents. Meaningful only next to the two counts above. */
  netCents: number;
  /** True when nothing at all has been logged — the UI shows a prompt, not zeros. */
  empty: boolean;
}

export function buildLedger(tickets: LedgerTicket[], claims: LedgerClaim[]): LedgerSummary {
  const priced = tickets.filter((t) => typeof t.cost_cents === "number");
  const spentCents = priced.reduce((sum, t) => sum + (t.cost_cents ?? 0), 0);

  // 'unknown' is the schema's own marker for "we don't have a figure for this"
  // (supabase/migrations/0014). Anything else — 'published' or 'user_entered' —
  // is a real number from a real source.
  const valued = claims.filter((c) => c.amount_cents != null && c.amount_source !== "unknown");
  const collectedCents = valued
    .filter((c) => c.claimed_at)
    .reduce((sum, c) => sum + (c.amount_cents ?? 0), 0);
  const outstandingCents = valued
    .filter((c) => !c.claimed_at)
    .reduce((sum, c) => sum + (c.amount_cents ?? 0), 0);
  const wonCents = collectedCents + outstandingCents;

  return {
    spentCents,
    ticketsPriced: priced.length,
    ticketsUnpriced: tickets.length - priced.length,
    collectedCents,
    outstandingCents,
    wonCents,
    claimsWithoutAmount: claims.length - valued.length,
    netCents: wonCents - spentCents,
    empty: tickets.length === 0 && claims.length === 0,
  };
}

/** "$12.00" / "−$12.00". Cents in, never a float in the maths. */
export function formatCents(cents: number, { signed = false } = {}): string {
  const sign = cents < 0 ? "−" : signed && cents > 0 ? "+" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Dollars as typed ("12", "12.50", "$12.50") to integer cents, or null. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
