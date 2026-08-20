import { NextResponse } from "next/server";
import { SESSION_COOKIE, getCurrentSubscriber } from "@/lib/auth";
import { deleteAccount } from "@/lib/supabase-admin";

/** POST /api/account/delete-account — permanently deletes the subscriber
 *  row and, via ON DELETE CASCADE, every dependent row (followed games,
 *  combinations, checks, favourites, sessions, subscription record, email
 *  log) in every table added since 0004_subscribers.sql. Does not cancel a
 *  live Stripe subscription automatically — see the report's "remaining
 *  risks" for why (no Stripe account configured to test against yet). */
export async function POST() {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  try {
    await deleteAccount(subscriber.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    console.error("[account/delete-account] error:", e);
    return NextResponse.json({ ok: false, error: "Couldn't delete your account. Try again shortly." }, { status: 500 });
  }
}
