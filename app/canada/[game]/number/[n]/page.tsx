import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveGame } from "@/config/games";
import { getStats, getNumberStat, getDraws, getPlayableSlugs } from "@/lib/draws";
import { drawDate } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { Balls } from "@/components/draws/Balls";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;
export function generateStaticParams() {
  const params: { game: string; n: string }[] = [];
  for (const game of getPlayableSlugs()) {
    const stats = getStats(game);
    if (!stats) continue;
    for (let n = 1; n <= stats.max; n++) params.push({ game, n: String(n) });
  }
  return params;
}

export function generateMetadata({
  params,
}: {
  params: { game: string; n: string };
}): Metadata {
  const g = getLiveGame(params.game);
  if (!g) return {};
  const title = `${g.name} Number ${params.n} — Frequency & History`;
  const description = `How often ${g.name} number ${params.n} is drawn, when it last appeared, its current and longest gap, and the numbers it's most often drawn with.`;
  return {
    title,
    description,
    alternates: { canonical: `/canada/${g.slug}/number/${params.n}` },
    openGraph: { title, description, url: absUrl(`/canada/${g.slug}/number/${params.n}`) },
  };
}

export default function NumberPage({
  params,
}: {
  params: { game: string; n: string };
}) {
  const g = getLiveGame(params.game);
  if (!g) notFound();
  const n = Number(params.n);
  const stats = getStats(g.slug);
  const stat = getNumberStat(g.slug, n);
  const draws = getDraws(g.slug);
  if (!stats || !stat || !draws || n < 1 || n > stats.max) notFound();

  const appearances = draws.draws.filter((d) => d.numbers.includes(n)).slice(0, 12);
  const tiles: { k: string; v: string; foot: string }[] = [
    { k: "Times drawn", v: String(stat.count), foot: `of ${stats.drawCount} draws` },
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
          url: absUrl(`/canada/${g.slug}/number/${n}`),
          about: `${g.name} number ${n}`,
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/canada">Canada</Link> /{" "}
            <Link href={`/canada/${g.slug}`}>{g.name}</Link> /{" "}
            <Link href={`/canada/${g.slug}/statistics`}>Statistics</Link> /{" "}
            <span>Number {n}</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}
          >
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
          <div className="stat-grid" style={{ marginBottom: 40 }}>
            {tiles.map((t) => (
              <div className="stat-tile" key={t.k}>
                <div className="k">{t.k}</div>
                <div className="v">{t.v}</div>
                <div className="foot">{t.foot}</div>
              </div>
            ))}
          </div>

          <p className="prose" style={{ marginBottom: 40 }}>
            In {g.name}, number <strong>{n}</strong> has been drawn{" "}
            <strong>{stat.count} times</strong> across {stats.drawCount} recorded draws
            ({(stat.frequency * 100).toFixed(1)}%). It was last drawn{" "}
            <strong>{stat.lastDate ? drawDate(stat.lastDate) : "—"}</strong>
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
                  <Link
                    key={p.n}
                    href={`/canada/${g.slug}/number/${p.n}`}
                    style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
                  >
                    <span className="ball">{String(p.n).padStart(2, "0")}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)" }}>
                      ×{p.count}
                    </span>
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
            <Link href={`/canada/${g.slug}/statistics`} className="btn btn-secondary">
              ← All {g.name} numbers
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
