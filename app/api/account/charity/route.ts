import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { getCharityLottery } from "@/lib/charity";
import { followCharity, unfollowCharity } from "@/lib/supabase-admin";

async function body(req: Request): Promise<{ lotteryId?: string }> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

/** POST /api/account/charity {lotteryId} — follow a charity lottery. */
export async function POST(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const { lotteryId = "" } = await body(req);
  if (!getCharityLottery(lotteryId)) return NextResponse.json({ ok: false, error: "Unknown lottery." }, { status: 400 });
  await followCharity(subscriber.id, lotteryId);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/account/charity {lotteryId} */
export async function DELETE(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const { lotteryId = "" } = await body(req);
  await unfollowCharity(subscriber.id, lotteryId);
  return NextResponse.json({ ok: true });
}
