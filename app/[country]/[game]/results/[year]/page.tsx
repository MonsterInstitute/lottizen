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

/** Month + day in UTC, e.g. "Jun 6". Draw dates are calendar dates, not instants. */
function shortDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Built from that year's own draws (count, date range, most-drawn numbers),
 * so no two year pages share a description. "Most drawn" is a plain
 * historical count for that year — never framed as a prediction.
 */
function yearDescription(g: NonNullable<ReturnType<typeof resolveGame>>, year: number): string {
  const draws = getDrawsByYear(g.slug, year);
  if (draws.length === 0) return `${g.name} winning numbers for ${year}, every draw listed with its date.`;
  const dates = draws.map((d) => d.date).sort();
  const span = dates.length === 1 ? shortDate(dates[0]) : `${shortDate(dates[0])} – ${shortDate(dates.at(-1)!)}`;
  const extra = g.format === "digit" ? "" : g.hasBonus ? ` and ${g.bonusLabel ?? "bonus"}` : "";
  const head = `All ${draws.length} ${g.name} draw${draws.length === 1 ? "" : "s"} of ${year} (${span}), with every winning number${extra}.`;
  if (g.format === "digit") {
    const last = draws.reduce((a, b) => (a.date > b.date ? a : b));
    return `${head} Last draw of the year: ${last.numbers.join("-")} on ${shortDate(last.date)}. Full list, newest first.`;
  }
  const freq = new Map<number, number>();
  for (const d of draws) for (const n of d.numbers) freq.set(n, (freq.get(n) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3);
  const nums = top.map(([n]) => n);
  const list = nums.length === 3 ? `${nums[0]}, ${nums[1]} and ${nums[2]}` : nums.join(" and ");
  const counts = top.map(([, c]) => c);
  const times = counts.every((c) => c === counts[0])
    ? `${counts[0]} times each`
    : `${counts.slice(0, -1).join(", ")} and ${counts.at(-1)} times`;
  return `${head} Most drawn that year: ${list} (${times}).`;
}

export function generateMetadata({
  params,
}: {
  params: { country: string; game: string; year: string };
}): Metadata {
  const g = resolveGame(params.country, params.game);
  if (!g) return {};
  const title = `${g.name} Results ${params.year} — Winning Numbers`;
  const description = yearDescription(g, Number(params.year));
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
                    <Balls numbers={d.numbers} bonus={d.bonus} bonus2={d.bonus2} size="sm" />
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
