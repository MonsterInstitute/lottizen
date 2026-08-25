import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * Permanent redirects for the old Ontario-only scratch URLs, now that
 * /scratch covers 5 provinces (see /scratch/ontario/*). Built from the
 * CURRENT OLG game list (data/rankings/ontario.json, already prefetched
 * from Supabase by `prebuild` before `next build` runs) rather than a
 * wildcard — an explicit list can never accidentally swallow the new
 * `/scratch/:province` routes, since no OLG game slug collides with a
 * province slug (ontario/british-columbia/western/atlantic/quebec).
 */
function legacyScratchRedirects() {
  let slugs = [];
  try {
    const data = JSON.parse(
      readFileSync(join(ROOT, "data", "rankings", "ontario.json"), "utf-8"),
    );
    slugs = data.games.map((g) => g.slug);
  } catch {
    // data/rankings/ontario.json doesn't exist yet (e.g. a fresh checkout
    // before the first `prebuild` run) — skip slug redirects for this
    // build rather than fail it; the price-point redirect below still works.
    return [];
  }
  return slugs.map((slug) => ({
    source: `/scratch/${slug}`,
    destination: `/scratch/ontario/${slug}`,
    permanent: true,
  }));
}

/**
 * Loto-Québec's slugify() used to leave French accents in the URL
 * (Élite, Années 90, Diva à Paris, ...) — a real sitemap-protocol
 * violation (unescaped non-ASCII in <loc>) fixed by ASCII-folding new
 * slugs going forward (see scripts/db.py's slugify()). These 12 games
 * already had accented slugs live, so their old URLs get a permanent
 * redirect to the new ASCII ones — a static list (not derived from
 * current data, since the old slugs no longer exist anywhere to derive
 * from) built once by diffing the DB before/after the slugify fix shipped.
 */
const QUEBEC_ACCENT_SLUG_REDIRECTS = [
  ["années-90", "annees-90"],
  ["diva-à-paris", "diva-a-paris"],
  ["gagnant-à-vie", "gagnant-a-vie"],
  ["la-voûte", "la-voute"],
  ["mots-cachés-astrologie", "mots-caches-astrologie"],
  ["mots-cachés-plantes", "mots-caches-plantes"],
  ["mots-cachés", "mots-caches"],
  ["néon", "neon"],
  ["slingo-jeu-de-dés", "slingo-jeu-de-des"],
  ["slingo-sucré", "slingo-sucre"],
  ["à-la-piscine", "a-la-piscine"],
  ["élite", "elite"],
];

function quebecAccentSlugRedirects() {
  return QUEBEC_ACCENT_SLUG_REDIRECTS.map(([oldSlug, newSlug]) => ({
    source: `/scratch/quebec/${encodeURIComponent(oldSlug)}`,
    destination: `/scratch/quebec/${newSlug}`,
    permanent: true,
  }));
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: not using `output: "export"` — a pure static export can't run Edge
  // Middleware (needed for geo-routing). Every page still uses generateStaticParams
  // + dynamicParams=false, so they are prerendered as static HTML (SSG); Vercel
  // serves them statically and only runs middleware on `/`.
  images: {
    unoptimized: true,
  },
  trailingSlash: false,
  async redirects() {
    return [
      {
        source: "/scratch/price/:price",
        destination: "/scratch/ontario/price/:price",
        permanent: true,
      },
      ...legacyScratchRedirects(),
      ...quebecAccentSlugRedirects(),
    ];
  },
};

export default nextConfig;
