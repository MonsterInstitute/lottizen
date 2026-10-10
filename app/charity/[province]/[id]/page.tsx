import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  KIND_LABEL,
  daysUntil,
  getCharityLotteries,
  getCharityLottery,
  lotteryPath,
  nextDeadline,
  provinceByCode,
  provinceBySlug,
  fmtDeadline,
  type CharityLottery,
} from "@/lib/charity";
import { drawDate, longDate, money } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { BuyLink } from "@/components/charity/BuyLink";
import { Countdown } from "@/components/charity/Countdown";
import { FollowByEmail } from "@/components/site/FollowByEmail";

export function generateStaticParams() {
  return getCharityLotteries()
    .filter((l) => l.current || l.results.length)
    .map((l) => ({ province: provinceByCode(l.province)!.slug, id: l.id }));
}

function describe(l: CharityLottery): string {
  const e = l.current;
  const bits: string[] = [];
  if (e?.ticketCap) bits.push(`${e.ticketCap.toLocaleString("en-CA")} tickets`);
  if (e?.prizeCount) bits.push(`${e.prizeCount.toLocaleString("en-CA")} prizes`);
  if (e?.salesClose) bits.push(`sales close ${fmtDeadline(e.salesClose, l.province, false)}`);
  if (l.kind !== "home" && e?.jackpot != null && e.status === "on_sale") bits.push(`pot now ${money(e.jackpot)}`);
  return bits.length ? `${l.name}: ${bits.join(", ")}.` : `${l.name}: deadlines, prizes and winning numbers.`;
}

export function generateMetadata({ params }: { params: { province: string; id: string } }): Metadata {
  const l = getCharityLottery(params.id);
  if (!l) return {};
  const title = `${l.name}: Deadlines, Prizes, Odds and Winners`;
  const description = `${describe(l)} From the lottery's own rules and ticket site.`;
  return { title, description, alternates: { canonical: lotteryPath(l) }, openGraph: { title, description, url: absUrl(lotteryPath(l)) } };
}

