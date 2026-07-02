import Link from "next/link";
import { getRankings, getTopPick } from "@/lib/data";
import { money, humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { RankingTable } from "@/components/ranking/RankingTable";
import { PriceNav } from "@/components/ranking/PriceNav";
import { ScratchTicketHero } from "@/components/ranking/ScratchTicketHero";
import { DemoNotice } from "@/components/site/DemoNotice";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export default function HomePage() {
  const { games, generatedAt } = getRankings();
  const top = getTopPick();
  const totalPrizePool = games.reduce((s, g) => s + g.remainingPrizePool, 0);
  const topTier = top.prizeTiers.find((t) => t.isTop) ?? top.prizeTiers[0];

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

      {/* ============ HERO ============ */}
      <section className="hero">
        <div className="container">
          <div className="hero-meta reveal r-1">
            <div>
              <span className="live-dot" />
              Lottizen / Ontario / Updated {humanDate(generatedAt)}
            </div>
            <div>EST. 2026 · MMXXVI</div>
          </div>

          <div className="hero-grid">
            <div>
              <h1 className="hero-headline">
                <span className="line reveal r-2">Smarter scratch.</span>
                <span className="line reveal r-3">
                  better <em>odds.</em>
                </span>
              </h1>
              <p className="hero-deck reveal r-4">
                Not every scratch ticket is worth the same today. We track{" "}
                <strong>every Ontario instant game&rsquo;s remaining prizes</strong>{" "}
                from OLG and score which ones still have the most value left — so
                you buy the smart one, not the pretty one.
              </p>
              <div className="hero-cta-row reveal r-5">
                <Link href="#rankings" className="btn-primary">
                  See Today&rsquo;s Rankings
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link href="/methodology" className="btn-secondary">
                  How Value Score Works
                </Link>
              </div>
            </div>

            <ScratchTicketHero
              data={{
                slug: top.slug,
                name: top.name,
                gameNumber: top.gameNumber,
                price: top.price,
                valueScore: top.valueScore,
                topPrizeLabel: topTier.label,
              }}
            />
          </div>
        </div>
      </section>

      {/* ============ STAT BAND ============ */}
      <div className="stat-band">
        <div className="stat-cell">
          <div className="stat-cell-label">⚡ Games Tracked · Ontario</div>
          <div className="stat-cell-value">
            {games.length}
          </div>
          <div className="stat-cell-foot">
            Active OLG instant games, re-ranked every morning.
          </div>
        </div>
        <div className="stat-cell">
          <div className="stat-cell-label">◈ Prize Money Still Unclaimed</div>
          <div className="stat-cell-value">
            {money(totalPrizePool, { compact: true }).replace("$", "$")}
            <em>+</em>
          </div>
          <div className="stat-cell-foot">
            Across every tracked game, right now.
          </div>
        </div>
        <div className="stat-cell">
          <div className="stat-cell-label">✓ Today&rsquo;s Best Value</div>
          <div className="stat-cell-value">
            {top.valueScore.toFixed(0)}
            <em>/{Math.round(top.price)}</em>
          </div>
          <div className="stat-cell-foot">
            {top.name} — highest score at ${Math.round(top.price)}.
          </div>
        </div>
      </div>

      {/* ============ RANKINGS ============ */}
      <section className="section" id="rankings" style={{ paddingTop: 96 }}>
        <div className="container">
          <div className="section-eyebrow">/ Today&rsquo;s Board</div>
          <h2 className="section-headline">
            Ontario scratch tickets, ranked by <em>value left.</em>
          </h2>
          <p className="section-lede">
            Higher Value Score = more expected prize money still in the game per
            dollar you spend. Tap any ticket for the full prize breakdown.
          </p>

          <DemoNotice />
          <PriceNav />

          <AdSlot slot="rankings-top" format="leaderboard" className="reveal" />
          <div style={{ height: 24 }} />

          <RankingTable games={games} />

          <div style={{ height: 40 }} />
          <AdSlot slot="rankings-bottom" format="leaderboard" />
        </div>
      </section>
    </>
  );
}
