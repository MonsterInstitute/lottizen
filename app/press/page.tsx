import type { Metadata } from "next";
import Link from "next/link";
import { drawGameFacts, scratchFacts } from "@/lib/almanac";
import { getDraws, getPlayableSlugs } from "@/lib/draws";
import { humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { JsonLd } from "@/components/site/JsonLd";

export const metadata: Metadata = {
  title: "Press & Data — Canadian Lottery Data, Free to Cite",
  description:
    "Lottizen's data for journalists and researchers: remaining scratch-ticket prizes for all 5 Canadian lottery agencies and decades of draw history, updated daily. Free to cite with a link.",
  alternates: { canonical: "/press" },
  openGraph: {
    title: "Lottizen Press & Data",
    description:
      "Canadian lottery data, updated daily and free to cite: scratch-ticket prizes still unclaimed across 5 agencies, and decades of draw history.",
    url: absUrl("/press"),
    type: "website",
  },
};

export default function PressPage() {
  const scratch = scratchFacts();
  const caDraws = drawGameFacts("CA");
  const games = getPlayableSlugs();
  const earliest = games
    .map((s) => getDraws(s)?.dataSince)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  const full = scratch.provinces.filter((p) => p.share);
  const sixFortyNine = caDraws.find((d) => d.game.slug === "lotto-6-49");
  const asOf = scratch.asOf ? humanDate(scratch.asOf) : "";

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: SITE.name,
          url: SITE.url,
          contactPoint: { "@type": "ContactPoint", contactType: "media", email: SITE.pressEmail },
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link> / <span>Press &amp; data</span>
          </div>
          <div className="section-eyebrow">Press &amp; data</div>
          <h1 className="section-headline">
            Lottery data you can <em>cite.</em>
          </h1>
          <p className="section-lede">
            Lottizen compiles the public data Canada&rsquo;s lottery agencies publish into one place, updated
            every morning. Journalists, researchers and writers are welcome to use it.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container prose">
          <h2>Citable data sets</h2>
          <p>Each is free to quote with a link, and each page carries its sources and a citation line.</p>
          <ul>
            <li>
              <Link href="/unclaimed">Unclaimed prizes of $100,000 or more</Link>: every prize on OLG&rsquo;s,
              WCLC&rsquo;s and Loto-Québec&rsquo;s official unclaimed lists, by claim deadline, with each
              list&rsquo;s date. BCLC and Atlantic Lottery publish no such list.
            </li>
            <li>
              <Link href="/data/canada-lottery-almanac">Province-by-province scratch figures</Link>: tickets listed
              and on sale per agency, how many on sale have no top prize left, and the share of printed prize money
              still unclaimed (OLG, BCLC, Loto-Québec).
            </li>
            <li>
              <Link href="/news">News from the data</Link>: jackpot runs and wins, scratch tickets whose top
              prizes run out, unclaimed prizes nearing their deadline, and a monthly province comparison
              (<a href="/news/rss.xml">RSS</a>).
            </li>
            <li>
              <Link href="/api">Data API</Link> and the <a href="/llms.txt">llms.txt</a> summary for AI tools.
            </li>
          </ul>

          <h2>What the data covers</h2>
          <ul>
            <li>
              <strong>Scratch tickets:</strong> prizes printed and still unclaimed for{" "}
              {scratch.totalGames} games from all five agencies: OLG (Ontario), BCLC (British Columbia), WCLC
              (Alberta, Saskatchewan, Manitoba), ALC (Atlantic Canada) and Loto-Québec. Read from each
              agency&rsquo;s own published data every day.
            </li>
            <li>
              <strong>Draw games:</strong> every result for {games.length} lotteries in Canada, the US and
              Europe, with archives going back to {earliest?.slice(0, 4)}, plus number frequencies.
            </li>
            <li>
              <strong>Unclaimed prizes:</strong> every prize of $100,000 or more on the agencies&rsquo; official
              unclaimed-prize lists, with claim deadlines, in one table at{" "}
              <Link href="/unclaimed">/unclaimed</Link>, updated daily.
            </li>
            <li>
              <strong>What we don&rsquo;t have:</strong> no Canadian agency publishes how many scratch tickets
              were printed or remain unsold, so we never estimate &ldquo;tickets left&rdquo;. WCLC and ALC
              publish less prize detail than the other three; our pages say where that limits a figure.
            </li>
          </ul>

          <h2>Figures you can quote today</h2>
          <p>As of {asOf}. Each links to the page that shows the underlying numbers.</p>
          <ul>
            {scratch.onSaleAgencies.length > 0 && (
              <li>
                <strong>{scratch.totalTopGoneOnSale}</strong> of the {scratch.totalOnSale} scratch games on sale at{" "}
                {new Intl.ListFormat("en", { type: "conjunction" }).format(scratch.onSaleAgencies)} (the agencies
                whose current catalog Lottizen can match) have no top prize left (
                <Link href="/data/canada-lottery-almanac">almanac</Link>).
              </li>
            )}
            <li>
              The five agencies&rsquo; prize lists hold {scratch.totalGames} scratch games, including games that
              have stopped selling but still have claimable prizes; {scratch.totalTopGone} of those listed games
              have no top prize left.
            </li>
            {full.map((p) => (
              <li key={p.slug}>
                {p.agency}: the median game still has <strong>{p.share!.medianPct}%</strong> of its listed prize
                money unclaimed. Highest: {p.share!.highest.game.name} (${p.share!.highest.game.price},{" "}
                {p.share!.highest.pct}%). Lowest: {p.share!.lowest.game.name} (${p.share!.lowest.game.price},{" "}
                {p.share!.lowest.pct}%) (<Link href={`/scratch/${p.slug}`}>{p.label} rankings</Link>).
              </li>
            ))}
            {sixFortyNine && (
              <li>
                Lotto 6/49: across {sixFortyNine.statsDraws.toLocaleString("en-CA")} draws since{" "}
                {sixFortyNine.statsFrom.slice(0, 4)}, the most-drawn number is{" "}
                <strong>{sixFortyNine.most.numbers.join(", ")}</strong> ({sixFortyNine.most.count} times) and
                the least-drawn is <strong>{sixFortyNine.least.numbers.join(", ")}</strong> (
                {sixFortyNine.least.count} times) (
                <Link href="/canada/lotto-6-49/statistics">6/49 statistics</Link>).
              </li>
            )}
          </ul>
          <p>
            More, with sources: the <Link href="/data/canada-lottery-almanac">Canadian Lottery Data Almanac</Link>
            , which covers record jackpots, claim deadlines by agency, where unclaimed money goes, and
            province-by-province comparisons.
          </p>

          <h2>Reading the numbers correctly</h2>
          <ul>
            <li>
              Scratch figures describe <strong>prize money still unclaimed</strong>. They do not change the
              odds of any ticket winning. How each agency&rsquo;s figure is calculated:{" "}
              <Link href="/methodology">methodology</Link>.
            </li>
            <li>
              Number frequencies are <strong>historical counts</strong>. Every number has the same chance in
              every draw; a &ldquo;most drawn&rdquo; number is not more likely next time.
            </li>
            <li>
              Lottizen is independent and not affiliated with any lottery agency. For anything official
              (claims, rules, a specific ticket) the agency is the authority.
            </li>
          </ul>

          <h2>Using the data</h2>
          <p>
            Quoting figures, charts or tables is free. Please credit <strong>Lottizen</strong> and link to the
            page you used, e.g. &ldquo;Source: Lottizen (lottizen.com), compiled from OLG, BCLC, WCLC, ALC and
            Loto-Québec data&rdquo;. For bulk or repeated access, use the <Link href="/api">Lottizen API</Link>.
          </p>
          <p>
            Running a live blog or a results page? <Link href="/embed">Free widgets</Link> show the latest numbers,
            the current jackpot or a province&rsquo;s top scratch tickets by prize money left, updated daily. One
            iframe, no JavaScript.
          </p>

          <h2>Contact</h2>
          <p>
            Questions, a custom cut of the data, or a correction:{" "}
            <a href={`mailto:${SITE.pressEmail}`}>{SITE.pressEmail}</a>.
          </p>
        </div>
      </section>
    </>
  );
}
