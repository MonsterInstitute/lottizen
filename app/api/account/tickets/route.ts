import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { effectiveTier } from "@/lib/entitlements";
import {
  countTickets,
  createTicket,
  deleteTicket,
  getSubscription,
  listPrizeClaims,
  listTickets,
  markClaimCollected,
  updateTicket,
} from "@/lib/supabase-admin";
import { computeClaimDeadline } from "@/config/claim-deadlines";
import { GAMES } from "@/config/games";
import { PLANS } from "@/lib/plans";

/**
 * The ticket wallet: physical tickets a subscriber logs by hand.
 *
 * Free keeps one ticket so the whole loop is genuinely usable before paying —
 * log it, watch it get checked, see the countdown. Plus removes the limit.
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
// NOT exported: Next.js route files may only export the HTTP handlers and a
// fixed set of config keys, and any other export fails the build.
const FREE_TICKET_LIMIT = PLANS.free.limits.wallettickets;

export async function GET() {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  const [tickets, claims, subscription] = await Promise.all([
    listTickets(subscriber.id),
    listPrizeClaims(subscriber.id),
    getSubscription(subscriber.id),
  ]);
  const tier = effectiveTier(subscription);
  return NextResponse.json({
    ok: true,
    tickets,
    claims,
    tier,
    limit: tier === "plus" ? null : FREE_TICKET_LIMIT,
  });
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

  const [subscription, existing] = await Promise.all([
    getSubscription(subscriber.id),
    countTickets(subscriber.id),
  ]);
  if (effectiveTier(subscription) !== "plus" && existing >= FREE_TICKET_LIMIT) {
    return NextResponse.json(
      {
        ok: false,
        code: "LIMIT_REACHED",
        error: "Free accounts track one ticket at a time. Lottizen Plus removes the limit.",
      },
      { status: 403 },
    );
  }

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

/** PATCH — set a printed scratch expiry, or mark a prize collected. */
export async function PATCH(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  let body: { ticketId?: number; claimId?: number; claimDeadline?: string; markClaimed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
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
