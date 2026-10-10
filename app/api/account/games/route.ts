import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { followGame, unfollowGame } from "@/lib/supabase-admin";
import { isValidGameSlug } from "@/lib/subscribe";

/** POST /api/account/games — follow a game (session-authenticated dashboard
 *  version of the bulk updatePreferences() used by the older token-based
 *  /subscribe/preferences page). There is no follow limit — every account
 *  can follow every game. */
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
