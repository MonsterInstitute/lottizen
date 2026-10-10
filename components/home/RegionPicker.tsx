"use client";

import { useEffect, useState } from "react";
import { HOME_REGIONS, type HomeRegion } from "@/components/home/regions";

/** Region buttons. Remembers the choice (localStorage) so it wins over the
 *  geo guess next visit; switching only changes <html data-home-region>. */
export function RegionPicker() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    setActive(document.documentElement.getAttribute("data-home-region"));
  }, []);
  const choose = (key: HomeRegion) => {
    document.documentElement.setAttribute("data-home-region", key);
    try {
      localStorage.setItem("lottizen_home_region", key);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
    setActive(key);
  };
  return (
    <nav aria-label="Choose your region" className="region-picker">
      {HOME_REGIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => choose(r.key)}
          aria-pressed={active === r.key}
          className={active === r.key ? "region-btn active" : "region-btn"}
          title={r.label}
        >
          {r.short}
        </button>
      ))}
    </nav>
  );
}
