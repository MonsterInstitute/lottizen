/**
 * Server-only Supabase data layer for the subscription system. Unlike
 * lib/data.ts / lib/draws.ts (build-time JSON, read by every page), this
 * talks to Supabase's PostgREST API at REQUEST TIME with the service-role
 * key — subscribers sign up, confirm, and edit preferences live.
 *
 * Deliberately a hand-rolled `fetch()` wrapper instead of @supabase/supabase-js:
 * scripts/prefetch_supabase.mjs already avoids that SDK because its realtime
 * module assumes a native `WebSocket` global that isn't reliably present
 * everywhere Node runs; talking to PostgREST directly sidesteps that
 * entirely and needs nothing beyond fetch(), already global in the Next.js
 * server runtime.
 *
 * Only ever imported from route handlers (app/api/subscribe/**) — never
 * from a page component — so SUPABASE_SERVICE_ROLE_KEY never reaches the
 * client bundle.
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
