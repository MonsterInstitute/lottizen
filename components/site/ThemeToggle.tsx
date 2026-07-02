"use client";

import { useEffect, useState } from "react";

/**
 * Day / "After Hours" theme toggle. Mirrors the v5 mockup's bulb toggle:
 * a fixed circular button with an offset shadow that flips
 * <html data-theme="day|night"> and persists the choice.
 */
export function ThemeToggle() {
  const [night, setNight] = useState(false);

  useEffect(() => {
    setNight(document.documentElement.getAttribute("data-theme") === "night");
  }, []);

  function toggle() {
    const next = !night;
    setNight(next);
    const theme = next ? "night" : "day";
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("lottizen-theme", theme);
    } catch {
      /* private mode — ignore */
    }
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label="Toggle After Hours mode"
      type="button"
    >
      <span className="bulb" />
      <span className="theme-toggle-label">
        {night ? "DAYLIGHT" : "AFTER HOURS"}
      </span>
    </button>
  );
}
