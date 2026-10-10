"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Ticket {
  status: "pending" | "checked_no_win" | "won_unclaimed" | "claimed" | "expired";
  claim_deadline: string | null;
}
interface Claim {
  claim_deadline: string | null;
  claimed_at: string | null;
}

/** The signed-in visitor's tickets at a glance (from /api/account/tickets),
 *  or an invitation to log one. Rendered client-side so the page itself
 *  stays static and identical for every visitor. */
export function MyTicketsCard() {
  const [state, setState] = useState<"loading" | "anon" | { tickets: Ticket[]; claims: Claim[] }>("loading");
  useEffect(() => {
    fetch("/api/account/tickets", { credentials: "same-origin" })
      .then((r) => (r.status === 401 ? null : r.json()))
      .then((j) => setState(j && j.ok ? { tickets: j.tickets, claims: j.claims } : "anon"))
      .catch(() => setState("anon"));
  }, []);

  if (state === "loading") return <div className="card home-tickets" aria-busy="true" />;
  if (state === "anon") {
    return (
      <div className="card home-tickets">
        <div className="section-eyebrow">Your tickets</div>
        <p className="home-pick-reason">
          Log a ticket and Lottizen checks it against the operator&rsquo;s published prize results (Lotto Max,
          6/49, Daily Grand and the BC and Western games), emails you if it wins, and reminds you before the
          claim deadline. Free; you sign in with your email.
        </p>
        <Link href="/dashboard" className="btn btn-primary">
          Log a ticket
        </Link>
      </div>
    );
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const pending = state.tickets.filter((t) => t.status === "pending").length;
  const open = state.claims.filter((c) => !c.claimed_at && (!c.claim_deadline || c.claim_deadline >= today));
  const next = open.map((c) => c.claim_deadline).filter((d): d is string => Boolean(d)).sort()[0];
  const days = next
    ? Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    : null;
  return (
    <div className="card home-tickets">
      <div className="section-eyebrow">Your tickets</div>
      <ul className="home-ticket-stats">
        <li>
          <strong>{pending}</strong> waiting for a draw result
        </li>
        <li>
          <strong>{open.length}</strong> {open.length === 1 ? "prize" : "prizes"} to claim
          {days != null ? (
            <>
              {" "}· next deadline in <strong>{days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}</strong>
            </>
          ) : null}
        </li>
      </ul>
      <Link href="/dashboard" className="btn btn-secondary">
        Open my tickets
      </Link>
    </div>
  );
}
