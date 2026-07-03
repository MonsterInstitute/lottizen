import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveGame } from "@/config/games";
import { getDrawsByYear, getPlayableSlugs, getResultYears } from "@/lib/draws";
import { drawDate } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { GameTabs } from "@/components/draws/GameTabs";

export const dynamicParams = false;
export function generateStaticParams() {
  const params: { game: string; year: string }[] = [];
  for (const game of getPlayableSlugs()) {
    for (const y of getResultYears(game)) params.push({ game, year: String(y) });
  }
  return params;
}

export function generateMetadata({
  params,
}: {
  params: { game: string; year: string };
}): Metadata {
  const g = getLiveGame(params.game);
  if (!g) return {};
  const title = `${g.name} Results ${params.year} — Winning Numbers`;
  const description = `All ${g.name} winning numbers from ${params.year}.`;
  return {
    title,
    description,
    alternates: { canonical: `/canada/${g.slug}/results/${params.year}` },
    openGraph: { title, description, url: absUrl(`/canada/${g.slug}/results/${params.year}`) },
  };
}

export default function ResultsYearPage({
  params,
}: {
  params: { game: string; year: string };
}) {
  const g = getLiveGame(params.game);
  if (!g) notFound();
  const year = Number(params.year);
  const draws = getDrawsByYear(g.slug, year).slice().reverse();
  if (!draws.length) notFound();
  const years = getResultYears(g.slug);

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/canada">Canada</Link> /{" "}
            <Link href={`/canada/${g.slug}`}>{g.name}</Link> /{" "}
            <Link href={`/canada/${g.slug}/results`}>Results</Link> / <span>{year}</span>
          </div>
          <div className="section-eyebrow">Results · {year}</div>
          <h1 className="section-headline">
            {g.name} <em>{year}.</em>
          </h1>
          <GameTabs slug={g.slug} active="results" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="chip-row" style={{ marginBottom: 24 }}>
            <Link href={`/canada/${g.slug}/results`} className="chip">
              All
            </Link>
            {years.map((y) => (
              <Link
                key={y}
                href={`/canada/${g.slug}/results/${y}`}
                className={`chip ${y === year ? "active" : ""}`}
              >
                {y}
              </Link>
            ))}
          </div>

          <table className="results-table">
            <thead>
              <tr>
                <th style={{ width: 190 }}>Draw date</th>
                <th>Winning numbers</th>
              </tr>
            </thead>
            <tbody>
              {draws.map((d) => (
                <tr key={d.date}>
                  <td className="rdate">{drawDate(d.date)}</td>
                  <td>
                    <Balls numbers={d.numbers} bonus={d.bonus} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
