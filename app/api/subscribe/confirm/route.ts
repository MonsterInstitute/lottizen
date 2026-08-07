import { NextResponse } from "next/server";
import { absUrl } from "@/lib/site";
import { confirmSubscriber } from "@/lib/supabase-admin";

/** GET /api/subscribe/confirm?token= — the double opt-in click. Idempotent:
 *  a second click on an already-confirmed link just redirects again, no error. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return NextResponse.redirect(absUrl("/subscribe?error=missing_token"));
  try {
    const subscriber = await confirmSubscriber(token);
    if (!subscriber) return NextResponse.redirect(absUrl("/subscribe?error=invalid_token"));
    return NextResponse.redirect(absUrl(`/subscribe/preferences?token=${subscriber.magic_token}&confirmed=1`));
  } catch (e) {
    console.error("[subscribe/confirm] error:", e);
    return NextResponse.redirect(absUrl("/subscribe?error=server_error"));
  }
}
