/**
 * Which pages go in sitemap.xml.
 *
 * Every page stays live, internally linked and indexable (no noindex). The
 * sitemap is only a hint about where Google should spend its attention, and
 * as of 2026-10-03 Google had indexed 61 of 2,022 listed URLs with 1,965
 * stuck at "Discovered – currently not indexed". So the sitemap lists the
 * pages that carry the site's value first, and the templated long tail is
 * added back in batches as indexing catches up.
 *
 * To add the next batch, raise SITEMAP_TIER by one. That is the only change
 * needed; app/sitemap.ts reads it and scripts/indexnow_submit.py reads the
 * built sitemap.
 *
 *   1  core (~550): home, country hubs, each game's overview / results /
 *      statistics, guides, scratch hubs + province rankings + every ticket
 *      page + price pages, static pages
 *   2  + each game's generator and FAQ (~36)
 *   3  + yearly results archives (~500)
 *   4  + per-number pages (~900): everything
 */
export const SITEMAP_TIER: SitemapTier = 1;

export type SitemapTier = 1 | 2 | 3 | 4;

export const TIER = {
  core: 1,
  gameTools: 2,
  resultYears: 3,
  numbers: 4,
} as const satisfies Record<string, SitemapTier>;

/** Rough URL count at each tier, for health checks (not exact; data-driven). */
export const SITEMAP_EXPECTED_MIN: Record<SitemapTier, number> = {
  1: 450,
  2: 480,
  3: 950,
  4: 1800,
};
