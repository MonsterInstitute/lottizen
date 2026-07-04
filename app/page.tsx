import Link from "next/link";
import {
  COUNTRIES,
  countrySlug,
  gamesForCountry,
  type Country,
  type GameConfig,
} from "@/config/games";
import { getLatestAll, getLatestGeneratedAt, hasData } from "@/lib/draws";
import { getTopPick, getRankings } from "@/lib/data";
import { drawDate, money, humanDate, nextDrawDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export default function HomePage() {
  const latest = new Map(getLatestAll().map((l) => [l.slug, l]));
  const generatedAt = getLatestGeneratedAt();
  const scratchTop = getTopPick();
  const scratchCount = getRankings().games.length;

  const liveGames = (code: Country): GameConfig[] =>
    gamesForCountry(code).filter((g) => g.live && hasData(g.slug));
  const featured = latest.get("powerball") ?? latest.get("lotto-max");
  const featuredCfg =
    gamesForCountry("US").find((g) => g.slug === "powerball") ??
    gamesForCountry("CA").find((g) => g.slug === "lotto-max");
  // A progressive game with a real scraped estimate shows its jackpot; every other
  // game shows its next draw date instead. Never a stale "TBA".
  const jackpotOrDraw = (g: GameConfig): { label: string; value: string } => {
    const j = g.progressive ? latest.get(g.slug)?.nextJackpot : null;
    if (j != null) return { label: "Next jackpot", value: money(j, { compact: true }) };
    const nd = latest.get(g.slug)?.nextDraw ?? nextDrawDate(g.drawDays);
    return { label: "Next draw", value: drawDate(nd) };
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    description:
      "Canadian and US lottery winning numbers, results and number statistics — Powerball, Mega Millions, Lotto Max, Lotto 6/49 and more.",
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
              North America&rsquo;s lottery numbers &amp; statistics
            </span>
            <h1 className="hero-headline">
              <span className="line reveal r-2">Lottery,</span>
              <span className="line reveal r-3">
                by the <em>numbers.</em>
              </span>
            </h1>
            <p className="hero-deck reveal r-4">
              Winning numbers, deep statistics, and number tools for{" "}
              <strong>every major draw game in Canada and the USA</strong> — Powerball, Mega
              Millions, Lotto Max, 6/49 and more. Plus a scratch-ticket value tracker.
            </p>
            <div className="hero-cta-row reveal r-5">
              <Link href="/usa" className="btn btn-primary">
                US games
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
              <Link href="/canada" className="btn btn-secondary">
                Canadian games
              </Link>
            </div>
            <div className="hero-meta reveal r-5">
              Updated {humanDate(generatedAt)} · {COUNTRIES.length} countries · Free
            </div>
          </div>

          {featured && featuredCfg && (
            <div className="data-card reveal r-3">
              <div className="data-card-head">
                <Link href={`/${countrySlug(featuredCfg.country)}/${featuredCfg.slug}`} className="data-card-title">
                  {featuredCfg.name}
                </Link>
                <span className="status-pill">Latest</span>
              </div>
              <div className="game-card-date" style={{ marginTop: 16, marginBottom: 14 }}>
                {drawDate(featured.latestDate)}
              </div>
              <Balls numbers={featured.numbers} bonus={featured.bonus} size="lg" />
              <div className="game-card-jackpot">
                <span className="lbl">{jackpotOrDraw(featuredCfg).label}</span>
                <span className="amt">{jackpotOrDraw(featuredCfg).value}</span>
              </div>
              <div className="data-card-foot">
                <span>{featured.drawCount.toLocaleString("en-CA")} draws on record</span>
                <Link href={`/${countrySlug(featuredCfg.country)}/${featuredCfg.slug}/statistics`} style={{ color: "var(--brand-deep)", textDecoration: "none" }}>
                  Stats →
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============ COUNTRY BLOCKS ============ */}
      {COUNTRIES.map((c) => {
        const games = liveGames(c.code).slice(0, 6);
        if (!games.length) return null;
        return (
          <section className="section" key={c.code} style={{ paddingTop: 40, paddingBottom: 40 }}>
            <div className="container">
              <div className="section-eyebrow">{c.name}</div>
              <div className="section-head-row">
                <h2 className="section-headline">
                  {c.name === "Canada" ? "Canadian" : "US"} <em>results.</em>
                </h2>
                <Link href={`/${c.slug}`} className="btn btn-secondary">
                  All {c.name} games →
                </Link>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: 16,
                  marginTop: 28,
                }}
              >
                {games.map((g) => {
                  const l = latest.get(g.slug);
                  if (!l) return null;
                  return (
                    <Link key={g.slug} href={`/${c.slug}/${g.slug}`} className="game-card">
                      <div className="game-card-head">
                        <span className="game-card-name">{g.name}</span>
                        <span className="game-card-meta">{g.pick}/{g.max}</span>
                      </div>
                      <div className="game-card-date">{drawDate(l.latestDate)}</div>
                      <Balls numbers={l.numbers} bonus={l.bonus} size="sm" />
                      <div className="game-card-jackpot">
                        <span className="lbl">{jackpotOrDraw(g).label}</span>
                        <span className="amt">{jackpotOrDraw(g).value}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}

      <section className="container">
        <AdSlot slot="home-mid" format="leaderboard" />
      </section>

      {/* ============ SCRATCH TRACKER ============ */}
      <section className="section">
        <div className="container">
          <div
            className="card home-scratch-grid"
            style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32, alignItems: "center", padding: 36 }}
          >
            <div>
              <div className="section-eyebrow" style={{ marginBottom: 14 }}>
                Scratch Value Tracker
              </div>
              <h2 className="section-headline" style={{ fontSize: "clamp(28px,3.4vw,44px)", marginBottom: 12 }}>
                Which scratch ticket is <em>worth it</em> today?
              </h2>
              <p className="section-lede" style={{ marginBottom: 22 }}>
                We track OLG&rsquo;s remaining instant-game prizes and rank every Ontario scratch
                ticket by the value still left to win.
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
                <span className="v" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>{scratchTop.valueScore.toFixed(1)}</span>
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
                <Link href="/scratch" style={{ color: "var(--brand-deep)", textDecoration: "none" }}>See all →</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
