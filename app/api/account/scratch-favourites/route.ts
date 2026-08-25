import { NextResponse } from "next/server";
import { getGameBySlug } from "@/lib/data";
import { provinceForAgency } from "@/config/scratch";
import { getCurrentSubscriber } from "@/lib/auth";
import { effectiveTier } from "@/lib/entitlements";
import { addScratchFavourite, getSubscription, listScratchFavourites, removeScratchFavourite } from "@/lib/supabase-admin";

/** POST /api/account/scratch-favourites — follow a scratch ticket from any
 *  of the 5 tracked agencies. Free tier is limited to one province at a
 *  time (the province of their first favourite — there's no separate
 *  "home province" field to ask for at signup); Plus removes that limit.
 *  This was previously documented in lib/plans.ts but never actually
 *  enforced here — fixed to match. */
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

  const [subscription, existing] = await Promise.all([
    getSubscription(subscriber.id),
    listScratchFavourites(subscriber.id),
  ]);
  const tier = effectiveTier(subscription);
  if (tier === "free") {
    const existingProvinces = new Set(
      existing.map((f) => provinceForAgency(f.agency)).filter((p): p is NonNullable<typeof p> => Boolean(p)),
    );
    if (existingProvinces.size > 0 && !existingProvinces.has(province)) {
      return NextResponse.json(
        {
          ok: false,
          code: "LIMIT_REACHED",
          error: "Free plan follows scratch tickets in one province at a time. Upgrade to Lottizen Plus to follow all 5.",
        },
        { status: 403 },
      );
    }
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
