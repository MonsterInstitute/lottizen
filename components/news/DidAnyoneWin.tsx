import type { Metadata } from "next";
import Link from "next/link";
import { countrySlug, getGame } from "@/config/games";
import { getLatestAll } from "@/lib/draws";
import {
  ANNUITY_TOP,
  DID_ANYONE_WIN_PREFIX,
  DRAW_PAGE_FRESH_DAYS,
  drawPageSlug,
  type BreakdownDraw,
  type GameBreakdowns,
} from "@/lib/breakdowns";
import { daysBetween, drawDate, longDate, money } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { JsonLd } from "@/components/site/JsonLd";
import { Balls } from "@/components/draws/Balls";
import { BreakdownTable } from "@/components/news/BreakdownTable";

/** The direct answer, from the operator's published breakdown only. */
export function answer(g: GameBreakdowns, d: BreakdownDraw): string {
  const top = d.tiers[0];
  const n = top?.winners ?? 0;
  if (!top) return `The prize breakdown for the ${longDate(d.date)} ${g.name} draw isn't available.`;
  if (n > 0) {
    const prize = ANNUITY_TOP[g.slug]
      ? ` for the top prize of ${ANNUITY_TOP[g.slug]}`
      : top.prize != null
        ? `, winning ${money(top.prize)}${n > 1 ? " each" : ""}`
        : "";
    return `Yes. ${n.toLocaleString("en-CA")} ticket${n === 1 ? "" : "s"} matched ${top.label} in the ${longDate(d.date)} ${g.name} draw${prize}.`;
  }
  return `No. Nobody matched ${top.label} in the ${longDate(d.date)} ${g.name} draw.`;
}

function lastWinLine(g: GameBreakdowns, asOf: BreakdownDraw): string {
  // On a winning draw's own page, "last won" means the win before it.
  const isWin = (asOf.tiers[0]?.winners ?? 0) > 0;
  const wins = g.topWins.filter((w) => (isWin ? w.date < asOf.date : w.date <= asOf.date));
  if (isWin) {
    return wins.length
      ? `The previous top-prize win in the breakdowns Lottizen holds was the ${longDate(wins[0].date)} draw.`
      : `It's the first top-prize win in the breakdowns Lottizen holds, which begin with the ${longDate(g.breakdownsSince!)} draw.`;
  }
  if (!wins.length) {
    return `No ticket has matched the top tier in the breakdowns Lottizen holds, which begin with the ${longDate(g.breakdownsSince!)} draw.`;
  }
  const last = wins[0];
  const since = g.draws.filter((d) => d.date > last.date && d.date <= asOf.date).length;
  return `The top prize was last won in the ${longDate(last.date)} draw${
    since ? `; ${since} draw${since === 1 ? "" : "s"} with a published breakdown since had no top-prize winner` : ""
  }.`;
}

function nextLine(g: GameBreakdowns): string | null {
  if (!g.nextDraw) return null;
  return `Next draw: ${longDate(g.nextDraw)}${g.nextJackpot ? `, jackpot ${money(g.nextJackpot)}` : ""}.`;
}

export function didAnyoneWinMetadata(g: GameBreakdowns): Metadata {
  const d = g.draws[0];
  const title = `Did Anyone Win ${g.name} Last Night? Latest Winners and Prizes`;
  const description = `${answer(g, d)} Winning numbers, every prize tier's winners and payouts, from the operator's published breakdown.`;
  const path = `/news/${DID_ANYONE_WIN_PREFIX}${g.slug}`;
  return { title, description, alternates: { canonical: path }, openGraph: { title, description, url: absUrl(path), type: "article" } };
}

export function DidAnyoneWinPage({ g }: { g: GameBreakdowns }) {
  const d = g.draws[0];
  const cfg = getGame(g.slug);
  const text = answer(g, d);
  // A later draw whose numbers are in but whose breakdown isn't published yet.
  const latestResult = getLatestAll().find((l) => l.slug === g.slug)?.latestDate;
  const pending = latestResult && latestResult > d.date ? latestResult : null;
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: `Did anyone win ${g.name} last night?`,
              acceptedAnswer: { "@type": "Answer", text: `${text} ${lastWinLine(g, d)}` },
            },
          ],
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/news">News</Link> / <span>Did anyone win {g.name}?</span>
          </div>
          <div className="section-eyebrow">Latest draw · {drawDate(d.date)}</div>
          <h1 className="section-headline">Did anyone win {g.name} last night?</h1>
          <p className="section-lede">
            {pending ? (
              <>
                The prize breakdown for the {longDate(pending)} draw isn&rsquo;t published yet, so whether anyone won
                it isn&rsquo;t known here. The latest published one:{" "}
              </>
            ) : null}
            <strong>{text}</strong> {lastWinLine(g, d)} {nextLine(g)}
          </p>
        </div>
      </div>
      <DrawBody g={g} d={d} />
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container prose">
          <h2>Recent draws</h2>
          <ul>
            {g.draws.slice(1, 11).map((x) => (
              <li key={x.date}>
                <Link href={`/news/${drawPageSlug(g.slug, x.date)}`}>{longDate(x.date)}</Link>:{" "}
                {(x.tiers[0]?.winners ?? 0) > 0
                  ? `${x.tiers[0].winners} top-prize winner${x.tiers[0].winners === 1 ? "" : "s"}`
                  : "no top-prize winner"}
              </li>
            ))}
          </ul>
          {cfg && (
            <p>
              <Link href={`/${countrySlug(cfg.country)}/${g.slug}`}>All {g.name} results and statistics →</Link>
            </p>
          )}
        </div>
      </section>
    </>
  );
}

