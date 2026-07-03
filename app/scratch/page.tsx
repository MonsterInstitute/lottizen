import type { Metadata } from "next";
import Link from "next/link";
import { getRankings, getTopPick } from "@/lib/data";
import { money, humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { RankingTable } from "@/components/ranking/RankingTable";
import { PriceNav } from "@/components/ranking/PriceNav";
import { TopPickCard } from "@/components/ranking/TopPickCard";
import { DemoNotice } from "@/components/site/DemoNotice";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export const metadata: Metadata = {
  title: "Scratch Value Tracker — Best Ontario Scratch Tickets Today",
  description:
    "Live value rankings for Ontario scratch tickets. We track OLG's remaining instant-game prizes and score which scratch ticket is worth buying right now.",
  alternates: { canonical: "/scratch" },
  openGraph: {
    title: "Scratch Value Tracker · Lottizen",
    description:
      "Which Ontario scratch ticket is worth buying right now — ranked by remaining prize value.",
    url: absUrl("/scratch"),
    type: "website",
  },
};

export default function ScratchHome() {
  const { games, generatedAt } = getRankings();
  const top = getTopPick();
  const totalPrizePool = games.reduce((s, g) => s + g.remainingPrizePool, 0);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Ontario Scratch Ticket Value Rankings — ${humanDate(generatedAt)}`,
    description: SITE.description,
    numberOfItems: games.length,
    itemListElement: games.map((g) => ({
      "@type": "ListItem",
      position: g.rank,
      url: absUrl(`/scratch/${g.slug}`),
      name: g.name,
    })),
  };

  return (
    <>
      <JsonLd data={itemListJsonLd} />

      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="pill reveal r-1">
              <span className="dot" />
              Ontario&rsquo;s scratch-ticket value tracker
            </span>
            <h1 className="hero-headline">
              <span className="line reveal r-2">Smarter scratch,</span>
              <span className="line reveal r-3">
                <em>better odds.</em>
              </span>
            </h1>
            <p className="hero-deck reveal r-4">
              Not every scratch ticket is worth the same today. Lottizen tracks{" "}
              <strong>every Ontario instant game&rsquo;s remaining prizes</strong>{" "}
              from OLG and scores which still have the most value left — so you
              buy the smart one, not the pretty one.
            </p>
            <div className="hero-cta-row reveal r-5">
              <Link href="#rankings" className="btn btn-primary">
                See today&rsquo;s rankings
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
              <Link href="/methodology" className="btn btn-secondary">
                How the score works
              </Link>
            </div>
            <div className="hero-meta reveal r-5">
              Updated {humanDate(generatedAt)} · {games.length} games tracked · Free
            </div>
          </div>
          <TopPickCard game={top} />
        </div>
      </section>

      <section className="container">
        <div className="stat-band">
          <div className="stat-cell">
            <div className="stat-cell-label">Games tracked</div>
            <div className="stat-cell-value">{games.length}</div>
            <div className="stat-cell-foot">Active OLG instant games, re-ranked every morning.</div>
          </div>
          <div className="stat-cell">
            <div className="stat-cell-label">Prize money unclaimed</div>
            <div className="stat-cell-value">
              {money(totalPrizePool, { compact: true })}
              <em>+</em>
            </div>
            <div className="stat-cell-foot">Across every tracked game, right now.</div>
          </div>
          <div className="stat-cell">
            <div className="stat-cell-label">Today&rsquo;s best value</div>
            <div className="stat-cell-value">{top.valueScore.toFixed(0)}</div>
            <div className="stat-cell-foot">{top.name} — highest Value Score on the board.</div>
          </div>
        </div>
      </section>

      <section className="section" id="rankings">
        <div className="container">
          <div className="section-eyebrow">Today&rsquo;s board</div>
          <div className="section-head-row">
            <h2 className="section-headline">
              Ontario scratch tickets, ranked by <em>value left.</em>
            </h2>
            <p className="section-lede" style={{ maxWidth: "26em" }}>
              Higher Value Score = more expected prize money still in the game
              per dollar you spend. Tap any ticket for the full prize breakdown.
            </p>
          </div>
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 20 }}>
            <DemoNotice />
            <PriceNav />
            <AdSlot slot="rankings-top" format="leaderboard" />
            <RankingTable games={games} />
            <AdSlot slot="rankings-bottom" format="leaderboard" />
          </div>
        </div>
      </section>
    </>
  );
}
