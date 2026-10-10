import type { Metadata } from "next";
import Link from "next/link";
import { getPicks } from "@/lib/picks";
import { drawDate, longDate } from "@/lib/format";
import { absUrl } from "@/lib/site";
import { HOME_REGIONS } from "@/components/home/regions";
import { RegionSelect } from "@/components/home/RegionSelect";
import { PickCard, SkipCard, NewTicketsCard, hasWeek, hasNew } from "@/components/home/ProvinceBlock";
import { ScratchDisclaimer } from "@/components/site/ScratchDisclaimer";

export const metadata: Metadata = {
  title: "This Week's Scratch Ticket Picks by Province",
  description:
    "This week's scratch ticket pick for each Canadian province by price band, the tickets still on sale with no top prize left, and this month's steadiest tickets. About prize money left, not your odds.",
  alternates: { canonical: "/picks" },
  openGraph: {
    title: "This Week's Scratch Ticket Picks by Province · Lottizen",
    description: "Pick and skip lists for every Canadian province, from each agency's published prize data.",
    url: absUrl("/picks"),
    type: "website",
  },
};

/**
 * The full weekly picks for every Canadian region. Every region is in the
 * HTML; a visitor whose Canadian province is known sees only theirs
 * (data-picks-region, RegionScript) and can switch with the selector.
 * Visitors from elsewhere, or with no known region, see every province.
 */
export default function PicksPage() {
  const picks = getPicks();
  const regions = HOME_REGIONS.filter((r) => picks.provinces[r.key] && (hasWeek(picks.provinces[r.key]) || hasNew(picks.provinces[r.key])));
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/scratch">Scratch tickets</Link> / <span>This week&rsquo;s picks</span>
          </div>
          <div className="section-eyebrow">Week of {longDate(picks.weekStart)}</div>
          <h1 className="section-headline">
            This week&rsquo;s <em>picks.</em>
          </h1>
          <p className="section-lede">
            For each province: the ticket on sale with the most prize money left by the agency&rsquo;s published
            counts, the best in each price band, and the tickets still sold whose top prize is gone. Updated{" "}
            {drawDate(picks.asOf)}. This is about prize money left, not your odds.
          </p>
          <div className="picks-switch">
            <RegionSelect />
          </div>
          <nav className="picks-jump" aria-label="Provinces">
            {regions.map((r) => (
              <a key={r.key} href={`#${r.key}`}>
                {picks.provinces[r.key].label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          {regions.map((r) => {
            const p = picks.provinces[r.key];
            return (
              <div key={r.key} id={r.key} data-picks-region={r.key} className="picks-region">
                <h2 className="section-headline picks-region-title">
                  {p.label} <span className="field-hint">· {p.agencyName}</span>
                </h2>
                <Link href={`/scratch/${p.scratchSlug}/prices`} className="compare-cta" style={{ marginBottom: 18 }}>
                  <span>One $20 ticket, four $5 tickets or Lotto Max?</span>
                  <strong>Compare by price →</strong>
                </Link>
                <div className="home-grid">
                  <PickCard p={p} full />
                  <SkipCard p={p} full />
                  <NewTicketsCard p={p} full />
                </div>
                <p className="field-hint">
                  <Link href={`/scratch/${p.scratchSlug}`}>Full {p.agencyName} rankings →</Link>
                </p>
              </div>
            );
          })}
          <ScratchDisclaimer />
        </div>
      </section>
    </>
  );
}
