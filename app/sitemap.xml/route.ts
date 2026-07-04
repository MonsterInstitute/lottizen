import { COUNTRIES } from "@/config/games";
import { getRankings } from "@/lib/data";
import { absUrl } from "@/lib/site";

// Next.js `generateSitemaps()` (see app/sitemap.ts) emits the sharded sitemaps at
// /sitemap/0.xml, /sitemap/1.xml, … but does NOT create an index at /sitemap.xml.
// This route handler serves that missing index so /sitemap.xml resolves (200) and
// points crawlers at every shard. Shard ids mirror generateSitemaps():
// 0 = core + scratch, then one per country.
export const dynamic = "force-static";

export function GET() {
  const lastmod = new Date(getRankings().generatedAt).toISOString();
  const ids = [0, ...COUNTRIES.map((_, i) => i + 1)];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ids
  .map(
    (id) =>
      `  <sitemap>\n    <loc>${absUrl(`/sitemap/${id}.xml`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`,
  )
  .join("\n")}
</sitemapindex>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
