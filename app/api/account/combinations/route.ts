import { NextResponse } from "next/server";
import { getGame } from "@/config/games";
import { getCurrentSubscriber } from "@/lib/auth";
import { effectiveTier, maxSavedCombinations } from "@/lib/entitlements";
import {
  countCombinations,
  createCombination,
  DuplicateCombinationError,
  getSubscription,
  listCombinations,
} from "@/lib/supabase-admin";
import { isValidGameSlug, validateCombinationNumbers } from "@/lib/subscribe";

/** GET /api/account/combinations — list the signed-in subscriber's saved combinations. */
export async function GET() {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const combinations = await listCombinations(subscriber.id);
  return NextResponse.json({ ok: true, combinations });
}

/** POST /api/account/combinations — save a new number combination.
 *  Rejects: wrong pick count, out-of-range numbers, repeated numbers within
 *  the combination, an exact duplicate of an existing saved combination for
 *  that game, and (free tier) exceeding the saved-combination limit. */
export async function POST(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  let body: { gameSlug?: string; numbers?: number[]; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const gameSlug = body.gameSlug || "";
  if (!isValidGameSlug(gameSlug)) {
    return NextResponse.json({ ok: false, error: "Unknown game." }, { status: 400 });
  }
  const game = getGame(gameSlug)!;
  const validated = validateCombinationNumbers(body.numbers, game.pick, game.max);
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const [count, subscription] = await Promise.all([
    countCombinations(subscriber.id),
    getSubscription(subscriber.id),
  ]);
  const tier = effectiveTier(subscription);
  const max = maxSavedCombinations(tier);
  if (count >= max) {
    return NextResponse.json(
      {
        ok: false,
        code: "LIMIT_REACHED",
        error:
          max === 1
            ? "Free plan saves 1 number combination. Upgrade to Lottizen Pro to save more."
            : `You've reached your limit of ${max} saved combinations.`,
      },
      { status: 403 },
    );
  }

  try {
    const combination = await createCombination(subscriber.id, gameSlug, validated.numbers, body.label?.trim() || null);
    return NextResponse.json({ ok: true, combination });
  } catch (e) {
    if (e instanceof DuplicateCombinationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    }
    console.error("[account/combinations] error:", e);
    return NextResponse.json({ ok: false, error: "Couldn't save. Try again shortly." }, { status: 500 });
  }
}
