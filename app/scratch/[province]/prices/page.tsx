import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllProvinceSlugs, getRankings } from "@/lib/data";
import { getPicks } from "@/lib/picks";
import { getGame } from "@/config/games";
import { drawDate, money } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { isProvince, provinceConfig, type Province } from "@/config/scratch";
import { ScratchDisclaimer } from "@/components/site/ScratchDisclaimer";
import type { Game } from "@/lib/types";

/**
 * Price guide: how a province's on-sale scratch tickets differ by price, and
 * what about $20 buys three ways (one $20 ticket, four $5 tickets, Lotto Max).
 *
 * Honesty (CLAUDE.md): this compares how the games are built (OLG's published
 * payout %, prize tiers, top prizes) and how much prize money is left (the
 * share of printed prize money unclaimed). It never compares the chance of
 * winning, and it says so. Figures an agency doesn't publish are shown as
 * "not published", never estimated.
 */

export function generateStaticParams() {
  return getAllProvinceSlugs().map((province) => ({ province }));
}

export function generateMetadata({ params }: { params: { province: string } }): Metadata {
  if (!isProvince(params.province)) return {};
  const cfg = provinceConfig(params.province);
  const title = `${cfg.label} Scratch Tickets by Price — $20 vs Four $5 Tickets vs Lotto Max`;
  const description = `How ${cfg.agency}'s scratch tickets on sale compare by price: prize money still unclaimed, top prizes left${
    cfg.agency === "OLG" ? ", and the payout rate OLG publishes for each game" : ""
  }. Plus what about $20 buys three ways. Updated daily.`;
  const path = `/scratch/${params.province}/prices`;
  return { title, description, alternates: { canonical: path }, openGraph: { title, description, url: absUrl(path) } };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x: number | null) => (x == null ? "not published" : `${x.toFixed(1)}%`);
const shareLeft = (g: Game) =>
  g.scoringMethod === "retention" && g.printedPrizePool && g.remainingPrizePool != null
    ? (100 * g.remainingPrizePool) / g.printedPrizePool
    : null;

function bestAt(games: Game[], price: number): Game | undefined {
  return games
    .filter((g) => g.price === price && g.onSale === true && g.topPrizesRemaining > 0)
    .sort((a, b) => b.valueScore - a.valueScore)[0];
}

function TicketCard({ g, count, province }: { g: Game | undefined; count: number; province: string }) {
  if (!g) return <p className="field-hint">No ticket at this price is on sale with a top prize left.</p>;
  const share = shareLeft(g);
  return (
    <ul>
      <li>
        {count} × <Link href={`/scratch/${province}/${g.slug}`}>{g.name}</Link> ({money(g.price)}), the top-ranked one on
        sale at this price
      </li>
      <li>
        Top prize {g.topPrizeLabel}: {g.topPrizesRemaining}
        {g.topPrizesTotal ? ` of ${g.topPrizesTotal}` : ""} left
      </li>
      <li>{g.prizeTierCount} prize tiers listed by the agency</li>
      {share != null && <li>{share.toFixed(1)}% of its printed prize money still unclaimed</li>}
      {g.publishedPayoutPct != null && <li>Printed to pay out {g.publishedPayoutPct}% of sales as prizes (OLG)</li>}
    </ul>
  );
}

