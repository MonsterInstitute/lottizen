import type { Metadata } from "next";
import Link from "next/link";
import { getHubGames } from "@/lib/draws";
import { absUrl } from "@/lib/site";
import { GeoHub } from "@/components/site/GeoHub";

export const metadata: Metadata = {
  title: "Lottery Number Generators — Every Game",
  description:
    "Free number generators for every Canadian and US draw lottery — Quick Pick, statistics-weighted, or birthday picks for Powerball, Lotto Max, 6/49 and more.",
  alternates: { canonical: "/generator" },
  openGraph: {
    title: "Lottery Number Generators · Lottizen",
    description: "Quick Pick and stats-weighted number generators for every game.",
    url: absUrl("/generator"),
    type: "website",
  },
};

export default function GeneratorHub() {
  const games = getHubGames("generator");
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link> / <span>Number Tools</span>
          </div>
          <div className="section-eyebrow">Number tools</div>
          <h1 className="section-headline">
            Number generators, <em>every game.</em>
          </h1>
          <p className="section-lede">
            Quick Pick, statistics-weighted, or birthday-seeded picks — for any game, free and
            in your browser. Pick a game to generate.
          </p>
        </div>
      </div>
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <GeoHub games={games} kind="generator" />
        </div>
      </section>
    </>
  );
}
