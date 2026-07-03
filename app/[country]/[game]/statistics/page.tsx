import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName } from "@/config/games";
import { resolveGame, countryGameParams, getStats } from "@/lib/draws";
import { drawDate } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { GameTabs } from "@/components/draws/GameTabs";
import { NumberGrid } from "@/components/draws/NumberGrid";
import { FrequencyChart, SumChart, OddEvenChart } from "@/components/draws/StatCharts";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;
export function generateStaticParams() {
  return countryGameParams();
}

export function generateMetadata({ params }: { params: { country: string; game: string } }): Metadata {
  const g = resolveGame(params.country, params.game);
  if (!g) return {};
  const title = `${g.name} Statistics — Number Frequency, Hot & Cold, Gaps`;
  const description = `${g.name} number statistics: how often every number is drawn, current and longest gaps, hot & cold numbers, odd/even and sum patterns, and the most common pairs.`;
  return {
    title,
    description,
    alternates: { canonical: `/${params.country}/${g.slug}/statistics` },
    openGraph: { title, description, url: absUrl(`/${params.country}/${g.slug}/statistics`) },
  };
}

function Chips({ base, nums }: { base: string; nums: number[] }) {
  return (
    <div className="mini-balls">
      {nums.map((n) => (
        <Link key={n} href={`${base}/number/${n}`} className="ball sm">
          {String(n).padStart(2, "0")}
        </Link>
      ))}
    </div>
  );
}

export default function StatisticsPage({ params }: { params: { country: string; game: string } }) {
  const g = resolveGame(params.country, params.game);
  if (!g) notFound();
  const base = `/${params.country}/${g.slug}`;
  const stats = getStats(g.slug);
  if (!stats) notFound();
  const a = stats.aggregate;
  const thin = stats.drawCount < 10;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: `${g.name} number frequency statistics`,
          description: `Frequency, gap and pattern statistics computed from ${stats.drawCount} ${g.name} draws.`,
          url: absUrl(`${base}/statistics`),
          creator: { "@type": "Organization", name: "Lottizen" },
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href={`/${params.country}`}>{countryName(g.country)}</Link> /{" "}
            <Link href={base}>{g.name}</Link> / <span>Statistics</span>
          </div>
          <div className="section-eyebrow">Statistics</div>
          <h1 className="section-headline">
            {g.name} <em>number stats.</em>
          </h1>
          <p className="section-lede">
            Computed from {stats.drawCount.toLocaleString("en-CA")} draws
            {stats.statsFrom
              ? ` under the current game matrix (since ${drawDate(stats.statsFrom)})`
              : stats.dataSince
                ? ` since ${drawDate(stats.dataSince)}`
                : ""}
            . Frequencies are a record of the past — every future draw is still independent
            and random.
          </p>
          <GameTabs country={params.country} slug={g.slug} active="statistics" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          {stats.statsFrom && (
            <div className="notice" style={{ marginBottom: 28 }}>
              <span className="notice-tag">Rules era</span>
              <span>
                {g.name} changed its number matrix on {drawDate(stats.statsFrom)}. These stats
                use the {stats.drawCount.toLocaleString("en-CA")} draws since then; the results
                archive keeps all {stats.allTimeDrawCount.toLocaleString("en-CA")} draws.
              </span>
            </div>
          )}
          {thin && (
            <div className="notice" style={{ marginBottom: 28 }}>
              <span className="notice-tag">Building</span>
              <span>
                Only {stats.drawCount} draw{stats.drawCount === 1 ? "" : "s"} on record for {g.name} so
                far — a full history source isn&rsquo;t publicly available, so these stats deepen as
                the daily tracker records new draws.
              </span>
            </div>
          )}

          <div className="stat-grid" style={{ marginBottom: 40 }}>
            <div className="chart-card">
              <h3>Hot numbers</h3>
              <div className="sub">Most drawn over the last {Math.min(50, stats.drawCount)} draws.</div>
              <Chips base={base} nums={a.hot} />
            </div>
            <div className="chart-card">
              <h3>Cold numbers</h3>
              <div className="sub">Longest current gap since last drawn.</div>
              <Chips base={base} nums={a.cold} />
            </div>
            <div className="chart-card">
              <h3>Draw shape</h3>
              <div className="sub">Typical make-up of a winning line.</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, lineHeight: 2, color: "var(--ink-2)" }}>
                Avg sum <strong style={{ color: "var(--ink)" }}>{a.sum.avg}</strong>
                <br />
                Odd/Even <strong style={{ color: "var(--ink)" }}>{a.oddEven.avgOdd}</strong> / {a.oddEven.avgEven}
                <br />
                Consecutive <strong style={{ color: "var(--ink)" }}>{a.consecutive.pct}%</strong> of draws
              </div>
            </div>
          </div>

          <div className="chart-card" style={{ marginBottom: 24 }}>
            <h3>Number frequency</h3>
            <div className="sub">
              How many times each number (1–{stats.max}) has been drawn. Hot numbers in deep orange.
            </div>
            <FrequencyChart data={a.frequencyChart} hot={a.hot} />
          </div>

          {a.bonus && (
            <div className="chart-card" style={{ marginBottom: 24 }}>
              <h3>{a.bonus.label} frequency</h3>
              <div className="sub">
                The secondary ball is drawn from its own pool (1–{a.bonus.max}).
              </div>
              <FrequencyChart data={a.bonus.chart} hot={a.bonus.hot} />
            </div>
          )}

          <div className="stat-grid" style={{ marginBottom: 40 }}>
            <div className="chart-card">
              <h3>Sum distribution</h3>
              <div className="sub">Total of the {stats.pick} main numbers per draw.</div>
              <SumChart data={a.sum.buckets} />
            </div>
            <div className="chart-card">
              <h3>Odd numbers per draw</h3>
              <div className="sub">How many of the {stats.pick} numbers are odd.</div>
              <OddEvenChart data={a.oddEven.dist} />
            </div>
          </div>

          <div style={{ marginBottom: 40 }}>
            <AdSlot slot={`stats-${g.slug}`} format="leaderboard" />
          </div>

          {a.topPairs.length > 0 && (
            <div className="chart-card" style={{ marginBottom: 40 }}>
              <h3>Most common pairs</h3>
              <div className="sub">Number duos that show up together most often.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {a.topPairs.map((p) => (
                  <div key={`${p.a}-${p.b}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="ball sm">{String(p.a).padStart(2, "0")}</span>
                    <span className="ball sm">{String(p.b).padStart(2, "0")}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)" }}>×{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="section-headline" style={{ fontSize: "clamp(26px,3vw,40px)", marginBottom: 8 }}>
            Every <em>number.</em>
          </h2>
          <p className="section-lede" style={{ marginBottom: 24 }}>
            Tap any number for its full history, gaps, and partner numbers.
          </p>
          <NumberGrid slug={g.slug} numbers={stats.numbers} country={params.country} />
        </div>
      </section>
    </>
  );
}
