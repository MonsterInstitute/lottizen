import type { Metadata } from "next";
import Link from "next/link";
import { getUnclaimed, type UnclaimedPrize } from "@/lib/unclaimed";
import { daysBetween, drawDate, longDate, money } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { JsonLd } from "@/components/site/JsonLd";
import { DaysLeft } from "@/components/unclaimed/DaysLeft";

const PATH = "/unclaimed";

/** Exactly as the agency lists it: cents shown when the amount has any
 *  (OLG lists one 6/49 prize at $254,269.50 — money() would round it). */
function exact(n: number): string {
  return n % 1 === 0
    ? money(n)
    : `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function summary() {
  const d = getUnclaimed();
  const total = d.prizes.reduce((s, p) => s + p.amount, 0);
  const millionPlus = d.prizes.filter((p) => p.amount >= 1_000_000);
  const soonest = d.prizes[0];
  const largest = [...d.prizes].sort((a, b) => b.amount - a.amount)[0];
  return { d, total, millionPlus, soonest, largest };
}

export function generateMetadata(): Metadata {
  const { d, total, soonest } = summary();
  const title = "Unclaimed Lottery Prizes in Canada — $100,000 and Up, by Deadline";
  const description =
    `${d.prizes.length} unclaimed Canadian lottery prizes of $100,000 or more, worth ${money(total, { compact: true })} together, ` +
    `from the agencies' official lists, sorted by claim deadline` +
    (soonest ? `. Next to expire: a ${money(soonest.amount, { compact: true })} ${soonest.game} prize on ${longDate(soonest.expires)}.` : ".");
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: { title, description, url: absUrl(PATH), type: "article" },
  };
}

function agencyLabel(p: UnclaimedPrize) {
  return p.agency === "QUEBEC" ? "Loto-Québec" : p.agency;
}

