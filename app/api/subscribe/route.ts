import { NextResponse } from "next/server";
import { absUrl } from "@/lib/site";
import {
  createLoginToken,
  createSubscriber,
  findSubscriberByEmail,
  logEmail,
  resetForResubscribe,
} from "@/lib/supabase-admin";
import { renderSignInEmail, sendEmail } from "@/lib/email";
import { isValidCountry } from "@/lib/subscribe";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/subscribe — the single low-friction entry point for both email
 * alerts AND a full "My Lottizen" account: just an email address, no
 * password. One email address always resolves to the same subscriber row
 * (the User entity — see lib/supabase-admin.ts's header comment), whether
 * they're brand new or returning.
 *
 * Every case below ends the same way: a single-use, 30-minute sign-in link
 * (/api/auth/verify) that confirms the email (if new) and opens a session,
 * landing on /dashboard. This replaced the old two-step "confirm, then
 * separately dig up your preferences link" flow — clicking the link now
 * IS signing in.
 */
export async function POST(req: Request) {
  let body: { email?: string; country?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const country = body.country && isValidCountry(body.country) ? body.country : "CA";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    let subscriber = await findSubscriberByEmail(email);
    const isNewAccount = !subscriber;
    if (!subscriber) {
      subscriber = await createSubscriber(email, country);
    } else if (subscriber.unsubscribed_at) {
      // Re-subscribing after opting out: fresh consent, fresh sign-in.
      subscriber = await resetForResubscribe(subscriber.id);
    }

    const preferencesUrl = absUrl(`/subscribe/preferences?token=${subscriber.magic_token}`);
    const unsubscribeUrl = absUrl(`/api/subscribe/unsubscribe?token=${subscriber.magic_token}`);
    const loginToken = await createLoginToken(subscriber.id);
    const verifyUrl = absUrl(`/api/auth/verify?token=${loginToken}`);

    const { subject, html } = renderSignInEmail({ verifyUrl, isNewAccount, preferencesUrl, unsubscribeUrl });
    const result = await sendEmail(subscriber.email, subject, html);
    if (result.ok) await logEmail(subscriber.id, isNewAccount ? "confirmation" : "sign_in_link");
    else console.error("[subscribe] sign-in email send failed:", result.error);

    return NextResponse.json({
      ok: true,
      status: isNewAccount ? "confirmation_sent" : "already_subscribed",
      emailSent: result.ok,
      emailSkipped: result.skipped ?? false,
    });
  } catch (e) {
    console.error("[subscribe] error:", e);
    return NextResponse.json({ ok: false, error: "Something went wrong. Try again shortly." }, { status: 500 });
  }
}
