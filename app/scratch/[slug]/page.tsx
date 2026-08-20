import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllSlugs,
  getGameBySlug,
  getRankings,
  getRelatedGames,
} from "@/lib/data";
import { money, price, count, score, humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";
import { RankingTable } from "@/components/ranking/RankingTable";
import { AdSlot } from "@/components/site/AdSlot";
import { DemoNotice } from "@/components/site/DemoNotice";
import { ScratchDisclaimer } from "@/components/site/ScratchDisclaimer";
import { FollowButton } from "@/components/site/FollowButton";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const g = getGameBySlug(params.slug);
  if (!g) return {};
  const title = `${g.name} — Value Score ${score(g.valueScore)} · $${Math.round(g.price)} Scratch Ticket`;
  const description = `${g.name} (OLG game #${g.gameNumber}) has ${g.topPrizesRemaining} of ${g.topPrizesTotal} top prizes (${g.topPrizeLabel}) and ${money(g.remainingPrizePool, { compact: true })} in prizes still unclaimed. See the full prize breakdown and today's value ranking.`;
  return {
    title,
    description,
    alternates: { canonical: `/scratch/${g.slug}` },
    openGraph: {
      title,
      description,
      url: absUrl(`/scratch/${g.slug}`),
      type: "article",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function ScratchPage({ params }: { params: { slug: string } }) {
  const g = getGameBySlug(params.slug);
  if (!g) notFound();
  const { games, generatedAt } = getRankings();
  const related = getRelatedGames(g.slug);
  const topTier = g.prizeTiers.find((t) => t.isTop) ?? g.prizeTiers[0];

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: g.name,
    sku: g.gameNumber,
    category: "Ontario Instant Lottery Game",
    brand: { "@type": "Brand", name: "OLG" },
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
        value: `${g.topPrizesRemaining} of ${g.topPrizesTotal}`,
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
      { "@type": "ListItem", position: 1, name: "Rankings", item: SITE.url },
      {
        "@type": "ListItem",
        position: 2,
        name: `$${Math.round(g.price)} Tickets`,
        item: absUrl(`/scratch/price/${Math.round(g.price)}`),
      },
      { "@type": "ListItem", position: 3, name: g.name, item: absUrl(`/scratch/${g.slug}`) },
    ],
  };

  return (
    <>
      <JsonLd data={[productJsonLd, breadcrumbJsonLd]} />

      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/scratch">Scratch</Link> /{" "}
            <Link href={`/scratch/price/${Math.round(g.price)}`}>
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
                Rank {g.rank} of {games.length} · Game #{g.gameNumber}
              </div>
              <h1 className="section-headline" style={{ marginBottom: 12 }}>
                {g.name}
              </h1>
              <p className="section-lede">
                A ${Math.round(g.price)} OLG instant game with{" "}
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
          {/* Stat tiles */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
            }}
          >
            <div className="stat-tile">
              <div className="k">Value Score</div>
              <div className="v">{score(g.valueScore)}</div>
              <div className="foot">Prize value left per $1, ×100.</div>
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
                <em>/{g.topPrizesTotal}</em>
              </div>
              <div className="foot">{topTier.label} tier.</div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <DemoNotice />
          </div>

          <div style={{ marginTop: 20 }}>
            <FollowButton kind="scratch" slug={g.slug} label="Follow this scratch ticket" />
          </div>

          {/* Prize table */}
          <h2
            className="section-headline"
            style={{ fontSize: "clamp(30px,4vw,52px)", marginTop: 72 }}
          >
            Prize <em>breakdown.</em>
          </h2>
          <p className="section-lede">
            Every prize tier, how many were printed, and how many are still out
            there to be won.
          </p>
          <table className="prize-table">
            <thead>
              <tr>
                <th>Prize</th>
                <th>Total Printed</th>
                <th>Remaining</th>
                <th>% Left</th>
              </tr>
            </thead>
            <tbody>
              {g.prizeTiers.map((t, i) => {
                const pctLeft = t.total ? (t.remaining / t.total) * 100 : 0;
                return (
                  <tr key={i} className={t.remaining === 0 ? "depleted" : ""}>
                    <td className="amount">
                      {t.label}
                      {t.isTop ? (
                        <span style={{ color: "var(--brand)" }}> ★</span>
                      ) : null}
                    </td>
                    <td className="num">{count(t.total)}</td>
                    <td className="num">{count(t.remaining)}</td>
                    <td className="num">{pctLeft.toFixed(0)}%</td>
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
            Value retention {g.valueRetention.toFixed(2)}× · data as of{" "}
            {humanDate(g.scrapedAt)}. OLG lists a game&rsquo;s top prize tiers; see{" "}
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
            <Link href="/scratch" className="btn btn-secondary">
              ← Back to full rankings
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
