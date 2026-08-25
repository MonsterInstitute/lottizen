/**
 * Server-only Supabase data layer for accounts, subscriptions, and the
 * Lottizen Plus tracking features. Unlike lib/data.ts / lib/draws.ts
 * (build-time JSON, read by every page), this talks to Supabase's PostgREST
 * API at REQUEST TIME with the service-role key — subscribers sign up,
 * sign in, and edit their tracked games/combinations live.
 *
 * Deliberately a hand-rolled `fetch()` wrapper instead of @supabase/supabase-js:
 * scripts/prefetch_supabase.mjs already avoids that SDK because its realtime
 * module assumes a native `WebSocket` global that isn't reliably present
 * everywhere Node runs; talking to PostgREST directly sidesteps that
 * entirely and needs nothing beyond fetch(), already global in the Next.js
 * server runtime.
 *
 * Only ever imported from route handlers and server components — never from
 * a component that ships to the client — so SUPABASE_SERVICE_ROLE_KEY never
 * reaches the browser bundle. The `subscribers` table IS the user/account
 * entity (email, tier, frequency, country, magic_token) — see
 * supabase/migrations/0004_subscribers.sql and 0006_lottizen_pro.sql. There
 * is no separate `users` table by design (reuse, not duplicate).
 */
import { randomBytes } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function pg<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured.");
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${init.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export function newToken(): string {
  return randomBytes(24).toString("hex"); // 48 hex chars — unguessable, URL-safe
}

export interface Subscriber {
  id: string;
  email: string;
  country: string;
  frequency: "instant" | "weekly" | "both";
  tier: string;
  magic_token: string;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

export async function findSubscriberByEmail(email: string): Promise<Subscriber | null> {
  const rows = await pg<Subscriber[]>(`subscribers?email=eq.${encodeURIComponent(email)}&select=*`);
  return rows?.[0] ?? null;
}

export async function getSubscriberByToken(token: string): Promise<Subscriber | null> {
  const rows = await pg<Subscriber[]>(`subscribers?magic_token=eq.${encodeURIComponent(token)}&select=*`);
  return rows?.[0] ?? null;
}

export async function getSubscriberById(id: string): Promise<Subscriber | null> {
  const rows = await pg<Subscriber[]>(`subscribers?id=eq.${id}&select=*`);
  return rows?.[0] ?? null;
}

/** Idempotent, by id (login_tokens resolve to a subscriber_id, not a magic_token). */
export async function confirmSubscriberById(id: string): Promise<void> {
  await pg(`subscribers?id=eq.${id}&confirmed_at=is.null`, {
    method: "PATCH",
    body: JSON.stringify({ confirmed_at: new Date().toISOString() }),
  });
}

export async function createSubscriber(email: string, country: string): Promise<Subscriber> {
  const rows = await pg<Subscriber[]>(`subscribers`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{ email, country, magic_token: newToken() }]),
  });
  return rows[0];
}

