import Link from "next/link";
import type { Game } from "@/lib/types";
import { provinceConfig } from "@/config/scratch";
import { money, price, score } from "@/lib/format";

/**
 * Static white data card for the hero — mirrors the reference "record" card,
 * repurposed to surface today's #1 value pick. No interactivity; pure editorial.
 */
export function TopPickCard({ game }: { game: Game }) {
  const cfg = provinceConfig(game.province);
  const hasTotals = game.scoringMethod !== "remaining_value_index";
  return (
    <div className="data-card reveal r-3">
      <div className="data-card-head">
        <Link href={`/scratch/${game.province}/${game.slug}`} className="data-card-title">
          {game.name}
        </Link>
        <span className="status-pill">Top pick</span>
      </div>

      <div>
        <div className="data-row">
          <span className="k">Ticket price</span>
          <span className="v">{price(game.price)}</span>
        </div>
        <div className="data-row">
          <span className="k">Top prize</span>
          <span className="v">{game.topPrizeLabel}</span>
        </div>
        <div className="data-row">
          <span className="k">Top prizes left</span>
          <span className="v">
            {game.topPrizesRemaining}
            {hasTotals ? ` / ${game.topPrizesTotal}` : ""}
          </span>
        </div>
        <div className="data-row">
          <span className="k">Prizes unclaimed</span>
          <span className="v">{money(game.remainingPrizePool, { compact: true })}</span>
        </div>
        <div className="data-row">
          <span className="k">Value score</span>
          <span className="v" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            {score(game.valueScore)}
          </span>
        </div>
      </div>

      <div className="data-card-note">
        <div className="eyebrow">Why it&rsquo;s #1</div>
        <p>
          Its big prizes are draining slower than the tickets — more prize value
          is still on the table per dollar than any other {cfg.label} game today.
        </p>
      </div>

      <div className="data-card-foot">
        <span>GAME #{game.gameNumber}</span>
        <span>{game.agency} · {cfg.label}</span>
      </div>
    </div>
  );
}
