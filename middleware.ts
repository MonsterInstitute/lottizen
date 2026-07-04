import { NextResponse, type NextRequest } from "next/server";

/**
 * Geo-routing + geo hint.
 *
 * On `/`: redirect Canadian visitors to /canada, US visitors to /usa, and
 * European visitors (GB/IE/FR/ES/PT/AT/BE/CH/LU — the EuroMillions/EuroJackpot/
 * UK Lotto footprint) to /europe (307, uncached); other countries stay on the
 * landing page. Precedence: lottizen_region cookie (nav country switch) >
 * x-vercel-ip-country > DEV_GEO_COUNTRY > CA in dev.
 *
 * On every matched path we also write a lightweight, non-httpOnly cookie
 * `lottizen_geo` = "<country>-<region>" (e.g. "CA-ON", "US-NY") from Vercel's
 * geo headers. The /statistics and /generator hubs read it client-side to sort
 * the user's province/state games to the top — the pages stay fully static.
 */
export const config = { matcher: ["/", "/statistics", "/generator"] };

const YEAR = 60 * 60 * 24 * 365;

// Countries whose players play the European games we cover (EuroMillions is sold
// across these; UK Lotto in GB). IP country in this set → /europe.
const EU_COUNTRIES = new Set(["GB", "IE", "FR", "ES", "PT", "AT", "BE", "CH", "LU"]);

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

  const withGeo = (res: NextResponse) => {
    if (geo) res.cookies.set("lottizen_geo", geo, { path: "/", maxAge: YEAR, sameSite: "lax" });
    return res;
  };

  // Only the root path redirects by country.
  if (req.nextUrl.pathname === "/") {
    const chosen =
      req.cookies.get("lottizen_region")?.value?.toUpperCase() ||
      country ||
      process.env.DEV_GEO_COUNTRY?.toUpperCase() ||
      (isDev ? "CA" : undefined);
    if (chosen === "CA") return withGeo(NextResponse.redirect(new URL("/canada", req.url), 307));
    if (chosen === "US") return withGeo(NextResponse.redirect(new URL("/usa", req.url), 307));
    if (chosen === "EU" || (chosen && EU_COUNTRIES.has(chosen)))
      return withGeo(NextResponse.redirect(new URL("/europe", req.url), 307));
    return withGeo(NextResponse.next());
  }

  // Hub pages: just set the geo hint.
  return withGeo(NextResponse.next());
}
