import { CATEGORY_LABEL, getNews } from "@/lib/news";
import { SITE, absUrl } from "@/lib/site";

// RSS 2.0 for /news: the 50 most recent items. Prerendered at build time;
// the site redeploys after each data refresh.
export const dynamic = "force-static";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function GET() {
  const items = getNews().slice(0, 50);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(SITE.name)} — news from the data</title>
<link>${absUrl("/news")}</link>
<atom:link href="${absUrl("/news/rss.xml")}" rel="self" type="application/rss+xml" />
<description>Canadian lottery news written from Lottizen's daily data: jackpots, scratch tickets, unclaimed prizes. Every figure is sourced.</description>
<language>en-ca</language>
${items
  .map(
    (n) => `<item>
<title>${esc(n.headline)}</title>
<link>${absUrl(`/news/${n.slug}`)}</link>
<guid isPermaLink="true">${absUrl(`/news/${n.slug}`)}</guid>
<pubDate>${new Date(n.published_at).toUTCString()}</pubDate>
<category>${esc(CATEGORY_LABEL[n.category])}</category>
<description>${esc(n.dek)}</description>
</item>`,
  )
  .join("\n")}
</channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
