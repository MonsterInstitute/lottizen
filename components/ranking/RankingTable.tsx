import Link from "next/link";
import type { Game } from "@/lib/types";
import { money, price } from "@/lib/format";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";

/**
 * The core ranking board — editorial table: hairline rows, serif game names,
 * mono numerics, generous row height. Each row links to /scratch/[slug] and
 * collapses to a stacked card on mobile (see globals).
 */
export function RankingTable({
  games,
  startRank = 1,
  hotCount = 3,
}: {
  games: Game[];
  startRank?: number;
  hotCount?: number;
}) {
  return (
    <div className="rank-table">
      <div className="rank-head">
        <div>#</div>
        <div>Game</div>
        <div className="num-col">Price</div>
        <div className="num-col">Prizes left</div>
        <div className="num-col">Top prizes left</div>
        <div className="num-col">Score</div>
      </div>
      {games.map((g, i) => {
        const pos = startRank + i;
        const hasTotals = g.scoringMethod !== "remaining_value_index";
        return (
          <Link href={`/scratch/${g.province}/${g.slug}`} className="rank-row" key={`${g.agency}:${g.slug}`}>
            <div className="rank-pos">
              {String(pos).padStart(2, "0")}
            </div>
            <div className="rank-name">
              {g.name}
              <span className="rank-gameno">
                GAME #{g.gameNumber} · TOP PRIZE {g.topPrizeLabel}
              </span>
            </div>
            <div className="rank-cell rank-num num-col">
              <span className="rank-cell-label">Price</span>
              <strong>{price(g.price)}</strong>
            </div>
            <div className="rank-cell rank-num num-col">
              <span className="rank-cell-label">Prizes left</span>
              {money(g.remainingPrizePool, { compact: true })}
            </div>
            <div className="rank-cell rank-num num-col">
              <span className="rank-cell-label">Top left</span>
              <strong>{g.topPrizesRemaining}</strong>
              {hasTotals ? <span style={{ color: "var(--ink-3)" }}>&nbsp;/&nbsp;{g.topPrizesTotal}</span> : null}
            </div>
            <div className="rank-score">
              <ScoreBadge value={g.valueScore} hot={pos <= hotCount} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