export default function PriceGuidePage({ params }: { params: { province: string } }) {
  if (!isProvince(params.province)) notFound();
  const province = params.province as Province;
  const cfg = provinceConfig(province);
  const all = getRankings(province).games;
  const saleKnown = all.some((g) => g.onSale === true || g.onSale === false);
  const games = saleKnown ? all.filter((g) => g.onSale === true) : all;
  const prices = [...new Set(games.map((g) => g.price))].sort((a, b) => a - b);
  const rows = prices.map((p) => {
    const gs = games.filter((g) => g.price === p);
    const shares = gs.map(shareLeft).filter((x): x is number => x != null);
    const payouts = gs.map((g) => g.publishedPayoutPct).filter((x): x is number => x != null);
    return {
      price: p,
      n: gs.length,
      withTop: gs.filter((g) => g.topPrizesRemaining > 0).length,
      share: median(shares),
      payout: median(payouts),
      payoutRange: payouts.length ? [Math.min(...payouts), Math.max(...payouts)] : null,
      biggestTop: Math.max(...gs.map((g) => g.topPrizeAmount ?? 0)),
    };
  });
  const r20 = rows.find((r) => r.price === 20);
  const r5 = rows.find((r) => r.price === 5);
  const lm = getPicks().lottoMax ?? null;
  const lmGame = getGame("lotto-max");
  const lmPlays = lmGame ? Math.floor(20 / lmGame.price) : 0;

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/scratch">Scratch</Link> / <Link href={`/scratch/${province}`}>{cfg.label}</Link> / <span>By price</span>
          </div>
          <div className="section-eyebrow">Price guide · {cfg.agency}</div>
          <h1 className="section-headline">
            {cfg.label} scratch tickets, <em>by price.</em>
          </h1>
          <p className="section-lede">
            How {cfg.agency}&rsquo;s scratch tickets {saleKnown ? "on sale now" : "on its prize list"} differ by price,
            from the agency&rsquo;s published data. This compares how the games are built and how much of their prize
            money is left. It doesn&rsquo;t compare, and doesn&rsquo;t change, the chance of any ticket winning.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container prose">
          <h2>Does a $20 ticket leave more than four $5 tickets?</h2>
          {r20 && r5 ? (
            <ul>
              {r20.payout != null && r5.payout != null ? (
                <li>
                  {cfg.agency} prints its $20 tickets on sale to pay out a median <strong>{r20.payout.toFixed(2)}%</strong> of
                  sales as prizes, and its $5 tickets <strong>{r5.payout.toFixed(2)}%</strong> (the payout rate on each
                  game&rsquo;s product page). That is how the games are designed across all their tickets, not what any
                  one ticket returns.
                </li>
              ) : (
                <li>{cfg.agency} doesn&rsquo;t publish a payout rate per game, so that comparison isn&rsquo;t possible here.</li>
              )}
              {r20.share != null && r5.share != null ? (
                <li>
                  The median $20 ticket on sale has <strong>{r20.share.toFixed(1)}%</strong> of its printed prize money
                  still unclaimed; the median $5 ticket, <strong>{r5.share.toFixed(1)}%</strong>.
                </li>
              ) : (
                <li>
                  {cfg.agency} doesn&rsquo;t publish how many prizes were printed in every tier, so the share of prize money
                  left can&rsquo;t be compared by price.
                </li>
              )}
              <li>
                No agency publishes how many tickets are still unsold, so nobody can say how much prize money is left
                per ticket, at any price.
              </li>
            </ul>
          ) : (
            <p>{cfg.agency} doesn&rsquo;t have both $20 and $5 tickets on sale right now.</p>
          )}

          <h2>Every price point</h2>
          <div className="table-wrap">
            <table className="prize-table">
              <thead>
                <tr>
                  <th>Price</th>
                  <th>{saleKnown ? "On sale" : "Listed"}</th>
                  <th>With a top prize left</th>
                  <th>Median share of printed prize money unclaimed</th>
                  <th>Published payout (median, range)</th>
                  <th>Largest top prize</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.price}>
                    <td className="num">{money(r.price)}</td>
                    <td className="num">{r.n}</td>
                    <td className="num">{r.withTop}</td>
                    <td className="num">{pct(r.share)}</td>
                    <td className="num">
                      {r.payout == null
                        ? "not published"
                        : `${r.payout.toFixed(2)}% (${r.payoutRange![0]}–${r.payoutRange![1]}%)`}
                    </td>
                    <td className="num">{r.biggestTop ? money(r.biggestTop) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>About $20, three ways</h2>
          <p>
            The same money, spent three ways. Each describes what the agency publishes about the game; none of it is
            the chance of winning, which Lottizen doesn&rsquo;t compare.
          </p>
          <h3>One $20 scratch ticket</h3>
          <TicketCard g={bestAt(games, 20)} count={1} province={province} />
          <h3>Four $5 scratch tickets</h3>
          <TicketCard g={bestAt(games, 5)} count={4} province={province} />
          {lmGame && lm && (
            <>
              <h3>
                {lmPlays} Lotto Max plays ({money(lmPlays * lmGame.price)})
              </h3>
              <ul>
                <li>
                  {money(lmGame.price)} a play, drawn Tuesdays and Fridays.
                  {lm.nextDraw ? (
                    <>
                      {" "}
                      Next draw {drawDate(lm.nextDraw)}
                      {lm.jackpot ? <>, jackpot {money(lm.jackpot)}</> : null}.
                    </>
                  ) : null}
                </li>
                <li>
                  What each prize tier paid per winning ticket in the {drawDate(lm.breakdownDate)} draw (
                  {lm.sourceUrl ? <a href={lm.sourceUrl}>published breakdown</a> : "published breakdown"}); the shared tiers
                  change every draw:{" "}
                  {lm.tiers
                    .filter((t) => t.prize && (t.winners ?? 0) > 0)
                    .map((t) => `${t.tier} ${money(t.prize!)}`)
                    .join(" · ")}
                  .
                  {lm.tiers[0] && !(lm.tiers[0].winners ?? 0) ? ` Nobody matched ${lm.tiers[0].tier} in that draw.` : ""}
                </li>
                <li>
                  A draw game has no &ldquo;prize money left&rdquo;: every draw starts a new prize pool, so the scratch-ticket
                  measures above don&rsquo;t apply to it.
                </li>
              </ul>
            </>
          )}
          <ScratchDisclaimer />
        </div>
      </section>
    </>
  );
}
