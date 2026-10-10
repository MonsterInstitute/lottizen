import Link from "next/link";
import { getRankings } from "@/lib/data";
import type { Game } from "@/lib/types";
import type { Province } from "@/config/scratch";
import { money } from "@/lib/format";
import { isAnnuityLabel } from "@/components/home/text";

// WCLC sells some games in one province only (games.sold_in).
const REGION_CODES: Record<string, string[]> = {
  alberta: ["AB"],
  saskatchewan: ["SK"],
  manitoba: ["MB"],
  territories: ["YT", "NT", "NU"],
};

function topPrize(g: Game): string {
  if (isAnnuityLabel(g.topPrizeLabel)) return g.topPrizeLabel.replace(/\s+/g, " ");
  return money(g.topPrizeAmount);
}

/** The region's scratch board at a glance: its highest-ranked tickets that
 *  are on sale there, with the top prizes still unclaimed. Rank describes
 *  prize money left (see /methodology), never odds. */
export function scratchTop(region: string, scratchSlug: string): Game[] {
  const r = getRankings(scratchSlug as Province);
  const codes = REGION_CODES[region];
  const sold = (g: Game) => !codes || !g.soldIn?.length || g.soldIn.some((c) => codes.includes(c));
  const anyFlag = r.games.some((g) => g.onSale != null);
  return r.games.filter((g) => (anyFlag ? g.onSale === true : true) && sold(g) && g.topPrizesRemaining > 0).slice(0, 5);
}

export function ScratchRegionCard({
  region,
  label,
  scratchSlug,
  className,
}: {
  region: string;
  label: string;
  scratchSlug: string;
  className?: string;
}) {
  const top = scratchTop(region, scratchSlug);
  if (!top.length) return null;
  return (
    <div className={className} data-region-block={region}>
    <div className="data-card">
      <div className="data-card-head">
        <span className="data-card-title">{label}</span>
        <span className="status-pill">Top 5 by prize money left</span>
      </div>
      {top.map((g, i) => (
        <Link key={g.slug} href={`/scratch/${scratchSlug}/${g.slug}`} className="data-row" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="k">
            {i + 1}. {g.name} <span className="field-hint">{money(g.price)}</span>
          </span>
          <span className="v">
            {g.topPrizesTotal > 0 ? `${g.topPrizesRemaining} of ${g.topPrizesTotal}` : g.topPrizesRemaining} × {topPrize(g)}
          </span>
        </Link>
      ))}
      <div className="data-card-foot">
        <Link href={`/scratch/${scratchSlug}`} style={{ color: "var(--brand-deep)", textDecoration: "none" }}>
          Full rankings →
        </Link>
        <Link href={`/picks#${region}`} style={{ color: "var(--brand-deep)", textDecoration: "none" }}>
          This week&rsquo;s picks →
        </Link>
      </div>
    </div>
    <Link href={`/scratch/${scratchSlug}/prices`} className="compare-cta">
      <span>One $20 ticket or four $5 tickets?</span>
      <strong>Compare by price →</strong>
    </Link>
    </div>
  );
}
