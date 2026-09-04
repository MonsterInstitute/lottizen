"use client";

import { useState } from "react";
import { Balls } from "@/components/draws/Balls";
import { STRATEGIES, type Strategy } from "@/lib/number-strategy-meta";

/**
 * Number generator. Every strategy is free, unlimited, and available without
 * an account — generation and backtesting are retention features, not
 * monetisation ones, and the monthly quota this briefly carried only cost
 * return visits on pages that are a search entry point.
 *
 * Generation still runs SERVER-side (/api/numbers/generate): that was right
 * independently of the gating, keeping the algorithms out of the client bundle
 * and letting them use the full draw history without shipping it.
 */
export function Generator({
  gameSlug,
  pick,
  max,
  hasBonus,
  bonusMax,
  bonusCount = 1,
  bonusLabel = "Bonus",
}: {
  gameSlug: string;
  pick: number;
  max: number;
  hasBonus: boolean;
  bonusMax?: number;
  bonusCount?: number;
  bonusLabel?: string;
}) {
  const [strategy, setStrategy] = useState<Strategy>("quick");
  const [line, setLine] = useState<{ nums: number[]; bonuses: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const active = STRATEGIES.find((s) => s.id === strategy)!;
  // Secondary balls come from their OWN pool (1..bonusMax), independent of the
  // main pool; two-star games draw `bonusCount` uniques (e.g. 2 Lucky Stars).
  function localBonuses(): number[] {
    if (!hasBonus) return [];
    const pool = Array.from({ length: bonusMax ?? max }, (_, i) => i + 1);
    const out: number[] = [];
    while (out.length < bonusCount && pool.length) {
      out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
    }
    return out.sort((a, b) => a - b);
  }

  async function run() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/numbers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug, strategy }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Couldn't generate right now. Try again shortly.");
        return;
      }
      setLine({ nums: data.numbers, bonuses: localBonuses() });
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="chip-row" style={{ marginBottom: 8, flexWrap: "wrap" }}>
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip ${strategy === s.id ? "active" : ""}`}
            onClick={() => setStrategy(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p style={{ color: "var(--ink-2)", fontSize: 14, marginBottom: 18 }}>{active.blurb}</p>


      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? "Generating…" : "Generate numbers"}
      </button>



      {error && (
        <div className="form-notice error" style={{ marginTop: 18 }}>
          {error}
        </div>
      )}

      {line && (
        <div style={{ marginTop: 26 }}>
          <Balls
            numbers={line.nums}
            bonus={line.bonuses[0] ?? null}
            bonus2={line.bonuses[1] ?? null}
            star={bonusCount > 1}
            bonusTitle={bonusLabel}
            size="lg"
          />
        </div>
      )}

      <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)", marginTop: 22 }}>
        For entertainment only. Every combination has exactly the same odds — no pick style
        changes your chance of winning. Avoiding calendar numbers only means fewer people to
        split a prize with if you do win.
      </p>
    </div>
  );
}
