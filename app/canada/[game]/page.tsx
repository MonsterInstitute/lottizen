import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveGame } from "@/config/games";
import { getDraws, getStats, getPlayableSlugs, liveGameCard } from "@/lib/draws";
import { drawDate, money } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { GameTabs } from "@/components/draws/GameTabs";
import { JsonLd } from "@/components/site/JsonLd";
import { AdSlot } from "@/components/site/AdSlot";

export const dynamicParams = false;
export function generateStaticParams() {
  return getPlayableSlugs().map((game) => ({ game }));
}

export function generateMetadata({ params }: { params: { game: string } }): Metadata {
  const g = getLiveGame(params.game);
  if (!g) return {};
  const title = `${g.name} — Winning Numbers, Results & Statistics`;
  const description = `${g.name} (${g.pick}/${g.max}, ${g.agency}) winning numbers, full results archive, number frequency statistics, and a number generator. Draws ${g.drawDays.join(" & ")}.`;
  return {
    title,
    description,
    alternates: { canonical: `/canada/${g.slug}` },
    openGraph: { title, description, url: absUrl(`/canada/${g.slug}`), type: "website" },
  };
}

export default function GamePage({ params }: { params: { game: string } }) {
  const g = getLiveGame(params.game);
  if (!g) notFound();
  const card = liveGameCard(g.slug);
  const draws = getDraws(g.slug);
  const stats = getStats(g.slug);
  if (!card || !draws || !stats) notFound();
  const latest = draws.draws[0];
  const jackpotStr = card.latest?.nextJackpot
    ? money(card.latest.nextJackpot, { compact: true })
    : "TBA";

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Game",
          name: g.name,
          url: absUrl(`/canada/${g.slug}`),
          description: g.blurb,
          gameLocation: g.region,
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link> / <Link href="/canada">Canada</Link> /{" "}
            <span>{g.name}</span>
          </div>
          <div className="section-eyebrow">
            {g.agency} · {g.region}
          </div>
          <h1 className="section-headline" style={{ marginBottom: 14 }}>
            {g.name}
          </h1>
          <p className="section-lede">{g.blurb}</p>
          <GameTabs slug={g.slug} active="" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 1fr",
              gap: 20,
              alignItems: "start",
            }}
            className="game-top-grid"
          >
            {/* Latest draw */}
            <div className="card">
              <div className="section-eyebrow" style={{ marginBottom: 14 }}>
                Latest winning numbers
              </div>
              <div className="game-card-date" style={{ fontSize: 14 }}>
                {drawDate(latest.date)}
              </div>
              <Balls numbers={latest.numbers} bonus={latest.bonus} size="lg" />
              <div style={{ marginTop: 20 }}>
                <Link href={`/canada/${g.slug}/results`} className="btn btn-secondary">
                  All results →
                </Link>
              </div>
            </div>

            {/* Next draw / jackpot */}
            <div className="data-card">
              <div className="data-card-head">
                <span className="data-card-title">Next draw</span>
              </div>
              <div className="data-row">
                <span className="k">Estimated jackpot</span>
                <span className="v" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
                  {jackpotStr}
                </span>
              </div>
              <div className="data-row">
                <span className="k">Draw date</span>
                <span className="v">
                  {card.latest?.nextDraw ? drawDate(card.latest.nextDraw) : "—"}
                </span>
              </div>
              <div className="data-row">
                <span className="k">Draw days</span>
                <span className="v">{g.drawDays.join(", ")}</span>
              </div>
              <div className="data-row">
                <span className="k">Ticket price</span>
                <span className="v">${g.price.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* How to play / odds */}
          <h2 className="section-headline" style={{ fontSize: "clamp(28px,3.4vw,44px)", marginTop: 64 }}>
            How <em>{g.name}</em> works
          </h2>
          <div className="prose" style={{ marginTop: 8 }}>
            <p>
              Each {g.name} play costs <strong>${g.price.toFixed(2)}</strong> and asks you to
              select <strong>{g.pick} numbers from 1 to {g.max}</strong>
              {g.hasBonus ? ", with a bonus number drawn from the same pool for secondary prizes" : ""}.
              Draws take place <strong>{g.drawDays.join(" and ")}</strong>.
            </p>
            <h3>Match &amp; prize tiers</h3>
            <p>
              Match all {g.pick} main numbers to win the jackpot. Lower tiers pay out for
              matching {g.pick - 1} plus the bonus, {g.pick - 1}, and fewer — exact tiers
              and odds are set by {g.agency}. Lottizen tracks the numbers and the math, not
              the ticket sale.
            </p>
          </div>

          <div style={{ marginTop: 40 }}>
            <AdSlot slot={`game-${g.slug}`} format="leaderboard" />
          </div>

          {/* Quick links */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))",
              gap: 16,
              marginTop: 40,
            }}
          >
            <Link href={`/canada/${g.slug}/statistics`} className="game-card">
              <span className="game-card-name">Statistics</span>
              <div className="game-card-meta" style={{ marginTop: 8 }}>
                Frequency, gaps, hot &amp; cold across {stats.drawCount} draws.
              </div>
            </Link>
            <Link href={`/canada/${g.slug}/generator`} className="game-card">
              <span className="game-card-name">Number generator</span>
              <div className="game-card-meta" style={{ marginTop: 8 }}>
                Quick Pick, statistics-weighted, or birthday picks.
              </div>
            </Link>
            <Link href={`/canada/${g.slug}/faq`} className="game-card">
              <span className="game-card-name">FAQ</span>
              <div className="game-card-meta" style={{ marginTop: 8 }}>
                Cut-off times, claim deadlines, taxes &amp; anonymity.
              </div>
            </Link>
          </div>

          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)", marginTop: 32 }}>
            Data since {stats.dataSince ? drawDate(stats.dataSince) : "—"} · {stats.drawCount} draws ·
            not affiliated with {g.agency}.
          </p>
        </div>
      </section>
    </>
  );
}
