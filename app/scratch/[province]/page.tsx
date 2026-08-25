import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllProvinceSlugs, getRankings, getTopPick } from "@/lib/data";
import { isProvince, provinceConfig, provinceForAgency, type Province } from "@/config/scratch";
import { money, humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { getCurrentSubscriber } from "@/lib/auth";
import { getSubscription, listScratchFavourites } from "@/lib/supabase-admin";
import { effectiveTier } from "@/lib/entitlements";
import { PLANS } from "@/lib/plans";
import { estimateRemainingValue } from "@/lib/plus-analytics";
import { RankingTable } from "@/components/ranking/RankingTable";
import { ProRankingBoard } from "@/components/ranking/ProRankingBoard";
import { BudgetOptimizer } from "@/components/ranking/BudgetOptimizer";
import { PriceNav } from "@/components/ranking/PriceNav";
import { TopPickCard } from "@/components/ranking/TopPickCard";
import { DemoNotice } from "@/components/site/DemoNotice";
import { ScratchDisclaimer } from "@/components/site/ScratchDisclaimer";
import { ScoringMethodNotice } from "@/components/site/ScoringMethodNotice";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

// Per-visitor entitlement gate (free top-3 teaser vs the full Pro board) —
// necessarily dynamic, unlike the individual /scratch/[province]/[slug]
// pages (kept static; FollowButton there self-fetches its state client-side
// instead).
export const dynamic = "force-dynamic";
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllProvinceSlugs().map((province) => ({ province }));
}

export function generateMetadata({ params }: { params: { province: string } }): Metadata {
  if (!isProvince(params.province)) return {};
  const cfg = provinceConfig(params.province);
  const title = `Scratch Value Tracker — Best ${cfg.label} Scratch Tickets Today`;
  const description = `Live value rankings for ${cfg.label} scratch tickets. We track ${cfg.agency}'s remaining instant-game prizes and score which scratch ticket is worth buying right now.`;
  return {
    title,
    description,
    alternates: { canonical: `/scratch/${params.province}` },
    openGraph: {
      title: `${cfg.label} Scratch Value Tracker · Lottizen`,
      description: `Which ${cfg.label} scratch ticket is worth buying right now — ranked by remaining prize value.`,
      url: absUrl(`/scratch/${params.province}`),
      type: "website",
    },
  };
}

export default async function ScratchProvincePage({ params }: { params: { province: string } }) {
  if (!isProvince(params.province)) notFound();
  const province: Province = params.province;
  const cfg = provinceConfig(province);
  const { games, generatedAt, scoringMethod } = getRankings(province);
  const top = getTopPick(province);
  const totalPrizePool = games.reduce((s, g) => s + (g.remainingPrizePool ?? 0), 0);

  const subscriber = await getCurrentSubscriber();
  const [subscription, allFavourites] = subscriber
    ? await Promise.all([getSubscription(subscriber.id), listScratchFavourites(subscriber.id)])
    : [null, []];
  const favourites = allFavourites.filter((f) => provinceForAgency(f.agency) === province);
  const isPlus = subscriber ? effectiveTier(subscription) === "plus" : false;

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${cfg.label} Scratch Ticket Value Rankings — ${humanDate(generatedAt)}`,
    description: SITE.description,
    numberOfItems: games.length,
    itemListElement: games.map((g) => ({
      "@type": "ListItem",
      position: g.rank,
      url: absUrl(`/scratch/${province}/${g.slug}`),
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
              {cfg.label}&rsquo;s scratch-ticket value tracker
            </span>
            <h1 className="hero-headline">
              <span className="line reveal r-2">Smarter scratch,</span>
              <span className="line reveal r-3">
                <em>better odds.</em>
              </span>
            </h1>
            <p className="hero-deck reveal r-4">
              Not every scratch ticket is worth the same today. Lottizen tracks{" "}
              <strong>every {cfg.label} instant game&rsquo;s remaining prizes</strong>{" "}
              from {cfg.agency} and scores which still have the most value left — so
              you buy the smart one, not the pretty one.
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
        <div style={{ marginTop: 20 }}>
          <ScoringMethodNotice method={scoringMethod} province={province} />
        </div>
        <div className="stat-band" style={{ marginTop: 20 }}>
          <div className="stat-cell">
            <div className="stat-cell-label">Games tracked</div>
            <div className="stat-cell-value">{games.length}</div>
            <div className="stat-cell-foot">Active {cfg.agency} instant games, re-ranked every morning.</div>
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
              {cfg.label} scratch tickets, ranked by <em>value left.</em>
            </h2>
            <p className="section-lede" style={{ maxWidth: "26em" }}>
              Higher Value Score = more expected prize money still in the game
              per dollar you spend. Tap any ticket for the full prize breakdown.
            </p>
          </div>
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 20 }}>
            <DemoNotice province={province} />
            {isPlus ? (
              <>
                <AdSlot slot="rankings-top" format="leaderboard" />
                <BudgetOptimizer games={games} />
                <ProRankingBoard games={games} initialFavourites={favourites} />
              </>
            ) : (
              <>
                <PriceNav province={province} />
                <AdSlot slot="rankings-top" format="leaderboard" />
                <RankingTable games={games.slice(0, 3)} />
                {(() => {
                  const est = estimateRemainingValue(top);
                  return est.supported ? (
                    <div className="card" style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                      <div>
                        <div className="section-eyebrow" style={{ marginBottom: 4 }}>
                          Plus insight · {top.name}
                        </div>
                        <div style={{ fontSize: 15 }}>
                          🔒 <strong>{est.pctRemaining}%</strong> of this game&rsquo;s prize pool remains ·{" "}
                          <strong>~{est.evPerDollarCents}¢</strong> expected value per $1 spent
                        </div>
                      </div>
                      <Link href="/plus" className="btn btn-secondary">
                        Unlock with Plus
                      </Link>
                    </div>
                  ) : null;
                })()}
                <div className="card" style={{ padding: 32, textAlign: "center" }}>
                  <div className="section-eyebrow" style={{ justifyContent: "center" }}>
                    Lottizen Plus
                  </div>
                  <h2 className="section-headline" style={{ fontSize: "clamp(24px,3vw,34px)", marginBottom: 10 }}>
                    See the full {cfg.label} scratch board
                  </h2>
                  <p className="section-lede" style={{ marginBottom: 18 }}>
                    Compare every active game, filter by price, get alerts when a top prize is
                    claimed, and see the estimated real value per dollar — {PLANS.plus.priceMonthlyLabel}.
                  </p>
                  <Link href="/plus" className="btn btn-primary">
                    Explore Lottizen Plus
                  </Link>
                </div>
                <p className="field-hint">
                  Free plan shows the top 3 highest current Value Score tickets. Rankings are based
                  on remaining-prize data published by {cfg.agency}.
                </p>
              </>
            )}
            <ScratchDisclaimer />
            <AdSlot slot="rankings-bottom" format="leaderboard" />
          </div>
        </div>
      </section>
    </>
  );
}
