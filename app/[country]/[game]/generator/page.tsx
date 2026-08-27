import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName } from "@/config/games";
import { resolveGame, countryGamePoolParams, getStats } from "@/lib/draws";
import { absUrl } from "@/lib/site";
import { GameTabs } from "@/components/draws/GameTabs";
import { GameSwitcher } from "@/components/draws/GameSwitcher";
import { Generator } from "@/components/draws/Generator";
import { Backtest } from "@/components/draws/Backtest";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;
export function generateStaticParams() {
  return countryGamePoolParams();
}

export function generateMetadata({ params }: { params: { country: string; game: string } }): Metadata {
  const g = resolveGame(params.country, params.game);
  if (!g) return {};
  const title = `${g.name} Number Generator — Quick Pick & Stats-Weighted`;
  const description = `Generate ${g.name} numbers: pure Quick Pick free and unlimited, plus frequency-weighted, hot, cold, and jackpot-splitting-aware pick styles. Backtest any combination against every recorded draw.`;
  return {
    title,
    description,
    alternates: { canonical: `/${params.country}/${g.slug}/generator` },
    openGraph: { title, description, url: absUrl(`/${params.country}/${g.slug}/generator`) },
  };
}

export default function GeneratorPage({ params }: { params: { country: string; game: string } }) {
  const g = resolveGame(params.country, params.game);
  if (!g || g.format === "digit") notFound();
  const base = `/${params.country}/${g.slug}`;
  const stats = getStats(g.slug);
  if (!stats) notFound();

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: `${g.name} Number Generator`,
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "Any (web browser)",
          url: absUrl(`${base}/generator`),
          description: `Generate ${g.name} numbers: pure Quick Pick, statistics-weighted, or birthday-seeded.`,
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: g.currency },
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href={`/${params.country}`}>{countryName(g.country)}</Link> /{" "}
            <Link href={base}>{g.name}</Link> / <span>Generator</span>
          </div>
          <div className="section-eyebrow">Number tools</div>
          <h1 className="section-headline">
            {g.name} <em>generator.</em>
          </h1>
          <p className="section-lede">
            Pick {g.pick} of {g.max}
            {g.hasBonus ? ` plus a ${g.bonusLabel ?? "bonus"}` : ""} — three ways. It&rsquo;s a bit of
            fun; the odds are identical no matter how you choose.
          </p>
          <GameTabs country={params.country} slug={g.slug} active="generator" />
          <GameSwitcher slug={g.slug} kind="generator" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <Generator
            gameSlug={g.slug}
            pick={g.pick}
            max={g.max}
            hasBonus={g.hasBonus}
            bonusMax={g.bonusMax ?? g.max}
            bonusCount={g.bonusCount ?? 1}
            bonusLabel={g.bonusLabel ?? "Bonus"}
          />
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <h2 className="section-headline" style={{ fontSize: "clamp(24px,3vw,34px)", marginBottom: 10 }}>
            Have these numbers <em>ever won?</em>
          </h2>
          <p className="section-lede" style={{ marginBottom: 22, maxWidth: "42em" }}>
            Check any combination against every {g.name} draw on record.
          </p>
          <Backtest gameSlug={g.slug} pick={g.pick} max={g.max} />
        </div>
      </section>
    </>
  );
}
