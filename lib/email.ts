/**
 * Transactional email (confirmation + "manage your subscription" links) sent
 * from Next.js API routes via Resend's REST API. The recurring content mail
 * (draw-result / weekly digest) is generated and sent from the Python data
 * pipeline instead (scripts/email_templates.py, scripts/send_*_emails.py) —
 * this file only covers the two mails triggered live by a user action.
 *
 * RESEND_API_KEY is unset until the account is registered; sendEmail() logs
 * and no-ops rather than throwing, so the subscribe flow still works (the DB
 * write succeeds) before the key exists.
 */
import { SITE } from "@/lib/site";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = process.env.RESEND_FROM_EMAIL || `Lottizen <newsletter@mail.lottizen.com>`;

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  id?: string;
}

/**
 * `unsubscribeUrl` adds the RFC 8058 one-click headers. Gmail and Yahoo both
 * require bulk senders to expose them, and their absence is a documented
 * spam-placement factor — diagnosed 2026-08-26, when Resend reported
 * "delivered" to Gmail for every send while the mail never reached the inbox.
 * The URL must accept POST (see app/api/subscribe/unsubscribe/route.ts).
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  unsubscribeUrl?: string,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set — skipping send to ${to}: "${subject}"`);
    return { ok: false, skipped: true };
  }
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject,
      html,
      ...(unsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[email] Resend send failed (${res.status}): ${text.slice(0, 300)}`);
    return { ok: false, error: text.slice(0, 300) };
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: body.id };
}

/**
 * Shared HTML shell — the editorial design translated to email-safe markup:
 * table layout for Outlook compatibility, web-safe font stacks standing in
 * for Playfair Display / Inter / JetBrains Mono (custom @font-face is
 * unreliable across mail clients), the same cream/ink/orange palette as
 * app/globals.css. `footerLinks` renders the manage-preferences and
 * unsubscribe links every mail is required to carry.
 */
export function emailShell(opts: {
  previewText: string;
  bodyHtml: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
}): string {
  const { previewText, bodyHtml, preferencesUrl, unsubscribeUrl } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${SITE.name}</title>
</head>
<body style="margin:0;padding:0;background:#f7f4ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e6e0d4;border-radius:14px;overflow:hidden;">
<tr><td style="padding:28px 36px;border-bottom:1px solid #e6e0d4;">
<span style="font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:20px;color:#1a1815;letter-spacing:-0.01em;">Lottizen</span>
<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#9c968a;margin-left:10px;">${SITE.tagline}</span>
</td></tr>
<tr><td style="padding:32px 36px;color:#1a1815;font-size:15px;line-height:1.6;">
${bodyHtml}
</td></tr>
<tr><td style="padding:20px 36px 28px;border-top:1px solid #e6e0d4;font-size:12px;color:#9c968a;line-height:1.7;">
<a href="${preferencesUrl}" style="color:#c2652a;text-decoration:underline;">Manage your subscription</a>
&nbsp;·&nbsp;
<a href="${unsubscribeUrl}" style="color:#c2652a;text-decoration:underline;">Unsubscribe</a>
<br />
Lottizen is an independent information site — not a lottery operator. You're receiving this because you subscribed at ${SITE.url.replace(/^https?:\/\//, "")}.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const btn = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#dd8232;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:8px;margin-top:8px;">${label}</a>`;

/**
 * The one email that gets someone into "My Lottizen" — used both for a
 * brand-new account (clicking it confirms the email AND signs in) and a
 * returning visitor asking for a fresh sign-in link. Passwordless by design:
 * this link is the only credential, single-use, 30 minutes (see
 * createLoginToken in lib/supabase-admin.ts).
 */
export function renderSignInEmail(opts: {
  verifyUrl: string;
  isNewAccount: boolean;
  preferencesUrl: string;
  unsubscribeUrl: string;
}) {
  const subject = opts.isNewAccount ? "Confirm your email & start tracking" : "Sign in to My Lottizen";
  const heading = opts.isNewAccount ? "One click to start tracking" : "Sign in to My Lottizen";
  const lede = opts.isNewAccount
    ? "Thanks for creating a Lottizen account. Click below to confirm your email and open your dashboard — no password needed."
    : "Click below to sign in to your dashboard. No password needed — this link is your key.";
  const body = `
<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#1a1815;margin:0 0 14px;">${heading}</h1>
<p style="margin:0 0 18px;">${lede}</p>
${btn(opts.verifyUrl, opts.isNewAccount ? "Confirm & open my dashboard" : "Sign in")}
<p style="margin:22px 0 0;font-size:13px;color:#6d685f;">This link expires in 30 minutes and can only be used once. If you didn't request this, you can ignore this email.</p>`;
  const html = emailShell({
    previewText: opts.isNewAccount
      ? "Confirm your email to start tracking your games and numbers."
      : "Your sign-in link for My Lottizen.",
    bodyHtml: body,
    preferencesUrl: opts.preferencesUrl,
    unsubscribeUrl: opts.unsubscribeUrl,
  });
  return { subject, html };
}
