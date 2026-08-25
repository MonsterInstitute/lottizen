import { NextResponse, type NextRequest } from "next/server";

/**
 * Geo hint only — no redirects.
 *
 * `/` used to 307-redirect by IP country (CA → /canada, US → /usa, EU → /europe).
 * Removed: Googlebot crawls primarily from US-tagged IPs, so it never saw the
 * real homepage — only a redirect response — which is very likely why GSC showed
 * ~50/2019 pages indexed despite a clean sitemap. A User-Agent allowlist for
 * crawlers was considered and rejected: serving different content (a real page
 * vs. a redirect) to bots vs. humans on the same URL is cloaking by Google's own
 * definition, even when well-intentioned, and risks a trust/manual-action penalty.
 * The homepage already has real multi-country content (hero CTAs + per-country
 * game blocks for every entry in COUNTRIES), so instead of redirecting we now
 * only reorder those blocks client-side — see components/site/HomeGeoSort.tsx,
 * the same non-redirect pattern already used on /statistics and /generator.
 *
 * On every matched path we write a lightweight, non-httpOnly cookie
 * `lottizen_geo` = "<country>-<region>" (e.g. "CA-ON", "US-NY") from Vercel's
 * geo headers, read client-side to sort the user's country/province/state
 * content to the top. The pages stay fully static/crawlable either way.
 */
export const config = { matcher: ["/", "/statistics", "/generator"] };

const YEAR = 60 * 60 * 24 * 365;

export function middleware(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const country = req.headers.get("x-vercel-ip-country")?.toUpperCase();
  const region = req.headers.get("x-vercel-ip-country-region")?.toUpperCase();

  // Build the geo hint (fall back to a dev override in local development).
  const devGeo = process.env.DEV_GEO?.toUpperCase();
  const geo =
    (country ? (region ? `${country}-${region}` : country) : undefined) ||
    devGeo ||
    (isDev ? "CA-ON" : undefined);

  const res = NextResponse.next();
  if (geo) res.cookies.set("lottizen_geo", geo, { path: "/", maxAge: YEAR, sameSite: "lax" });
  return res;
}
