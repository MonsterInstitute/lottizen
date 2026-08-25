import { NextResponse } from "next/server";
import { getGameBySlug } from "@/lib/data";
import { provinceForAgency } from "@/config/scratch";
import { getCurrentSubscriber } from "@/lib/auth";
import { addScratchFavourite, removeScratchFavourite } from "@/lib/supabase-admin";

/** POST /api/account/scratch-favourites — follow a scratch ticket from any
 *  of the 5 tracked agencies. No tier limit — favouriting is free/Pro
 *  alike; the Pro gate is on the ranking board itself (full list,
 *  filters), not on how many you can save. */
export async function POST(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  let body: { gameSlug?: string; agency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const gameSlug = body.gameSlug || "";
  const agency = body.agency || "";
  const province = provinceForAgency(agency);
  if (!province || !getGameBySlug(province, gameSlug)) {
    return NextResponse.json({ ok: false, error: "Unknown scratch ticket." }, { status: 400 });
  }
  await addScratchFavourite(subscriber.id, agency, gameSlug);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/account/scratch-favourites */
export async function DELETE(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  let body: { gameSlug?: string; agency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  await removeScratchFavourite(subscriber.id, body.agency || "", body.gameSlug || "");
  return NextResponse.json({ ok: true });
}
