import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveGame } from "@/config/games";
import { getStats, getPlayableSlugs } from "@/lib/draws";
import { absUrl } from "@/lib/site";
import { GameTabs } from "@/components/draws/GameTabs";
import { Generator } from "@/components/draws/Generator";

export const dynamicParams = false;
export function generateStaticParams() {
  return getPlayableSlugs().map((game) => ({ game }));
}

export function generateMetadata({ params }: { params: { game: string } }): Metadata {
  const g = getLiveGame(params.game);
  if (!g) return {};
  const title = `${g.name} Number Generator — Quick Pick & Stats-Weighted`;
  const description = `Generate ${g.name} numbers: pure Quick Pick, statistics-weighted, or birthday-seeded. Free, in your browser.`;
  return {
    title,
    description,
    alternates: { canonical: `/canada/${g.slug}/generator` },
    openGraph: { title, description, url: absUrl(`/canada/${g.slug}/generator`) },
  };
}

export default function GeneratorPage({ params }: { params: { game: string } }) {
  const g = getLiveGame(params.game);
  if (!g) notFound();
  const stats = getStats(g.slug);
  if (!stats) notFound();

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/canada">Canada</Link> /{" "}
            <Link href={`/canada/${g.slug}`}>{g.name}</Link> / <span>Generator</span>
          </div>
          <div className="section-eyebrow">Number tools</div>
          <h1 className="section-headline">
            {g.name} <em>generator.</em>
          </h1>
          <p className="section-lede">
            Pick {g.pick} of {g.max}
            {g.hasBonus ? " plus a bonus" : ""} — three ways. It&rsquo;s a bit of fun; the
            odds are identical no matter how you choose.
          </p>
          <GameTabs slug={g.slug} active="generator" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <Generator
            pick={g.pick}
            max={g.max}
            hasBonus={g.hasBonus}
            frequency={stats.aggregate.frequencyChart}
          />
        </div>
      </section>
    </>
  );
}
