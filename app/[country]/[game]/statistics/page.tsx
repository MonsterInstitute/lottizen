import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName } from "@/config/games";
import { resolveGame, countryGameParams, getStats, getDigitStats } from "@/lib/draws";
import { drawDate, nDraws } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { GameTabs } from "@/components/draws/GameTabs";
import { GameSwitcher } from "@/components/draws/GameSwitcher";
import { NumberGrid } from "@/components/draws/NumberGrid";
import { DigitStats } from "@/components/draws/DigitStats";
import { FrequencyChart, SumChart, OddEvenChart } from "@/components/draws/StatCharts";
import { FrequencyToggle } from "@/components/draws/FrequencyToggle";
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

  // Positional digit games (Numbers, Win 4) use a distinct statistics view.
  if (g.format === "digit") {
    const ds = getDigitStats(g.slug);
    if (!ds) notFound();
    return (
      <>
        <div className="page-head">
          <div className="container">
            <div className="breadcrumb">
              <Link href={`/${params.country}`}>{countryName(g.country)}</Link> /{" "}
              <Link href={base}>{g.name}</Link> / <span>Statistics</span>
            </div>
            <div className="section-eyebrow">Statistics</div>
            <h1 className="section-headline">
              {g.name} <em>digit stats.</em>
            </h1>
            <p className="section-lede">
              Computed from {ds.drawCount.toLocaleString("en-CA")} evening draws since{" "}
              {ds.dataSince ? drawDate(ds.dataSince) : "—"}. Each position is drawn
              independently — past frequency doesn&rsquo;t change future odds.
            </p>
            <GameTabs country={params.country} slug={g.slug} active="statistics" format={g.format} />
            <GameSwitcher slug={g.slug} kind="statistics" />
          </div>
        </div>
        <section className="section" style={{ paddingTop: 40 }}>
          <div className="container">
            <DigitStats stats={ds} name={g.name} />
          </div>
        </section>
      </>
    );
  }

  const stats = getStats(g.slug);
  if (!stats) notFound();
  const a = stats.aggregate;
  const thin = stats.drawCount < 10;
  // When there are no more draws than the recent window, the All-time and "Last N"
  // views are identical — show one static chart instead of a redundant toggle.
  const collapseFreq = stats.drawCount <= a.windowSize;
  const newNums = stats.poolAdded?.numbers ?? [];
  const poolSince = stats.poolAdded?.since;
  const excl = newNums.length ? ` Excludes ${newNums.join(" & ")} (new to the pool).` : "";

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
            Computed from {nDraws(stats.drawCount)}
            {stats.statsFrom
              ? ` under the current game matrix (since ${drawDate(stats.statsFrom)})`
              : stats.dataSince
                ? ` since ${drawDate(stats.dataSince)}`
                : ""}
            . Frequencies are a record of the past — every future draw is still independent
            and random.
          </p>
          <GameTabs country={params.country} slug={g.slug} active="statistics" />
            <GameSwitcher slug={g.slug} kind="statistics" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          {stats.statsFrom && (
            <div className="notice" style={{ marginBottom: 28 }}>
              <span className="notice-tag">Rules era</span>
              <span>
                {g.name} changed its number matrix on {drawDate(stats.statsFrom)}. These stats
                use the {nDraws(stats.drawCount)} since then; the results
                archive keeps all {nDraws(stats.allTimeDrawCount)}.
              </span>
            </div>
          )}
          {stats.poolAdded && (
            <div className="notice" style={{ marginBottom: 28 }}>
              <span className="notice-tag">Pool update</span>
              <span>
                Number{newNums.length > 1 ? "s" : ""} {newNums.join(" & ")} joined the {g.name} pool
                on {drawDate(stats.poolAdded.since)}, when it expanded to {stats.pick}/{stats.max}. They&rsquo;ve
                appeared in only the draws since, so they&rsquo;re shown <strong>hatched</strong> and kept out
                of the hot, cold, frequency and pairs rankings — otherwise they&rsquo;d look misleadingly
                &ldquo;cold.&rdquo; The full archive still records every draw.
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

          {/* Hot/cold/shape are ranking-style stats — hidden until there are enough
              draws to mean anything; the Building notice above explains the gap. */}
          {!thin && (
            <div className="stat-grid" style={{ marginBottom: 40 }}>
              <div className="chart-card">
                <h3>Hot numbers</h3>
                <div className="sub">Most drawn over the last {nDraws(a.windowSize)} (recent window).{excl}</div>
                <Chips base={base} nums={a.hot} />
              </div>
              <div className="chart-card">
                <h3>Cold numbers</h3>
                <div className="sub">Longest current gap since last drawn (all-time gap).{excl}</div>
                <Chips base={base} nums={a.cold} />
              </div>
              <div className="chart-card">
                <h3>Draw shape</h3>
                <div className="sub">Averages over all {nDraws(stats.drawCount)}.</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, lineHeight: 2, color: "var(--ink-2)" }}>
                  Avg sum <strong style={{ color: "var(--ink)" }}>{a.sum.avg}</strong>
                  <br />
                  Odd/Even <strong style={{ color: "var(--ink)" }}>{a.oddEven.avgOdd}</strong> / {a.oddEven.avgEven}
                  <br />
                  Consecutive <strong style={{ color: "var(--ink)" }}>{a.consecutive.pct}%</strong> of draws
                </div>
              </div>
            </div>
          )}

          {collapseFreq ? (
            <div className="chart-card" style={{ marginBottom: 24 }}>
              <h3>Number frequency</h3>
              <div className="sub" style={{ marginBottom: 14 }}>
                How often each number has been drawn across all {nDraws(stats.drawCount)}.
              </div>
              <FrequencyChart data={a.frequencyChart} hot={a.allTimeTop} newNums={newNums} />
            </div>
          ) : (
            <FrequencyToggle
              windowSize={a.windowSize}
              allTime={{
                chart: a.frequencyChart,
                top: a.allTimeTop,
                basis: `${nDraws(stats.drawCount)}${
                  stats.statsFrom
                    ? ` since ${drawDate(stats.statsFrom)} (current matrix)`
                    : stats.dataSince
                      ? ` since ${drawDate(stats.dataSince)}`
                      : ""
                }`,
              }}
              window={{ chart: a.windowChart, top: a.windowTop, basis: `the last ${nDraws(a.windowSize)}` }}
              newNums={newNums}
              poolSince={poolSince}
            />
          )}

          {a.bonus && (
            <div className="chart-card" style={{ marginBottom: 24 }}>
              <h3>{a.bonus.label} frequency</h3>
              <div className="sub">
                {(a.bonus.count ?? 1) > 1
                  ? `Both ${a.bonus.label} are drawn from their own pool (1–${a.bonus.max}); counts include every ${a.bonus.label} drawn.`
                  : `The secondary ball is drawn from its own pool (1–${a.bonus.max}).`}
              </div>
              <FrequencyChart data={a.bonus.chart} hot={a.bonus.hot} />
            </div>
          )}

          <div className="stat-grid" style={{ marginBottom: 40 }}>
            <div className="chart-card">
              <h3>Sum distribution</h3>
              <div className="sub">Total of the {stats.pick} main numbers per draw — all {nDraws(stats.drawCount)}.</div>
              <SumChart data={a.sum.buckets} />
            </div>
            <div className="chart-card">
              <h3>Odd numbers per draw</h3>
              <div className="sub">How many of the {stats.pick} numbers are odd — all {nDraws(stats.drawCount)}.</div>
              <OddEvenChart data={a.oddEven.dist} />
            </div>
          </div>

          <div style={{ marginBottom: 40 }}>
            <AdSlot slot={`stats-${g.slug}`} format="leaderboard" />
          </div>

          {!thin && a.topPairs.length > 0 && (
            <div className="chart-card" style={{ marginBottom: 40 }}>
              <h3>Most common pairs</h3>
              <div className="sub">
                Number duos drawn together most often, across all {nDraws(stats.drawCount)}.
              </div>
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
