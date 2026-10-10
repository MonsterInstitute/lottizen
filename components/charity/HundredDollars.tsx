import Link from "next/link";
import { getCharity, isOpen, lotteriesIn, lotteryPath, type CharityProvince } from "@/lib/charity";
import { scratchTop } from "@/components/home/ScratchRegionCard";
import type { Province } from "@/config/scratch";
import { money } from "@/lib/format";

const SCRATCH_BOARD: Record<string, Province> = {
  ON: "ontario", QC: "quebec", BC: "british-columbia", AB: "western", SK: "western", MB: "western", YT: "western",
  NT: "western", NU: "western", NS: "atlantic", NB: "atlantic", PE: "atlantic", NL: "atlantic",
};

/**
 * "The same $100, three ways" for one province: a home lottery, scratch
 * tickets and Lotto Max, each described only by what its operator
 * publishes. They aren't put on one scale: a home lottery publishes a ticket
 * cap and a prize list, Lotto Max publishes odds per play, and no scratch
 * agency publishes how many tickets are still unsold — so a scratch
 * ticket's chance of winning today can't be stated, and isn't.
 */
export function HundredDollars({ p }: { p: CharityProvince }) {
  const home = lotteriesIn(p.code).find(
    (l) => l.kind === "home" && isOpen(l) && l.current?.priceTiers.length && l.current.ticketCap,
  );
  const tiersUnder = home?.current?.priceTiers.filter((t) => t.price <= 100) ?? [];
  const best = tiersUnder.sort((a, b) => b.tickets / b.price - a.tickets / a.price)[0];
  const scratch = scratchTop(p.region, SCRATCH_BOARD[p.code])[0];
  const dg = getCharity().drawGame;
  const plays = dg ? Math.floor(100 / dg.price) : 0;
  if (!home && !scratch && !dg) return null;
  return (
    <section className="section" style={{ paddingTop: 20 }}>
      <div className="container">
        <div className="section-eyebrow">Compare</div>
        <h2 className="section-headline">
          The same $100, <em>three ways.</em>
        </h2>
        <p className="section-lede">
          What each operator publishes about where $100 goes in {p.name}. These are different kinds of games and
          they publish different things, so they aren&rsquo;t put on one scale.
        </p>
        <div className="charity-grid">
          {home && home.current && (
            <div className="card" style={{ padding: 22 }}>
              <div className="section-eyebrow">Home lottery</div>
              <h3 className="home-pick-title" style={{ fontSize: 22 }}>
                <Link href={lotteryPath(home)}>{home.name}</Link>
              </h3>
              <ul className="home-skip-list">
                {best && (
                  <li>
                    $100 buys {best.tickets} ticket{best.tickets === 1 ? "" : "s"}
                    {best.price < 100 ? ` (${money(best.price)})` : ""}
                  </li>
                )}
                <li>At most {home.current.ticketCap!.toLocaleString("en-CA")} tickets are sold</li>
                {home.current.prizeCount != null && (
                  <li>
                    {home.current.prizeCount.toLocaleString("en-CA")} prizes
                    {home.current.prizeValue != null ? `, worth ${money(home.current.prizeValue)} in all` : ""}
                  </li>
                )}
                {home.current.odds.map((o) => (
                  <li key={o.text}>&ldquo;{o.text}&rdquo;</li>
                ))}
              </ul>
            </div>
          )}
          {scratch && (
            <div className="card" style={{ padding: 22 }}>
              <div className="section-eyebrow">Scratch tickets</div>
              <h3 className="home-pick-title" style={{ fontSize: 22 }}>
                <Link href={`/scratch/${SCRATCH_BOARD[p.code]}/${scratch.slug}`}>{scratch.name}</Link>
              </h3>
              <ul className="home-skip-list">
                <li>
                  $100 buys {Math.floor(100 / scratch.price)} ticket{Math.floor(100 / scratch.price) === 1 ? "" : "s"} at{" "}
                  {money(scratch.price)}
                </li>
                <li>{money(scratch.remainingPrizePool)} in prizes still unclaimed (the agency&rsquo;s published counts)</li>
                {scratch.topPrizesTotal > 0 && (
                  <li>
                    Top prize {scratch.topPrizeLabel}: {scratch.topPrizesRemaining} of {scratch.topPrizesTotal} left
                  </li>
                )}
                <li>
                  No agency publishes how many tickets are still unsold, so the chance of a ticket winning today can&rsquo;t be
                  stated.
                </li>
              </ul>
            </div>
          )}
          {dg && (
            <div className="card" style={{ padding: 22 }}>
              <div className="section-eyebrow">Draw game</div>
              <h3 className="home-pick-title" style={{ fontSize: 22 }}>
                <Link href="/canada/lotto-max">{dg.name}</Link>
              </h3>
              <ul className="home-skip-list">
                <li>
                  $100 buys {plays} plays at {money(dg.price)} ({money(plays * dg.price)})
                </li>
                <li>
                  Any prize: {dg.anyPrize} per {money(dg.price)} play; jackpot: {dg.jackpot} per play (
                  <a href={dg.sourceUrl} rel="noopener noreferrer">OLG</a>)
                </li>
                <li>Every draw starts a new prize pool; there&rsquo;s no &ldquo;prize money left&rdquo; to track.</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
