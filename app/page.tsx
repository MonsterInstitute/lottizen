import Link from "next/link";
import { getLiveGame, LIVE_GAMES } from "@/config/games";
import { getLatestAll, getLatestGeneratedAt, getStats } from "@/lib/draws";
import { getTopPick, getRankings } from "@/lib/data";
import { drawDate, money, humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export default function HomePage() {
  const latest = getLatestAll();
  const generatedAt = getLatestGeneratedAt();
  const byslug = new Map(latest.map((l) => [l.slug, l]));
  const featured = byslug.get("lotto-max");
  const featuredCfg = getLiveGame("lotto-max");
  const scratchTop = getTopPick();
  const scratchCount = getRankings().games.length;

  const jackpot = (slug: string) => {
    const j = byslug.get(slug)?.nextJackpot;
    return j ? money(j, { compact: true }) : "TBA";
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    description:
      "Canadian lottery winning numbers, results and number statistics — Lotto Max, Lotto 6/49, Ontario 49 and more.",
  };

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* ============ HERO ============ */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="pill reveal r-1">
              <span className="dot" />
              Canada&rsquo;s lottery numbers &amp; statistics
            </span>
            <h1 className="hero-headline">
              <span className="line reveal r-2">Canada&rsquo;s lottery,</span>
              <span className="line reveal r-3">
                by the <em>numbers.</em>
              </span>
            </h1>
            <p className="hero-deck reveal r-4">
              Winning numbers, deep statistics, and number tools for{" "}
              <strong>every Canadian draw game</strong> — Lotto Max, 6/49, Ontario 49 and
              more. Plus a scratch-ticket value tracker, because the smart play is knowing
              the math.
            </p>
            <div className="hero-cta-row reveal r-5">
              <Link href="/canada" className="btn btn-primary">
                Browse all games
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
              <Link href="/canada/lotto-max/statistics" className="btn btn-secondary">
                Number statistics
              </Link>
            </div>
            <div className="hero-meta reveal r-5">
              Updated {humanDate(generatedAt)} · {LIVE_GAMES.length} games live · Free
            </div>
          </div>

          {/* Featured latest draw */}
          {featured && featuredCfg && (
            <div className="data-card reveal r-3">
              <div className="data-card-head">
                <Link href="/canada/lotto-max" className="data-card-title">
                  {featuredCfg.name}
                </Link>
                <span className="status-pill">Latest</span>
              </div>
              <div className="game-card-date" style={{ marginTop: 16, marginBottom: 14 }}>
                {drawDate(featured.latestDate)}
              </div>
              <Balls numbers={featured.numbers} bonus={featured.bonus} size="lg" />
              <div className="game-card-jackpot">
                <span className="lbl">Next jackpot</span>
                <span className="amt">{jackpot("lotto-max")}</span>
              </div>
              <div className="data-card-foot">
                <span>{featured.drawCount} draws on record</span>
                <Link href="/canada/lotto-max/statistics" style={{ color: "var(--brand-deep)", textDecoration: "none" }}>
                  Stats →
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============ RECENT RESULTS ============ */}
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="section-eyebrow">Latest results</div>
          <div className="section-head-row">
            <h2 className="section-headline">
              Tonight&rsquo;s winning <em>numbers.</em>
            </h2>
            <p className="section-lede" style={{ maxWidth: "24em" }}>
              The most recent draw for each game we track, with the next estimated jackpot.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 16,
              marginTop: 32,
            }}
          >
            {LIVE_GAMES.map((g) => {
              const l = byslug.get(g.slug);
              if (!l) return null;
              return (
                <Link key={g.slug} href={`/canada/${g.slug}`} className="game-card">
                  <div className="game-card-head">
                    <span className="game-card-name">{g.name}</span>
                    <span className="game-card-meta">{g.pick}/{g.max}</span>
                  </div>
                  <div className="game-card-date">{drawDate(l.latestDate)}</div>
                  <Balls numbers={l.numbers} bonus={l.bonus} size="sm" />
                  <div className="game-card-jackpot">
                    <span className="lbl">Next jackpot</span>
                    <span className="amt">{jackpot(g.slug)}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div style={{ marginTop: 28 }}>
            <Link href="/canada" className="btn btn-secondary">
              All Canadian games →
            </Link>
          </div>

          <div style={{ marginTop: 40 }}>
            <AdSlot slot="home-mid" format="leaderboard" />
          </div>
        </div>
      </section>

      {/* ============ SCRATCH TRACKER (demoted module) ============ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div
            className="card home-scratch-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gap: 32,
              alignItems: "center",
              padding: 36,
            }}
          >
            <div>
              <div className="section-eyebrow" style={{ marginBottom: 14 }}>
                Scratch Value Tracker
              </div>
              <h2 className="section-headline" style={{ fontSize: "clamp(28px,3.4vw,44px)", marginBottom: 12 }}>
                Which scratch ticket is <em>worth it</em> today?
              </h2>
              <p className="section-lede" style={{ marginBottom: 22 }}>
                We track OLG&rsquo;s remaining instant-game prizes and rank every Ontario
                scratch ticket by the value still left to win.
              </p>
              <Link href="/scratch" className="btn btn-primary">
                Open the tracker
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="data-card" style={{ boxShadow: "var(--shadow-sm)" }}>
              <div className="data-card-head">
                <span className="data-card-title">{scratchTop.name}</span>
                <span className="status-pill">#1 value</span>
              </div>
              <div className="data-row">
                <span className="k">Value score</span>
                <span className="v" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
                  {scratchTop.valueScore.toFixed(1)}
                </span>
              </div>
              <div className="data-row">
                <span className="k">Ticket price</span>
                <span className="v">${Math.round(scratchTop.price)}</span>
              </div>
              <div className="data-row">
                <span className="k">Prizes unclaimed</span>
                <span className="v">{money(scratchTop.remainingPrizePool, { compact: true })}</span>
              </div>
              <div className="data-card-foot">
                <span>{scratchCount} scratch games ranked</span>
                <Link href="/scratch" style={{ color: "var(--brand-deep)", textDecoration: "none" }}>
                  See all →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