/** Re-subscribing after a prior unsubscribe: fresh consent, fresh token. */
export async function resetForResubscribe(id: string): Promise<Subscriber> {
  const rows = await pg<Subscriber[]>(`subscribers?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ confirmed_at: null, unsubscribed_at: null, magic_token: newToken() }),
  });
  return rows[0];
}

/** Idempotent: only sets confirmed_at the first time. Returns the row either way. */
export async function confirmSubscriber(token: string): Promise<Subscriber | null> {
  const enc = encodeURIComponent(token);
  const rows = await pg<Subscriber[]>(`subscribers?magic_token=eq.${enc}&confirmed_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ confirmed_at: new Date().toISOString() }),
  });
  if (rows?.[0]) return rows[0];
  return getSubscriberByToken(token); // already confirmed, or bad token (null)
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const enc = encodeURIComponent(token);
  const rows = await pg<Subscriber[]>(`subscribers?magic_token=eq.${enc}&unsubscribed_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ unsubscribed_at: new Date().toISOString() }),
  });
  return Boolean(rows?.length);
}

export async function updatePreferences(
  subscriberId: string,
  prefs: { country: string; frequency: string; games: string[] },
): Promise<void> {
  await pg(`subscribers?id=eq.${subscriberId}`, {
    method: "PATCH",
    body: JSON.stringify({ country: prefs.country, frequency: prefs.frequency }),
  });
  // Replace the full follow-list: delete then insert. Small N (<=19), simplest
  // correct diff, and matches the "save whole form" UX of the preferences page.
  await pg(`subscriber_games?subscriber_id=eq.${subscriberId}`, { method: "DELETE" });
  if (prefs.games.length) {
    await pg(`subscriber_games`, {
      method: "POST",
      body: JSON.stringify(prefs.games.map((slug) => ({ subscriber_id: subscriberId, game_slug: slug }))),
    });
  }
}

export async function updateFrequency(subscriberId: string, frequency: string): Promise<void> {
  await pg(`subscribers?id=eq.${subscriberId}`, { method: "PATCH", body: JSON.stringify({ frequency }) });
}

export async function getFollowedGames(subscriberId: string): Promise<string[]> {
  const rows = await pg<{ game_slug: string }[]>(
    `subscriber_games?subscriber_id=eq.${subscriberId}&select=game_slug`,
  );
  return (rows ?? []).map((r) => r.game_slug);
}

/** Free tier: one saved number set. Phase 4 (Plus) raises this — see the
 *  brief's "号码存储：免费版限 1 组...代码里用常量控制". Enforced here (replace-
 *  on-save keeps storage at exactly one row) and again in the API route
 *  (explicit check) and the preferences form (single input, not a list). */
export const FREE_NUMBER_SET_LIMIT = 1;

export interface SavedNumbers {
  game_slug: string;
  numbers: number[];
  label: string | null;
}

export async function saveNumbers(
  subscriberId: string,
  gameSlug: string,
  numbers: number[],
  label: string | null,
): Promise<void> {
  await pg(`subscriber_numbers?subscriber_id=eq.${subscriberId}`, { method: "DELETE" });
  await pg(`subscriber_numbers`, {
    method: "POST",
    body: JSON.stringify([{ subscriber_id: subscriberId, game_slug: gameSlug, numbers, label }]),
  });
}

export async function clearNumbers(subscriberId: string): Promise<void> {
  await pg(`subscriber_numbers?subscriber_id=eq.${subscriberId}`, { method: "DELETE" });
}

export async function getNumbers(subscriberId: string): Promise<SavedNumbers[]> {
  return (
    (await pg<SavedNumbers[]>(`subscriber_numbers?subscriber_id=eq.${subscriberId}&select=game_slug,numbers,label`)) ??
    []
  );
}

export async function logEmail(subscriberId: string, type: string, gameSlug = ""): Promise<void> {
  await pg(`email_log`, {
    method: "POST",
    body: JSON.stringify([{ subscriber_id: subscriberId, type, game_slug: gameSlug }]),
  });
}

export interface EmailLogRow {
  id: number;
  type: string;
  game_slug: string;
  sent_at: string;
}

/** For the dashboard's "latest relevant alerts" feed. */
export async function listRecentEmailLog(subscriberId: string, limit = 10): Promise<EmailLogRow[]> {
  return (
    (await pg<EmailLogRow[]>(
      `email_log?subscriber_id=eq.${subscriberId}&select=id,type,game_slug,sent_at&order=sent_at.desc&limit=${limit}`,
    )) ?? []
  );
}

// ============================================================================
// Auth — passwordless sign-in (login_tokens -> sessions), backing the
// "My Lottizen" dashboard. See lib/auth.ts for the cookie/session wiring
// that sits on top of these.
// ============================================================================
const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min — a real credential, kept short
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createLoginToken(subscriberId: string): Promise<string> {
  const token = newToken();
  await pg(`login_tokens`, {
    method: "POST",
    body: JSON.stringify([
      { subscriber_id: subscriberId, token, expires_at: new Date(Date.now() + LOGIN_TOKEN_TTL_MS).toISOString() },
    ]),
  });
  return token;
}

/** Consumes a login token (single-use). Returns the subscriber_id, or null if
 *  invalid/expired/already used. */
export async function consumeLoginToken(token: string): Promise<string | null> {
  const enc = encodeURIComponent(token);
  const nowIso = new Date().toISOString();
  const rows = await pg<{ subscriber_id: string }[]>(
    `login_tokens?token=eq.${enc}&used_at=is.null&expires_at=gt.${encodeURIComponent(nowIso)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ used_at: nowIso }) },
  );
  return rows?.[0]?.subscriber_id ?? null;
}

export async function createSession(subscriberId: string): Promise<string> {
  const sessionToken = newToken();
  await pg(`sessions`, {
    method: "POST",
    body: JSON.stringify([
      {
        subscriber_id: subscriberId,
        session_token: sessionToken,
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      },
    ]),
  });
  return sessionToken;
}

/** Returns the subscriber for a live (unexpired) session, or null. */
export async function getSessionSubscriber(sessionToken: string): Promise<Subscriber | null> {
  const enc = encodeURIComponent(sessionToken);
  const nowIso = encodeURIComponent(new Date().toISOString());
  const rows = await pg<{ subscribers: Subscriber }[]>(
    `sessions?session_token=eq.${enc}&expires_at=gt.${nowIso}&select=subscribers(*)`,
  );
  return rows?.[0]?.subscribers ?? null;
}

