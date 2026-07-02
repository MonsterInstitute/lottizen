/** Site-wide constants used by metadata, SEO, and chrome. */
export const SITE = {
  name: "Lottizen",
  tagline: "Smarter Scratch. Better Odds.",
  description:
    "Live value rankings for Ontario scratch tickets. We track OLG's remaining instant-game prizes and compute a Value Score so you know which scratch ticket is worth buying right now.",
  // Set NEXT_PUBLIC_SITE_URL in the environment for canonical/OG/sitemap URLs.
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://lottizen.com").replace(/\/$/, ""),
  locale: "en_CA",
  twitter: "@lottizen",
  province: "Ontario",
} as const;

export function absUrl(path = ""): string {
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}
