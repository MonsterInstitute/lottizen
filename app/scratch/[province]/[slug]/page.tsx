import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllProvinceSlugs,
  getAllSlugs,
  getGameBySlug,
  getRankings,
  getRelatedGames,
} from "@/lib/data";
import { isProvince, provinceConfig, type Province } from "@/config/scratch";
import { money, price, count, score, humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";
import { RankingTable } from "@/components/ranking/RankingTable";
import { AdSlot } from "@/components/site/AdSlot";
import { DemoNotice } from "@/components/site/DemoNotice";
import { ScratchDisclaimer } from "@/components/site/ScratchDisclaimer";
import { ScoringMethodNotice } from "@/components/site/ScoringMethodNotice";
import { FollowButton } from "@/components/site/FollowButton";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllProvinceSlugs().flatMap((province) =>
    getAllSlugs(province).map((slug) => ({ province, slug })),
  );
}

export function generateMetadata({
  params,
}: {
  params: { province: string; slug: string };
}): Metadata {
  if (!isProvince(params.province)) return {};
  const g = getGameBySlug(params.province, params.slug);
  if (!g) return {};
  const cfg = provinceConfig(params.province);
  const title = `${g.name} — Value Score ${score(g.valueScore)} · $${Math.round(g.price)} Scratch Ticket (${cfg.label})`;
  const description = `${g.name} (${g.agency} game #${g.gameNumber}) has ${g.topPrizesRemaining} of ${g.topPrizesTotal || "?"} top prizes (${g.topPrizeLabel}) and ${money(g.remainingPrizePool, { compact: true })} in prizes still unclaimed. See the full prize breakdown and today's value ranking.`;
  return {
    title,
    description,
    alternates: { canonical: `/scratch/${params.province}/${g.slug}` },
    openGraph: {
      title,
      description,
      url: absUrl(`/scratch/${params.province}/${g.slug}`),
      type: "article",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function ScratchGamePage({
  params,
}: {
  params: { province: string; slug: string };
}) {
  if (!isProvince(params.province)) notFound();
  const province: Province = params.province;
  const g = getGameBySlug(province, params.slug);
  if (!g) notFound();
  const cfg = provinceConfig(province);
  const { games, generatedAt } = getRankings(province);
  const related = getRelatedGames(province, g.slug);
  const topTier = g.prizeTiers.find((t) => t.isTop) ?? g.prizeTiers[0];
  const hasTotals = g.scoringMethod !== "remaining_value_index";

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: g.name,
    sku: g.gameNumber,
    category: `${cfg.label} Instant Lottery Game`,
    brand: { "@type": "Brand", name: g.agency },
    offers: {
      "@type": "Offer",
      price: g.price.toFixed(2),
      priceCurrency: "CAD",
      availability: "https://schema.org/InStock",
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Value Score", value: g.valueScore },
      { "@type": "PropertyValue", name: "Top Prize", value: g.topPrizeLabel },
      {
        "@type": "PropertyValue",
        name: "Top Prizes Remaining",
        value: hasTotals ? `${g.topPrizesRemaining} of ${g.topPrizesTotal}` : `${g.topPrizesRemaining}`,
      },
      {
        "@type": "PropertyValue",
        name: "Prize Money Unclaimed",
        value: money(g.remainingPrizePool),
      },
    ],
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Scratch", item: absUrl("/scratch") },
      { "@type": "ListItem", position: 2, name: cfg.label, item: absUrl(`/scratch/${province}`) },
      {
        "@type": "ListItem",
        position: 3,
        name: `$${Math.round(g.price)} Tickets`,
        item: absUrl(`/scratch/${province}/price/${Math.round(g.price)}`),
      },
      { "@type": "ListItem", position: 4, name: g.name, item: absUrl(`/scratch/${province}/${g.slug}`) },
    ],
  };

  return (
    <>
      <JsonLd data={[productJsonLd, breadcrumbJsonLd]} />

      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/scratch">Scratch</Link> /{" "}
            <Link href={`/scratch/${province}`}>{cfg.label}</Link> /{" "}
            <Link href={`/scratch/${province}/price/${Math.round(g.price)}`}>
              ${Math.round(g.price)} Tickets
            </Link>{" "}
            / <span>{g.name}</span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="section-eyebrow">
                Rank {g.rank} of {games.length} · {g.agency} game #{g.gameNumber}
              </div>
              <h1 className="section-headline" style={{ marginBottom: 12 }}>
                {g.name}
              </h1>
              <p className="section-lede">
                A ${Math.round(g.price)} {cfg.label} instant game with{" "}
                <strong style={{ fontStyle: "normal", color: "var(--ink)" }}>
                  {money(g.remainingPrizePool, { compact: true })}
                </strong>{" "}
                in prizes still unclaimed.
              </p>
            </div>
            <ScoreBadge value={g.valueScore} hot={g.rank <= 3} />
          </div>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <ScoringMethodNotice method={g.scoringMethod} province={province} />

          {/* Stat tiles */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
              marginTop: 20,
            }}
          >
            <div className="stat-tile">
              <div className="k">Value Score</div>
              <div className="v">{score(g.valueScore)}</div>
              <div className="foot">
                {g.scoringMethod === "retention" && "Prize value left per $1, ×100."}
                {g.scoringMethod === "remaining_value_index" && "Remaining prize $ per $1 ticket."}
                {g.scoringMethod === "top_prize_fraction" && "% of top prizes still unclaimed."}
              </div>
            </div>
            <div className="stat-tile">
              <div className="k">Ticket Price</div>
              <div className="v">{price(g.price)}</div>
              <div className="foot">Cost per ticket.</div>
            </div>
            <div className="stat-tile">
              <div className="k">Prizes Still Unclaimed</div>
              <div className="v" style={{ fontSize: "clamp(24px,3vw,40px)" }}>
                {money(g.remainingPrizePool, { compact: true })}
              </div>
              <div className="foot">Across {g.prizeTierCount} prize tiers.</div>
            </div>
            <div className="stat-tile">
              <div className="k">Top Prizes Left</div>
              <div className="v">
                {g.topPrizesRemaining}
                {hasTotals ? <em>/{g.topPrizesTotal}</em> : null}
              </div>
              <div className="foot">{topTier.label} tier.</div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <DemoNotice province={province} />
          </div>

          <div style={{ marginTop: 20 }}>
            <FollowButton kind="scratch" slug={g.slug} agency={g.agency} label="Follow this scratch ticket" />
            <p className="field-hint" style={{ marginTop: 8 }}>
              <Link href="/plus" style={{ color: "var(--brand-deep)" }}>
                Lottizen Plus
              </Link>{" "}
              subscribers get an email the moment this ticket&rsquo;s top prize is claimed, or if
              it drops in the rankings.
            </p>
          </div>

          {/* Prize table */}
          <h2
            className="section-headline"
            style={{ fontSize: "clamp(30px,4vw,52px)", marginTop: 72 }}
          >
            Prize <em>breakdown.</em>
          </h2>
          <p className="section-lede">
            Every prize tier {g.agency} discloses, how many were printed (where published), and how
            many are still out there to be won.
          </p>
          <table className="prize-table">
            <thead>
              <tr>
                <th>Prize</th>
                <th>{hasTotals ? "Total Printed" : "Total"}</th>
                <th>Remaining</th>
                <th>{hasTotals ? "% Left" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {g.prizeTiers.map((t, i) => {
                const pctLeft = t.total ? (t.remaining / t.total) * 100 : null;
                return (
                  <tr key={i} className={t.remaining === 0 ? "depleted" : ""}>
                    <td className="amount">
                      {t.label}
                      {t.isTop ? (
                        <span style={{ color: "var(--brand)" }}> ★</span>
                      ) : null}
                    </td>
                    <td className="num">{hasTotals ? (t.total ? count(t.total) : "—") : "—"}</td>
                    <td className="num">{count(t.remaining)}</td>
                    <td className="num">{pctLeft !== null ? `${pctLeft.toFixed(0)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ink-3)",
              marginTop: 14,
              letterSpacing: "0.02em",
            }}
          >
            {g.scoringMethod === "retention" && g.valueRetention !== null
              ? `Value retention ${g.valueRetention.toFixed(2)}× · `
              : null}
            data as of {humanDate(g.scrapedAt)}. {g.agency} lists this game&rsquo;s prize tiers; see{" "}
            <Link href="/methodology" style={{ color: "var(--brand-deep)" }}>
              methodology
            </Link>
            .
          </p>

          <ScratchDisclaimer />

          <div style={{ height: 40 }} />
          <AdSlot slot="detail-mid" format="leaderboard" />

          {/* Related */}
          <h2
            className="section-headline"
            style={{ fontSize: "clamp(30px,4vw,52px)", marginTop: 80 }}
          >
            More worth <em>a look.</em>
          </h2>
          <RankingTable games={related} startRank={1} hotCount={0} />

          <div style={{ marginTop: 40 }}>
            <Link href={`/scratch/${province}`} className="btn btn-secondary">
              ← Back to {cfg.label} rankings
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