export async function touchSession(sessionToken: string): Promise<void> {
  await pg(`sessions?session_token=eq.${encodeURIComponent(sessionToken)}`, {
    method: "PATCH",
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  });
}

export async function deleteSession(sessionToken: string): Promise<void> {
  await pg(`sessions?session_token=eq.${encodeURIComponent(sessionToken)}`, { method: "DELETE" });
}

export async function deleteAllSessions(subscriberId: string): Promise<void> {
  await pg(`sessions?subscriber_id=eq.${subscriberId}`, { method: "DELETE" });
}

/** Full account + all data deletion — every other new table cascades from
 *  subscribers.id via ON DELETE CASCADE (see 0004/0006 migrations). */
export async function deleteAccount(subscriberId: string): Promise<void> {
  await pg(`subscribers?id=eq.${subscriberId}`, { method: "DELETE" });
}

// ============================================================================
// Saved combinations — full CRUD (Lottizen Plus: multiple per subscriber).
// The older saveNumbers()/getNumbers()/clearNumbers() above stay in place
// unchanged for the token-based /subscribe/preferences page (no login,
// free-tier single combination, "replace on save" is the whole UX there).
// These are the richer, id-addressable versions the session-authenticated
// dashboard and /api/account/combinations use.
// ============================================================================
export interface Combination {
  id: number;
  subscriber_id: string;
  game_slug: string;
  numbers: number[];
  label: string | null;
  created_at: string;
  updated_at: string;
}

export async function listCombinations(subscriberId: string): Promise<Combination[]> {
  return (
    (await pg<Combination[]>(
      `subscriber_numbers?subscriber_id=eq.${subscriberId}&select=*&order=created_at.desc`,
    )) ?? []
  );
}

export async function countCombinations(subscriberId: string): Promise<number> {
  return (await listCombinations(subscriberId)).length;
}

export class DuplicateCombinationError extends Error {}

export async function createCombination(
  subscriberId: string,
  gameSlug: string,
  numbers: number[],
  label: string | null,
): Promise<Combination> {
  const sorted = [...numbers].sort((a, b) => a - b);
  try {
    const rows = await pg<Combination[]>(`subscriber_numbers`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ subscriber_id: subscriberId, game_slug: gameSlug, numbers: sorted, label }]),
    });
    return rows[0];
  } catch (e) {
    // Postgres unique_violation surfaces as a 409/400 with "duplicate key" in
    // the body from PostgREST — idx_subscriber_numbers_dedup catches an exact
    // re-save of the same numbers for the same game.
    if (e instanceof Error && /duplicate key|already exists/i.test(e.message)) {
      throw new DuplicateCombinationError("You already have this exact combination saved for this game.");
    }
    throw e;
  }
}

export async function getCombination(id: number, subscriberId: string): Promise<Combination | null> {
  const rows = await pg<Combination[]>(`subscriber_numbers?id=eq.${id}&subscriber_id=eq.${subscriberId}&select=*`);
  return rows?.[0] ?? null;
}

export async function updateCombination(
  id: number,
  subscriberId: string,
  patch: { numbers?: number[]; label?: string | null },
): Promise<Combination | null> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.numbers) body.numbers = [...patch.numbers].sort((a, b) => a - b);
  if (patch.label !== undefined) body.label = patch.label;
  try {
    const rows = await pg<Combination[]>(`subscriber_numbers?id=eq.${id}&subscriber_id=eq.${subscriberId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    return rows?.[0] ?? null;
  } catch (e) {
    if (e instanceof Error && /duplicate key|already exists/i.test(e.message)) {
      throw new DuplicateCombinationError("You already have this exact combination saved for this game.");
    }
    throw e;
  }
}

export async function deleteCombination(id: number, subscriberId: string): Promise<boolean> {
  const rows = await pg<Combination[]>(`subscriber_numbers?id=eq.${id}&subscriber_id=eq.${subscriberId}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  return Boolean(rows?.length);
}

// ============================================================================
// Draw-game following (dashboard CRUD on top of the existing
// subscriber_games table from Phase 1 — updatePreferences() above does a
// bulk replace for the token-based preferences page; these are single-game
// add/remove for the dashboard).
// ============================================================================
export async function followGame(subscriberId: string, gameSlug: string): Promise<void> {
  await pg(`subscriber_games`, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify([{ subscriber_id: subscriberId, game_slug: gameSlug }]),
  });
}

