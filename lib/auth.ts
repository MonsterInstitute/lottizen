/**
 * Session cookie helpers for the "My Lottizen" dashboard. Passwordless by
 * design (see the brief: "do not build an unnecessarily complex password
 * system") — a subscriber signs in by clicking an emailed link
 * (/api/auth/verify), which creates a row in `sessions` and sets this
 * cookie. Table-backed, not a stateless JWT, so sign-out and account
 * deletion actually revoke access server-side (see deleteSession /
 * deleteAllSessions in lib/supabase-admin.ts).
 */
import { cookies } from "next/headers";
import { getSessionSubscriber, touchSession, type Subscriber } from "@/lib/supabase-admin";

export const SESSION_COOKIE = "lottizen_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

/** Read-only: safe to call from Server Components (dashboard pages) and
 *  Route Handlers alike. Returns null for anonymous visitors or an
 *  expired/invalid session — never throws. */
export async function getCurrentSubscriber(): Promise<Subscriber | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const subscriber = await getSessionSubscriber(token);
    if (subscriber) {
      // Fire-and-forget — a last_seen_at bump should never slow down or
      // fail the actual request.
      touchSession(token).catch(() => {});
    }
    return subscriber;
  } catch {
    return null;
  }
}
