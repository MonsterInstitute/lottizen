import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getActivePricePoints,
  getGamesByPrice,
  getRankings,
} from "@/lib/data";
import { money, humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { RankingTable } from "@/components/ranking/RankingTable";
import { PriceNav } from "@/components/ranking/PriceNav";
import { DemoNotice } from "@/components/site/DemoNotice";
import { ScratchDisclaimer } from "@/components/site/ScratchDisclaimer";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return getActivePricePoints().map((p) => ({ price: String(p) }));
}

function parsePrice(raw: string): number | null {
  const p = Number(raw);
  if (!Number.isInteger(p)) return null;
  return getActivePricePoints().includes(p) ? p : null;
}

export function generateMetadata({
  params,
}: {
  params: { price: string };
}): Metadata {
  const p = parsePrice(params.price);
  if (p === null) return {};
  const games = getGamesByPrice(p);
  const best = games[0];
  const title = `Best $${p} Scratch Tickets in Ontario — Ranked by Value`;
  const description = `The ${games.length} best $${p} OLG instant games ranked by remaining prize value.${
    best ? ` Top pick: ${best.name} (Value Score ${best.valueScore.toFixed(1)}).` : ""
  } Updated daily.`;
  return {
    title,
    description,
    alternates: { canonical: `/scratch/price/${p}` },
    openGraph: { title, description, url: absUrl(`/scratch/price/${p}`), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function PricePage({ params }: { params: { price: string } }) {
  const p = parsePrice(params.price);
  if (p === null) notFound();
  const games = getGamesByPrice(p);
  const { generatedAt } = getRankings();
  const poolAtPrice = games.reduce((s, g) => s + g.remainingPrizePool, 0);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Best $${p} Scratch Tickets in Ontario`,
    numberOfItems: games.length,
    itemListElement: games.map((g) => ({
      "@type": "ListItem",
      position: g.rank,
      url: absUrl(`/scratch/${g.slug}`),
      name: g.name,
    })),
  };

  return (
    <>
      <JsonLd data={itemListJsonLd} />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/scratch">Scratch</Link> / <span>${p} Tickets</span>
          </div>
          <div className="section-eyebrow">By price · ${p}</div>
          <h1 className="section-headline">
            Best <em>${p}</em> scratch tickets.
          </h1>
          <p className="section-lede">
            {games.length} Ontario instant game{games.length === 1 ? "" : "s"} at
            this price, ranked by value left — {money(poolAtPrice, { compact: true })}{" "}
            in unclaimed prizes between them. Updated {humanDate(generatedAt)}.
          </p>
          <PriceNav active={p} />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 44 }}>
        <div className="container">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <DemoNotice />
            <AdSlot slot="price-top" format="leaderboard" />
            {games.length ? (
              <RankingTable games={games} />
            ) : (
              <p className="section-lede">No games at this price right now.</p>
            )}
            <ScratchDisclaimer />
          </div>
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
