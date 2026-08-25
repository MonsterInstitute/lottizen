"use client";

import { useEffect } from "react";

// EU_COUNTRIES here must match middleware.ts's old EU set — the IP countries
// whose players play the games /europe covers (EuroMillions footprint + UK Lotto).
const EU_COUNTRIES = new Set(["GB", "IE", "FR", "ES", "PT", "AT", "BE", "CH", "LU"]);

function resolveCountry(): "CA" | "US" | "EU" | null {
  const cookie = typeof document !== "undefined" ? document.cookie : "";
  const region = cookie.match(/(?:^|; )lottizen_region=([^;]+)/);
  if (region) {
    const v = decodeURIComponent(region[1]).toUpperCase();
    if (v === "CA" || v === "US" || v === "EU") return v;
  }
  const geo = cookie.match(/(?:^|; )lottizen_geo=([^;]+)/);
  if (geo) {
    const country = decodeURIComponent(geo[1]).split("-")[0].toUpperCase();
    if (country === "CA" || country === "US") return country;
    if (EU_COUNTRIES.has(country)) return "EU";
  }
  return null;
}

/**
 * Moves the visitor's home-country block to the top of #country-blocks on the
 * homepage — replaces the old server-side redirect (see middleware.ts) with
 * pure client-side reordering so the same URL and HTML ship to every visitor
 * and crawler; only the order changes, after mount.
 */
export function HomeGeoSort() {
  useEffect(() => {
    const country = resolveCountry();
    if (!country) return;
    const el = document.querySelector<HTMLElement>(`[data-country-block="${country}"]`);
    const parent = el?.parentElement;
    if (el && parent && parent.firstElementChild !== el) {
      parent.insertBefore(el, parent.firstElementChild);
    }
  }, []);
  return null;
}
