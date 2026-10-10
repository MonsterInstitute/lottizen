"use client";

import { useEffect, useState } from "react";
import { HOME_REGIONS, type HomeRegion } from "@/components/home/regions";

/** A compact region chooser for the hero. Remembers the choice
 *  (localStorage) and tells the page (a "lottizen-region" event) so the
 *  country blocks can reorder too. */
export function RegionSelect() {
  const [active, setActive] = useState<string>("");
  useEffect(() => {
    setActive(document.documentElement.getAttribute("data-home-region") || "");
  }, []);
  return (
    <label className="region-select">
      <span>Showing</span>
      <select
        value={active}
        onChange={(e) => {
          const key = e.target.value as HomeRegion;
          document.documentElement.setAttribute("data-home-region", key);
          try {
            localStorage.setItem("lottizen_home_region", key);
          } catch {
            /* private mode: not remembered */
          }
          setActive(key);
          window.dispatchEvent(new CustomEvent("lottizen-region", { detail: key }));
        }}
      >
        {HOME_REGIONS.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
