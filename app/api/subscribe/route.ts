import { NextResponse } from "next/server";
import { absUrl } from "@/lib/site";
import {
  addScratchFavourite,
  createLoginToken,
  createSubscriber,
  followCharity,
  followGame,
  findSubscriberByEmail,
  logEmail,
  resetForResubscribe,
} from "@/lib/supabase-admin";
import { renderSignInEmail, sendEmail } from "@/lib/email";
import { isValidCountry, isValidProvince } from "@/lib/subscribe";
import { pageKind } from "@/lib/page-kind";
import { getCharityLottery } from "@/lib/charity";
import { getLiveGame } from "@/config/games";
import { provinceForAgency } from "@/config/scratch";
import { getGameBySlug } from "@/lib/data";

const PROVINCE_CODES = new Set(["ON", "QC", "BC", "AB", "SK", "MB", "NB", "NS", "PE", "NL", "YT", "NT", "NU"]);
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

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
  let body: {
    email?: string;
    country?: string;
    province?: string;
    /** The page this form is on (recorded as the signup source). */
    source?: string;
    /** Province code the page is about (e.g. a charity lottery's licensing province). */
    sourceProvince?: string;
    /** What the visitor asked to follow from this form, followed right away. */
    follow?: { kind?: string; id?: string; agency?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const country = body.country && isValidCountry(body.country) ? body.country : "CA";
  const province = body.province && isValidProvince(body.province) ? body.province : null;
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    let subscriber = await findSubscriberByEmail(email);
    const isNewAccount = !subscriber;
    const sourcePath =
      typeof body.source === "string" && body.source.startsWith("/") ? body.source.split("?")[0].slice(0, 300) : null;
    const sourceProvince =
      body.sourceProvince && PROVINCE_CODES.has(body.sourceProvince.toUpperCase()) ? body.sourceProvince.toUpperCase() : null;
    if (!subscriber) {
      subscriber = await createSubscriber(email, country, province, {
        path: sourcePath,
        kind: sourcePath ? pageKind(sourcePath) : null,
        province: sourceProvince,
      });
    } else if (subscriber.unsubscribed_at) {
      // Re-subscribing after opting out: fresh consent, fresh sign-in.
      subscriber = await resetForResubscribe(subscriber.id);
    }

    // "Follow this" forms: follow at once; emails only go to confirmed
    // subscribers, so nothing is sent for it until the link is clicked.
    const f = body.follow;
    if (f?.id && SLUG_RE.test(f.id)) {
      const prov = f.agency ? provinceForAgency(f.agency) : null;
      if (f.kind === "charity" && getCharityLottery(f.id)) await followCharity(subscriber.id, f.id).catch(() => {});
      else if (f.kind === "game" && getLiveGame(f.id)) await followGame(subscriber.id, f.id).catch(() => {});
      else if (f.kind === "scratch" && f.agency && prov && getGameBySlug(prov, f.id))
        await addScratchFavourite(subscriber.id, f.agency, f.id).catch(() => {});
    }

    const preferencesUrl = absUrl(`/subscribe/preferences?token=${subscriber.magic_token}`);
    const unsubscribeUrl = absUrl(`/api/subscribe/unsubscribe?token=${subscriber.magic_token}`);
    const loginToken = await createLoginToken(subscriber.id);
    const verifyUrl = absUrl(`/api/auth/verify?token=${loginToken}`);

    const { subject, html } = renderSignInEmail({ verifyUrl, isNewAccount, preferencesUrl, unsubscribeUrl });
    const result = await sendEmail(subscriber.email, subject, html, unsubscribeUrl);
    const type = isNewAccount ? "confirmation" : "sign_in_link";
    if (!result.skipped) {
      // A second sign-in link the same day hits email_log's per-day unique
      // index; that's a log-only conflict and must not fail the request.
      await logEmail(subscriber.id, type, result).catch(() => {});
    }
    if (!result.ok) console.error("[subscribe] sign-in email send failed:", result.error);

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
