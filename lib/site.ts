/** Site-wide constants used by metadata, SEO, and chrome. */
export const SITE = {
  name: "Lottizen",
  tagline: "Smarter Scratch. Better Odds.",
  description:
    "Canadian lottery winning numbers, results, and number statistics — Lotto Max, Lotto 6/49, Ontario 49 and more — plus a scratch-ticket value tracker.",
  // Set NEXT_PUBLIC_SITE_URL in the environment for canonical/OG/sitemap URLs.
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://lottizen.com").replace(/\/$/, ""),
  locale: "en_CA",
  twitter: "@lottizen",
  province: "Ontario",
} as const;

export function absUrl(path = ""): string {
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}