export default function LotteryPage({ params }: { params: { province: string; id: string } }) {
  const l = getCharityLottery(params.id);
  const p = provinceBySlug(params.province);
  if (!l || !p || provinceByCode(l.province)?.slug !== p.slug) notFound();
  const e = l.current;
  const next = e ? nextDeadline(e) : null;
  const ahead = e?.draws.filter((d) => d.cutoff && new Date(d.cutoff) > new Date()) ?? [];
  const missed = e?.draws.filter((d) => d.cutoff && new Date(d.cutoff) <= new Date()) ?? [];
  const is5050 = l.kind === "5050" || l.kind === "catch_the_ace";
  const licences = (l.provinces?.length ? l.provinces : [l.province]).map((c) => provinceByCode(c)?.name ?? c);
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/charity">Charity lotteries</Link> / <Link href={`/charity/${p.slug}`}>{p.name}</Link> / <span>{l.name}</span>
          </div>
          <div className="section-eyebrow">
            {KIND_LABEL[l.kind]} · {licences.join(", ")}
            {e?.licenceNo ? ` · Licence ${e.licenceNo}` : ""}
          </div>
          <h1 className="section-headline">{l.name}</h1>
          <p className="section-lede">
            {l.operator ? `Run by ${l.operator}. ` : ""}
            {e?.title && e.title !== l.name ? `${e.title}. ` : ""}
            {e?.status === "sold_out"
              ? "Sold out. "
              : e?.status === "closed"
                ? "Ticket sales have closed. "
                : e?.status === "drawn"
                  ? "This edition has been drawn. "
                  : ""}
            Every figure below is the lottery&rsquo;s own, from its rules page or ticket site.
          </p>
          <div className="hero-cta-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <BuyLink l={l} />
          </div>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          {e && (
            <div className="charity-facts">
              {next && (
                <div className="stat-tile">
                  <div className="k">{next.name}</div>
                  <div className="v" style={{ fontSize: "clamp(22px,3vw,34px)" }}>
                    <Countdown at={next.at} fallback={`${daysUntil(next.at)} day${daysUntil(next.at) === 1 ? "" : "s"}`} />
                  </div>
                  <div className="foot">{fmtDeadline(next.at, l.province)}</div>
                </div>
              )}
              {is5050 && e.jackpot != null && e.status === "on_sale" && (
                <div className="stat-tile">
                  <div className="k">{e.guarantee ? "Guaranteed pot" : "Pot now"}</div>
                  <div className="v">{money(e.jackpot)}</div>
                  <div className="foot">
                    {e.percentPrize ? `The total pot; the winner gets ${e.percentPrize}% of it.` : "The total pot."}
                    {e.guarantee ? ` A guaranteed minimum of ${money(e.guarantee)}.` : ""}
                  </div>
                </div>
              )}
              {e.ticketCap != null && (
                <div className="stat-tile">
                  <div className="k">Tickets</div>
                  <div className="v">{e.ticketCap.toLocaleString("en-CA")}</div>
                  <div className="foot">The most that will be sold{e.quotes.ticket_cap ? ` — “${e.quotes.ticket_cap}”` : "."}</div>
                </div>
              )}
              {e.prizeCount != null && (
                <div className="stat-tile">
                  <div className="k">Prizes</div>
                  <div className="v">{e.prizeCount.toLocaleString("en-CA")}</div>
                  <div className="foot">{e.prizeValue != null ? `Worth ${money(e.prizeValue)} in all.` : ""}</div>
                </div>
              )}
              {e.prizeCount == null && e.prizeValue != null && (
                <div className="stat-tile">
                  <div className="k">Prizes worth</div>
                  <div className="v">{money(e.prizeValue)}</div>
                </div>
              )}
              {e.drawDate && !is5050 && (
                <div className="stat-tile">
                  <div className="k">Grand prize draw</div>
                  <div className="v" style={{ fontSize: "clamp(22px,3vw,34px)" }}>
                    {drawDate(e.drawDate.slice(0, 10))}
                  </div>
                </div>
              )}
            </div>
          )}

          {e && e.priceTiers.length > 0 && (
            <>
              <h2 className="section-headline" style={{ fontSize: "clamp(24px,3vw,34px)" }}>
                Ticket prices
              </h2>
              <div className="table-wrap">
                <table className="prize-table">
                  <thead>
                    <tr>
                      <th>Tickets</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.priceTiers.map((t) => (
                      <tr key={t.tickets}>
                        <td className="num">{t.tickets}</td>
                        <td className="num">{money(t.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {e && e.draws.length > 0 && (
            <>
              <h2 className="section-headline" style={{ fontSize: "clamp(24px,3vw,34px)", marginTop: 32 }}>
                Deadlines and draws
              </h2>
              <p className="section-lede">
                A ticket is in a draw only if it&rsquo;s bought by that draw&rsquo;s deadline.
                {ahead.length > 0
                  ? ` Bought today, a ticket is in ${ahead.length === 1 ? "the 1 remaining deadline draw" : `all ${ahead.length} remaining deadline draws`}${missed.length ? `; it has missed ${missed.length}` : ""}.`
                  : ""}
              </p>
              <div className="table-wrap">
                <table className="prize-table">
                  <thead>
                    <tr>
                      <th>Deadline</th>
                      <th>Buy by (end of day)</th>
                      <th>Draw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.draws.map((d) => (
                      <tr key={d.name} className={d.cutoff && new Date(d.cutoff) <= new Date() ? "depleted" : ""}>
                        <td>{d.name}</td>
                        <td className="num">{d.cutoff ? fmtDeadline(d.cutoff, l.province, false) : "—"}</td>
                        <td className="num">{d.drawDate ? drawDate(d.drawDate) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {e.eligibility.length > 0 && (
                <>
                  <p className="field-hint" style={{ marginTop: 10 }}>
                    What the rules say about how many draws each ticket is in:
                  </p>
                  <ul className="home-skip-list">
                    {e.eligibility.map((s) => (
                      <li key={s}>&ldquo;{s}.&rdquo;</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {e && e.odds.length > 0 && (
            <>
              <h2 className="section-headline" style={{ fontSize: "clamp(24px,3vw,34px)", marginTop: 32 }}>
                Published odds
              </h2>
              <ul className="home-skip-list">
                {e.odds.map((o) => (
                  <li key={o.text}>&ldquo;{o.text}.&rdquo;</li>
                ))}
              </ul>
            </>
          )}

          {is5050 && e && e.history.filter((h) => h.jackpot != null).length > 1 && (
            <>
              <h2 className="section-headline" style={{ fontSize: "clamp(24px,3vw,34px)", marginTop: 32 }}>
                The pot, day by day
              </h2>
              <div className="table-wrap">
                <table className="prize-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Pot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.history
                      .filter((h) => h.jackpot != null)
                      .map((h) => (
                        <tr key={h.date}>
                          <td>{drawDate(h.date)}</td>
                          <td className="num">{money(h.jackpot!)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <FollowByEmail
            kind="charity"
            id={l.id}
            province={l.province}
            title={`Follow ${l.name}`}
            what={
              is5050
                ? "We’ll email you the winning number after each draw, and when a big pot is close to its deadline."
                : "We’ll email you 3 days before each deadline (and what you’d miss after it), if it’s about to sell out, and when the winners are drawn."
            }
          />

          {l.results.length > 0 && (
            <>
              <h2 className="section-headline" style={{ fontSize: "clamp(24px,3vw,34px)", marginTop: 32 }}>
                Latest winning numbers
              </h2>
              <div className="table-wrap">
                <table className="prize-table wn-table">
                  <thead>
                    <tr>
                      <th>Draw</th>
                      <th>Winning number</th>
                      <th>Prize</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.results.slice(0, 8).map((r) => (
                      <tr key={`${r.edition}-${r.drawName}`}>
                        <td>
                          {r.drawDate ? drawDate(r.drawDate) : ""}
                          {r.event ? <div className="field-hint">{r.event}</div> : null}
                        </td>
                        <td className="num">{r.winningNumbers.join(", ")}</td>
                        <td className="num">{r.prizeValue ? money(r.prizeValue) : r.drawName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                <Link href={`${lotteryPath(l)}/winning-numbers`}>All {l.name} winning numbers →</Link>
              </p>
            </>
          )}

          <p className="field-hint" style={{ marginTop: 24 }}>
            Sources: {l.rulesUrl && <a href={l.rulesUrl} rel="nofollow noopener noreferrer">the lottery&rsquo;s rules</a>}
            {l.rulesUrl && l.url ? " and " : ""}
            {l.url && <a href={l.url} rel="nofollow noopener noreferrer">official site</a>}
            {e?.scrapedAt ? `, read ${longDate(e.scrapedAt.slice(0, 10))}` : ""}. Lottizen isn&rsquo;t affiliated with this
            lottery and isn&rsquo;t paid for ticket sales. Check every detail with the lottery before you buy.
          </p>
        </div>
      </section>
    </>
  );
}
