import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName } from "@/config/games";
import { resolveGame, countryGameYearParams, getDrawsByYear, getResultYears } from "@/lib/draws";
import { drawDate } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { GameTabs } from "@/components/draws/GameTabs";

export const dynamicParams = false;
export function generateStaticParams() {
  return countryGameYearParams();
}

export function generateMetadata({
  params,
}: {
  params: { country: string; game: string; year: string };
}): Metadata {
  const g = resolveGame(params.country, params.game);
  if (!g) return {};
  const title = `${g.name} Results ${params.year} — Winning Numbers`;
  const description = `All ${g.name} winning numbers from ${params.year}.`;
  return {
    title,
    description,
    alternates: { canonical: `/${params.country}/${g.slug}/results/${params.year}` },
    openGraph: { title, description, url: absUrl(`/${params.country}/${g.slug}/results/${params.year}`) },
  };
}

export default function ResultsYearPage({
  params,
}: {
  params: { country: string; game: string; year: string };
}) {
  const g = resolveGame(params.country, params.game);
  if (!g) notFound();
  const base = `/${params.country}/${g.slug}`;
  const year = Number(params.year);
  const draws = getDrawsByYear(g.slug, year).slice().reverse();
  if (!draws.length) notFound();
  const years = getResultYears(g.slug);

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href={`/${params.country}`}>{countryName(g.country)}</Link> /{" "}
            <Link href={base}>{g.name}</Link> /{" "}
            <Link href={`${base}/results`}>Results</Link> / <span>{year}</span>
          </div>
          <div className="section-eyebrow">Results · {year}</div>
          <h1 className="section-headline">
            {g.name} <em>{year}.</em>
          </h1>
          <GameTabs country={params.country} slug={g.slug} active="results" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="chip-row" style={{ marginBottom: 24 }}>
            <Link href={`${base}/results`} className="chip">
              All
            </Link>
            {years.map((y) => (
              <Link key={y} href={`${base}/results/${y}`} className={`chip ${y === year ? "active" : ""}`}>
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
