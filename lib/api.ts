/**
 * Shared plumbing for the public REST API (app/api/v1/**). Every route
 * handler renders data already materialized at build time (see lib/data.ts,
 * lib/draws.ts) — there is no per-request Supabase call — but the routes
 * still run dynamically because they read request headers (RapidAPI proxy
 * secret) and, in a couple of cases, query params. CDN caching is handled
 * entirely via the Cache-Control header, not Next's static rendering.
 */
import { NextResponse } from "next/server";
import type { Country, GameConfig } from "@/config/games";
import { countryName, getGame, operatorName } from "@/config/games";
import { getStats, hasData } from "@/lib/draws";

/** Data refreshes once a day (daily scrape + rebuild), so a 1h edge cache
 *  with a 24h stale-while-revalidate window is safe and cheap. */
export const API_CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-RapidAPI-Proxy-Secret, X-RapidAPI-Key",
};

export function apiOk<T>(data: T, meta: Record<string, unknown> | null = null, status = 200) {
  return NextResponse.json(
    { data, meta },
    { status, headers: { "Cache-Control": API_CACHE_CONTROL, ...CORS_HEADERS } },
  );
}

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store", ...CORS_HEADERS } },
  );
}

/** CORS preflight — assign directly: `export const OPTIONS = apiOptions;` */
export function apiOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Gate for the RapidAPI marketplace listing. Off by default (env var unset)
 * so every endpoint stays publicly reachable while the listing is being
 * configured and tested from the RapidAPI dashboard. Flip
 * API_REQUIRE_RAPIDAPI_SECRET=true once the listing is live to require the
 * `X-RapidAPI-Proxy-Secret` header RapidAPI's proxy attaches to every
 * forwarded request — that rejects any direct (non-proxied) traffic.
 */
export function checkRapidApiSecret(req: Request): NextResponse | null {
  if (process.env.API_REQUIRE_RAPIDAPI_SECRET !== "true") return null;
  const expected = process.env.RAPIDAPI_PROXY_SECRET;
  const got = req.headers.get("x-rapidapi-proxy-secret");
  if (!expected || got !== expected) {
    return apiError(
      401,
      "UNAUTHORIZED",
      "This API is only reachable via its RapidAPI listing. Missing or invalid X-RapidAPI-Proxy-Secret header.",
    );
  }
  return null;
}

export interface ApiGame {
  slug: string;
  name: string;
  country: Country;
  countryName: string;
  agency: string;
  operator: string;
  region: string;
  format: GameConfig["format"];
  pick: number;
  max: number;
  hasBonus: boolean;
  bonusLabel: string | null;
  bonusMax: number | null;
  bonusCount: number;
  drawDays: string[];
  price: number;
  currency: string;
  blurb: string;
  progressive: boolean;
  drawCount: number;
  dataSince: string | null;
}

/** Public API shape for a draw-lottery game (config/games.ts + its stats file). */
export function toApiGame(g: GameConfig): ApiGame {
  const stats = getStats(g.slug);
  return {
    slug: g.slug,
    name: g.name,
    country: g.country,
    countryName: countryName(g.country),
    agency: g.agency,
    operator: operatorName(g),
    region: g.region,
    format: g.format,
    pick: g.pick,
    max: g.max,
    hasBonus: g.hasBonus,
    bonusLabel: g.bonusLabel ?? null,
    bonusMax: g.bonusMax ?? null,
    bonusCount: g.bonusCount ?? 1,
    drawDays: g.drawDays,
    price: g.price,
    currency: g.currency,
    blurb: g.blurb,
    progressive: Boolean(g.progressive),
    drawCount: stats?.drawCount ?? 0,
    dataSince: stats?.dataSince ?? null,
  };
}

/** Resolve a slug to a live, data-backed game — the only games the /games/*
 *  endpoints serve (mirrors resolveGame() in lib/draws.ts, minus the
 *  per-country page routing that function also does). */
export function apiGameOrNull(slug: string): GameConfig | null {
  const g = getGame(slug);
  if (!g || !g.live || !hasData(g.slug)) return null;
  return g;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isValidDateParam(v: string | null): v is string {
  return v === null || DATE_RE.test(v);
}

export interface PageResult<T> {
  page: T[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

/** Clamp `limit`/`offset` query params and slice. Default 50, hard cap 500. */
export function paginate<T>(items: T[], searchParams: URLSearchParams): PageResult<T> {
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50, 1), 500);
  const rawOffset = Number(searchParams.get("offset"));
  const offset = Math.max(Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0, 0);
  const page = items.slice(offset, offset + limit);
  return { page, limit, offset, total: items.length, hasMore: offset + limit < items.length };
}
