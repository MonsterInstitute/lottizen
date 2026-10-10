"use client";

import { useEffect, useState } from "react";
import { Ledger } from "@/components/dashboard/Ledger";
import { parseDollarsToCents } from "@/lib/ledger";

interface Ticket {
  id: number;
  ticket_type: "draw" | "scratch";
  game_slug: string | null;
  label: string | null;
  numbers: number[] | null;
  purchase_date: string | null;
  draw_date: string | null;
  claim_deadline: string | null;
  deadline_source: "computed" | "user_entered" | "unknown";
  cost_cents: number | null;
  status: string;
}

interface Claim {
  id: number;
  game_slug: string | null;
  draw_date: string | null;
  prize_tier: string | null;
  amount_cents: number | null;
  amount_source: string;
  claim_deadline: string | null;
  claimed_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for the draw",
  // "no cash prize", not "no win": the bottom tier of some games pays a free
  // play, which the checker deliberately doesn't turn into a claim.
  checked_no_win: "Checked — no cash prize",
  won_unclaimed: "Won — not yet collected",
  claimed: "Collected",
  expired: "Expired",
};

/** '5/6+B' -> '5 of 6 + Bonus'. The stored code stays machine-readable so the
 *  sweep can look the published amount up again later; this is display only. */
function prettyTier(code: string | null): string | null {
  if (!code) return null;
  return code
    .split(" or ")
    .map((part) => {
      const bonus = part.endsWith("+B");
      return (bonus ? part.slice(0, -2) : part).replace("/", " of ") + (bonus ? " + Bonus" : "");
    })
    .join(" or ");
}

function daysUntil(deadline: string): number {
  const end = new Date(`${deadline}T00:00:00Z`).getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / 86_400_000);
}

/**
 * The ticket wallet. Tickets sort by urgency — anything won and uncollected
 * first, with its countdown — because that is the only part of this screen
 * where delay costs real money.
 *
 * A ticket with no claim_deadline is shown normally but flagged as not being
 * reminded about, with a prompt to type in the date printed on it. Deadlines
 * are never inferred for scratch tickets: each agency sets instant expiry per
 * game and prints it, so a guessed date would drive a real reminder email at
 * the wrong time. See config/claim-deadlines.ts.
 */
