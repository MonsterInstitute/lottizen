"use client";

import Link from "next/link";

/**
 * A nav link that remembers the user's country choice in the `lottizen_region`
 * cookie, which the geo-middleware reads with priority over IP. Use for the
 * Canada / USA switch so a manual choice always wins over geo.
 */
export function RegionLink({
  region,
  href,
  className,
  children,
}: {
  region: "CA" | "US";
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  function remember() {
    try {
      document.cookie = `lottizen_region=${region}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* private mode — ignore */
    }
  }
  return (
    <Link href={href} className={className} onClick={remember}>
      {children}
    </Link>
  );
}
