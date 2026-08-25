import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { effectiveTier, maxFollowedGames } from "@/lib/entitlements";
import { followGame, getFollowedGames, getSubscription, unfollowGame } from "@/lib/supabase-admin";
import { isValidGameSlug } from "@/lib/subscribe";

/** POST /api/account/games — follow a game (session-authenticated dashboard
 *  version of the bulk updatePreferences() used by the older token-based
 *  /subscribe/preferences page). Entitlement is checked here, server-side —
 *  never only by hiding the "follow" button in the UI. */
export async function POST(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  let body: { gameSlug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const gameSlug = body.gameSlug || "";
  if (!isValidGameSlug(gameSlug)) {
    return NextResponse.json({ ok: false, error: "Unknown game." }, { status: 400 });
  }

  const [current, subscription] = await Promise.all([
    getFollowedGames(subscriber.id),
    getSubscription(subscriber.id),
  ]);
  if (!current.includes(gameSlug)) {
    const tier = effectiveTier(subscription);
    const max = maxFollowedGames(tier);
    if (current.length >= max) {
      return NextResponse.json(
        {
          ok: false,
          code: "LIMIT_REACHED",
          error: `Free plan follows up to ${max} games. Upgrade to Lottizen Plus to follow more.`,
        },
        { status: 403 },
      );
    }
  }
  await followGame(subscriber.id, gameSlug);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/account/games — unfollow a game. */
export async function DELETE(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  let body: { gameSlug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  await unfollowGame(subscriber.id, body.gameSlug || "");
  return NextResponse.json({ ok: true });
}