export default function UnclaimedPage() {
  const { d, total, millionPlus, soonest, largest } = summary();
  const asOf = longDate(d.asOfDate);
  const covered = d.agencies.filter((a) => a.ok);
  const sources = new Intl.ListFormat("en", { type: "conjunction" }).format(
    covered.map((a) => (a.agency === "QUEBEC" ? "Loto-Québec" : a.agency)),
  );
  const citation = `Lottizen, "Unclaimed lottery prizes in Canada," ${asOf}, ${absUrl(PATH)}. Data: the official unclaimed-prize lists of ${sources}, compiled by Lottizen.`;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "Unclaimed lottery prizes in Canada ($100,000 and up)",
          description:
            "Every prize of $100,000 or more that a Canadian lottery agency lists as won but not yet claimed, with draw date, where the ticket was sold and the claim deadline. Compiled daily from the agencies' official lists.",
          url: absUrl(PATH),
          creator: { "@type": "Organization", name: SITE.name, url: SITE.url },
          isAccessibleForFree: true,
          dateModified: d.asOfDate,
          spatialCoverage: "Canada",
          isBasedOn: covered.map((a) => a.url),
          variableMeasured: ["prize amount (CAD)", "draw date", "claim deadline", "where sold"],
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/press">Press &amp; data</Link> / <span>Unclaimed prizes</span>
          </div>
          <div className="section-eyebrow">Unclaimed prize tracker · updated daily</div>
          <h1 className="section-headline">
            Unclaimed lottery prizes, <em>before the deadline.</em>
          </h1>
          <p className="section-lede">
            Every prize of {money(d.minAmount)} or more that a Canadian lottery agency lists as won but not yet
            claimed, sorted by claim deadline. Copied from each agency&rsquo;s official list every morning; the
            date of each list is shown below, because a prize can be claimed after the list was last updated.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container prose">
          <h2>Key facts, as of {asOf}</h2>
          <ul>
            <li>
              <strong>{d.prizes.length}</strong> prizes of {money(d.minAmount)} or more are listed as unclaimed and
              not yet expired, worth <strong>{exact(total)}</strong> together.
            </li>
            <li>
              <strong>{millionPlus.length}</strong> of them are $1 million or more.
            </li>
            {soonest && (
              <li>
                The next to expire is a <strong>{exact(soonest.amount)}</strong> {soonest.game} prize{soonest.detail ? ` (${soonest.detail})` : ""} from the{" "}
                {longDate(soonest.drawDate)} draw, sold in {soonest.location} ({agencyLabel(soonest)}). Its claim
                deadline is <strong>{longDate(soonest.expires)}</strong>,{" "}
                {daysBetween(d.asOfDate, soonest.expires)} days after {asOf}.
              </li>
            )}
            {largest && largest !== soonest && (
              <li>
                The largest is a <strong>{exact(largest.amount)}</strong> {largest.game} prize from the{" "}
                {longDate(largest.drawDate)} draw ({agencyLabel(largest)}), claimable until{" "}
                {longDate(largest.expires)}.
              </li>
            )}
            <li>
              Sources: {covered.map((a, i) => (
                <span key={a.agency}>
                  {i > 0 ? "; " : ""}
                  <a href={a.url} rel="noopener noreferrer">{a.name}</a>, list dated {a.listAsOf ?? "(no date given)"}
                </span>
              ))}.
            </li>
          </ul>

          <h2>All listed prizes of {money(d.minAmount)} or more</h2>
          <div className="table-wrap">
            <table className="prize-table">
              <thead>
                <tr>
                  <th>Claim deadline</th>
                  <th>Days left</th>
                  <th>Prize</th>
                  <th>Game</th>
                  <th>Draw date</th>
                  <th>Where sold</th>
                  <th>Listed by</th>
                </tr>
              </thead>
              <tbody>
                {d.prizes.map((p) => (
                  <tr key={`${p.agency}|${p.game}|${p.drawDate}|${p.amount}|${p.location}`}>
                    <td>{drawDate(p.expires)}</td>
                    <td className="num">
                      <DaysLeft expires={p.expires} initial={daysBetween(d.asOfDate, p.expires)} />
                    </td>
                    <td className="num">
                      <strong>{exact(p.amount)}</strong>
                    </td>
                    <td>
                      {p.game}
                      {p.detail ? <div className="field-hint">{p.detail}</div> : null}
                    </td>
                    <td>{drawDate(p.drawDate)}</td>
                    <td>{p.location ?? "—"}</td>
                    <td>
                      <a href={p.sourceUrl} rel="noopener noreferrer">
                        {agencyLabel(p)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint">
            Deadlines: Loto-Québec states each one on its list; for OLG and WCLC they are the one-year claim
            period applied to the draw date. Where a prize is shared, the amount is the unclaimed share, as
            listed. Loto-Québec gives an administrative region, not a store. If you think you hold one of these tickets, check it at a retailer or with the agency
            before the deadline &mdash; the agency&rsquo;s own records decide every claim.
          </p>

          {d.noLongerListed.length > 0 && (
            <>
              <h2>No longer listed (last 90 days)</h2>
              <p>
                These prizes were on an agency&rsquo;s list and have since been removed. The agencies don&rsquo;t say
                why a prize leaves their list, so Lottizen doesn&rsquo;t either.
              </p>
              <div className="table-wrap">
                <table className="prize-table">
                  <thead>
                    <tr>
                      <th>Removed</th>
                      <th>Prize</th>
                      <th>Game</th>
                      <th>Draw date</th>
                      <th>Where sold</th>
                      <th>Deadline was</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.noLongerListed.map((p) => (
                      <tr key={`${p.agency}|${p.game}|${p.drawDate}|${p.amount}|${p.location}`}>
                        <td>{drawDate(p.removedOn!)}</td>
                        <td className="num">{exact(p.amount)}</td>
                        <td>{p.game}</td>
                        <td>{drawDate(p.drawDate)}</td>
                        <td>
                          {p.location ?? "—"} ({agencyLabel(p)})
                        </td>
                        <td>
                          {drawDate(p.expires)}
                          {p.removedBeforeDeadline ? "" : " (expired)"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2>Which agencies are covered</h2>
          <ul>
            {d.agencies.map((a) => (
              <li key={a.agency}>
                <strong>{a.name}</strong>:{" "}
                {a.ok ? (
                  <>
                    included, from its <a href={a.url} rel="noopener noreferrer">official list</a> (dated{" "}
                    {a.listAsOf ?? "no date given"}).
                  </>
                ) : (
                  <>its list could not be read today; yesterday&rsquo;s rows are shown until it can.</>
                )}
              </li>
            ))}
            {d.notCovered.map((a) => (
              <li key={a.agency}>
                <strong>{a.name}</strong>: not included. {a.reason}
              </li>
            ))}
          </ul>

          <h2>Cite this page</h2>
          <p className="field-hint" style={{ fontFamily: "var(--font-mono), monospace" }}>
            {citation}
          </p>
          <p>
            Free to quote with a link. More citable figures are in the{" "}
            <Link href="/data/canada-lottery-almanac">Canadian lottery data almanac</Link>; for questions, see{" "}
            <Link href="/press">Press &amp; data</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
