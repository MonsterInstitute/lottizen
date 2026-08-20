import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { updateFrequency } from "@/lib/supabase-admin";
import { isValidFrequency } from "@/lib/subscribe";

/** POST /api/account/preferences — update notification frequency from the
 *  signed-in dashboard. Followed games are managed individually via
 *  /api/account/games; this only touches subscribers.frequency. */
export async function POST(req: Request) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  let body: { frequency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (!body.frequency || !isValidFrequency(body.frequency)) {
    return NextResponse.json({ ok: false, error: "Invalid frequency." }, { status: 400 });
  }
  try {
    await updateFrequency(subscriber.id, body.frequency);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[account/preferences] error:", e);
    return NextResponse.json({ ok: false, error: "Couldn't save. Try again shortly." }, { status: 500 });
  }
}
