import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCharityLotteries, getCharityLottery, lotteryPath, provinceByCode, provinceBySlug, type CharityLottery } from "@/lib/charity";
import { drawDate, longDate, money } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { JsonLd } from "@/components/site/JsonLd";
import { FollowByEmail } from "@/components/site/FollowByEmail";

export function generateStaticParams() {
  return getCharityLotteries()
    .filter((l) => l.results.length)
    .map((l) => ({ province: provinceByCode(l.province)!.slug, id: l.id }));
}

/** "Blue Jays" for searches: the team name without its city, when a team has one. */
function searchName(l: CharityLottery): string {
  return l.team ? `${l.name} (${l.team})` : l.name;
}

function latestLine(l: CharityLottery): string {
  const r = l.results[0];
  if (!r) return "";
  const prize = r.prizeValue ? `, a prize of ${money(r.prizeValue)}` : "";
  const pot = r.pot && r.prizeValue && r.pot > r.prizeValue ? ` from a ${money(r.pot)} pot` : "";
  return `The latest ${l.name} winning number is ${r.winningNumbers.join(", ")}${r.drawDate ? `, drawn ${longDate(r.drawDate)}` : ""}${r.event ? ` (${r.event})` : ""}${prize}${pot}.`;
}

export function generateMetadata({ params }: { params: { province: string; id: string } }): Metadata {
  const l = getCharityLottery(params.id);
  if (!l) return {};
  const title = `${searchName(l)} Winning Numbers: Latest and Past Draws`;
  const description = `${latestLine(l)} Every winning number the lottery has published, newest first.`;
  const path = `${lotteryPath(l)}/winning-numbers`;
  return { title, description, alternates: { canonical: path }, openGraph: { title, description, url: absUrl(path) } };
}

export default function WinningNumbers({ params }: { params: { province: string; id: string } }) {
  const l = getCharityLottery(params.id);
  const p = provinceBySlug(params.province);
  if (!l || !p || !l.results.length || provinceByCode(l.province)?.slug !== p.slug) notFound();
  const main = l.results.filter((r) => r.prizeValue && r.prizeValue > 0);
  const other = l.results.filter((r) => !(r.prizeValue && r.prizeValue > 0));
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: `What is the latest ${l.name} winning number?`,
              acceptedAnswer: { "@type": "Answer", text: latestLine(l) },
            },
          ],
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/charity">Charity lotteries</Link> / <Link href={`/charity/${p.slug}`}>{p.name}</Link> /{" "}
            <Link href={lotteryPath(l)}>{l.name}</Link> / <span>Winning numbers</span>
          </div>
          <div className="section-eyebrow">Winning numbers{l.team ? ` · ${l.team}` : ""}</div>
          <h1 className="section-headline">{l.name} winning numbers</h1>
          <p className="section-lede">
            <strong>{latestLine(l)}</strong> Below is every winning number {l.operator ?? "the lottery"} has published that
            Lottizen holds, newest first. Check your ticket with the lottery itself; its records decide every claim.
          </p>
        </div>
      </div>
      <section className="section" style={{ paddingTop: 20 }}>
        <div className="container">
          <FollowByEmail
            kind="charity"
            id={l.id}
            province={l.province}
            title={`Get the ${l.name} winning number by email`}
            what="We’ll email you the winning number after each draw."
          />
          <div className="table-wrap">
            <table className="prize-table wn-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Draw</th>
                  <th>Winning number</th>
                  <th>Winner&rsquo;s prize</th>
                  <th>Total pot</th>
                </tr>
              </thead>
              <tbody>
                {main.map((r) => (
                  <tr key={`${r.edition}-${r.drawName}`}>
                    <td className="num">{r.drawDate ? drawDate(r.drawDate) : "—"}</td>
                    <td>{r.event ?? r.drawName}</td>
                    <td className="num">{r.winningNumbers.join(", ")}</td>
                    <td className="num">{money(r.prizeValue!)}</td>
                    <td className="num">{r.pot && r.pot > (r.prizeValue ?? 0) ? money(r.pot) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {other.length > 0 && (
            <>
              <h2 className="section-headline" style={{ fontSize: "clamp(22px,3vw,30px)", marginTop: 32 }}>
                Bonus and merchandise draws
              </h2>
              <div className="table-wrap">
                <table className="prize-table wn-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Prize</th>
                      <th>Winning number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {other.slice(0, 100).map((r) => (
                      <tr key={`${r.edition}-${r.drawName}`}>
                        <td className="num">{r.drawDate ? drawDate(r.drawDate) : "—"}</td>
                        <td>
                          {r.drawName}
                          {r.event ? <div className="field-hint">{r.event}</div> : null}
                        </td>
                        <td className="num">{r.winningNumbers.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="field-hint" style={{ marginTop: 20 }}>
            From the lottery&rsquo;s own published results{l.resultsUrl ? <> (<a href={l.resultsUrl} rel="nofollow noopener noreferrer">official winners page</a>)</> : null}.
            Lottizen doesn&rsquo;t publish winners&rsquo; names.
          </p>
        </div>
      </section>
    </>
  );
}
