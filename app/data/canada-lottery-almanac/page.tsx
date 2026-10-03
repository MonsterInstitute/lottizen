import type { Metadata } from "next";
import Link from "next/link";
import { drawGameFacts, scratchFacts } from "@/lib/almanac";
import { countrySlug } from "@/config/games";
import { drawDate, humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { JsonLd } from "@/components/site/JsonLd";
import { ScratchDisclaimer } from "@/components/site/ScratchDisclaimer";

const PATH = "/data/canada-lottery-almanac";

export function generateMetadata(): Metadata {
  const s = scratchFacts();
  const title = "Canadian Lottery Data Almanac — Scratch Prizes, Draw History, Unclaimed Money";
  const description = `Citable figures on Canadian lotteries: ${s.totalGames} scratch games across 5 agencies and how much prize money is still unclaimed, 40+ years of draw history, record jackpots and unclaimed-prize rules, with sources.`;
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: { title, description, url: absUrl(PATH), type: "article" },
  };
}

export default function AlmanacPage() {
  const scratch = scratchFacts();
  const draws = drawGameFacts("CA");
  const full = scratch.provinces.filter((p) => p.share);
  const asOf = scratch.asOf ? humanDate(scratch.asOf) : "";
  const oldest = draws[0];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "Canadian Lottery Data Almanac",
          description:
            "Remaining scratch-ticket prize data for OLG, BCLC, WCLC, ALC and Loto-Québec, and full draw histories for Canadian lotteries, compiled daily from the agencies' public data.",
          url: absUrl(PATH),
          creator: { "@type": "Organization", name: SITE.name, url: SITE.url },
          isAccessibleForFree: true,
          dateModified: scratch.asOf || undefined,
          spatialCoverage: "Canada",
          temporalCoverage: oldest?.archiveSince ? `${oldest.archiveSince}/..` : undefined,
          distribution: { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: absUrl("/api") },
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/press">Press &amp; data</Link> / <span>Almanac</span>
          </div>
          <div className="section-eyebrow">Data almanac</div>
          <h1 className="section-headline">
            Canadian lotteries, <em>by the numbers.</em>
          </h1>
          <p className="section-lede">
            Figures compiled from the public data of Canada&rsquo;s five lottery agencies, recomputed every
            morning. Scratch figures as of {asOf}. Free to quote with a link to this page; see{" "}
            <Link href="/press">how to cite</Link>.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container prose">
          <h2>Scratch tickets currently listed</h2>
          <p>
            Lottizen tracks <strong>{scratch.totalGames} scratch games</strong> currently listed by the five
            agencies. Of those, <strong>{scratch.totalTopGone}</strong> are still listed even though every top
            prize has already been claimed. The agencies publish this; it is easy to miss when buying a ticket.
          </p>
          <div className="table-wrap">
            <table className="prize-table">
              <thead>
                <tr>
                  <th>Agency</th>
                  <th>Games listed</th>
                  <th>Top prizes all claimed</th>
                </tr>
              </thead>
              <tbody>
                {scratch.provinces.map((p) => (
                  <tr key={p.slug}>
                    <td>
                      <Link href={`/scratch/${p.slug}`}>
                        {p.agency} ({p.label.replace(/\s*\(.*\)$/, "")})
                      </Link>
                    </td>
                    <td className="num">{p.games}</td>
                    <td className="num">{p.topPrizesGone.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            We count only what each agency still lists. An agency may stop listing a game once its top prizes
            are gone, so a zero means none in its current data, not necessarily none on store shelves.
          </p>
          {scratch.provinces.some((p) => p.topPrizesGone.length) && (
            <p>
              Highest-priced examples:{" "}
              {scratch.provinces
                .flatMap((p) => p.topPrizesGone.slice(0, 1).map((g) => ({ p, g })))
                .map(({ p, g }, i, arr) => (
                  <span key={g.slug}>
                    <Link href={`/scratch/${p.slug}/${g.slug}`}>{g.name}</Link> (${g.price}, {p.agency}, top prize{" "}
                    {g.topPrizeLabel})
                    {i < arr.length - 1 ? "; " : "."}
                  </span>
                ))}
            </p>
          )}

          <h3>How much prize money is still unclaimed</h3>
          <p>
            OLG, BCLC and Loto-Québec publish both the number of prizes printed and the number still unclaimed
            for each prize tier they list, so for their games we can state exactly what share of the listed
            prize money is still out there. WCLC publishes only remaining counts and ALC only top-prize counts,
            so they aren&rsquo;t in this comparison.
          </p>
          <div className="table-wrap">
            <table className="prize-table">
              <thead>
                <tr>
                  <th>Agency</th>
                  <th>Median game</th>
                  <th>Most still unclaimed</th>
                  <th>Least still unclaimed</th>
                </tr>
              </thead>
              <tbody>
                {full.map((p) => (
                  <tr key={p.slug}>
                    <td>{p.agency}</td>
                    <td className="num">{p.share!.medianPct}%</td>
                    <td>
                      <Link href={`/scratch/${p.slug}/${p.share!.highest.game.slug}`}>{p.share!.highest.game.name}</Link>{" "}
                      (${p.share!.highest.game.price}): {p.share!.highest.pct}%
                    </td>
                    <td>
                      <Link href={`/scratch/${p.slug}/${p.share!.lowest.game.slug}`}>{p.share!.lowest.game.name}</Link>{" "}
                      (${p.share!.lowest.game.price}): {p.share!.lowest.pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            &ldquo;Share still unclaimed&rdquo; = remaining prizes × prize amount ÷ printed prizes × prize amount,
            over the tiers the agency lists (OLG lists its top and notable tiers, not every small prize). It
            describes the money left in a game. It does <strong>not</strong> change the odds of any single
            ticket winning. Details: <Link href="/methodology">methodology</Link>.
          </p>
          <ScratchDisclaimer />

          <h2>Draw games: four decades of results</h2>
          <p>
            The oldest archive here is {oldest?.game.name}, with {oldest?.archiveDraws.toLocaleString("en-CA")}{" "}
            draws since {oldest?.archiveSince ? drawDate(oldest.archiveSince) : "—"}. Below: how often each number
            has come up under each game&rsquo;s current rules. These are historical counts. Every number has
            exactly the same chance in every draw, and past frequency doesn&rsquo;t change that.
          </p>
          <div className="table-wrap">
            <table className="prize-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Archive since</th>
                  <th>Counted period</th>
                  <th>Most drawn</th>
                  <th>Least drawn</th>
                </tr>
              </thead>
              <tbody>
                {draws.map((d) => (
                  <tr key={d.game.slug}>
                    <td>
                      <Link href={`/${countrySlug(d.game.country)}/${d.game.slug}/statistics`}>{d.game.name}</Link>
                    </td>
                    <td>{d.archiveSince?.slice(0, 4) ?? "—"}</td>
                    <td>
                      {d.statsDraws.toLocaleString("en-CA")} draws since {d.statsFrom.slice(0, 4)}
                    </td>
                    <td>
                      {d.most.numbers.join(", ")} ({d.most.count}×)
                    </td>
                    <td>
                      {d.least.numbers.join(", ")} ({d.least.count}×)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {draws.filter((d) => d.excluded).map((d) => (
            <p key={d.game.slug}>
              {d.game.name}: {d.excluded!.numbers.join(" and ")} joined the number pool on{" "}
              {drawDate(d.excluded!.since)}, so they&rsquo;re left out of most/least drawn. They&rsquo;ve had
              fewer draws to appear in.
            </p>
          ))}

          <h2>Record jackpots</h2>
          <p>
            Lottizen doesn&rsquo;t store historical jackpot amounts, so these come from the cited reports, not
            from our data.
          </p>
          <ul>
            <li>
              <strong>Lotto Max, $80 million</strong>: Sep 17, 2024, shared by two tickets (Ontario and Quebec,
              $40M each).{" "}
              <a href="https://ctvnews.ca/montreal/article/retired-quebec-teacher-wins-half-of-historic-80m-canadian-lottery-jackpot">
                CTV News
              </a>
              . Also $80 million on May 9, 2025, a single ticket sold in Surrey, B.C.{" "}
              <a href="https://www.ctvnews.ca/vancouver/article/bc-winner-of-massive-80m-lottery-jackpot-has-come-forward/">
                CTV News
              </a>
              .
            </li>
            <li>
              <strong>Lotto 6/49, $68 million Gold Ball</strong>: Sep 27, 2023, ticket sold in Toronto.{" "}
              <a href="https://toronto.ctvnews.ca/toronto-man-wins-68-million-in-lotto-6-49-gold-ball-jackpot-1.6687111">
                CTV News
              </a>
              . The largest classic 6/49 jackpot was $64 million on Oct 17, 2015, sold in Mississauga.{" "}
              <a href="https://globalnews.ca/news/2283587/ticket-sold-in-ontario-claims-record-64-million-lotto-649-jackpot/">
                Global News
              </a>
              .
            </li>
          </ul>

          <h2>Unclaimed prizes</h2>
          <h3>How long you have</h3>
          <div className="table-wrap">
            <table className="prize-table">
              <thead>
                <tr>
                  <th>Agency</th>
                  <th>Draw games</th>
                  <th>Scratch tickets</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>OLG</td>
                  <td>One year from the draw date</td>
                  <td>Expiry date printed on the back of the ticket</td>
                  <td>
                    <a href="https://www.olg.ca/en/winners/faq.html">OLG FAQ</a>
                  </td>
                </tr>
                <tr>
                  <td>WCLC</td>
                  <td>One year from the draw date</td>
                  <td>Expiry date printed on the back of the ticket</td>
                  <td>
                    <a href="https://www.wclc.com/for-players/unclaimed-prizes-1.htm">WCLC</a>
                  </td>
                </tr>
                <tr>
                  <td>ALC</td>
                  <td>One year from the draw date</td>
                  <td>Expiry date printed on the back of the ticket</td>
                  <td>
                    <a href="https://www.alc.ca/content/alc/en/corporate/are-you-a-winner/claiming-your-prize.html">ALC</a>
                  </td>
                </tr>
                <tr>
                  <td>Loto-Québec</td>
                  <td>One year from the draw date</td>
                  <td>
                    &ldquo;dans l&rsquo;année qui suit la date de mise en marché&rdquo;
                  </td>
                  <td>
                    <a href="https://newswire.ca/fr/news-releases/loto-quebec-est-a-la-recherche-de-deux-gagnants-512527641.html">
                      Loto-Québec release (2013)
                    </a>
                  </td>
                </tr>
                <tr>
                  <td>BCLC</td>
                  <td>52 weeks from the draw date</td>
                  <td>—</td>
                  <td>
                    <a href="https://globalnews.ca/news/9939940/bc-lottery-ticket-1-million-unclaimed">Global News</a>{" "}
                    (news report, not BCLC)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>Where the money goes</h3>
          <p>
            Unclaimed prizes from national games (Lotto Max, Lotto 6/49, Daily Grand) go back to players
            through future bonus draws, guaranteed jackpots and promotions. Unclaimed prizes from regional
            games go to the province: OLG says Ontario-only games&rsquo; unclaimed prizes support
            &ldquo;priorities like health care and education&rdquo; (
            <a href="https://www.olg.ca/en/winners/faq.html">OLG</a>); WCLC says they are
            &ldquo;returned to the member provinces and territories as revenue&rdquo; (
            <a href="https://www.wclc.com/for-players/unclaimed-prizes-1.htm">WCLC</a>).
          </p>

          <h3>How much goes unclaimed</h3>
          <ul>
            <li>
              In fiscal 2017–18, about <strong>$46 million</strong> in Canadian lottery prizes went unclaimed,
              about 1% of prize money: OLG $21.8M, BCLC $7.4M, Loto-Québec about $7M, WCLC $6.7M, ALC $4M (
              <a href="https://globalnews.ca/news/4342469/unclaimed-lottery-money-canada/">
                Global News, Jul 20, 2018
              </a>
              , citing the agencies).
            </li>
            <li>
              A <strong>$70 million Lotto Max</strong> jackpot from the June 28, 2022 draw, sold in Scarborough,
              Ont., expired unclaimed on June 28, 2023 (
              <a href="https://globalnews.ca/news/9887971/lotto-max-jackpot-ticket-70-million-unclaimed-olg/">
                Global News
              </a>
              ).
            </li>
          </ul>
          <p>
            Official lists of currently unclaimed winning tickets:{" "}
            <a href="https://about.olg.ca/winners-and-players/ticket-information/unclaimed-tickets/">OLG (draw games)</a>,{" "}
            <a href="https://www.olg.ca/en/winners/unclaimed-instant-prizes.html">OLG (instant)</a>,{" "}
            <a href="https://www.wclc.com/for-players/unclaimed-prizes-1.htm">WCLC</a>,{" "}
            <a href="https://loteries.lotoquebec.com/fr/informations-pratiques/etat-de-reclamation-des-lots">Loto-Québec</a>.
          </p>

          <h2>Sources and method</h2>
          <p>
            Scratch data: each agency&rsquo;s published remaining-prize data, read daily (
            <Link href="/methodology">methodology</Link>). Draw history: the agencies&rsquo; own result
            archives and feeds (WCLC, OLG, BCLC PlayNow), cross-checked between sources, plus
            ca.lottonumbers.com for older Ontario-only results (Ontario 49, Lottario). Programmatic access: the <Link href="/api">Lottizen API</Link>.
            Lottizen is independent and not affiliated with any lottery agency. 19+. Play for entertainment
            only (<Link href="/responsible-play">responsible play</Link>).
          </p>
        </div>
      </section>
    </>
  );
}
