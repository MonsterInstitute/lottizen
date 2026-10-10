import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CHARITY_PROVINCES, isOpen, lotteriesIn, lotteryPath, provinceBySlug } from "@/lib/charity";
import { drawDate, money } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { LotteryCard } from "@/components/charity/LotteryCard";
import { HundredDollars } from "@/components/charity/HundredDollars";

export function generateStaticParams() {
  return CHARITY_PROVINCES.filter((p) => lotteriesIn(p.code).length).map((p) => ({ province: p.slug }));
}

export function generateMetadata({ params }: { params: { province: string } }): Metadata {
  const p = provinceBySlug(params.province);
  if (!p) return {};
  const title = `${p.name} Charity Lotteries: Home Lotteries and 50/50s On Sale Now`;
  const description = `Hospital home lotteries and 50/50s licensed in ${p.name}: deadlines, ticket caps, prizes and published odds, current 50/50 pots and winning numbers.`;
  return { title, description, alternates: { canonical: `/charity/${p.slug}` }, openGraph: { title, description, url: absUrl(`/charity/${p.slug}`) } };
}

export default function ProvinceCharity({ params }: { params: { province: string } }) {
  const p = provinceBySlug(params.province);
  if (!p) notFound();
  const all = lotteriesIn(p.code);
  if (!all.length) notFound();
  const homes = all.filter((l) => l.kind !== "5050" && l.kind !== "catch_the_ace" && isOpen(l));
  const fifties = all
    .filter((l) => (l.kind === "5050" || l.kind === "catch_the_ace") && isOpen(l) && l.current?.status === "on_sale")
    .sort((a, b) => (a.current?.salesClose ?? "9").localeCompare(b.current?.salesClose ?? "9"));
  // Everything else we track here: between games or editions. Listed so each
  // lottery's page (and its winning numbers) stays reachable.
  const shown = new Set([...homes, ...fifties].map((l) => l.id));
  const resting = all.filter((l) => !shown.has(l.id)).sort((a, b) => a.name.localeCompare(b.name));
  const recent = all
    .filter((l) => l.results.length)
    .map((l) => ({ l, r: l.results[0] }))
    .sort((a, b) => (b.r.drawDate ?? "").localeCompare(a.r.drawDate ?? ""))
    .slice(0, 12);
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/charity">Charity lotteries</Link> / <span>{p.name}</span>
          </div>
          <div className="section-eyebrow">Charity lotteries · {p.name}</div>
          <h1 className="section-headline">
            {p.name} home lotteries and <em>50/50s.</em>
          </h1>
          <p className="section-lede">
            Licensed in {p.name}, by deadline. Every number is the lottery&rsquo;s own, from its rules page or its ticket site.
            Tickets can only be bought by people in {p.name}.
          </p>
        </div>
      </div>

      {homes.length > 0 && (
        <section className="section" style={{ paddingTop: 24 }}>
          <div className="container">
            <h2 className="section-headline">Home and prize lotteries</h2>
            <div className="charity-grid">
              {homes.map((l) => (
                <LotteryCard key={l.id} l={l} />
              ))}
            </div>
          </div>
        </section>
      )}

      {fifties.length > 0 && (
        <section className="section" style={{ paddingTop: 12 }}>
          <div className="container">
            <h2 className="section-headline">50/50s and Catch the Ace on sale</h2>
            <div className="charity-grid">
              {fifties.map((l) => (
                <LotteryCard key={l.id} l={l} />
              ))}
            </div>
          </div>
        </section>
      )}

      {resting.length > 0 && (
        <section className="section" style={{ paddingTop: 12 }}>
          <div className="container">
            <h2 className="section-headline">Between editions</h2>
            <p className="field-hint" style={{ marginBottom: 10 }}>
              Not on sale today: between games, or the next edition hasn&rsquo;t opened. Each page keeps the last
              edition&rsquo;s details and winning numbers.
            </p>
            <ul className="charity-resting">
              {resting.map((l) => (
                <li key={l.id}>
                  <Link href={lotteryPath(l)}>{l.name}</Link>
                  {l.operator ? <span className="field-hint"> · {l.operator}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="section" style={{ paddingTop: 12 }}>
          <div className="container">
            <h2 className="section-headline">Latest winning numbers</h2>
            <div className="table-wrap">
              <table className="prize-table wn-table">
                <thead>
                  <tr>
                    <th>Lottery</th>
                    <th>Draw</th>
                    <th>Winning number</th>
                    <th>Prize</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(({ l, r }) => (
                    <tr key={l.id}>
                      <td>
                        <Link href={`${lotteryPath(l)}/winning-numbers`}>{l.name}</Link>
                      </td>
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
          </div>
        </section>
      )}

      <HundredDollars p={p} />
    </>
  );
}
