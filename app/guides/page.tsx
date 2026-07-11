import type { Metadata } from "next";
import Link from "next/link";
import { guidesByCountry } from "@/lib/guides";
import { countryName, type Country } from "@/config/games";
import { SITE, absUrl } from "@/lib/site";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export const metadata: Metadata = {
  title: "Lottery Guides — Winning, Taxes, Claiming & Anonymity",
  description:
    "Plain-English guides to lottery winnings across Canada, the US and Europe: taxes, claim deadlines, staying anonymous, group play, and what to do if you win.",
  alternates: { canonical: "/guides" },
  openGraph: {
    title: "Lottery Guides",
    description:
      "Guides to lottery taxes, claiming, anonymity and more across Canada, the US and Europe.",
    url: absUrl("/guides"),
    type: "website",
  },
};

const SECTION_LABEL: Record<Country | "ALL", string> = {
  CA: "Canada",
  US: "United States",
  EU: "Europe",
  ALL: "Everywhere",
};

export default function GuidesHubPage() {
  const groups = guidesByCountry();
  const total = groups.reduce((n, g) => n + g.guides.length, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Lottery Guides",
    description: metadata.description,
    url: absUrl("/guides"),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <span>Guides</span>
          </div>
          <div className="section-eyebrow">Guides</div>
          <h1 className="section-headline">
            Lottery, <em>explained.</em>
          </h1>
          <p className="section-lede">
            The parts nobody tells you until you&rsquo;ve won — taxes, claim
            deadlines, staying anonymous, and the first calls to make. Researched
            against official sources and kept current.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          {total === 0 ? (
            <p className="section-lede">Guides are being written — check back soon.</p>
          ) : (
            groups.map((group, gi) => (
              <div key={group.country} style={{ marginBottom: gi < groups.length - 1 ? 56 : 0 }}>
                <div className="section-eyebrow" style={{ color: "var(--ink-3)" }}>
                  {group.country === "ALL"
                    ? SECTION_LABEL.ALL
                    : `${countryName(group.country as Country)} · ${SECTION_LABEL[group.country]}`}
                </div>
                <div className="guide-card-grid">
                  {group.guides.map((g) => (
                    <Link key={g.slug} href={`/guides/${g.slug}`} className="guide-card">
                      <span className="guide-card-title">{g.title}</span>
                      <span className="guide-card-desc">{g.description}</span>
                    </Link>
                  ))}
                </div>
                {gi === 0 ? (
                  <div className="guide-ad" style={{ marginTop: 32 }}>
                    <AdSlot slot="guides-hub" format="leaderboard" />
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
