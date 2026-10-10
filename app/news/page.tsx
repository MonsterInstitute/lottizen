import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORY_LABEL, getNews } from "@/lib/news";
import { humanDateTime } from "@/lib/format";
import { absUrl } from "@/lib/site";

const PATH = "/news";

export const metadata: Metadata = {
  title: "Canadian Lottery News From the Data — Jackpots, Scratch Tickets, Unclaimed Prizes",
  description:
    "Short news items written from Lottizen's daily lottery data: jackpot runs and wins, scratch tickets whose top prizes run out, and large unclaimed prizes nearing their deadline. Every figure is sourced.",
  alternates: { canonical: PATH, types: { "application/rss+xml": absUrl("/news/rss.xml") } },
  openGraph: { url: absUrl(PATH), type: "website" },
};

export default function NewsIndex() {
  const items = getNews();
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="section-eyebrow">News from the data</div>
          <h1 className="section-headline">
            What changed in Canadian lotteries, <em>from the numbers.</em>
          </h1>
          <p className="section-lede">
            Written automatically from Lottizen&rsquo;s daily data whenever something notable happens: a jackpot
            run, a top prize won, a scratch ticket&rsquo;s last top prize claimed, an unclaimed prize near its
            deadline. Every figure links to its source. No item is a prediction.{" "}
            <a href="/news/rss.xml">RSS feed</a>.
          </p>
        </div>
      </div>
      <section className="section">
        <div className="container">
          {items.length === 0 ? (
            <p className="section-lede">No news items yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 14 }}>
              {items.map((n) => (
                <li key={n.slug} className="card" style={{ padding: "18px 22px" }}>
                  <div className="section-eyebrow" style={{ marginBottom: 6 }}>
                    {CATEGORY_LABEL[n.category]} · {humanDateTime(n.updated_at)}
                  </div>
                  <h2 style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 22, lineHeight: 1.25, margin: "0 0 6px" }}>
                    <Link href={`/news/${n.slug}`} style={{ color: "var(--ink)", textDecoration: "none" }}>
                      {n.headline}
                    </Link>
                  </h2>
                  <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 15 }}>{n.dek}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
