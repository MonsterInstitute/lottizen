import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName, operatorName } from "@/config/games";
import { resolveGame, countryGameParams, getDraws, getStats, liveGameCard } from "@/lib/draws";
import { drawDate, money, nextDrawDate, nDraws, priceAmount } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { GameTabs } from "@/components/draws/GameTabs";
import { JsonLd } from "@/components/site/JsonLd";
import { AdSlot } from "@/components/site/AdSlot";

export const dynamicParams = false;
export function generateStaticParams() {
  return countryGameParams();
}

export function generateMetadata({ params }: { params: { country: string; game: string } }): Metadata {
  const g = resolveGame(params.country, params.game);
  if (!g) return {};
  const title = `${g.name} — Winning Numbers, Results & Statistics`;
  const description = `${g.name} (${g.pick}/${g.max}, ${g.agency}) winning numbers, full results archive, number frequency statistics, and a number generator. Draws ${g.drawDays.join(" & ")}.`;
  return {
    title,
    description,
    alternates: { canonical: `/${params.country}/${g.slug}` },
    openGraph: { title, description, url: absUrl(`/${params.country}/${g.slug}`), type: "website" },
  };
}

export default function GamePage({ params }: { params: { country: string; game: string } }) {
  const g = resolveGame(params.country, params.game);
  if (!g) notFound();
  const base = `/${params.country}/${g.slug}`;
  const card = liveGameCard(g.slug);
  const draws = getDraws(g.slug);
  const stats = getStats(g.slug);
  if (!card || !draws || !stats) notFound();
  const latest = draws.draws[0];
  // Only progressive games with a real scraped estimate show a jackpot; everything
  // else shows the next draw date and hides the jackpot row (never a stale "TBA").
  const showJackpot = g.progressive && card.latest?.nextJackpot != null;
  const jackpotStr = showJackpot ? money(card.latest!.nextJackpot!, { compact: true, currency: g.currency }) : null;
  const nextDraw = card.latest?.nextDraw ?? nextDrawDate(g.drawDays);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Game",
          name: g.name,
          url: absUrl(base),
          description: g.blurb,
          gameLocation: g.region,
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link> /{" "}
            <Link href={`/${params.country}`}>{countryName(g.country)}</Link> / <span>{g.name}</span>
          </div>
          <div className="section-eyebrow">
            {g.agency} · {g.region}
          </div>
          <h1 className="section-headline" style={{ marginBottom: 14 }}>
            {g.name}
          </h1>
          <p className="section-lede">{g.blurb}</p>
          <GameTabs country={params.country} slug={g.slug} active="" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div
            className="game-top-grid"
            style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20, alignItems: "start" }}
          >
            <div className="card">
              <div className="section-eyebrow" style={{ marginBottom: 14 }}>
                Latest winning numbers
              </div>
              <div className="game-card-date" style={{ fontSize: 14 }}>
                {drawDate(latest.date)}
              </div>
              <Balls numbers={latest.numbers} bonus={latest.bonus} bonus2={latest.bonus2} size="lg" />
              <div style={{ marginTop: 20 }}>
                <Link href={`${base}/results`} className="btn btn-secondary">
                  All results →
                </Link>
              </div>
            </div>

            <div className="data-card">
              <div className="data-card-head">
                <span className="data-card-title">Next draw</span>
              </div>
              {jackpotStr && (
                <div className="data-row">
                  <span className="k">Estimated jackpot</span>
                  <span className="v" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>{jackpotStr}</span>
                </div>
              )}
              <div className="data-row">
                <span className="k">Next draw</span>
                <span className="v">{drawDate(nextDraw)}</span>
              </div>
              <div className="data-row">
                <span className="k">Draw days</span>
                <span className="v">{g.drawDays.join(", ")}</span>
              </div>
              <div className="data-row">
                <span className="k">Ticket price</span>
                <span className="v">{priceAmount(g.price, g.currency)} {g.currency}</span>
              </div>
            </div>
          </div>

          <h2 className="section-headline" style={{ fontSize: "clamp(28px,3.4vw,44px)", marginTop: 64 }}>
            How <em>{g.name}</em> works
          </h2>
          <div className="prose" style={{ marginTop: 8 }}>
            {g.format === "digit" ? (
              <>
                <p>
                  Each {g.name} play asks you to pick a <strong>{g.pick}-digit number</strong>{" "}
                  (each position 0–9, repeats allowed). Draws take place{" "}
                  <strong>{g.drawDays.join(" and ")}</strong>.
                </p>
                <h3>Straight &amp; boxed</h3>
                <p>
                  Bet <strong>straight</strong> to win on an exact-order match, or{" "}
                  <strong>boxed</strong> to win on any order (better odds, smaller payout).
                  Exact prizes are set by {operatorName(g)}. Lottizen tracks the numbers and the math,
                  not the ticket sale.
                </p>
              </>
            ) : (
              <>
                <p>
                  Each {g.name} play costs <strong>{priceAmount(g.price, g.currency)} {g.currency}</strong> and asks you to
                  select <strong>{g.pick} numbers from 1 to {g.max}</strong>
                  {g.hasBonus
                    ? `, plus ${g.bonusCount && g.bonusCount > 1 ? `${g.bonusCount} ${g.bonusLabel ?? "bonus numbers"}` : `a ${g.bonusLabel ?? "bonus"}`}${g.bonusMax ? ` from 1 to ${g.bonusMax}` : ""}`
                    : ""}.
                  Draws take place <strong>{g.drawDays.join(" and ")}</strong>.
                </p>
                <h3>Match &amp; prize tiers</h3>
                <p>
                  Match all {g.pick} main numbers{g.hasBonus ? ` (and the ${g.bonusLabel ?? "bonus"} where it applies)` : ""} to
                  win the jackpot; lower tiers pay for partial matches. Exact tiers and odds are set by {operatorName(g)}.
                  Lottizen tracks the numbers and the math, not the ticket sale.
                </p>
              </>
            )}
          </div>

          <div style={{ marginTop: 40 }}>
            <AdSlot slot={`game-${g.slug}`} format="leaderboard" />
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 16, marginTop: 40 }}
          >
            <Link href={`${base}/statistics`} className="game-card">
              <span className="game-card-name">Statistics</span>
              <div className="game-card-meta" style={{ marginTop: 8 }}>
                Frequency, gaps, hot &amp; cold across {nDraws(stats.drawCount)}.
              </div>
            </Link>
            {g.format !== "digit" && (
              <Link href={`${base}/generator`} className="game-card">
                <span className="game-card-name">Number generator</span>
                <div className="game-card-meta" style={{ marginTop: 8 }}>
                  Quick Pick, statistics-weighted, or birthday picks.
                </div>
              </Link>
            )}
            <Link href={`${base}/faq`} className="game-card">
              <span className="game-card-name">FAQ</span>
              <div className="game-card-meta" style={{ marginTop: 8 }}>
                Cut-off, claim deadlines, taxes &amp; anonymity.
              </div>
            </Link>
          </div>

          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)", marginTop: 32 }}>
            {nDraws(stats.allTimeDrawCount)} on record since{" "}
            {draws.dataSince ? drawDate(draws.dataSince) : "—"} · not affiliated with {operatorName(g)}.
          </p>
        </div>
      </section>
    </>
  );
}
