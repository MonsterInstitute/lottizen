import Link from "next/link";
import type { Game } from "@/lib/types";
import { money, price } from "@/lib/format";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";

/**
 * The core ranking board. Each row links to /scratch/[slug]. Uses the ported
 * grid + brutalist frame; collapses to stacked cards on mobile (see globals).
 * `startRank` lets sub-lists (e.g. a price page) keep their own numbering.
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
        <div>Rank</div>
        <div>Game</div>
        <div>Price</div>
        <div>Prizes Left</div>
        <div>Top Prizes Left</div>
        <div>Score</div>
      </div>
      {games.map((g, i) => {
        const pos = startRank + i;
        return (
          <Link href={`/scratch/${g.slug}`} className="rank-row" key={g.slug}>
            <div className="rank-pos">{pos}</div>
            <div className="rank-name">
              {g.name}
              <span className="rank-gameno">
                GAME #{g.gameNumber} · TOP PRIZE {g.topPrizeLabel}
              </span>
            </div>
            <div className="rank-cell rank-num">
              <span className="rank-cell-label">Price</span>
              <strong>{price(g.price)}</strong>
            </div>
            <div className="rank-cell rank-num">
              <span className="rank-cell-label">Prizes left</span>
              <strong>{money(g.remainingPrizePool, { compact: true })}</strong>
            </div>
            <div className="rank-cell rank-num">
              <span className="rank-cell-label">Top left</span>
              <strong>{g.topPrizesRemaining}</strong>&nbsp;/&nbsp;{g.topPrizesTotal}
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
