import type { MetadataRoute } from "next";
import { getActivePricePoints, getAllSlugs, getRankings } from "@/lib/data";
import { getPlayableSlugs, getResultYears, getStats } from "@/lib/draws";
import { absUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const { generatedAt } = getRankings();
  const lastModified = new Date(generatedAt);
  const entries: MetadataRoute.Sitemap = [];
  const push = (path: string, priority: number, freq: "daily" | "weekly" | "monthly" | "yearly" = "weekly") =>
    entries.push({ url: absUrl(path), lastModified, changeFrequency: freq, priority });

  // Core
  push("/", 1, "daily");
  push("/canada", 0.9, "daily");
  push("/scratch", 0.8, "daily");
  push("/methodology", 0.5, "monthly");
  push("/responsible-play", 0.3, "yearly");

  // Draw games
  for (const slug of getPlayableSlugs()) {
    push(`/canada/${slug}`, 0.9, "daily");
    push(`/canada/${slug}/results`, 0.8, "daily");
    push(`/canada/${slug}/statistics`, 0.8, "daily");
    push(`/canada/${slug}/generator`, 0.6, "monthly");
    push(`/canada/${slug}/faq`, 0.5, "monthly");
    for (const y of getResultYears(slug)) push(`/canada/${slug}/results/${y}`, 0.5, "weekly");
    const stats = getStats(slug);
    if (stats) {
      for (let n = 1; n <= stats.max; n++) push(`/canada/${slug}/number/${n}`, 0.5, "weekly");
    }
  }

  // Scratch module
  for (const p of getActivePricePoints()) push(`/scratch/price/${p}`, 0.6, "daily");
  for (const slug of getAllSlugs()) push(`/scratch/${slug}`, 0.6, "daily");

  return entries;
}
