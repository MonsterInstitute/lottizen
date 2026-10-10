import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_LABEL, getNews, getNewsItem } from "@/lib/news";
import { humanDate, humanDateTime } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { JsonLd } from "@/components/site/JsonLd";
import { DID_ANYONE_WIN_PREFIX, allBreakdowns, breakdownsFor, drawPageSlug, parseDrawPageSlug } from "@/lib/breakdowns";
import { DidAnyoneWinPage, DrawResultPage, didAnyoneWinMetadata, drawPageMetadata } from "@/components/news/DidAnyoneWin";

export const dynamicParams = false;

export function generateStaticParams() {
  // News items, plus the "Did anyone win?" page and one page per draw for
  // the six games with a published prize breakdown (lib/breakdowns.ts).
  return [
    ...getNews().map((n) => ({ slug: n.slug })),
    ...allBreakdowns().flatMap((g) => [
      { slug: `${DID_ANYONE_WIN_PREFIX}${g.slug}` },
      ...g.draws.map((d) => ({ slug: drawPageSlug(g.slug, d.date) })),
    ]),
  ];
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  if (params.slug.startsWith(DID_ANYONE_WIN_PREFIX)) {
    const g = breakdownsFor(params.slug.slice(DID_ANYONE_WIN_PREFIX.length));
    return g ? didAnyoneWinMetadata(g) : {};
  }
  const dp = parseDrawPageSlug(params.slug);
  if (dp) return drawPageMetadata(dp.game, dp.draw);
  const n = getNewsItem(params.slug);
  if (!n) return {};
  const path = `/news/${n.slug}`;
  return {
    title: n.headline,
    description: n.dek,
    alternates: { canonical: path },
    openGraph: {
      title: n.headline,
      description: n.dek,
      url: absUrl(path),
      type: "article",
      publishedTime: n.published_at,
      modifiedTime: n.updated_at,
    },
  };
}

const RELATED: Record<string, { href: string; label: string }> = {
  draw: { href: "/canada", label: "Canadian draw results and statistics" },
  scratch: { href: "/scratch", label: "Scratch ticket value tracker" },
  unclaimed: { href: "/unclaimed", label: "Every listed unclaimed prize of $100,000 or more" },
};

export default function NewsArticlePage({ params }: { params: { slug: string } }) {
  if (params.slug.startsWith(DID_ANYONE_WIN_PREFIX)) {
    const g = breakdownsFor(params.slug.slice(DID_ANYONE_WIN_PREFIX.length));
    if (!g) notFound();
    return <DidAnyoneWinPage g={g} />;
  }
  const dp = parseDrawPageSlug(params.slug);
  if (dp) return <DrawResultPage g={dp.game} d={dp.draw} />;
  const n = getNewsItem(params.slug);
  if (!n) notFound();
  const url = absUrl(`/news/${n.slug}`);
  const citation = `Lottizen, "${n.headline}," ${humanDate(n.updated_at)}, ${url}. Data: Lottizen (lottizen.com), free to use with credit.`;
  const related = RELATED[n.category];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          headline: n.headline.slice(0, 110),
          description: n.dek,
          datePublished: n.published_at,
          dateModified: n.updated_at,
          mainEntityOfPage: url,
          url,
          image: [absUrl("/opengraph-image.png")],
          author: { "@type": "Organization", name: SITE.name, url: SITE.url },
          publisher: { "@type": "Organization", name: SITE.name, url: SITE.url, logo: { "@type": "ImageObject", url: absUrl("/icon.svg") } },
          isAccessibleForFree: true,
          articleSection: CATEGORY_LABEL[n.category],
          isBasedOn: n.facts.map((f) => f.url).filter(Boolean),
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/news">News</Link> / <span>{CATEGORY_LABEL[n.category]}</span>
          </div>
          <div className="section-eyebrow">
            {CATEGORY_LABEL[n.category]} · Lottizen data desk
          </div>
          <h1 className="section-headline" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            {n.headline}
          </h1>
          <p className="section-lede">{n.dek}</p>
          <p className="field-hint">
            Published {humanDateTime(n.published_at)}
            {n.updated_at !== n.published_at ? ` · Updated ${humanDateTime(n.updated_at)}` : ""} · Written automatically
            from Lottizen&rsquo;s data; every figure below is sourced.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container prose">
          {n.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}

          {n.data_table && (
            <div className="table-wrap">
              <table className="prize-table">
                <thead>
                  <tr>
                    {n.data_table.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {n.data_table.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>Key facts</h2>
          <ul>
            {n.facts.map((f) => (
              <li key={f.label}>
                <strong>{f.label}:</strong> {f.value} &mdash;{" "}
                {f.url ? (
                  <a href={f.url} rel="noopener noreferrer">
                    {f.source}
                  </a>
                ) : (
                  f.source
                )}
              </li>
            ))}
          </ul>

          <h2>Cite this</h2>
          <p className="field-hint" style={{ fontFamily: "var(--font-mono), monospace" }}>
            {citation}
          </p>
          <p>
            More: <Link href={related.href}>{related.label}</Link> · <Link href="/news">All news</Link> ·{" "}
            <Link href="/press">Press &amp; data</Link>
          </p>
        </div>
      </section>
    </>
  );
}
