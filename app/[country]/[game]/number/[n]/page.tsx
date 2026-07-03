import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName } from "@/config/games";
import { resolveGame, countryGameNumberParams, getStats, getNumberStat, getDraws } from "@/lib/draws";
import { drawDate } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;
export function generateStaticParams() {
  return countryGameNumberParams();
}

export function generateMetadata({
  params,
}: {
  params: { country: string; game: string; n: string };
}): Metadata {
  const g = resolveGame(params.country, params.game);
  if (!g) return {};
  const title = `${g.name} Number ${params.n} — Frequency & History`;
  const description = `How often ${g.name} number ${params.n} is drawn, when it last appeared, its current and longest gap, and the numbers it's most often drawn with.`;
  return {
    title,
    description,
    alternates: { canonical: `/${params.country}/${g.slug}/number/${params.n}` },
    openGraph: { title, description, url: absUrl(`/${params.country}/${g.slug}/number/${params.n}`) },
  };
}

export default function NumberPage({
  params,
}: {
  params: { country: string; game: string; n: string };
}) {
  const g = resolveGame(params.country, params.game);
  if (!g) notFound();
  const base = `/${params.country}/${g.slug}`;
  const n = Number(params.n);
  const stats = getStats(g.slug);
  const stat = getNumberStat(g.slug, n);
  const draws = getDraws(g.slug);
  if (!stats || !stat || !draws || n < 1 || n > stats.max) notFound();

  const appearances = draws.draws.filter((d) => d.numbers.includes(n)).slice(0, 12);
  const tiles = [
    { k: "Times drawn", v: String(stat.count), foot: `of ${stats.drawCount.toLocaleString("en-CA")} draws` },
    { k: "Frequency", v: `${(stat.frequency * 100).toFixed(1)}%`, foot: "of all draws" },
    { k: "Current gap", v: String(stat.currentGap), foot: "draws since last seen" },
    { k: "Longest gap", v: String(stat.maxGap), foot: "draws, historically" },
  ];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: `${g.name} Number ${n} — Frequency & History`,
          url: absUrl(`${base}/number/${n}`),
          about: `${g.name} number ${n}`,
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href={`/${params.country}`}>{countryName(g.country)}</Link> /{" "}
            <Link href={base}>{g.name}</Link> /{" "}
            <Link href={`${base}/statistics`}>Statistics</Link> / <span>Number {n}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <span className="ball lg" style={{ width: 72, height: 72, fontSize: 28 }}>
              {String(n).padStart(2, "0")}
            </span>
            <div>
              <div className="section-eyebrow">{g.name}</div>
              <h1 className="section-headline" style={{ marginBottom: 0 }}>
                Number {n}
                {stat.hot ? <em> · hot</em> : stat.cold ? <em> · cold</em> : null}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 36 }}>
        <div className="container">
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            {tiles.map((t) => (
              <div className="stat-tile" key={t.k}>
                <div className="k">{t.k}</div>
                <div className="v">{t.v}</div>
                <div className="foot">{t.foot}</div>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)", marginBottom: 40 }}>
            Frequency &amp; gaps are over the full {stats.drawCount.toLocaleString("en-CA")}-draw record
            {stats.statsFrom ? " (current game matrix)" : ""}; the hot / cold label reflects the recent{" "}
            {stats.aggregate.windowSize}-draw window.
          </p>

          <p className="prose" style={{ marginBottom: 40 }}>
            In {g.name}, number <strong>{n}</strong> has been drawn <strong>{stat.count} times</strong> across{" "}
            {stats.drawCount.toLocaleString("en-CA")} recorded draws ({(stat.frequency * 100).toFixed(1)}%). It was
            last drawn <strong>{stat.lastDate ? drawDate(stat.lastDate) : "—"}</strong>
            {stat.currentGap > 0 ? `, ${stat.currentGap} draw${stat.currentGap === 1 ? "" : "s"} ago` : " (in the latest draw)"}.
            Its longest dry spell on record is {stat.maxGap} draws.
          </p>

          {stat.partners.length > 0 && (
            <>
              <h2 className="section-headline" style={{ fontSize: "clamp(24px,3vw,36px)", marginBottom: 6 }}>
                Drawn most with
              </h2>
              <p className="section-lede" style={{ marginBottom: 20 }}>
                The numbers that most often share a draw with {n}.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 44 }}>
                {stat.partners.map((p) => (
                  <Link key={p.n} href={`${base}/number/${p.n}`} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                    <span className="ball">{String(p.n).padStart(2, "0")}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)" }}>×{p.count}</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {appearances.length > 0 && (
            <>
              <h2 className="section-headline" style={{ fontSize: "clamp(24px,3vw,36px)", marginBottom: 20 }}>
                Recent appearances
              </h2>
              <table className="results-table">
                <thead>
                  <tr>
                    <th style={{ width: 190 }}>Draw date</th>
                    <th>Winning numbers</th>
                  </tr>
                </thead>
                <tbody>
                  {appearances.map((d) => (
                    <tr key={d.date}>
                      <td className="rdate">{drawDate(d.date)}</td>
                      <td>
                        <Balls numbers={d.numbers} bonus={d.bonus} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div style={{ marginTop: 40 }}>
            <Link href={`${base}/statistics`} className="btn btn-secondary">
              ← All {g.name} numbers
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