export async function unfollowGame(subscriberId: string, gameSlug: string): Promise<void> {
  await pg(`subscriber_games?subscriber_id=eq.${subscriberId}&game_slug=eq.${encodeURIComponent(gameSlug)}`, {
    method: "DELETE",
  });
}

// ============================================================================
// Scratch-ticket favourites
// ============================================================================
export interface ScratchFavouriteRef {
  agency: string;
  slug: string;
}

/** Agency is part of the key because game_slug is only unique WITHIN one
 * agency — several agencies have games that share a slug (see
 * supabase/migrations/0008_scratch_pro_multi_agency.sql). */
export async function listScratchFavourites(subscriberId: string): Promise<ScratchFavouriteRef[]> {
  const rows = await pg<{ game_slug: string; agency: string }[]>(
    `scratch_favourites?subscriber_id=eq.${subscriberId}&select=game_slug,agency`,
  );
  return (rows ?? []).map((r) => ({ agency: r.agency, slug: r.game_slug }));
}

export async function addScratchFavourite(subscriberId: string, agency: string, gameSlug: string): Promise<void> {
  await pg(`scratch_favourites`, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify([{ subscriber_id: subscriberId, agency, game_slug: gameSlug }]),
  });
}

export async function removeScratchFavourite(subscriberId: string, agency: string, gameSlug: string): Promise<void> {
  await pg(
    `scratch_favourites?subscriber_id=eq.${subscriberId}&agency=eq.${encodeURIComponent(agency)}&game_slug=eq.${encodeURIComponent(gameSlug)}`,
    { method: "DELETE" },
  );
}

/** "Remove their saved data" (keep the account/email active) — clears
 *  followed games, saved combinations, and scratch favourites. Distinct
 *  from deleteAccount(), which removes the subscriber row entirely. */
export async function clearAllUserData(subscriberId: string): Promise<void> {
  await Promise.all([
    pg(`subscriber_games?subscriber_id=eq.${subscriberId}`, { method: "DELETE" }),
    pg(`subscriber_numbers?subscriber_id=eq.${subscriberId}`, { method: "DELETE" }),
    pg(`scratch_favourites?subscriber_id=eq.${subscriberId}`, { method: "DELETE" }),
  ]);
}

// ============================================================================
// Combination checks — read side for the dashboard ("recently checked
// results"). Written from scripts/send_draw_emails.py via the same
// PostgREST REST surface (Python's db.py), not from here.
// ============================================================================
export interface CombinationCheck {
  id: number;
  subscriber_id: string;
  combination_id: number;
  game_slug: string;
  draw_date: string;
  matched_main: number;
  pick: number;
  bonus_matched: boolean | null;
  possible_prize: string | null;
  created_at: string;
}

export async function listRecentChecks(subscriberId: string, limit = 10): Promise<CombinationCheck[]> {
  return (
    (await pg<CombinationCheck[]>(
      `combination_checks?subscriber_id=eq.${subscriberId}&select=*&order=created_at.desc&limit=${limit}`,
    )) ?? []
  );
}

// ============================================================================
// Subscriptions / entitlement (Stripe-shaped; see lib/stripe.ts and
// lib/entitlements.ts). Status stays 'none' and tier stays 'free' for every
// subscriber until a real Stripe webhook fires — nothing here fabricates
// a paid state.
// ============================================================================
export interface SubscriptionRow {
  id: number;
  subscriber_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
}

export async function getSubscription(subscriberId: string): Promise<SubscriptionRow | null> {
  const rows = await pg<SubscriptionRow[]>(`subscriptions?subscriber_id=eq.${subscriberId}&select=*`);
  return rows?.[0] ?? null;
}

export async function upsertSubscriptionByStripeId(
  stripeSubscriptionId: string,
  fields: Partial<SubscriptionRow> & { subscriber_id?: string; stripe_customer_id?: string },
): Promise<void> {
  await pg(`subscriptions`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ stripe_subscription_id: stripeSubscriptionId, ...fields, updated_at: new Date().toISOString() }]),
  });
}

export async function setSubscriberTier(subscriberId: string, tier: "free" | "plus"): Promise<void> {
  await pg(`subscribers?id=eq.${subscriberId}`, { method: "PATCH", body: JSON.stringify({ tier }) });
}

export async function findSubscriberByStripeCustomerId(stripeCustomerId: string): Promise<Subscriber | null> {
  const rows = await pg<{ subscribers: Subscriber }[]>(
    `subscriptions?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&select=subscribers(*)`,
  );
  return rows?.[0]?.subscribers ?? null;
}
