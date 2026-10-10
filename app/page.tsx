import Link from "next/link";
import {
  COUNTRIES,
  countrySlug,
  gamesForCountry,
  type Country,
  type GameConfig,
} from "@/config/games";
import { getLatestAll, getLatestGeneratedAt, hasData } from "@/lib/draws";
import { currentJackpot, drawDate, money, humanDate, resolveNextDraw } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";
import { getPicks } from "@/lib/picks";
import { HOME_REGIONS } from "@/components/home/regions";
import { RegionSelect } from "@/components/home/RegionSelect";
import { HeroRegionCard } from "@/components/home/HeroRegionCard";
import { PickCard, SkipCard, NewTicketsCard, hasWeek, hasNew } from "@/components/home/ProvinceBlock";
import { ScratchRegionCard, scratchTop } from "@/components/home/ScratchRegionCard";
import { LatestNews } from "@/components/home/LatestNews";
import { MyTicketsCard } from "@/components/home/MyTicketsCard";

// Draw games shown in each region's hero card: the headline game first, then
// the region's other games (national + that agency's own regional games).
const NATIONAL = ["lotto-max", "lotto-6-49", "daily-grand"];
const WESTERN = [...NATIONAL, "western-max", "western-6-49"];
const HERO_GAMES: Record<string, string[]> = {
  ontario: [...NATIONAL, "ontario-49", "lottario", "megadice"],
  quebec: NATIONAL,
  "british-columbia": [...NATIONAL, "bc-49"],
  alberta: WESTERN,
  saskatchewan: WESTERN,
  manitoba: WESTERN,
  territories: WESTERN,
  atlantic: NATIONAL,
  usa: ["powerball", "mega-millions", "new-york-lotto", "take-5", "pick-10"],
  europe: ["euromillions", "eurojackpot", "uk-lotto"],
};
const SCRATCH_SLUG: Record<string, string> = {
  ontario: "ontario", quebec: "quebec", "british-columbia": "british-columbia", alberta: "western",
  saskatchewan: "western", manitoba: "western", territories: "western", atlantic: "atlantic",
};

