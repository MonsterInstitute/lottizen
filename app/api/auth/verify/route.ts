import { NextResponse } from "next/server";
import { absUrl } from "@/lib/site";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { confirmSubscriberById, consumeLoginToken, createSession } from "@/lib/supabase-admin";

/**
 * GET /api/auth/verify?token= — the single-use link from the sign-in email.
 * Consumes the login token, confirms the email if this is a first sign-in,
 * opens a session (httpOnly cookie), and lands on the dashboard.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return NextResponse.redirect(absUrl("/subscribe?error=missing_token"));

  try {
    const subscriberId = await consumeLoginToken(token);
    if (!subscriberId) return NextResponse.redirect(absUrl("/subscribe?error=invalid_token"));

    await confirmSubscriberById(subscriberId);
    const sessionToken = await createSession(subscriberId);

    const res = NextResponse.redirect(absUrl("/dashboard?welcome=1"));
    res.cookies.set(SESSION_COOKIE, sessionToken, SESSION_COOKIE_OPTIONS);
    return res;
  } catch (e) {
    console.error("[auth/verify] error:", e);
    return NextResponse.redirect(absUrl("/subscribe?error=server_error"));
  }
}
