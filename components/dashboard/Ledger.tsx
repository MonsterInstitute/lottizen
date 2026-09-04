"use client";

import { buildLedger, formatCents, type LedgerClaim, type LedgerTicket } from "@/lib/ledger";

/**
 * Spend against returns, for the tickets in the wallet.
 *
 * A KPI row of three stat tiles rather than a chart: three headline numbers
 * with no trend to trace and no series to tell apart. Reuses the site's
 * existing .stat-grid / .stat-tile, so it needs no colour of its own — the
 * figures wear text tokens, and the sign carries the meaning. Deliberately no
 * red/green: a month where you are down is not an error state, and painting it
 * like one editorialises a number that should just be reported.
 *
 * The caveat line under the tiles is not decoration. This ledger covers the
 * tickets someone chose to log, valued only where a real figure exists —
 * unpriced tickets and unvalued prizes are named and counted rather than
 * folded in at zero, so the net figure is never mistaken for a complete
 * lifetime result.
 */
export function Ledger({ tickets, claims }: { tickets: LedgerTicket[]; claims: LedgerClaim[] }) {
  const l = buildLedger(tickets, claims);
  if (l.empty) return null;

  const caveats: string[] = [];
  if (l.ticketsUnpriced > 0) {
    caveats.push(
      `${l.ticketsUnpriced} ticket${l.ticketsUnpriced === 1 ? "" : "s"} with no price recorded ` +
        `${l.ticketsUnpriced === 1 ? "isn't" : "aren't"} counted`,
    );
  }
  if (l.claimsWithoutAmount > 0) {
    caveats.push(
      `${l.claimsWithoutAmount} prize${l.claimsWithoutAmount === 1 ? "" : "s"} with no confirmed ` +
        `amount ${l.claimsWithoutAmount === 1 ? "is" : "are"} left out rather than estimated`,
    );
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="k">Spent</div>
          <div className="v">{formatCents(l.spentCents)}</div>
          <div className="foot">
            {l.ticketsPriced === 0
              ? "No ticket prices recorded yet."
              : `Across ${l.ticketsPriced} ticket${l.ticketsPriced === 1 ? "" : "s"}.`}
          </div>
        </div>

        <div className="stat-tile">
          <div className="k">Won</div>
          <div className="v">{formatCents(l.wonCents)}</div>
          <div className="foot">
            {l.outstandingCents > 0
              ? `${formatCents(l.outstandingCents)} of it still to collect.`
              : "All collected."}
          </div>
        </div>

        <div className="stat-tile">
          <div className="k">Net</div>
          <div className="v">{formatCents(l.netCents, { signed: true })}</div>
          <div className="foot">Counting prizes you haven&rsquo;t collected yet.</div>
        </div>
      </div>

      <p className="field-hint" style={{ marginTop: 10 }}>
        Covers the tickets you&rsquo;ve logged here — not every ticket you&rsquo;ve ever bought.
        {caveats.length > 0 && <> {caveats.join("; ")}.</>}
      </p>
    </div>
  );
}
