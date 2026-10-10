"use client";

import { useEffect } from "react";
import { EU_COUNTRY_CODES } from "@/config/games";

function resolveCountry(): "CA" | "US" | "EU" | null {
  // The homepage's region (set before paint by RegionScript, or by the
  // visitor's choice) wins, so the hero card and the block order agree.
  const region = typeof document !== "undefined" ? document.documentElement.getAttribute("data-home-region") : null;
  if (region === "usa") return "US";
  if (region === "europe") return "EU";
  if (region) return "CA";
  const cookie = typeof document !== "undefined" ? document.cookie : "";
  const pref = cookie.match(/(?:^|; )lottizen_region=([^;]+)/);
  if (pref) {
    const v = decodeURIComponent(pref[1]).toUpperCase();
    if (v === "CA" || v === "US" || v === "EU") return v;
  }
  const geo = cookie.match(/(?:^|; )lottizen_geo=([^;]+)/);
  if (geo) {
    const country = decodeURIComponent(geo[1]).split("-")[0].toUpperCase();
    if (country === "CA" || country === "US") return country;
    if (country in EU_COUNTRY_CODES) return "EU";
  }
  return null;
}

/**
 * Moves the visitor's home-country block to the top of #country-blocks on the
 * homepage — replaces the old server-side redirect (see middleware.ts) with
 * pure client-side reordering so the same URL and HTML ship to every visitor
 * and crawler; only the order changes, after mount. A block marked
 * data-follows="<country>" (the scratch board after Canada) moves with it.
 */
export function HomeGeoSort() {
  useEffect(() => {
    const sort = () => {
      const country = resolveCountry();
      if (!country) return;
      const el = document.querySelector<HTMLElement>(`[data-country-block="${country}"]`);
      const parent = el?.parentElement;
      if (!el || !parent) return;
      if (parent.firstElementChild !== el) parent.insertBefore(el, parent.firstElementChild);
      const follower = parent.querySelector<HTMLElement>(`[data-follows="${country}"]`);
      if (follower && el.nextElementSibling !== follower) parent.insertBefore(follower, el.nextElementSibling);
    };
    sort();
    window.addEventListener("lottizen-region", sort);
    return () => window.removeEventListener("lottizen-region", sort);
  }, []);
  return null;
}
