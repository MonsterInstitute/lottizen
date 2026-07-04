import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName } from "@/config/games";
import { resolveGame, countryGameParams, getDraws, getResultYears } from "@/lib/draws";
import { drawDate } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { GameTabs } from "@/components/draws/GameTabs";
import { AdSlot } from "@/components/site/AdSlot";

export const dynamicParams = false;
export function generateStaticParams() {
  return countryGameParams();
}

export function generateMetadata({ params }: { params: { country: string; game: string } }): Metadata {
  const g = resolveGame(params.country, params.game);
  if (!g) return {};
  const title = `${g.name} Results — Past Winning Numbers`;
  const description = `Full ${g.name} results archive: past winning numbers and bonus for every draw, newest first.`;
  return {
    title,
    description,
    alternates: { canonical: `/${params.country}/${g.slug}/results` },
    openGraph: { title, description, url: absUrl(`/${params.country}/${g.slug}/results`) },
  };
}

const RECENT_LIMIT = 200;

export default function ResultsPage({ params }: { params: { country: string; game: string } }) {
  const g = resolveGame(params.country, params.game);
  if (!g) notFound();
  const base = `/${params.country}/${g.slug}`;
  const draws = getDraws(g.slug);
  if (!draws) notFound();
  const years = getResultYears(g.slug);
  const shown = draws.draws.slice(0, RECENT_LIMIT);
  const truncated = draws.draws.length > RECENT_LIMIT;

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href={`/${params.country}`}>{countryName(g.country)}</Link> /{" "}
            <Link href={base}>{g.name}</Link> / <span>Results</span>
          </div>
          <div className="section-eyebrow">Results</div>
          <h1 className="section-headline">
            {g.name} <em>winning numbers.</em>
          </h1>
          <p className="section-lede">
            {draws.drawCount.toLocaleString("en-CA")} {g.name} draws on record since{" "}
            {draws.dataSince ? drawDate(draws.dataSince) : "—"}.
            {truncated ? ` Showing the ${RECENT_LIMIT} most recent — use the year filter for the full archive.` : ""}
          </p>
          <GameTabs country={params.country} slug={g.slug} active="results" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          {years.length > 1 && (
            <div className="chip-row" style={{ marginBottom: 24 }}>
              <span className="chip active">All</span>
              {years.map((y) => (
                <Link key={y} href={`${base}/results/${y}`} className="chip">
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
              {shown.map((d) => (
                <tr key={d.date}>
                  <td className="rdate">{drawDate(d.date)}</td>
                  <td>
                    <Balls numbers={d.numbers} bonus={d.bonus} bonus2={d.bonus2} size="sm" />
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
