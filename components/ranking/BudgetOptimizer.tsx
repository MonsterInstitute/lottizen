"use client";

import { useState } from "react";
import Link from "next/link";
import type { Game } from "@/lib/types";
import { optimizeBudget } from "@/lib/plus-analytics";
import { money, price } from "@/lib/format";

/** Lottizen Plus's budget optimizer — given a spend, finds the combination
 * of active tickets in this province with the highest total expected
 * value. Pure client-side calculation over the games already on the page,
 * no extra data fetch. */
export function BudgetOptimizer({ games }: { games: Game[] }) {
  const [budget, setBudget] = useState(20);
  const result = optimizeBudget(games, budget);

  return (
    <div className="card" style={{ padding: 28 }}>
      <div className="section-eyebrow">Budget optimizer</div>
      <h2 className="section-headline" style={{ fontSize: "clamp(20px,2.4vw,26px)", marginBottom: 14 }}>
        What&rsquo;s the best combination for what you&rsquo;re spending?
      </h2>
      <div className="inline-form" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Budget ($)</label>
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
        <p className="field-hint">No combination fits that budget yet — try a higher amount.</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {result.lines.map((line) => (
              <div key={`${line.game.agency}:${line.game.slug}`} className="data-row">
                <span className="k">
                  {line.count}× <Link href={`/scratch/${line.game.province}/${line.game.slug}`}>{line.game.name}</Link> ({price(line.game.price)})
                </span>
                <span className="v">{money(line.count * line.game.price)}</span>
              </div>
            ))}
          </div>
          <p className="field-hint">
            Spends {money(result.totalSpent)} of {money(budget)} · estimated expected value ≈{" "}
            {money(result.totalExpectedValue)} across this combination — higher than any single
            ticket type at this budget, based on today&rsquo;s Value Scores.
          </p>
        </>
      )}
    </div>
  );
}
