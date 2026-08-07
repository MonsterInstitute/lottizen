import { NextResponse } from "next/server";
import { getGame } from "@/config/games";
import { clearNumbers, FREE_NUMBER_SET_LIMIT, getSubscriberByToken, saveNumbers } from "@/lib/supabase-admin";
import { isValidGameSlug } from "@/lib/subscribe";

/** POST /api/subscribe/numbers — save the (free tier: one) number set that
 *  gets auto-checked against every new draw of that game. */
export async function POST(req: Request) {
  let body: { token?: string; gameSlug?: string; numbers?: number[]; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const token = body.token || "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) return NextResponse.json({ ok: false, error: "Invalid or expired link." }, { status: 404 });

  const gameSlug = body.gameSlug || "";
  if (!isValidGameSlug(gameSlug)) {
    return NextResponse.json({ ok: false, error: "Unknown game." }, { status: 400 });
  }
  const game = getGame(gameSlug)!;
  const numbers = Array.isArray(body.numbers) ? body.numbers.map(Number) : [];
  const inRange = numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= game.max);
  if (numbers.length !== game.pick || !inRange) {
    return NextResponse.json(
      { ok: false, error: `Enter exactly ${game.pick} numbers between 1 and ${game.max}.` },
      { status: 400 },
    );
  }
  if (new Set(numbers).size !== numbers.length) {
    return NextResponse.json({ ok: false, error: "Numbers must be unique." }, { status: 400 });
  }

  try {
    // FREE_NUMBER_SET_LIMIT is 1 today: saveNumbers() replaces any existing
    // set, so storage never exceeds the limit without needing a separate check.
    await saveNumbers(subscriber.id, gameSlug, numbers, body.label?.trim() || null);
    return NextResponse.json({ ok: true, limit: FREE_NUMBER_SET_LIMIT });
  } catch (e) {
    console.error("[subscribe/numbers] error:", e);
    return NextResponse.json({ ok: false, error: "Couldn't save. Try again shortly." }, { status: 500 });
  }
}

/** DELETE /api/subscribe/numbers — clear the saved number set. */
export async function DELETE(req: Request) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const token = body.token || "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) return NextResponse.json({ ok: false, error: "Invalid or expired link." }, { status: 404 });

  await clearNumbers(subscriber.id);
  return NextResponse.json({ ok: true });
}
