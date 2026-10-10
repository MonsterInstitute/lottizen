"use client";

import { useEffect, useState } from "react";

/** "3 days 4 hours" to an ISO instant, ticking client-side; the build-time
 *  text is the fallback (the page is static). */
export function Countdown({ at, fallback }: { at: string; fallback: string }) {
  const [text, setText] = useState(fallback);
  useEffect(() => {
    const tick = () => {
      const ms = new Date(at).getTime() - Date.now();
      if (ms <= 0) return setText("closed");
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setText(d > 0 ? `${d} day${d === 1 ? "" : "s"} ${h} h` : `${h} h ${m} min`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [at]);
  return <span className="countdown">{text}</span>;
}
