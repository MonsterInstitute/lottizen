import type { Metadata } from "next";
import Link from "next/link";
import { getHubGames } from "@/lib/draws";
import { absUrl } from "@/lib/site";
import { GeoHub } from "@/components/site/GeoHub";

export const metadata: Metadata = {
  title: "Lottery Number Statistics — Every Game",
  description:
    "Number frequency, hot & cold, gaps and patterns for every Canadian and US draw lottery we track — Powerball, Mega Millions, Lotto Max, Lotto 6/49 and more.",
  alternates: { canonical: "/statistics" },
  openGraph: {
    title: "Lottery Number Statistics · Lottizen",
    description: "Deep number statistics for every Canadian and US draw lottery.",
    url: absUrl("/statistics"),
    type: "website",
  },
};

export default function StatisticsHub() {
  const games = getHubGames("statistics");
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link> / <span>Statistics</span>
          </div>
          <div className="section-eyebrow">Statistics</div>
          <h1 className="section-headline">
            Number stats, <em>every game.</em>
          </h1>
          <p className="section-lede">
            Frequency, gaps, hot &amp; cold, sums and pairs — computed from full official
            history. Pick a game to dive in.
          </p>
        </div>
      </div>
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <GeoHub games={games} kind="statistics" />
        </div>
      </section>
    </>
  );
}
