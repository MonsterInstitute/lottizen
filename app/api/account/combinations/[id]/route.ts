import { NextResponse } from "next/server";
import { getGame } from "@/config/games";
import { getCurrentSubscriber } from "@/lib/auth";
import {
  DuplicateCombinationError,
  deleteCombination,
  getCombination,
  updateCombination,
} from "@/lib/supabase-admin";
import { validateCombinationNumbers } from "@/lib/subscribe";

/** PATCH /api/account/combinations/[id] — edit numbers and/or label. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ ok: false, error: "Invalid id." }, { status: 400 });

  const existing = await getCombination(id, subscriber.id);
  if (!existing) return NextResponse.json({ ok: false, error: "Combination not found." }, { status: 404 });

  let body: { numbers?: number[]; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  let numbers: number[] | undefined;
  if (body.numbers !== undefined) {
    const game = getGame(existing.game_slug);
    if (!game) return NextResponse.json({ ok: false, error: "Unknown game." }, { status: 400 });
    const validated = validateCombinationNumbers(body.numbers, game.pick, game.max);
    if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
    numbers = validated.numbers;
  }

  try {
    const combination = await updateCombination(id, subscriber.id, {
      numbers,
      label: body.label !== undefined ? body.label.trim() || null : undefined,
    });
    return NextResponse.json({ ok: true, combination });
  } catch (e) {
    if (e instanceof DuplicateCombinationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    }
    console.error("[account/combinations/:id] error:", e);
    return NextResponse.json({ ok: false, error: "Couldn't save. Try again shortly." }, { status: 500 });
  }
}

/** DELETE /api/account/combinations/[id] */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ ok: false, error: "Invalid id." }, { status: 400 });

  const deleted = await deleteCombination(id, subscriber.id);
  if (!deleted) return NextResponse.json({ ok: false, error: "Combination not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
