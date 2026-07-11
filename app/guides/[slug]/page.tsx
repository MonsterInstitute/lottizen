import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getGuide,
  getGuideSlugs,
  splitAtSections,
  relatedGuides,
  type Guide,
} from "@/lib/guides";
import { getGame, gamePath, type Country } from "@/config/games";
import { SITE, absUrl } from "@/lib/site";
import { humanDate } from "@/lib/format";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;
export function generateStaticParams() {
  return getGuideSlugs().map((slug) => ({ slug }));
}

const EYEBROW: Record<Country | "ALL", string> = {
  CA: "Canada guide",
  US: "US guide",
  EU: "Europe guide",
  ALL: "Guide",
};

function loadGuide(slug: string): Guide | null {
  try {
    const g = getGuide(slug);
    return g.draft ? null : g;
  } catch {
    return null;
  }
}

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Format a YYYY-MM-DD frontmatter date without a timezone off-by-one. */
function guideDate(d: string): string {
  return humanDate(`${d}T12:00:00`);
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const g = loadGuide(params.slug);
  if (!g) return {};
  const canonical = `/guides/${g.slug}`;
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical },
    openGraph: {
      title: g.title,
      description: g.description,
      url: absUrl(canonical),
      type: "article",
      publishedTime: g.date,
      modifiedTime: g.updated ?? g.date,
    },
  };
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const g = loadGuide(params.slug);
  if (!g) notFound();

  const segments = splitAtSections(g.html);
  // Two in-article ads at roughly the 1/3 and 2/3 section boundaries.
  const adAfter = new Set<number>();
  if (segments.length >= 4) {
    adAfter.add(Math.floor(segments.length / 3) - 1);
    adAfter.add(Math.floor((2 * segments.length) / 3) - 1);
  } else if (segments.length >= 2) {
    adAfter.add(0);
  }

  const related = relatedGuides(g);
  const games = (g.relatedGames ?? [])
    .map((s) => getGame(s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const canonical = `/guides/${g.slug}`;

  const articleJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    datePublished: g.date,
    dateModified: g.updated ?? g.date,
    author: { "@type": "Organization", name: SITE.name, url: SITE.url },
    publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
    mainEntityOfPage: absUrl(canonical),
    inLanguage: "en",
    isAccessibleForFree: true,
  };
  if (g.sources?.length) {
    articleJsonLd.citation = g.sources.map((s) => ({
      "@type": "CreativeWork",
      name: s.title,
      url: s.url,
    }));
  }
  const faqJsonLd = g.faqs?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: g.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }
    : null;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: "Guides", item: absUrl("/guides") },
      { "@type": "ListItem", position: 3, name: g.title, item: absUrl(canonical) },
    ],
  };
  const jsonLd = faqJsonLd
    ? [articleJsonLd, faqJsonLd, breadcrumbJsonLd]
    : [articleJsonLd, breadcrumbJsonLd];

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/guides">Guides</Link> / <span>{g.title}</span>
          </div>
          <div className="section-eyebrow">{g.eyebrow ?? EYEBROW[g.country]}</div>
          <h1 className="section-headline">{g.title}</h1>
          <p className="section-lede">{g.description}</p>
          <div className="guide-meta">
            <span>{g.readingMinutes} min read</span>
            <span className="dot">·</span>
            <span>Updated {guideDate(g.updated ?? g.date)}</span>
            <span className="dot">·</span>
            <span>Reviewed by the Lottizen editors</span>
          </div>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="guide-layout">
            <aside className="guide-toc">
              <div className="guide-toc-title">On this page</div>
              <ol>
                {g.toc.map((t) => (
                  <li key={t.id} className={`lvl-${t.level}`}>
                    <a href={`#${t.id}`}>{t.text}</a>
                  </li>
                ))}
              </ol>
            </aside>

            <div>
              {g.toc.length > 2 ? (
                <details className="guide-toc-mobile">
                  <summary>On this page</summary>
                  <ol>
                    {g.toc.map((t) => (
                      <li key={t.id} className={`lvl-${t.level}`}>
                        <a href={`#${t.id}`}>{t.text}</a>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}

              <article className="prose guide-prose">
                {segments.map((seg, i) => (
                  <Fragment key={i}>
                    <div dangerouslySetInnerHTML={{ __html: seg }} />
                    {adAfter.has(i) ? (
                      <div className="guide-ad">
                        <AdSlot slot={`guide-${g.slug}-${i}`} format="leaderboard" />
                      </div>
                    ) : null}
                  </Fragment>
                ))}
              </article>

              {g.sources?.length ? (
                <div className="guide-sources">
                  <h2>Sources</h2>
                  <ol>
                    {g.sources.map((s, i) => (
                      <li key={i}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                          {s.title}
                        </a>{" "}
                        <span className="src-host">{host(s.url)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              <div className="notice" style={{ marginTop: 32 }}>
                <span className="notice-tag">{g.country === "CA" ? "19+" : "18+"}</span>
                <span>
                  Lottizen is an independent information site — not a lottery
                  operator, and not legal, tax, or financial advice. Confirm
                  current rules with the relevant lottery corporation or a
                  qualified professional. Play for entertainment only;{" "}
                  <Link href="/responsible-play">support resources</Link>.
                </span>
              </div>
            </div>
          </div>

          {related.length || games.length ? (
            <div style={{ marginTop: 72 }}>
              {related.length ? (
                <div className="guide-related">
                  <h2 className="guide-related-title">Related guides</h2>
                  <div className="guide-card-grid">
                    {related.map((r) => (
                      <Link key={r.slug} href={`/guides/${r.slug}`} className="guide-card">
                        <span className="guide-card-eyebrow">{EYEBROW[r.country]}</span>
                        <span className="guide-card-title">{r.title}</span>
                        <span className="guide-card-desc">{r.description}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              {games.length ? (
                <div className="guide-related" style={{ marginTop: 40 }}>
                  <h2 className="guide-related-title">Related games</h2>
                  <div className="guide-game-row">
                    {games.map((gm) => (
                      <Link key={gm.slug} href={gamePath(gm)} className="guide-game-chip">
                        {gm.name} — stats & results
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
