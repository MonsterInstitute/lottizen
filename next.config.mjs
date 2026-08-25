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
    ];
  },
};

export default nextConfig;