function DrawBody({ g, d }: { g: GameBreakdowns; d: BreakdownDraw }) {
  return (
    <section className="section">
      <div className="container prose">
        {d.numbers && (
          <>
            <h2>Winning numbers</h2>
            <Balls numbers={d.numbers} bonus={d.bonus} />
          </>
        )}
        <h2>Winners and prizes</h2>
        <BreakdownTable draw={d} />
        <p className="field-hint">
          From the prize breakdown the operator published for this draw
          {d.sourceUrl ? (
            <>
              {" "}
              (<a href={d.sourceUrl} rel="noopener noreferrer">source</a>)
            </>
          ) : null}
          . Shared tiers change every draw. The breakdown doesn&rsquo;t say where winning tickets were sold; check any ticket
          with the operator, whose records decide every claim.
        </p>
        <p className="field-hint">
          Cite: Lottizen, &ldquo;{g.name} results for {longDate(d.date)},&rdquo; {absUrl(`/news/${drawPageSlug(g.slug, d.date)}`)}.
          Data: the operator&rsquo;s published prize breakdown, via {SITE.name}.
        </p>
      </div>
    </section>
  );
}

export function drawPageMetadata(g: GameBreakdowns, d: BreakdownDraw): Metadata {
  const title = `${g.name} Results ${longDate(d.date)}: Winning Numbers, Winners and Prizes`;
  const description = `${answer(g, d)} Every prize tier's winners and payouts for the ${longDate(d.date)} draw.`;
  const fresh = daysBetween(d.date, new Date().toISOString().slice(0, 10)) <= DRAW_PAGE_FRESH_DAYS;
  // Older draw pages hand their weight to the evergreen page instead of
  // piling up as near-identical pages (the scaled-content risk agreed 2026-10-09).
  const canonical = fresh ? `/news/${drawPageSlug(g.slug, d.date)}` : `/news/${DID_ANYONE_WIN_PREFIX}${g.slug}`;
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: absUrl(canonical), type: "article" } };
}

export function DrawResultPage({ g, d }: { g: GameBreakdowns; d: BreakdownDraw }) {
  const url = absUrl(`/news/${drawPageSlug(g.slug, d.date)}`);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          headline: `${g.name} results for ${longDate(d.date)}`,
          description: answer(g, d),
          datePublished: `${d.date}T23:59:00-04:00`,
          dateModified: g.generatedAt,
          url,
          mainEntityOfPage: url,
          image: [absUrl("/opengraph-image.png")],
          author: { "@type": "Organization", name: SITE.name, url: SITE.url },
          publisher: { "@type": "Organization", name: SITE.name, url: SITE.url, logo: { "@type": "ImageObject", url: absUrl("/icon.svg") } },
          isBasedOn: d.sourceUrl ? [d.sourceUrl] : undefined,
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/news">News</Link> / <Link href={`/news/${DID_ANYONE_WIN_PREFIX}${g.slug}`}>{g.name}</Link> /{" "}
            <span>{drawDate(d.date)}</span>
          </div>
          <div className="section-eyebrow">{g.name} · {drawDate(d.date)}</div>
          <h1 className="section-headline">
            {g.name} results for {longDate(d.date)}
          </h1>
          <p className="section-lede">
            <strong>{answer(g, d)}</strong> {lastWinLine(g, d)}
          </p>
        </div>
      </div>
      <DrawBody g={g} d={d} />
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container prose">
          <p>
            <Link href={`/news/${DID_ANYONE_WIN_PREFIX}${g.slug}`}>Latest {g.name} draw: did anyone win? →</Link>
          </p>
        </div>
      </section>
    </>
  );
}
