"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Counts a page view (app/api/pv) on every route change. No cookies, no
 *  identifiers — just the path. */
export function PageView() {
  const path = usePathname();
  useEffect(() => {
    if (!path || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return;
    const body = JSON.stringify({ path });
    try {
      if (!navigator.sendBeacon?.("/api/pv", new Blob([body], { type: "application/json" }))) {
        fetch("/api/pv", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
      }
    } catch {
      /* never block the page */
    }
  }, [path]);
  return null;
}
