import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveGame } from "@/config/games";
import { getDraws, getPlayableSlugs, getResultYears } from "@/lib/draws";
import { drawDate } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { GameTabs } from "@/components/draws/GameTabs";
import { AdSlot } from "@/components/site/AdSlot";

export const dynamicParams = false;
export function generateStaticParams() {
  return getPlayableSlugs().map((game) => ({ game }));
}

export function generateMetadata({ params }: { params: { game: string } }): Metadata {
  const g = getLiveGame(params.game);
  if (!g) return {};
  const title = `${g.name} Results — Past Winning Numbers`;
  const description = `Full ${g.name} results archive: past winning numbers and bonus for every draw, newest first.`;
  return {
    title,
    description,
    alternates: { canonical: `/canada/${g.slug}/results` },
    openGraph: { title, description, url: absUrl(`/canada/${g.slug}/results`) },
  };
}

export default function ResultsPage({ params }: { params: { game: string } }) {
  const g = getLiveGame(params.game);
  if (!g) notFound();
  const draws = getDraws(g.slug);
  if (!draws) notFound();
  const years = getResultYears(g.slug);

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/canada">Canada</Link> /{" "}
            <Link href={`/canada/${g.slug}`}>{g.name}</Link> / <span>Results</span>
          </div>
          <div className="section-eyebrow">Results</div>
          <h1 className="section-headline">
            {g.name} <em>winning numbers.</em>
          </h1>
          <p className="section-lede">
            Every {g.name} draw since {draws.dataSince ? drawDate(draws.dataSince) : "—"} —
            newest first. {draws.drawCount} draws on record.
          </p>
          <GameTabs slug={g.slug} active="results" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          {years.length > 1 && (
            <div className="chip-row" style={{ marginBottom: 24 }}>
              <span className="chip active">All</span>
              {years.map((y) => (
                <Link key={y} href={`/canada/${g.slug}/results/${y}`} className="chip">
                  {y}
                </Link>
              ))}
            </div>
          )}

          <table className="results-table">
            <thead>
              <tr>
                <th style={{ width: 190 }}>Draw date</th>
                <th>Winning numbers</th>
              </tr>
            </thead>
            <tbody>
              {draws.draws.map((d) => (
                <tr key={d.date}>
                  <td className="rdate">{drawDate(d.date)}</td>
                  <td>
                    <Balls numbers={d.numbers} bonus={d.bonus} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 40 }}>
            <AdSlot slot={`results-${g.slug}`} format="leaderboard" />
          </div>
        </div>
      </section>
    </>
  );
}