export default function HomePage() {
  const latest = new Map(getLatestAll().map((l) => [l.slug, l]));
  const generatedAt = getLatestGeneratedAt();
  const picks = getPicks();
  const canadaRegions = HOME_REGIONS.filter((r) => picks.provinces[r.key]);
  // WCLC's four regions often share identical content. A visitor whose region
  // is known sees only theirs; everyone else (and crawlers) sees each distinct
  // block once — later duplicates carry dup-when-unknown.
  const dupOf = (sig: (k: string) => string) => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const r of canadaRegions) {
      const s = sig(r.key);
      if (seen.has(s)) dup.add(r.key);
      seen.add(s);
    }
    return (k: string) => (dup.has(k) ? "dup-when-unknown" : "");
  };
  const weekDup = dupOf((k) => {
    const p = picks.provinces[k];
    return JSON.stringify([p.picks, p.skip.map((g) => g.game_number), p.month?.top.map((g) => g.game_number)]);
  });
  const newDup = dupOf((k) => JSON.stringify([picks.provinces[k].newTickets, picks.provinces[k].comingSoon]));
  const scratchDup = dupOf((k) => JSON.stringify(scratchTop(k, SCRATCH_SLUG[k]).map((g) => g.slug)));

  const liveGames = (code: Country): GameConfig[] =>
    gamesForCountry(code).filter((g) => g.live && hasData(g.slug));
  const featured = latest.get("powerball") ?? latest.get("lotto-max");
  const featuredCfg =
    gamesForCountry("US").find((g) => g.slug === "powerball") ??
    gamesForCountry("CA").find((g) => g.slug === "lotto-max");
  // A progressive game with a real scraped estimate shows its jackpot; every other
  // game shows its next draw date instead. Never a stale "TBA".
  const jackpotOrDraw = (g: GameConfig): { label: string; value: string } => {
    // Only the jackpot published for the next draw (lib/format.currentJackpot).
    const j = currentJackpot(g, latest.get(g.slug));
    if (j != null) return { label: "Next jackpot", value: money(j, { compact: true, currency: g.currency }) };
    const nd = resolveNextDraw(latest.get(g.slug)?.nextDraw, g.drawDays);
    return { label: "Next draw", value: drawDate(nd) };
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
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
              <strong>every major draw game in Canada, the USA and Europe</strong> — Powerball, Mega
              Millions, EuroMillions, Lotto Max, UK Lotto and more. Plus a scratch-ticket value tracker.
            </p>
            <div className="hero-cta-row reveal r-5">
              <Link href="/usa" className="btn btn-primary" data-country-scope="US">
                US games
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
              <Link href="/canada" className="btn btn-secondary" data-country-scope="CA">
                Canadian games
              </Link>
              <Link href="/europe" className="btn btn-secondary" data-country-scope="EU">
                European games
              </Link>
            </div>
            <div className="hero-meta reveal r-5">
              Updated {humanDate(generatedAt)} · {COUNTRIES.length} countries · Free
            </div>
          </div>

          <div className="hero-cards">
            <RegionSelect />
            {HOME_REGIONS.map((r) => (
              <HeroRegionCard
                key={r.key}
                region={r.key}
                label={r.short}
                games={HERO_GAMES[r.key]}
                scratchSlug={SCRATCH_SLUG[r.key]}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ============ THIS WEEK IN [PROVINCE] ============ */}
      {/* Canadian regions only; each visitor sees their own region's block
          (data-region-block, RegionScript). Regions with nothing to say are
          left out rather than shown empty. */}
      <section className="section home-week" data-country-scope="CA">
        <div className="container">
          {canadaRegions
            .filter((r) => hasWeek(picks.provinces[r.key]))
            .map((r) => {
              const p = picks.provinces[r.key];
              return (
                <div key={r.key} data-region-block={r.key} className={`home-week-block ${weekDup(r.key)}`}>
                  <div className="section-head-row">
                    <h2 className="section-headline">
                      This week in <em>{p.label}.</em>
                    </h2>
                    <Link href={`/picks#${r.key}`} className="btn btn-secondary">
                      All of this week&rsquo;s picks →
                    </Link>
                  </div>
                  <div className="home-grid">
                    <PickCard p={p} />
                    <SkipCard p={p} />
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      {/* ============ RESULTS (+ SCRATCH, CANADA) ============ */}
      <div id="country-blocks">
        {COUNTRIES.map((c) => {
          const games = liveGames(c.code).slice(0, 6);
          if (!games.length) return null;
          const results = (
            <>
              <div className="section-eyebrow">{c.name}</div>
              <div className="section-head-row">
                <h2 className="section-headline">
                  {c.adjective} <em>results.</em>
                </h2>
                <Link href={`/${c.slug}`} className="btn btn-secondary">
                  All {c.name} games →
                </Link>
              </div>
              <div className={c.code === "CA" ? "home-results-grid home-results-grid-half" : "home-results-grid"}>
                {games.map((g) => {
                  const l = latest.get(g.slug);
                  if (!l) return null;
                  const jd = jackpotOrDraw(g);
                  return (
                    <Link key={g.slug} href={`/${c.slug}/${g.slug}`} className="game-card">
                      <div className="game-card-head">
                        <span className="game-card-name">{g.name}</span>
                        <span className="game-card-meta">{g.pick}/{g.max}</span>
                      </div>
                      <div className="game-card-date">{drawDate(l.latestDate)}</div>
                      <Balls numbers={l.numbers} bonus={l.bonus} bonus2={l.bonus2} size="sm" />
                      <div className="game-card-jackpot">
                        <span className="lbl">{jd.label}</span>
                        <span className="amt">{jd.value}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          );
          if (c.code !== "CA") {
            return (
              <section className="section" data-country-block={c.code} data-country-scope={c.code} key={c.code} style={{ paddingTop: 40, paddingBottom: 40 }}>
                <div className="container">{results}</div>
              </section>
            );
          }
          // Canada: draw results and scratch tickets side by side, equal weight.
          return (
            <section className="section" data-country-block="CA" data-country-scope="CA" key="CA" style={{ paddingTop: 40, paddingBottom: 40 }}>
              <div className="container home-board">
                <div>{results}</div>
                <div>
                  <div className="section-eyebrow">Scratch tickets</div>
                  <div className="section-head-row">
                    <h2 className="section-headline">
                      Scratch <em>tickets.</em>
                    </h2>
                    <Link href="/scratch" className="btn btn-secondary">
                      All scratch tickets →
                    </Link>
                  </div>
                  <div className="home-scratch-col">
                    {canadaRegions.map((r) => (
                      <ScratchRegionCard key={r.key} region={r.key} label={r.label} scratchSlug={SCRATCH_SLUG[r.key]} className={scratchDup(r.key)} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* ============ NEW TICKETS (regions whose agency publishes launches) ============ */}
      {canadaRegions.some((r) => hasNew(picks.provinces[r.key])) && (
        <section
          className="section"
          data-country-scope="CA"
          data-regions={canadaRegions.filter((r) => hasNew(picks.provinces[r.key])).map((r) => r.key).join(" ")}
          style={{ paddingTop: 20, paddingBottom: 20 }}
        >
          <div className="container">
            <div className="section-head-row">
              <h2 className="section-headline">
                New <em>tickets.</em>
              </h2>
            </div>
            {canadaRegions
              .filter((r) => hasNew(picks.provinces[r.key]))
              .map((r) => (
                <div key={r.key} data-region-block={r.key} className={newDup(r.key)} style={{ marginTop: 18 }}>
                  <NewTicketsCard p={picks.provinces[r.key]} />
                </div>
              ))}
          </div>
        </section>
      )}

      <LatestNews />

      <section className="container">
        <MyTicketsCard onlySignedIn />
      </section>

      <section className="container">
        <AdSlot slot="home-mid" format="leaderboard" />
      </section>

      {/* ============ EVERYTHING FREE ============ */}
      <section className="section">
        <div className="container">
          <div
            className="card home-scratch-grid"
            style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32, alignItems: "center", padding: 36 }}
          >
            <div>
              <div className="section-eyebrow" style={{ marginBottom: 14 }}>
                No paid plan
              </div>
              <h2 className="section-headline" style={{ fontSize: "clamp(28px,3.4vw,44px)", marginBottom: 12 }}>
                Every tool on Lottizen is <em>free.</em>
              </h2>
              <p className="section-lede" style={{ marginBottom: 22 }}>
                No limits and nothing to unlock. Follow as many games and scratch tickets as you
                like, save as many number combinations as you want, log every ticket you buy with
                its claim-deadline countdown, and get an email when the top prize of a scratch
                ticket you follow is claimed.
              </p>
              <div className="hero-cta-row">
                <Link href="/subscribe" className="btn btn-primary">
                  Get free email alerts
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link href="/dashboard" className="btn btn-secondary">
                  Open My Lottizen
                </Link>
              </div>
            </div>
            <div className="data-card" style={{ boxShadow: "var(--shadow-sm)" }}>
              <div className="data-card-head">
                <span className="data-card-title">What&rsquo;s included</span>
                <span className="status-pill">Free</span>
              </div>
              <div className="data-row">
                <span className="k">Full scratch board, all 5 provinces</span>
                <span className="v">Free</span>
              </div>
              <div className="data-row">
                <span className="k">Top-prize-claimed alerts</span>
                <span className="v">Free</span>
              </div>
              <div className="data-row">
                <span className="k">Saved number combinations</span>
                <span className="v">Unlimited</span>
              </div>
              <div className="data-row">
                <span className="k">Tickets in your wallet</span>
                <span className="v">Unlimited</span>
              </div>
              <div className="data-card-foot">
                <span>No card, no trial — just your email.</span>
                <Link href="/subscribe" style={{ color: "var(--brand-deep)", textDecoration: "none" }}>Sign up →</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PRODUCT ENTRY POINT ============ */}
      <section className="section">
        <div className="container">
          <div className="card" style={{ padding: 36, textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
            <div className="section-eyebrow" style={{ justifyContent: "center" }}>
              My Lottizen
            </div>
            <h2 className="section-headline" style={{ fontSize: "clamp(26px,3vw,38px)", marginBottom: 10 }}>
              Keep track of the games <em>you play.</em>
            </h2>
            <p className="section-lede" style={{ marginBottom: 20 }}>
              Save your numbers, check results automatically, and see current scratch-ticket
              rankings across all 5 Canadian provinces, based on public prize data.
            </p>
            <div className="hero-cta-row" style={{ justifyContent: "center" }}>
              <Link href="/dashboard" className="btn btn-primary">
                Start tracking for free
              </Link>
              <Link href="/scratch" className="btn btn-secondary">
                Explore scratch value
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
