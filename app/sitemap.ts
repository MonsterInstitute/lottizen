import type { MetadataRoute } from "next";
import { getActivePricePoints, getAllSlugs, getRankings } from "@/lib/data";
import { absUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const { generatedAt } = getRankings();
  const lastModified = new Date(generatedAt);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absUrl("/"), lastModified, changeFrequency: "daily", priority: 1 },
    { url: absUrl("/methodology"), lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: absUrl("/responsible-play"), lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];

  const priceRoutes: MetadataRoute.Sitemap = getActivePricePoints().map((p) => ({
    url: absUrl(`/price/${p}`),
    lastModified,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const gameRoutes: MetadataRoute.Sitemap = getAllSlugs().map((slug) => ({
    url: absUrl(`/scratch/${slug}`),
    lastModified,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [...staticRoutes, ...priceRoutes, ...gameRoutes];
}
