"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Game } from "@/lib/types";
import type { ScratchFavouriteRef } from "@/lib/supabase-admin";
import { money, price } from "@/lib/format";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";

interface ProRankingBoardProps {
  games: Game[];
  initialFavourites: ScratchFavouriteRef[];
}

const favKey = (agency: string, slug: string) => `${agency}:${slug}`;

/**
 * Lottizen Pro's full, filterable scratch board for one province — the
 * product's strongest differentiator (see the brief). Free visitors only
 * ever see the top-3 teaser (RankingTable in app/scratch/[province]/page.tsx);
 * this component only renders for a confirmed Pro session (server-checked
 * in the page). All filtering happens client-side over the full ranked
 * list already passed down — no extra data fetch per filter change.
 */
export function ProRankingBoard({ games, initialFavourites }: ProRankingBoardProps) {
  const [priceFilter, setPriceFilter] = useState<number | "all">("all");
  const [minTopPrizesRemaining, setMinTopPrizesRemaining] = useState(0);
  const [minRemainingPool, setMinRemainingPool] = useState(0);
  const [search, setSearch] = useState("");
  const [favourites, setFavourites] = useState<Set<string>>(
    new Set(initialFavourites.map((f) => favKey(f.agency, f.slug))),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const prices = useMemo(() => [...new Set(games.map((g) => Math.round(g.price)))].sort((a, b) => a - b), [games]);

  const filtered = games.filter((g) => {
    if (priceFilter !== "all" && Math.round(g.price) !== priceFilter) return false;
    if (g.topPrizesRemaining < minTopPrizesRemaining) return false;
    if ((g.remainingPrizePool ?? 0) < minRemainingPool) return false;
    if (search && !g.name.toLowerCase().includes(search.toLowerCase()) && !g.gameNumber.includes(search)) return false;
    return true;
  });

  async function toggleFavourite(g: Game) {
    const key = favKey(g.agency, g.slug);
    setBusy(key);
    const isFav = favourites.has(key);
    const res = await fetch("/api/account/scratch-favourites", {
      method: isFav ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlug: g.slug, agency: g.agency }),
    });
    setBusy(null);
    if (!res.ok) return;
    setFavourites((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <div className="inline-form" style={{ marginBottom: 20 }}>
        <div className="field">
          <label>Price</label>
          <select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
            <option value="all">All prices</option>
            {prices.map((p) => (
              <option key={p} value={p}>
                ${p}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Min. top prizes remaining</label>
          <input
            type="number"
            min={0}
            value={minTopPrizesRemaining}
            onChange={(e) => setMinTopPrizesRemaining(Number(e.target.value) || 0)}
          />
        </div>
        <div className="field">
          <label>Min. remaining prize pool ($)</label>
          <input
            type="number"
            min={0}
            step={1000}
            value={minRemainingPool}
            onChange={(e) => setMinRemainingPool(Number(e.target.value) || 0)}
          />
        </div>
        <div className="field">
          <label>Search name or game #</label>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Bingo, 3087" />
        </div>
      </div>

      <p className="field-hint" style={{ marginBottom: 12 }}>
        {filtered.length} of {games.length} games match your filters.
      </p>

      <div className="rank-table">
        <div className="rank-head">
          <div>#</div>
          <div>Game</div>
          <div className="num-col">Price</div>
          <div className="num-col">Prizes left</div>
          <div className="num-col">Top prizes left</div>
          <div className="num-col">Score</div>
        </div>
        {filtered.map((g) => {
          const key = favKey(g.agency, g.slug);
          const hasTotals = g.scoringMethod !== "remaining_value_index";
          return (
          <div key={key}>
            <div className="rank-row" style={{ cursor: "default" }}>
              <div className="rank-pos">{String(g.rank).padStart(2, "0")}</div>
              <div className="rank-name">
                <Link href={`/scratch/${g.province}/${g.slug}`}>{g.name}</Link>
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
              <div className="rank-score" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ScoreBadge value={g.valueScore} hot={g.rank <= 3} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, padding: "0 20px 14px", flexWrap: "wrap" }}>
              <button
                className="nav-signin"
                style={{ fontSize: 13 }}
                disabled={busy === key}
                onClick={() => toggleFavourite(g)}
              >
                {favourites.has(key) ? "★ Favourited" : "☆ Favourite"}
              </button>
              <button
                className="nav-signin"
                style={{ fontSize: 13 }}
                onClick={() => setExpanded(expanded === key ? null : key)}
              >
                {expanded === key ? "Hide prize breakdown" : "Show prize breakdown"}
              </button>
            </div>
            {expanded === key ? (
              <table className="prize-table" style={{ marginBottom: 14 }}>
                <thead>
                  <tr>
                    <th>Prize</th>
                    <th>{hasTotals ? "Total Printed" : "Total"}</th>
                    <th>Remaining</th>
                    <th>{hasTotals ? "% Left" : ""}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.prizeTiers.map((t, i) => {
                    const pctLeft = t.total ? (t.remaining / t.total) * 100 : null;
                    return (
                      <tr key={i} className={t.remaining === 0 ? "depleted" : ""}>
                        <td className="amount">
                          {t.label}
                          {t.isTop ? <span style={{ color: "var(--brand)" }}> ★</span> : null}
                        </td>
                        <td className="num">{hasTotals && t.total ? t.total : "—"}</td>
                        <td className="num">{t.remaining}</td>
                        <td className="num">{pctLeft !== null ? `${pctLeft.toFixed(0)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
          );
        })}
      </div>
    </div>
  );
}
