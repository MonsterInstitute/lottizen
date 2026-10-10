"use client";

import { useEffect, useState } from "react";

/** Days until a YYYY-MM-DD claim deadline, counted in Toronto. Renders the
 *  build-time figure first (so the static HTML is right on the day it was
 *  built), then recomputes in the browser so a page cached for a day or two
 *  never shows a stale countdown. */
export function DaysLeft({ expires, initial }: { expires: string; initial: number }) {
  const [days, setDays] = useState(initial);
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }); // YYYY-MM-DD
    const ms = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return Date.UTC(y, m - 1, d);
    };
    setDays(Math.round((ms(expires) - ms(today)) / 86_400_000));
  }, [expires]);
  if (days < 0) return <span>expired</span>;
  if (days === 0) return <strong>today</strong>;
  return <span>{days === 1 ? "1 day" : `${days} days`}</span>;
}
