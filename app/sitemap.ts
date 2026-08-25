import type { MetadataRoute } from "next";
import { COUNTRIES, gamesForCountry, getGame } from "@/config/games";
import { getActivePricePoints, getAllProvinceSlugs, getAllRankings, getAllSlugs, getGameBySlug, getGamesByPrice, getRankings } from "@/lib/data";
import { getDrawsByYear, getLatestAll, getNumberStat, getPlayableSlugs, getResultYears, getStats, hasData } from "@/lib/draws";
import { getAllGuides } from "@/lib/guides";
import { absUrl } from "@/lib/site";

export const dynamic = "force-static";

/**
 * A single flat sitemap.xml — no sharding. ~1,600 URLs total, far below
 * the protocol's 50,000-URL / 50MB-per-file limit, so splitting bought
 * nothing but complexity (and the split index, app/sitemap.xml/route.ts,
 * had to be hand-written since generateSitemaps() doesn't create one — see
 * git history). If this ever grows into the tens of thousands (e.g. a pSEO
 * expansion), re-introduce sharding with STABLE names
 * (sitemap-canada.xml, sitemap-scratch.xml, ...), never numeric ids —
 * a renumbered shard silently changes what's inside a previously-crawled
 * URL, which is worse than not sharding at all.
 *
 * lastmod is only ever set to a REAL "this content last changed" date —
 * never a build/scrape timestamp. A page whose content didn't change gets
 * the same lastmod as last time, even though the site rebuilds daily;
 * pages with no meaningful change signal (static editorial content, tool
 * pages) omit lastmod entirely rather than guess. Google explicitly
 * documents that an untrustworthy lastmod (e.g. every URL sharing today's
 * build time) gets the signal ignored site-wide — a fabricated date is
 * worse than no date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  const push = (path: string, lastModified?: Date) => {
    const e: MetadataRoute.Sitemap[number] = { url: absUrl(path) };
    if (lastModified) e.lastModified = lastModified;
    entries.push(e);
  };

  // ---- Scratch (5 provinces) ----
  const allRankings = getAllRankings();
  const scratchOverallLatest = maxDate(
    allRankings.flatMap((r) => r.games.map((g) => g.dataChangedAt)),
  );
  push("/scratch", scratchOverallLatest);

  for (const province of getAllProvinceSlugs()) {
    const { games } = getRankings(province);
    push(`/scratch/${province}`, maxDate(games.map((g) => g.dataChangedAt)));

    // Exactly the price points app/scratch/[province]/price/[price]/page.tsx
    // actually generates (generateStaticParams reads the same function) —
    // deriving this any other way risks the sitemap listing a price bucket
    // that was never built, or missing one that was.
    for (const p of getActivePricePoints(province)) {
      push(`/scratch/${province}/price/${p}`, maxDate(getGamesByPrice(province, p).map((g) => g.dataChangedAt)));
    }
    for (const slug of getAllSlugs(province)) {
      const g = getGameBySlug(province, slug);
      push(`/scratch/${province}/${slug}`, g ? new Date(g.dataChangedAt) : undefined);
    }
  }

  // ---- Draw games (latestBySlug computed first — the home page's lastmod
  // below is the max latest-draw-date across every live game, the same
  // real signal that drives what "today's results" shows on `/`). ----
  const latestBySlug = new Map(getLatestAll().map((l) => [l.slug, l.latestDate]));

  push("/", maxDate([...latestBySlug.values()]));

  // ---- Static / editorial (no real per-page change signal — omit lastmod) ----
  push("/methodology");
  push("/responsible-play");
  push("/guides");
  push("/api");
  push("/plus");
  push("/terms");
  push("/refund-policy");

  for (const g of getAllGuides()) {
    push(`/guides/${g.slug}`, new Date(`${g.updated ?? g.date}T12:00:00`));
  }

  for (const country of COUNTRIES) {
    const countryLatest = maxDate(
      gamesForCountry(country.code)
        .filter((g) => g.live && hasData(g.slug))
        .map((g) => latestBySlug.get(g.slug))
        .filter((d): d is string => Boolean(d)),
    );
    push(`/${country.slug}`, countryLatest);

    for (const slug of getPlayableSlugs(country.code)) {
      const g = `/${country.slug}/${slug}`;
      const latest = latestBySlug.get(slug);
      const latestDate = latest ? new Date(latest) : undefined;

      push(g, latestDate);
      push(`${g}/results`, latestDate);
      push(`${g}/statistics`, latestDate);
      // Digit games (Numbers, Win 4) have no generator page — the route
      // itself 404s for them (see app/[country]/[game]/generator/page.tsx),
      // so listing one in the sitemap would be a dead link, not just a
      // missing lastmod.
      if (getGame(slug)?.format !== "digit") {
        push(`${g}/generator`); // static tool — no data-driven change signal
      }
      push(`${g}/faq`); // static content — no data-driven change signal

      for (const y of getResultYears(slug)) {
        const yearDates = getDrawsByYear(slug, y).map((d) => d.date);
        push(`${g}/results/${y}`, maxDate(yearDates));
      }

      const stats = getStats(slug);
      if (stats) {
        for (let n = 1; n <= stats.max; n++) {
          const ns = getNumberStat(slug, n);
          push(`${g}/number/${n}`, ns?.lastDate ? new Date(ns.lastDate) : undefined);
        }
      }
    }
  }

  return entries;
}

/** Latest of a list of ISO date/datetime strings, or undefined if empty —
 * lexicographic max works directly since every date here is "YYYY-MM-DD"
 * or a full ISO timestamp, both sort correctly as strings. */
function maxDate(isoStrings: (string | undefined | null)[]): Date | undefined {
  const valid = isoStrings.filter((d): d is string => Boolean(d));
  if (valid.length === 0) return undefined;
  return new Date(valid.sort().at(-1)!);
}
