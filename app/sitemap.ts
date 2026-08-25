import type { MetadataRoute } from "next";
import { COUNTRIES } from "@/config/games";
import { getActivePricePoints, getAllProvinceSlugs, getAllRankings, getAllSlugs } from "@/lib/data";
import { getPlayableSlugs, getResultYears, getStats } from "@/lib/draws";
import { getAllGuides } from "@/lib/guides";
import { absUrl } from "@/lib/site";

export const dynamic = "force-static";

// Shard the sitemap: 0 = core + scratch, then one shard per country.
export async function generateSitemaps() {
  return [{ id: 0 }, ...COUNTRIES.map((_, i) => ({ id: i + 1 }))];
}

export default function sitemap({ id }: { id: number }): MetadataRoute.Sitemap {
  const allRankings = getAllRankings();
  const lastModified = new Date(allRankings.map((r) => r.generatedAt).sort().at(-1) ?? Date.now());
  const entries: MetadataRoute.Sitemap = [];
  const push = (
    path: string,
    priority: number,
    freq: "daily" | "weekly" | "monthly" | "yearly" = "weekly",
  ) => entries.push({ url: absUrl(path), lastModified, changeFrequency: freq, priority });

  if (id === 0) {
    push("/", 1, "daily");
    push("/scratch", 0.8, "daily");
    push("/methodology", 0.5, "monthly");
    push("/responsible-play", 0.3, "yearly");
    push("/guides", 0.7, "weekly");
    for (const g of getAllGuides()) {
      entries.push({
        url: absUrl(`/guides/${g.slug}`),
        lastModified: new Date(`${g.updated ?? g.date}T12:00:00`),
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
    for (const province of getAllProvinceSlugs()) {
      push(`/scratch/${province}`, 0.7, "daily");
      for (const p of getActivePricePoints(province)) push(`/scratch/${province}/price/${p}`, 0.6, "daily");
      for (const slug of getAllSlugs(province)) push(`/scratch/${province}/${slug}`, 0.6, "daily");
    }
    return entries;
  }

  const country = COUNTRIES[id - 1];
  if (!country) return entries;
  push(`/${country.slug}`, 0.9, "daily");
  for (const slug of getPlayableSlugs(country.code)) {
    const g = `/${country.slug}/${slug}`;
    push(g, 0.9, "daily");
    push(`${g}/results`, 0.8, "daily");
    push(`${g}/statistics`, 0.8, "daily");
    push(`${g}/generator`, 0.6, "monthly");
    push(`${g}/faq`, 0.5, "monthly");
    for (const y of getResultYears(slug)) push(`${g}/results/${y}`, 0.5, "weekly");
    const stats = getStats(slug);
    if (stats) for (let n = 1; n <= stats.max; n++) push(`${g}/number/${n}`, 0.4, "weekly");
  }
  return entries;
}
