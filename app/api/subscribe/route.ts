import { NextResponse } from "next/server";
import { absUrl } from "@/lib/site";
import { createSubscriber, findSubscriberByEmail, logEmail, resetForResubscribe } from "@/lib/supabase-admin";
import { renderConfirmationEmail, renderManageLinkEmail, sendEmail } from "@/lib/email";
import { isValidCountry } from "@/lib/subscribe";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/subscribe — the only field every entry point on the site
 * collects (homepage, game pages, guide footers, site footer): an email
 * address. No password, no account. Everything else (country, games,
 * frequency) is chosen afterwards on /subscribe/preferences.
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
    if (!subscriber) {
      subscriber = await createSubscriber(email, country);
    } else if (subscriber.unsubscribed_at) {
      // Re-subscribing after opting out: fresh consent, fresh double opt-in.
      subscriber = await resetForResubscribe(subscriber.id);
    }

    const preferencesUrl = absUrl(`/subscribe/preferences?token=${subscriber.magic_token}`);
    const unsubscribeUrl = absUrl(`/api/subscribe/unsubscribe?token=${subscriber.magic_token}`);

    if (subscriber.confirmed_at) {
      // Already an active subscriber — send their existing magic link instead
      // of confusing them with a second confirmation email.
      const { subject, html } = renderManageLinkEmail({ preferencesUrl, unsubscribeUrl });
      const result = await sendEmail(subscriber.email, subject, html);
      if (result.ok) await logEmail(subscriber.id, "manage_link");
      return NextResponse.json({ ok: true, status: "already_subscribed" });
    }

    const confirmUrl = absUrl(`/api/subscribe/confirm?token=${subscriber.magic_token}`);
    const { subject, html } = renderConfirmationEmail({ confirmUrl, preferencesUrl, unsubscribeUrl });
    const result = await sendEmail(subscriber.email, subject, html);
    if (result.ok) await logEmail(subscriber.id, "confirmation");
    return NextResponse.json({ ok: true, status: "confirmation_sent", emailSkipped: result.skipped ?? false });
  } catch (e) {
    console.error("[subscribe] error:", e);
    return NextResponse.json({ ok: false, error: "Something went wrong. Try again shortly." }, { status: 500 });
  }
}
