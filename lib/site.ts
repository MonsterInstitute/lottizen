/** Site-wide constants used by metadata, SEO, and chrome. */
export const SITE = {
  name: "Lottizen",
  // Was "Smarter Scratch. Better Odds." — accurate only while the site was
  // Ontario-scratch-only (its original July launch scope). The site's core
  // is draw-lottery numbers/stats now, with scratch as one part; this
  // covers both without overclaiming either.
  tagline: "Smarter Numbers. Real Value.",
  description:
    "Winning numbers, results, and number statistics for major lotteries across Canada, the US, and Europe — plus the only scratch-ticket value tracker covering all 5 Canadian provincial lottery agencies.",
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
