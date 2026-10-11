import Link from "next/link";
import { COUNTRIES, gamesForCountry, type Country, type GameConfig } from "@/config/games";
import { getLatestAll, getLatestGeneratedAt, hasData } from "@/lib/draws";
import { currentJackpot, drawDate, money, humanDate, resolveNextDraw } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";
import { getPicks } from "@/lib/picks";
import { HOME_REGIONS } from "@/components/home/regions";
import { HeroRegionCard } from "@/components/home/HeroRegionCard";
import { PickCard, SkipCard, NewTicketsCard, hasWeek, hasNew } from "@/components/home/ProvinceBlock";
import { scratchTop } from "@/components/home/ScratchRegionCard";
import { LatestNews } from "@/components/home/LatestNews";
import { CharityThisWeek, charityWeek } from "@/components/charity/CharityThisWeek";
import { MyTicketsCard } from "@/components/home/MyTicketsCard";
import { SubscribeForm } from "@/components/site/SubscribeForm";

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
// The hero card shows each country's headline game; the results section
// below leaves it out so the same numbers aren't shown twice.
const HERO_LEAD: Record<Country, string> = {
  CA: NATIONAL[0],
  US: HERO_GAMES.usa[0],
  EU: HERO_GAMES.europe[0],
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
  const top = (k: string) => scratchTop(k, SCRATCH_SLUG[k]);
  const weekDup = dupOf((k) => {
    const p = picks.provinces[k];
    return JSON.stringify([p.picks, p.skip.map((g) => g.game_number), top(k).map((g) => g.slug),
      (({ deadlines, pot }) => [deadlines.map((x) => x.l.id), pot?.id])(charityWeek(k))]);
  });
  const newDup = dupOf((k) => JSON.stringify([picks.provinces[k].newTickets, picks.provinces[k].comingSoon]));

  const liveGames = (code: Country): GameConfig[] =>
    gamesForCountry(code).filter((g) => g.live && hasData(g.slug));
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
    <div className="home">
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
            {/* One deck per country; the visitor's shows (RegionScript), and
                with no known country (crawlers) the general one. */}
            <p className="hero-deck reveal r-4 when-unknown">
              Winning numbers, statistics and number tools for the major draw games in{" "}
              <strong>Canada, the USA and Europe</strong>, plus scratch tickets and charity lotteries.
            </p>
            <p className="hero-deck reveal r-4 when-known" data-country-scope="CA">
              Winning numbers, statistics and number tools for <strong>Lotto Max, Lotto 6/49, Daily Grand</strong> and
              your province&rsquo;s own games, plus scratch tickets ranked by prize money left and charity lotteries.
            </p>
            <p className="hero-deck reveal r-4 when-known" data-country-scope="US">
              Winning numbers, statistics and number tools for <strong>Powerball, Mega Millions</strong> and the New
              York games.
            </p>
            <p className="hero-deck reveal r-4 when-known" data-country-scope="EU">
              Winning numbers, statistics and number tools for <strong>EuroMillions, EuroJackpot</strong> and UK Lotto.
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
            <div className="hero-meta reveal r-5">Updated {humanDate(generatedAt)} · Free</div>
          </div>

          <div className="hero-cards">
            {HOME_REGIONS.map((r) => (
              <HeroRegionCard key={r.key} region={r.key} label={r.short} games={HERO_GAMES[r.key]} />
            ))}
          </div>
        </div>
      </section>

      {/* ============ THIS WEEK IN [PROVINCE] ============ */}
      {/* Canadian regions only; each visitor sees their own region's block
          (data-region-block, RegionScript). Regions with nothing to say are
          left out rather than shown empty. */}
      <section className="section" data-country-scope="CA">
        <div className="container">
          {canadaRegions
            .filter((r) => hasWeek(picks.provinces[r.key], top(r.key)))
            .map((r) => {
              const p = picks.provinces[r.key];
              return (
                <div key={r.key} data-region-block={r.key} className={`home-week-block ${weekDup(r.key)}`}>
                  <div className="section-head-row">
                    <h2 className="section-headline home-h2">This week in {p.label}</h2>
                    <Link href={`/picks#${r.key}`} className="btn btn-secondary">
                      All of this week&rsquo;s picks →
                    </Link>
                  </div>
                  <div className="home-grid">
                    <PickCard p={p} top={top(r.key)} />
                    <div className="home-stack">
                      <SkipCard p={p} />
                      <CharityThisWeek region={r.key} />
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      {/* ============ RESULTS ============ */}
      <div id="country-blocks">
        {COUNTRIES.map((c) => {
          const games = liveGames(c.code)
            .filter((g) => g.slug !== HERO_LEAD[c.code])
            .slice(0, 6);
          if (!games.length) return null;
          return (
            <section className="section" data-country-block={c.code} data-country-scope={c.code} key={c.code}>
              <div className="container">
                <div className="section-head-row">
                  <h2 className="section-headline home-h2">{c.adjective} results</h2>
                  <Link href={`/${c.slug}`} className="btn btn-secondary">
                    All {c.name} games →
                  </Link>
                </div>
                <div className="home-results-grid">
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
                        <Balls numbers={l.numbers} bonus={l.bonus} bonus2={l.bonus2} size="sm" fit />
                        <div className="game-card-jackpot">
                          <span className="lbl">{jd.label}</span>
                          <span className="amt">{jd.value}</span>
                        </div>
                      </Link>
                    );
                  })}
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
        >
          <div className="container">
            <div className="section-head-row">
              <h2 className="section-headline home-h2">New tickets</h2>
            </div>
            {canadaRegions
              .filter((r) => hasNew(picks.provinces[r.key]))
              .map((r) => (
                <div key={r.key} data-region-block={r.key} className={newDup(r.key)}>
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

      {/* ============ EMAIL ============ */}
      {/* Both are real sends: draw results (send_draw_emails.py) and the
          claim / charity deadline reminders (send_claim_reminders.py,
          send_charity_alerts.py). */}
      <section className="section">
        <div className="container">
          <div className="card home-signup">
            <p className="home-signup-text">
              <strong>Free email alerts:</strong> results for the games you follow, and a reminder before a
              claim or charity-lottery deadline.
            </p>
            <SubscribeForm compact buttonLabel="Sign up free" />
          </div>
        </div>
      </section>
    </div>
  );
}
