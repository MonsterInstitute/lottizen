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

/**
 * Build an absolute URL from a path, percent-encoding any non-ASCII
 * characters (encodeURI leaves "/", "?", "#", etc. alone — it's designed
 * for encoding a full URI, not a single path segment). The sitemap
 * protocol requires every <loc> to be percent-escaped; this is the single
 * place that guarantees the sitemap, canonical tags, and anywhere else
 * absUrl() is used all emit the identical encoded form for the same page,
 * rather than relying on each call site to remember to encode. No
 * currently-live route actually has non-ASCII characters (Loto-Québec's
 * adapter now ASCII-folds slugs — see scripts/db.py's slugify()); this is
 * defensive for whatever comes next, not a fix for anything still live.
 */
export function absUrl(path = ""): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  // next.config.mjs sets trailingSlash: false site-wide; Next's own
  // metadata canonical resolution follows that (even for "/", which
  // resolves to the bare origin with no trailing slash at all) — mirror
  // it here so absUrl() never disagrees with the canonical tag it's
  // supposed to match (sitemap <loc>, JSON-LD, OG tags, ...).
  const trimmed = withSlash === "/" ? "" : withSlash.replace(/\/$/, "");
  return `${SITE.url}${encodeURI(trimmed)}`;
}
