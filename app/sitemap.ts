import type { MetadataRoute } from "next";
import { COUNTRIES } from "@/config/games";
import { getActivePricePoints, getAllSlugs, getRankings } from "@/lib/data";
import { getPlayableSlugs, getResultYears, getStats } from "@/lib/draws";
import { absUrl } from "@/lib/site";

export const dynamic = "force-static";

// Shard the sitemap: 0 = core + scratch, then one shard per country.
export async function generateSitemaps() {
  return [{ id: 0 }, ...COUNTRIES.map((_, i) => ({ id: i + 1 }))];
}

export default function sitemap({ id }: { id: number }): MetadataRoute.Sitemap {
  const lastModified = new Date(getRankings().generatedAt);
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
    for (const p of getActivePricePoints()) push(`/scratch/price/${p}`, 0.6, "daily");
    for (const slug of getAllSlugs()) push(`/scratch/${slug}`, 0.6, "daily");
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
