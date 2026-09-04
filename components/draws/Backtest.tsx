"use client";

import { useState } from "react";

interface Result {
  drawsChecked: number;
  firstDrawDate: string;
  lastDrawDate: string;
  distribution: Record<string, number>;
  bestMatch: number;
  bestMatchDates: string[];
  totalSpent: number | null;
  currency: string;
}

/**
 * Check a combination against every recorded draw for a game. Free,
 * unlimited, no account needed — this is a retention feature, not a
 * monetisation one (see /api/numbers/backtest).
 *
 * Shows match counts and real spend, never a "you would have won $X": tiers
 * above the fixed low prizes are pari-mutuel and historical prize breakdowns
 * aren't scraped, so a winnings figure would be invented (CLAUDE.md).
 *
 * The usual result is sobering — a combination that has never matched more
 * than 3 or 4, against thousands of dollars of hypothetical spend. That is the
 * honest picture of what playing a fixed set actually looks like, and it is
 * the reason this exists.
 */
export function Backtest({ gameSlug, pick, max }: { gameSlug: string; pick: number; max: number }) {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);


  async function run() {
    setError(null);
    setResult(null);
    const numbers = raw
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(Number);
    if (numbers.length !== pick || new Set(numbers).size !== pick || numbers.some((n) => n < 1 || n > max)) {
      setError(`Enter ${pick} different numbers from 1 to ${max}.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/numbers/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug, numbers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return setError(data.error || "Couldn't run that right now.");
      setResult(data.result);
    } finally {
      setBusy(false);
    }
  }

  const money = (n: number, ccy: string) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <label className="field-hint" htmlFor="backtest-input" style={{ display: "block", marginBottom: 8 }}>
        {pick} numbers, 1–{max}
      </label>
      <input
        id="backtest-input"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={Array.from({ length: pick }, (_, i) => i * 7 + 3).join(" ")}
        style={{
          width: "100%",
          padding: "12px 14px",
          border: "1px solid var(--border-2)",
          borderRadius: "var(--radius-sm)",
          fontFamily: "var(--font-mono)",
          fontSize: 15,
          marginBottom: 16,
          background: "var(--surface)",
          color: "var(--ink)",
        }}
      />


      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? "Checking every draw…" : "Check every draw"}
      </button>



      {error && (
        <div className="form-notice error" style={{ marginTop: 18 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 26 }}>
          <p style={{ fontSize: 16, marginBottom: 16 }}>
            Checked against <strong>{result.drawsChecked.toLocaleString("en-CA")}</strong> draws,{" "}
            {result.firstDrawDate} → {result.lastDrawDate}.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table className="prize-table">
              <thead>
                <tr>
                  <th>Numbers matched</th>
                  <th>Draws</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.distribution)
                  .sort((a, b) => Number(b[0]) - Number(a[0]))
                  .map(([matched, count]) => (
                    <tr key={matched}>
                      <td className="amount">
                        {matched} of {pick}
                      </td>
                      <td className="num">{count.toLocaleString("en-CA")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 15, marginTop: 18 }}>
            Best result ever: <strong>{result.bestMatch} of {pick}</strong>
            {result.bestMatchDates.length > 0 && <> — {result.bestMatchDates.join(", ")}</>}.
            {result.totalSpent != null && (
              <>
                {" "}
                Playing this combination in every draw would have cost{" "}
                <strong>{money(result.totalSpent, result.currency)}</strong>.
              </>
            )}
          </p>

          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)", marginTop: 18 }}>
            Match counts only — no winnings figure. Most prize tiers are pari-mutuel, so what a
            given match paid depends on that draw&rsquo;s pool and how many others matched, and
            we don&rsquo;t hold historical prize breakdowns. Past results say nothing about future
            draws.
          </p>
        </div>
      )}
    </div>
  );
}
