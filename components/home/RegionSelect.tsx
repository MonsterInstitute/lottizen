"use client";

import { useEffect, useState } from "react";
import { HOME_REGIONS } from "@/components/home/regions";

const COUNTRY_OF = (r: string) => (r === "usa" ? "US" : r === "europe" ? "EU" : "CA");

/** Region chooser (hero and nav). Remembers the choice in localStorage and
 *  applies it at once to <html data-home-region / data-home-country>, which
 *  the whole page's CSS keys on. "All regions" clears it: everything shows. */
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
    } else {
      d.setAttribute("data-home-region", key);
      d.setAttribute("data-home-country", COUNTRY_OF(key));
    }
    try {
      localStorage.setItem("lottizen_home_region", key);
    } catch {
      /* private mode: not remembered */
    }
    window.dispatchEvent(new CustomEvent("lottizen-region", { detail: key }));
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
