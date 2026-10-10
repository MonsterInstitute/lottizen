"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Game } from "@/lib/types";
import type { ScratchFavouriteRef } from "@/lib/supabase-admin";
import { money, price } from "@/lib/format";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";
import { GOAL_MODES, estimateRemainingValue, rankByGoalMode, type GoalMode } from "@/lib/plus-analytics";

interface ProRankingBoardProps {
  games: Game[];
  initialFavourites: ScratchFavouriteRef[];
}

const favKey = (agency: string, slug: string) => `${agency}:${slug}`;

/**
 * The full, filterable scratch board for one province, shown to every
 * visitor (no sign-in needed). Favouriting needs the free email sign-in;
 * anonymous visitors get a pointer to it instead of a silent failure. All
 * filtering/sorting happens client-side over the full ranked list already
 * passed down — no extra data fetch per filter change.
 *
 * Everything shown describes prize money still unclaimed — never odds, never
 * a ticket count, never an expected return (see lib/plus-analytics.ts).
 */
export function ProRankingBoard({ games, initialFavourites }: ProRankingBoardProps) {
  const [priceFilter, setPriceFilter] = useState<number | "all">("all");
  const [minTopPrizesRemaining, setMinTopPrizesRemaining] = useState(0);
  const [minRemainingPool, setMinRemainingPool] = useState(0);
  const [search, setSearch] = useState("");
  // The agencies' prize lists include games that stopped selling (BCLC: most
  // of them). Default to what a buyer can actually buy, where we know.
  const saleKnown = games.some((g) => g.onSale === true || g.onSale === false);
  const [onSaleOnly, setOnSaleOnly] = useState(saleKnown);
  const [goalMode, setGoalMode] = useState<GoalMode>("overall");
  const [favourites, setFavourites] = useState<Set<string>>(
    new Set(initialFavourites.map((f) => favKey(f.agency, f.slug))),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const prices = useMemo(() => [...new Set(games.map((g) => Math.round(g.price)))].sort((a, b) => a - b), [games]);

  const filtered = rankByGoalMode(games, goalMode).filter((g) => {
    if (onSaleOnly && g.onSale !== true) return false;
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
    if (res.status === 401) {
      setNeedsSignIn(true);
      return;
    }
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
      <div className="chip-row" style={{ marginBottom: 14 }}>
        {GOAL_MODES.map((m) => (
          <button
            key={m.id}
            className={`chip ${goalMode === m.id ? "active" : ""}`}
            style={{ border: "none", cursor: "pointer" }}
            title={m.blurb}
            onClick={() => setGoalMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="field-hint" style={{ marginBottom: 16 }}>
        {GOAL_MODES.find((m) => m.id === goalMode)?.blurb}
      </p>
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
        {saleKnown && (
          <div className="field">
            <label>
              <input type="checkbox" checked={onSaleOnly} onChange={(e) => setOnSaleOnly(e.target.checked)} /> On sale
              now only
            </label>
          </div>
        )}
        <div className="field">
          <label>Search name or game #</label>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Bingo, 3087" />
        </div>
      </div>

      <p className="field-hint" style={{ marginBottom: 12 }}>
        {filtered.length} of {games.length} games match your filters.
      </p>
      {needsSignIn ? (
        <div className="form-notice" style={{ marginBottom: 12 }}>
          Favourites are saved to a free account — <Link href="/dashboard">sign in with your email</Link> and
          we&rsquo;ll email you if a favourite&rsquo;s top prize is claimed.
        </div>
      ) : null}

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
                  {g.onSale === false ? " · NOT ON SALE (prize claims only)" : ""}
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
              <>
                {(() => {
                  const est = estimateRemainingValue(g);
                  return (
                    <div style={{ padding: "0 20px 14px", fontSize: 13.5 }}>
                      <strong>Prize money still unclaimed:</strong>{" "}
                      {est.supported
                        ? `${est.pctPrizeMoneyRemaining}% of the printed prize money (100% at launch) · ${est.pctPrizesRemaining}% of prizes by count`
                        : `not supported (${est.reason})`}
                      {est.supported ? (
                        <div className="field-hint" style={{ marginTop: 4 }}>
                          Measured from {g.agency}&rsquo;s published prize counts. It describes the prize money
                          left in the game — not the odds of any ticket winning, and not what you&rsquo;d win back.
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
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
              </>
            ) : null}
          </div>
          );
        })}
      </div>
    </div>
  );
}
