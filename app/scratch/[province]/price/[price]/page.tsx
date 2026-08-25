import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getActivePricePoints,
  getAllProvinceSlugs,
  getGamesByPrice,
  getRankings,
} from "@/lib/data";
import { isProvince, provinceConfig, type Province } from "@/config/scratch";
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
  return getAllProvinceSlugs().flatMap((province) =>
    getActivePricePoints(province).map((p) => ({ province, price: String(p) })),
  );
}

function parsePrice(province: Province, raw: string): number | null {
  const p = Number(raw);
  if (!Number.isInteger(p)) return null;
  return getActivePricePoints(province).includes(p) ? p : null;
}

export function generateMetadata({
  params,
}: {
  params: { province: string; price: string };
}): Metadata {
  if (!isProvince(params.province)) return {};
  const p = parsePrice(params.province, params.price);
  if (p === null) return {};
  const cfg = provinceConfig(params.province);
  const games = getGamesByPrice(params.province, p);
  const best = games[0];
  const title = `Best $${p} Scratch Tickets in ${cfg.label} — Ranked by Value`;
  const description = `The ${games.length} best $${p} ${cfg.agency} instant games ranked by remaining prize value.${
    best ? ` Top pick: ${best.name} (Value Score ${best.valueScore.toFixed(1)}).` : ""
  } Updated daily.`;
  return {
    title,
    description,
    alternates: { canonical: `/scratch/${params.province}/price/${p}` },
    openGraph: { title, description, url: absUrl(`/scratch/${params.province}/price/${p}`), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function ScratchProvincePricePage({
  params,
}: {
  params: { province: string; price: string };
}) {
  if (!isProvince(params.province)) notFound();
  const province: Province = params.province;
  const cfg = provinceConfig(province);
  const p = parsePrice(province, params.price);
  if (p === null) notFound();
  const games = getGamesByPrice(province, p);
  const { generatedAt } = getRankings(province);
  const poolAtPrice = games.reduce((s, g) => s + (g.remainingPrizePool ?? 0), 0);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Best $${p} Scratch Tickets in ${cfg.label}`,
    numberOfItems: games.length,
    itemListElement: games.map((g) => ({
      "@type": "ListItem",
      position: g.rank,
      url: absUrl(`/scratch/${province}/${g.slug}`),
      name: g.name,
    })),
  };

  return (
    <>
      <JsonLd data={itemListJsonLd} />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/scratch">Scratch</Link> /{" "}
            <Link href={`/scratch/${province}`}>{cfg.label}</Link> / <span>${p} Tickets</span>
          </div>
          <div className="section-eyebrow">By price · ${p}</div>
          <h1 className="section-headline">
            Best <em>${p}</em> {cfg.label} scratch tickets.
          </h1>
          <p className="section-lede">
            {games.length} {cfg.label} instant game{games.length === 1 ? "" : "s"} at
            this price, ranked by value left — {money(poolAtPrice, { compact: true })}{" "}
            in unclaimed prizes between them. Updated {humanDate(generatedAt)}.
          </p>
          <PriceNav province={province} active={p} />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 44 }}>
        <div className="container">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <DemoNotice province={province} />
            <AdSlot slot="price-top" format="leaderboard" />
            {games.length ? (
              <RankingTable games={games} />
            ) : (
              <p className="section-lede">No games at this price right now.</p>
            )}
            <ScratchDisclaimer />
          </div>
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
