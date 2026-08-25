import type { Metadata } from "next";
import Link from "next/link";
import { getAllRankings } from "@/lib/data";
import { PROVINCES } from "@/config/scratch";
import { money, humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";
import { ScratchDisclaimer } from "@/components/site/ScratchDisclaimer";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export const metadata: Metadata = {
  title: "Scratch Value Tracker — Every Canadian Province, Ranked",
  description:
    "Live scratch-ticket value rankings across all 5 Canadian lottery agencies — Ontario (OLG), British Columbia (BCLC), Western Canada (WCLC), Atlantic Canada (ALC), and Quebec. See which province's board to explore.",
  alternates: { canonical: "/scratch" },
  openGraph: {
    title: "Scratch Value Tracker · Lottizen",
    description: "Which scratch ticket is worth buying right now — across every Canadian province Lottizen tracks.",
    url: absUrl("/scratch"),
    type: "website",
  },
};

export default function ScratchNationalOverview() {
  const allRankings = getAllRankings();
  const generatedAt = allRankings.map((r) => r.generatedAt).sort().at(-1) ?? new Date().toISOString();
  const totalGames = allRankings.reduce((s, r) => s + r.gameCount, 0);
  const totalPool = allRankings.reduce(
    (s, r) => s + r.games.reduce((s2, g) => s2 + (g.remainingPrizePool ?? 0), 0),
    0,
  );

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Canadian Scratch Ticket Value Rankings — ${humanDate(generatedAt)}`,
    description: SITE.description,
    numberOfItems: PROVINCES.length,
    itemListElement: PROVINCES.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absUrl(`/scratch/${p.slug}`),
      name: p.label,
    })),
  };

  return (
    <>
      <JsonLd data={itemListJsonLd} />

      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="pill reveal r-1">
              <span className="dot" />
              All 5 Canadian scratch-ticket agencies
            </span>
            <h1 className="hero-headline">
              <span className="line reveal r-2">Smarter scratch,</span>
              <span className="line reveal r-3">
                <em>coast to coast.</em>
              </span>
            </h1>
            <p className="hero-deck reveal r-4">
              Lottizen tracks remaining scratch-ticket prizes across{" "}
              <strong>Ontario, British Columbia, Western Canada, Atlantic Canada, and Quebec</strong>{" "}
              and scores which tickets still have the most value left. Pick your province below.
            </p>
            <div className="hero-meta reveal r-5">
              Updated {humanDate(generatedAt)} · {totalGames} games tracked across 5 provinces
            </div>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="stat-band">
          <div className="stat-cell">
            <div className="stat-cell-label">Provinces tracked</div>
            <div className="stat-cell-value">{PROVINCES.length}</div>
            <div className="stat-cell-foot">OLG, BCLC, WCLC, ALC, Loto-Québec.</div>
          </div>
          <div className="stat-cell">
            <div className="stat-cell-label">Games tracked</div>
            <div className="stat-cell-value">{totalGames}</div>
            <div className="stat-cell-foot">Active instant games, re-ranked every morning.</div>
          </div>
          <div className="stat-cell">
            <div className="stat-cell-label">Prize money unclaimed</div>
            <div className="stat-cell-value">
              {money(totalPool, { compact: true })}
              <em>+</em>
            </div>
            <div className="stat-cell-foot">Across every tracked game, right now.</div>
          </div>
        </div>
      </section>

      <section className="section" id="provinces">
        <div className="container">
          <div className="section-eyebrow">Pick a province</div>
          <div className="section-head-row">
            <h2 className="section-headline">
              Not every province publishes the <em>same data.</em>
            </h2>
            <p className="section-lede" style={{ maxWidth: "30em" }}>
              Ontario, British Columbia, and Quebec publish full prize-tier data. Western Canada
              only discloses remaining counts; Atlantic Canada only discloses top-prize counts. Each
              board says so up front — see{" "}
              <Link href="/methodology#scoring-methods" style={{ color: "var(--brand-deep)" }}>
                how each is scored
              </Link>
              .
            </p>
          </div>

          <div style={{ display: "grid", gap: 20, marginTop: 28 }}>
            {allRankings.map((r) => {
              const cfg = PROVINCES.find((p) => p.slug === r.province)!;
              const topFive = r.games.slice(0, 5);
              return (
                <div key={r.province} className="card" style={{ padding: 28 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div className="section-eyebrow" style={{ marginBottom: 6 }}>
                        {cfg.agency} · {r.gameCount} games
                      </div>
                      <h3 className="section-headline" style={{ fontSize: "clamp(20px,2.6vw,28px)", marginBottom: 4 }}>
                        <Link href={`/scratch/${r.province}`}>{cfg.label}</Link>
                      </h3>
                      <span className="chip" style={{ display: "inline-flex", marginTop: 6 }}>
                        {cfg.completenessBadge}
                      </span>
                    </div>
                    <Link href={`/scratch/${r.province}`} className="btn btn-secondary">
                      See full board →
                    </Link>
                  </div>

                  <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
                    {topFive.map((g) => (
                      <Link
                        key={g.slug}
                        href={`/scratch/${r.province}/${g.slug}`}
                        className="data-row"
                        style={{ textDecoration: "none" }}
                      >
                        <span className="k">
                          #{g.rank} {g.name} · ${Math.round(g.price)}
                        </span>
                        <ScoreBadge value={g.valueScore} hot={g.rank <= 3} />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 32 }}>
            <ScratchDisclaimer />
          </div>
          <div style={{ height: 40 }} />
          <AdSlot slot="rankings-bottom" format="leaderboard" />
        </div>
      </section>
    </>
  );
}
