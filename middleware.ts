import { NextResponse, type NextRequest } from "next/server";

/**
 * Geo-routing — runs ONLY on `/` (see matcher). Sends Canadian visitors to
 * /canada and US visitors to /usa; everyone else stays on the two-country
 * landing page. All other paths (/canada/*, /usa/*, /scratch/*, …) are never
 * intercepted, so users and crawlers reach any page directly.
 *
 * Precedence: explicit user choice (lottizen_region cookie, set by the nav
 * country switch) > real geo (x-vercel-ip-country) > dev override
 * (DEV_GEO_COUNTRY) > default CA in development. Uses a 307 (temporary) so the
 * redirect is never cached and users can always switch countries.
 */
export const config = { matcher: "/" };

export function middleware(req: NextRequest) {
  const cookie = req.cookies.get("lottizen_region")?.value?.toUpperCase();
  const ip = req.headers.get("x-vercel-ip-country")?.toUpperCase();
  const devOverride = process.env.DEV_GEO_COUNTRY?.toUpperCase();
  const isDev = process.env.NODE_ENV !== "production";

  const region = cookie || ip || devOverride || (isDev ? "CA" : undefined);

  if (region === "CA") return NextResponse.redirect(new URL("/canada", req.url), 307);
  if (region === "US") return NextResponse.redirect(new URL("/usa", req.url), 307);

  // Unknown / other countries: stay on the landing page.
  return NextResponse.next();
}
