import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  COUNTRIES,
  countryFromSlug,
  countryName,
  gamesByAgency,
} from "@/config/games";
import { getLatestAll, hasData } from "@/lib/draws";
import { drawDate } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;
export function generateStaticParams() {
  return COUNTRIES.map((c) => ({ country: c.slug }));
}

export function generateMetadata({ params }: { params: { country: string } }): Metadata {
  const code = countryFromSlug(params.country);
  if (!code) return {};
  const name = countryName(code);
  const title = `${name} Lottery Results & Statistics`;
  const description = `Winning numbers, statistics, and number tools for every ${name} draw lottery.`;
  return {
    title,
    description,
    alternates: { canonical: `/${params.country}` },
    openGraph: { title, description, url: absUrl(`/${params.country}`), type: "website" },
  };
}

export default function CountryOverview({ params }: { params: { country: string } }) {
  const code = countryFromSlug(params.country);
  if (!code) notFound();
  const name = countryName(code);
  const groups = gamesByAgency(code);
  const latest = new Map(getLatestAll().map((g) => [g.slug, g]));
  const liveGames = groups.flatMap((grp) => grp.games).filter((g) => g.live && hasData(g.slug));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${name} Lottery Games`,
          description: `Winning numbers, results, and statistics for every live ${name} draw lottery — organized by the agency that runs it.`,
          url: absUrl(`/${params.country}`),
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: liveGames.length,
            itemListElement: liveGames.map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: g.name,
              url: absUrl(`/${params.country}/${g.slug}`),
            })),
          },
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link> / <span>{name}</span>
          </div>
          <div className="section-eyebrow">{name}</div>
          <h1 className="section-headline">
            Every {name === "Canada" ? "Canadian" : "US"} <em>draw game.</em>
          </h1>
          <p className="section-lede">
            Winning numbers, deep statistics, and number tools for the national games and
            every regional lottery — organized by who runs them.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          {groups.map((grp) => (
            <div key={grp.agency} style={{ marginBottom: 56 }}>
              <div className="section-eyebrow" style={{ marginBottom: 20 }}>
                {grp.agency}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: 16,
                }}
              >
                {grp.games.map((g) => {
                  const isLive = g.live && hasData(g.slug);
                  const l = latest.get(g.slug);
                  const inner = (
                    <>
                      <div className="game-card-head">
                        <span className="game-card-name">{g.name}</span>
                        <span className="game-card-meta">
                          {g.format === "digit" ? `${g.pick}-digit` : `${g.pick}/${g.max}`}
                        </span>
                      </div>
                      <div className="game-card-meta" style={{ marginBottom: 12 }}>
                        {g.region} · ${g.price} · {g.drawDays.join(" & ")}
                      </div>
                      {isLive && l ? (
                        <>
                          <div className="game-card-date">Latest · {drawDate(l.latestDate)}</div>
                          <Balls numbers={l.numbers} bonus={l.bonus} bonus2={l.bonus2} size="sm" />
                        </>
                      ) : (
                        <div className="game-card-meta">Coming soon</div>
                      )}
                    </>
                  );
                  return isLive ? (
                    <Link key={g.slug} href={`/${params.country}/${g.slug}`} className="game-card">
                      {inner}
                    </Link>
                  ) : (
                    <div key={g.slug} className="game-card" style={{ opacity: 0.55 }}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
