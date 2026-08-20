import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { getFollowedGames, listScratchFavourites } from "@/lib/supabase-admin";

/**
 * GET /api/account/status?kind=game|scratch&slug= — lightweight per-user
 * follow-state check for FollowButton. A separate endpoint (not server
 * props) specifically because the pages this button lives on
 * (/[country]/[game], /scratch/[slug]) are statically generated — there is
 * no per-request "current visitor" at build time, so this has to be a
 * client-side call.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const slug = searchParams.get("slug") || "";

  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: true, signedIn: false, following: false });

  const list = kind === "scratch" ? await listScratchFavourites(subscriber.id) : await getFollowedGames(subscriber.id);
  return NextResponse.json({ ok: true, signedIn: true, following: list.includes(slug) });
}