export function TicketWallet({
  games,
}: {
  games: { slug: string; name: string; pick: number; max: number; checkable: boolean }[];
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [type, setType] = useState<"draw" | "scratch">("draw");
  const [gameSlug, setGameSlug] = useState(games[0]?.slug ?? "");
  const [label, setLabel] = useState("");
  const [numbersRaw, setNumbersRaw] = useState("");
  const [drawDate, setDrawDate] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [deadlineRaw, setDeadlineRaw] = useState("");
  const [costRaw, setCostRaw] = useState("");
  // Which ticket's "I won on this" amount box is open, and what's typed in it.
  const [winFor, setWinFor] = useState<number | null>(null);
  const [winRaw, setWinRaw] = useState("");

  async function load() {
    const res = await fetch("/api/account/tickets");
    const d = await res.json().catch(() => ({}));
    if (d?.ok) {
      setTickets(d.tickets);
      setClaims(d.claims);
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketType: type,
          gameSlug: type === "draw" ? gameSlug : undefined,
          label: type === "scratch" ? label : undefined,
          numbers:
            type === "draw"
              ? numbersRaw.split(/[^0-9]+/).filter(Boolean).map(Number)
              : undefined,
          drawDate: type === "draw" ? drawDate : undefined,
          purchaseDate: purchaseDate || undefined,
          claimDeadline: deadlineRaw || undefined,
          costCents: parseDollarsToCents(costRaw) ?? undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        setError(d.error || "Couldn't save that ticket.");
        return;
      }
      setShowForm(false);
      setNumbersRaw("");
      setLabel("");
      setDeadlineRaw("");
      setCostRaw("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setDeadline(ticketId: number, value: string) {
    await fetch("/api/account/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, claimDeadline: value }),
    });
    await load();
  }

  /** A win the owner is reporting themselves. The amount is optional — knowing
   *  you won without knowing how much still earns the countdown, and the
   *  ledger reports it as unvalued instead of inventing a figure. */
  async function recordWin(ticketId: number) {
    const cents = parseDollarsToCents(winRaw);
    await fetch("/api/account/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, recordWin: true, amountCents: cents }),
    });
    setWinFor(null);
    setWinRaw("");
    await load();
  }

  async function collect(claimId: number) {
    await fetch("/api/account/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId }),
    });
    await load();
  }

  async function remove(ticketId: number) {
    await fetch("/api/account/tickets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId }),
    });
    await load();
  }

  const game = games.find((g) => g.slug === gameSlug);
  const today = new Date().toISOString().slice(0, 10);
  // A draw ticket whose draw has happened but whose game has no published
  // breakdown. It stays 'pending' on purpose: the sweep never marks a ticket
  // checked when it had nothing to check it against, and saying so is better
  // than a countdown that quietly never resolves.
  // Scratch tickets are never auto-checked (there are no numbers to check),
  // and a draw game with no published breakdown is never checked either — for
  // both, the owner is the only source. Everything else is resolved from the
  // operator's own figures, so offering to overwrite that invites a wrong
  // number into the ledger.
  const canReportWin = (t: Ticket) =>
    t.status !== "won_unclaimed" &&
    t.status !== "claimed" &&
    (t.ticket_type === "scratch" || games.find((g) => g.slug === t.game_slug)?.checkable === false);

  const uncheckable = (t: Ticket) =>
    t.ticket_type === "draw" &&
    t.status === "pending" &&
    Boolean(t.draw_date && t.draw_date <= today) &&
    games.find((g) => g.slug === t.game_slug)?.checkable === false;
  const openClaims = claims.filter((c) => !c.claimed_at);

  // Won-and-uncollected first, then waiting, then everything settled.
  const rank = (t: Ticket) =>
    t.status === "won_unclaimed" ? 0 : t.status === "pending" ? 1 : 2;
  const ordered = [...tickets].sort((a, b) => rank(a) - rank(b));

  if (loading) return <p className="field-hint">Loading your wallet…</p>;

  return (
    <div>
      <Ledger tickets={tickets} claims={claims} />

      {openClaims.length > 0 && (
        <div className="card" style={{ padding: 22, marginBottom: 20, border: "2px solid var(--brand)" }}>
          <div className="section-eyebrow" style={{ marginBottom: 10 }}>
            Waiting to be collected
          </div>
          {openClaims.map((c) => {
            const left = c.claim_deadline ? daysUntil(c.claim_deadline) : null;
            return (
              <div
                key={c.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 10 }}
              >
                <div>
                  <strong>{prettyTier(c.prize_tier) ?? "Prize"}</strong>
                  {c.game_slug && <> · {games.find((g) => g.slug === c.game_slug)?.name ?? c.game_slug}</>}
                  {c.draw_date && <> · {c.draw_date}</>}
                  <div className="field-hint">
                    {c.amount_cents != null
                      ? `$${(c.amount_cents / 100).toFixed(2)}`
                      : "Amount not confirmed — we won't guess it"}
                    {left != null && (
                      <>
                        {" · "}
                        <strong style={{ color: left <= 7 ? "var(--brand-deep)" : undefined }}>
                          {left} days left to claim
                        </strong>
                      </>
                    )}
                  </div>
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => collect(c.id)}>
                  Mark collected
                </button>
              </div>
            );
          })}
        </div>
      )}

      {ordered.length === 0 && (
        <p className="field-hint" style={{ marginBottom: 16 }}>
          No tickets yet. Log one and we&rsquo;ll check it against every draw and count down its
          claim deadline for you.
        </p>
      )}

      {ordered.map((t) => {
        const left = t.claim_deadline ? daysUntil(t.claim_deadline) : null;
        return (
          <div key={t.id} className="card" style={{ padding: 18, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>
                  {t.ticket_type === "scratch" ? t.label : games.find((g) => g.slug === t.game_slug)?.name ?? t.game_slug}
                </strong>
                <span className="field-hint"> · {STATUS_LABEL[t.status] ?? t.status}</span>
                {t.numbers && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, marginTop: 4 }}>
                    {t.numbers.join(" · ")}
                  </div>
                )}
                {t.draw_date && <div className="field-hint">Draw {t.draw_date}</div>}
                {uncheckable(t) && (
                  <div className="field-hint" style={{ marginTop: 6 }}>
                    We can&rsquo;t check this one — no prize breakdown is published for this game
                    in a form we can read, so we won&rsquo;t tell you it lost. Check it with the
                    retailer.
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => remove(t.id)}
                style={{ alignSelf: "flex-start" }}
              >
                Remove
              </button>
            </div>

            {t.claim_deadline ? (
              <p className="field-hint" style={{ marginTop: 8 }}>
                Claim by {t.claim_deadline}
                {left != null && <> — {left} days left</>}
                {t.deadline_source === "computed" && <> (one year from the draw)</>}
              </p>
            ) : (
              <div style={{ marginTop: 10 }}>
                <p className="field-hint" style={{ marginBottom: 6 }}>
                  ⚠️ No expiry date yet — this ticket won&rsquo;t get claim reminders. Enter the
                  date printed on it to switch them on.
                </p>
                <input
                  type="date"
                  onChange={(e) => e.target.value && setDeadline(t.id, e.target.value)}
                  style={{
                    padding: "8px 10px",
                    border: "1px solid var(--border-2)",
                    borderRadius: "var(--radius-sm)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 14,
                    background: "var(--surface)",
                    color: "var(--ink)",
                  }}
                />
              </div>
            )}

            {canReportWin(t) &&
              (winFor === t.id ? (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    value={winRaw}
                    onChange={(e) => setWinRaw(e.target.value)}
                    placeholder="How much? (optional)"
                    style={{
                      padding: "8px 10px",
                      border: "1px solid var(--border-2)",
                      borderRadius: "var(--radius-sm)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      background: "var(--surface)",
                      color: "var(--ink)",
                    }}
                  />
                  <button type="button" className="btn btn-primary" onClick={() => recordWin(t.id)}>
                    Save
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setWinFor(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => {
                    setWinFor(t.id);
                    setWinRaw("");
                  }}
                >
                  I won on this one
                </button>
              ))}
          </div>
        );
      })}

      {!showForm ? (
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Log a ticket
        </button>
      ) : (
        <div className="card" style={{ padding: 20, marginTop: 8 }}>
          <div className="chip-row" style={{ marginBottom: 14 }}>
            <button type="button" className={`chip ${type === "draw" ? "active" : ""}`} onClick={() => setType("draw")}>
              Draw ticket
            </button>
            <button type="button" className={`chip ${type === "scratch" ? "active" : ""}`} onClick={() => setType("scratch")}>
              Scratch ticket
            </button>
          </div>

          {type === "draw" ? (
            <>
              <select
                value={gameSlug}
                onChange={(e) => setGameSlug(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", marginBottom: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--ink)" }}
              >
                {games.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.name}
                  </option>
                ))}
              </select>
              <input
                value={numbersRaw}
                onChange={(e) => setNumbersRaw(e.target.value)}
                placeholder={game ? `${game.pick} numbers, 1–${game.max}` : "Your numbers"}
                style={{ width: "100%", padding: "10px 12px", marginBottom: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", fontFamily: "var(--font-mono)", background: "var(--surface)", color: "var(--ink)" }}
              />
              <label className="field-hint">Draw date</label>
              <input
                type="date"
                value={drawDate}
                onChange={(e) => setDrawDate(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", marginBottom: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--ink)" }}
              />
              <p className="field-hint" style={{ marginBottom: 12 }}>
                We&rsquo;ll set the claim deadline to one year after the draw — the rule every
                Canadian lottery uses for draw games.
              </p>
            </>
          ) : (
            <>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ticket name, e.g. Bingo Multiplier"
                style={{ width: "100%", padding: "10px 12px", marginBottom: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--ink)" }}
              />
              <label className="field-hint">Purchase date</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", marginBottom: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--ink)" }}
              />
              <label className="field-hint">Expiry date printed on the ticket (optional)</label>
              <input
                type="date"
                value={deadlineRaw}
                onChange={(e) => setDeadlineRaw(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", marginBottom: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--ink)" }}
              />
              <p className="field-hint" style={{ marginBottom: 12 }}>
                Scratch tickets each carry their own expiry, printed on the back — there&rsquo;s no
                way to work it out from the purchase date, so we won&rsquo;t guess. Add it and
                we&rsquo;ll remind you before it runs out.
              </p>
            </>
          )}

          <label className="field-hint">What you paid (optional)</label>
          <input
            value={costRaw}
            onChange={(e) => setCostRaw(e.target.value)}
            placeholder="e.g. 5.00"
            style={{ width: "100%", padding: "10px 12px", marginBottom: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", fontFamily: "var(--font-mono)", background: "var(--surface)", color: "var(--ink)" }}
          />
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Only tickets with a price recorded count towards what you&rsquo;ve spent &mdash; the
            rest are left out of the total rather than counted as free.
          </p>

          {error && <div className="form-notice error" style={{ marginBottom: 12 }}>{error}</div>}

          <button type="button" className="btn btn-primary" onClick={add} disabled={busy}>
            {busy ? "Saving…" : "Save ticket"}
          </button>{" "}
          <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
