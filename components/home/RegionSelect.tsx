"use client";

import { useEffect, useState } from "react";
import { HOME_REGIONS } from "@/components/home/regions";

const COUNTRY_OF = (r: string) => (r === "usa" ? "US" : r === "europe" ? "EU" : "CA");
const SINGLE: Record<string, string> = {
  ontario: "ON", quebec: "QC", "british-columbia": "BC", alberta: "AB", saskatchewan: "SK", manitoba: "MB",
};
const MULTI: Record<string, string[]> = { atlantic: ["NB", "NS", "PE", "NL"], territories: ["YT", "NT", "NU"] };
/** The exact province for a region, if it's known: a single-province region,
 *  or the geo cookie's province when it lies within the chosen region. */
function provinceFor(region: string): string | null {
  if (SINGLE[region]) return SINGLE[region];
  const m = document.cookie.match(/(?:^|; )lottizen_geo=([^;]+)/);
  const geo = m ? decodeURIComponent(m[1]).toUpperCase().split("-") : [];
  return geo[0] === "CA" && MULTI[region]?.includes(geo[1]) ? geo[1] : null;
}
const RESULTS_PAGE = (r: string) => (r === "usa" ? "/usa" : r === "europe" ? "/europe" : "/canada");

/** Region chooser (hero, nav, /picks). Every instance does the same thing:
 *  applies the choice at once to <html data-home-region / data-home-country>,
 *  which the whole page's CSS keys on, remembers it (localStorage + the
 *  lottizen_region cookie, both read by RegionScript), and tells the other
 *  selectors on the page (lottizen-region event) so they stay in sync.
 *  "All regions" clears it: everything shows. The nav's selector, used away
 *  from the homepage, then goes to that region's results page (except a
 *  Canadian province chosen on /picks, which switches the province there). */
export function RegionSelect({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState<string>("all");
  useEffect(() => {
    const sync = () => setActive(document.documentElement.getAttribute("data-home-region") || "all");
    sync();
    window.addEventListener("lottizen-region", sync);
    return () => window.removeEventListener("lottizen-region", sync);
  }, []);
  const choose = (key: string) => {
    const d = document.documentElement;
    if (key === "all") {
      d.removeAttribute("data-home-region");
      d.removeAttribute("data-home-country");
      d.removeAttribute("data-home-prov");
    } else {
      d.setAttribute("data-home-region", key);
      d.setAttribute("data-home-country", COUNTRY_OF(key));
      const prov = provinceFor(key);
      if (prov) d.setAttribute("data-home-prov", prov);
      else d.removeAttribute("data-home-prov");
    }
    try {
      localStorage.setItem("lottizen_home_region", key);
    } catch {
      /* private mode: the cookie below still remembers it */
    }
    document.cookie = `lottizen_region=${key}; path=/; max-age=31536000; samesite=lax`;
    setActive(key);
    window.dispatchEvent(new CustomEvent("lottizen-region", { detail: key }));
    const path = window.location.pathname;
    const staysHere = path === "/" || (COUNTRY_OF(key) === "CA" && key !== "all" && path.startsWith("/picks"));
    if (compact && key !== "all" && !staysHere) window.location.assign(RESULTS_PAGE(key));
  };
  return (
    <label className={compact ? "region-select region-select-compact" : "region-select"}>
      {compact ? null : <span>Showing</span>}
      <select aria-label="Region" value={active} onChange={(e) => choose(e.target.value)}>
        {HOME_REGIONS.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
        <option value="all">All regions</option>
      </select>
    </label>
  );
}
