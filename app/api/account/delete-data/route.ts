import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { clearAllUserData } from "@/lib/supabase-admin";

/** POST /api/account/delete-data — clears followed games, saved
 *  combinations, and scratch favourites. Keeps the account (email, sign-in)
 *  active — distinct from full account deletion (/api/account/delete-account). */
export async function POST() {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  try {
    await clearAllUserData(subscriber.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[account/delete-data] error:", e);
    return NextResponse.json({ ok: false, error: "Couldn't clear your data. Try again shortly." }, { status: 500 });
  }
}
