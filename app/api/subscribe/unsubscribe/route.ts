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

/** POST /api/subscribe/unsubscribe?token= — RFC 8058 one-click unsubscribe,
 *  triggered by the mail client itself (not a human clicking a link) when it
 *  sees our List-Unsubscribe / List-Unsubscribe-Post headers. Gmail and Yahoo
 *  both require bulk senders to support this, and its absence is a documented
 *  spam-placement factor — which is why mail was being accepted by Gmail and
 *  then filtered out of the inbox anyway.
 *
 *  Deliberately returns a bare 200 rather than GET's redirect: the caller here
 *  is an automated agent that only checks the status code, and following a
 *  redirect to an HTML page would be pointless. Same idempotent behaviour. */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (token) {
    try {
      await unsubscribeByToken(token);
    } catch (e) {
      console.error("[subscribe/unsubscribe] POST error:", e);
    }
  }
  return new NextResponse(null, { status: 200 });
}
