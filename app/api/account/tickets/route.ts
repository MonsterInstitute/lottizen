import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import {
  createTicket,
  deleteTicket,
  listPrizeClaims,
  listTickets,
  markClaimCollected,
  recordTicketWin,
  updateTicket,
} from "@/lib/supabase-admin";
import { computeClaimDeadline } from "@/config/claim-deadlines";
import { GAMES } from "@/config/games";

/**
 * The ticket wallet: physical tickets a subscriber logs by hand.
 *
 * There is no limit on how many tickets an account logs.
 *
 * Claim deadlines are never guessed. Canadian draw tickets get draw date + 1
 * year from config/claim-deadlines.ts (every rule sourced from the operator).
 * Scratch tickets can't be computed at all — expiry is set per game and
 * printed on the ticket — so they are stored with a null deadline and
 * deadline_source 'unknown' until the owner types the printed date in. A
 * ticket with no deadline still lives in the wallet; it just takes no part in
 * reminders, because a countdown built on a made-up date would email someone
 * a false urgency (or, worse, none at all).
 */
export async function GET() {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  const [tickets, claims] = await Promise.all([listTickets(subscriber.id), listPrizeClaims(subscriber.id)]);
  return NextResponse.json({ ok: true, tickets, claims });
}

export async function POST(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  let body: {
    ticketType?: string;
    gameSlug?: string;
    label?: string;
    numbers?: unknown;
    purchaseDate?: string;
    drawDate?: string;
    costCents?: number;
    claimDeadline?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const ticketType = body.ticketType === "scratch" ? "scratch" : "draw";

  let game = null;
  let numbers: number[] | null = null;
  if (ticketType === "draw") {
    game = GAMES.find((g) => g.slug === body.gameSlug) ?? null;
    if (!game) return NextResponse.json({ ok: false, error: "Pick a game." }, { status: 400 });
    if (!body.drawDate) {
      return NextResponse.json({ ok: false, error: "Enter the draw date." }, { status: 400 });
    }
    const raw = Array.isArray(body.numbers) ? body.numbers : [];
    const ok =
      raw.length === game.pick &&
      raw.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= game!.max) &&
      new Set(raw as number[]).size === game.pick;
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: `Enter ${game.pick} different numbers from 1 to ${game.max}.` },
        { status: 400 },
      );
    }
    numbers = raw as number[];
  } else if (!body.label?.trim()) {
    return NextResponse.json({ ok: false, error: "Enter the ticket name." }, { status: 400 });
  }

  const computed = computeClaimDeadline({
    ticketType,
    drawDate: body.drawDate ?? null,
    agency: game?.agency ?? null,
    country: game?.country ?? "CA",
  });
  // A user-supplied date always wins: for scratch it's the only real source,
  // and for a draw ticket the owner is looking at the printed slip.
  const claimDeadline = body.claimDeadline || computed.deadline;
  const deadlineSource = body.claimDeadline
    ? "user_entered"
    : computed.deadline
      ? "computed"
      : "unknown";

  const ticket = await createTicket({
    subscriber_id: subscriber.id,
    ticket_type: ticketType,
    game_slug: ticketType === "draw" ? (game?.slug ?? null) : null,
    agency: game?.agency ?? null,
    label: body.label?.trim() || null,
    numbers,
    purchase_date: body.purchaseDate || null,
    draw_date: body.drawDate || null,
    cost_cents: Number.isInteger(body.costCents) ? body.costCents : null,
    claim_deadline: claimDeadline,
    deadline_source: deadlineSource,
  });

  return NextResponse.json({ ok: true, ticket, deadlineRule: computed.rule.kind });
}

/** PATCH — set a printed scratch expiry, record a win the owner is telling us
 *  about, or mark a prize collected. */
export async function PATCH(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  let body: {
    ticketId?: number;
    claimId?: number;
    claimDeadline?: string;
    markClaimed?: boolean;
    recordWin?: boolean;
    amountCents?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // A win the owner reports themselves — the only path that writes
  // amount_source 'user_entered'. The amount is optional: someone who knows
  // they won but not yet how much still gets the countdown and the reminders,
  // and the ledger leaves the prize out of its total rather than guessing.
  if (body.recordWin && body.ticketId) {
    const amount = body.amountCents;
    if (amount != null && (!Number.isInteger(amount) || amount < 0)) {
      return NextResponse.json({ ok: false, error: "Enter a valid amount." }, { status: 400 });
    }
    const claim = await recordTicketWin(body.ticketId, subscriber.id, amount ?? null);
    if (!claim) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, claim });
  }

  if (body.claimId) {
    const claim = await markClaimCollected(body.claimId, subscriber.id);
    if (!claim) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, claim });
  }

  if (!body.ticketId) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const fields: Record<string, unknown> = {};
  if (body.claimDeadline) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.claimDeadline)) {
      return NextResponse.json({ ok: false, error: "Use a YYYY-MM-DD date." }, { status: 400 });
    }
    fields.claim_deadline = body.claimDeadline;
    fields.deadline_source = "user_entered";
  }
  if (body.markClaimed) {
    fields.status = "claimed";
    fields.claimed_at = new Date().toISOString();
  }
  if (!Object.keys(fields).length) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const ticket = await updateTicket(body.ticketId, subscriber.id, fields);
  if (!ticket) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, ticket });
}

export async function DELETE(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  let body: { ticketId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (!body.ticketId) return NextResponse.json({ ok: false, error: "Nothing to delete." }, { status: 400 });
  await deleteTicket(body.ticketId, subscriber.id);
  return NextResponse.json({ ok: true });
}
