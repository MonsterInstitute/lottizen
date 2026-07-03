import type { Metadata } from "next";
import Link from "next/link";
import { gamesByAgency } from "@/config/games";
import { getLatestAll, getPlayableSlugs } from "@/lib/draws";
import { drawDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { JsonLd } from "@/components/site/JsonLd";

export const metadata: Metadata = {
  title: "Canadian Lottery Results & Statistics",
  description:
    "Winning numbers, statistics, and number tools for every Canadian draw lottery — Lotto Max, Lotto 6/49, Ontario 49 and more, by region.",
  alternates: { canonical: "/canada" },
  openGraph: {
    title: "Canadian Lottery Results & Statistics · Lottizen",
    description:
      "Winning numbers and statistics for every Canadian draw lottery, grouped by region.",
    url: absUrl("/canada"),
    type: "website",
  },
};

export default function CanadaOverview() {
  const groups = gamesByAgency();
  const live = new Set(getPlayableSlugs());
  const latest = new Map(getLatestAll().map((g) => [g.slug, g]));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Canadian Lottery Games",
          url: absUrl("/canada"),
          description: metadata.description,
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link> / <span>Canada</span>
          </div>
          <div className="section-eyebrow">All of Canada</div>
          <h1 className="section-headline">
            Every Canadian <em>draw game.</em>
          </h1>
          <p className="section-lede">
            Winning numbers, deep statistics, and number tools for the national
            games and every provincial lottery — organized by who runs them.
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
                  const isLive = live.has(g.slug);
                  const l = latest.get(g.slug);
                  const inner = (
                    <>
                      <div className="game-card-head">
                        <span className="game-card-name">{g.name}</span>
                        <span className="game-card-meta">
                          {g.pick}/{g.max}
                        </span>
                      </div>
                      <div className="game-card-meta" style={{ marginBottom: 12 }}>
                        {g.region} · ${g.price} · {g.drawDays.join(" & ")}
                      </div>
                      {isLive && l ? (
                        <>
                          <div className="game-card-date">
                            Latest · {drawDate(l.latestDate)}
                          </div>
                          <Balls numbers={l.numbers} bonus={l.bonus} size="sm" />
                        </>
                      ) : (
                        <div className="game-card-meta">Coming soon</div>
                      )}
                    </>
                  );
                  return isLive ? (
                    <Link key={g.slug} href={`/canada/${g.slug}`} className="game-card">
                      {inner}
                    </Link>
                  ) : (
                    <div
                      key={g.slug}
                      className="game-card"
                      style={{ opacity: 0.6, cursor: "default" }}
                    >
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
