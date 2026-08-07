import { NextResponse } from "next/server";
import { absUrl } from "@/lib/site";
import { unsubscribeByToken } from "@/lib/supabase-admin";

/** GET /api/subscribe/unsubscribe?token= — one-click unsubscribe from the
 *  link every email carries (CAN-SPAM/CASL: must not require login or a
 *  second confirmation step). Idempotent and always lands on the same
 *  confirmation page, whether or not the token was already unsubscribed. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (token) {
    try {
      await unsubscribeByToken(token);
    } catch (e) {
      console.error("[subscribe/unsubscribe] error:", e);
    }
  }
  return NextResponse.redirect(absUrl("/subscribe/unsubscribed"));
}
