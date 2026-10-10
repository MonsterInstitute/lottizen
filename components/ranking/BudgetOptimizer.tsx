"use client";

import { useState } from "react";
import Link from "next/link";
import type { Game } from "@/lib/types";
import { optimizeBudget } from "@/lib/plus-analytics";
import { money, price } from "@/lib/format";

/** Budget planner, shown to every visitor on /scratch/[province]: given a
 * planned spend, fills it with the highest-Value-Score tickets that fit and
 * shows how much prize money is still unclaimed in each. It never shows an
 * "expected value" or a dollar return — a Value Score isn't one (see
 * lib/plus-analytics.ts). Pure client-side calculation over the games already
 * on the page, no extra data fetch. */
export function BudgetOptimizer({ games }: { games: Game[] }) {
  const [budget, setBudget] = useState(20);
  const result = optimizeBudget(games, budget);

  return (
    <div className="card" style={{ padding: 28 }}>
      <div className="section-eyebrow">Budget planner</div>
      <h2 className="section-headline" style={{ fontSize: "clamp(20px,2.4vw,26px)", marginBottom: 14 }}>
        Where is the prize money still unclaimed, for what you plan to spend?
      </h2>
      <p className="field-hint" style={{ marginBottom: 14 }}>
        Enter an amount and we&rsquo;ll fill it with the highest-scoring tickets on today&rsquo;s board
        that fit, and show how much prize money each game still has unclaimed.
      </p>
      <div className="inline-form" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Planned spend ($)</label>
          <input
            type="number"
            min={1}
            step={1}
            value={budget}
            onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
      </div>

      {result.lines.length === 0 ? (
        <p className="field-hint">No ticket fits that amount — try a higher one.</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {result.lines.map((line) => (
              <div key={`${line.game.agency}:${line.game.slug}`} className="data-row">
                <span className="k">
                  {line.count}× <Link href={`/scratch/${line.game.province}/${line.game.slug}`}>{line.game.name}</Link> ({price(line.game.price)})
                  <span style={{ color: "var(--ink-3)" }}>
                    {" "}· score {line.game.valueScore.toFixed(1)} · {money(line.game.remainingPrizePool, { compact: true })} in prizes unclaimed
                  </span>
                </span>
                <span className="v">{money(line.count * line.game.price)}</span>
              </div>
            ))}
          </div>
          <p className="field-hint">
            Spends {money(result.totalSpent)} of {money(budget)}. This shows where the unclaimed prize
            money is, based on today&rsquo;s published prize counts. It does not change the odds of any
            ticket winning, and it isn&rsquo;t a prediction of what you&rsquo;ll win back.
          </p>
        </>
      )}
    </div>
  );
}
