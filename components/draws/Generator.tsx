"use client";

import { useState } from "react";
import { Balls } from "@/components/draws/Balls";

type Mode = "quick" | "weighted" | "birthday";

export function Generator({
  pick,
  max,
  hasBonus,
  bonusMax,
  bonusLabel = "Bonus",
  frequency,
}: {
  pick: number;
  max: number;
  hasBonus: boolean;
  /** secondary-ball pool size (own pool, e.g. Powerball 1-26). */
  bonusMax?: number;
  bonusLabel?: string;
  /** count per number index 1..max, for statistics weighting */
  frequency: { n: number; count: number }[];
}) {
  const [mode, setMode] = useState<Mode>("quick");
  const [line, setLine] = useState<{ nums: number[]; bonus: number | null } | null>(null);
  const [birthday, setBirthday] = useState("");

  const weights = new Map(frequency.map((f) => [f.n, f.count]));

  function pickUnique(pool: number[], k: number, weighted: boolean): number[] {
    const chosen = new Set<number>();
    const items = [...pool];
    while (chosen.size < k && items.length) {
      let idx: number;
      if (weighted) {
        const total = items.reduce((s, n) => s + (weights.get(n) ?? 1), 0);
        let r = Math.random() * total;
        idx = 0;
        for (let i = 0; i < items.length; i++) {
          r -= weights.get(items[i]) ?? 1;
          if (r <= 0) {
            idx = i;
            break;
          }
        }
      } else {
        idx = Math.floor(Math.random() * items.length);
      }
      chosen.add(items[idx]);
      items.splice(idx, 1);
    }
    return [...chosen].sort((a, b) => a - b);
  }

  function generate() {
    const pool = Array.from({ length: max }, (_, i) => i + 1);
    let nums: number[];
    if (mode === "birthday" && birthday) {
      const seed = birthday.replace(/\D/g, "");
      const fromDate = new Set<number>();
      for (let i = 0; i + 1 < seed.length && fromDate.size < pick; i += 2) {
        const v = Number(seed.slice(i, i + 2));
        if (v >= 1 && v <= max) fromDate.add(v);
      }
      nums = [...fromDate];
      const rest = pickUnique(
        pool.filter((n) => !fromDate.has(n)),
        pick - nums.length,
        false,
      );
      nums = [...nums, ...rest].sort((a, b) => a - b);
    } else {
      nums = pickUnique(pool, pick, mode === "weighted");
    }
    // Secondary ball comes from its OWN pool (1..bonusMax), independent of the main pool.
    const bPool = Array.from({ length: bonusMax ?? max }, (_, i) => i + 1);
    const bonus = hasBonus ? bPool[Math.floor(Math.random() * bPool.length)] : null;
    setLine({ nums, bonus });
  }

  const modes: { key: Mode; label: string; desc: string }[] = [
    { key: "quick", label: "Quick Pick", desc: "Pure random, like the terminal." },
    { key: "weighted", label: "Stats-weighted", desc: "Biased toward more-drawn numbers." },
    { key: "birthday", label: "Birthday", desc: "Seed from a date, fill the rest." },
  ];

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="chip-row" style={{ marginBottom: 8 }}>
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`chip ${mode === m.key ? "active" : ""}`}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p style={{ color: "var(--ink-2)", fontSize: 14, marginBottom: 18 }}>
        {modes.find((m) => m.key === mode)!.desc}
      </p>

      {mode === "birthday" && (
        <input
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-mono)",
            fontSize: 15,
            marginBottom: 18,
            background: "var(--surface)",
            color: "var(--ink)",
          }}
        />
      )}

      <button type="button" className="btn btn-primary" onClick={generate}>
        Generate numbers
      </button>

      {line && (
        <div style={{ marginTop: 26 }}>
          <Balls numbers={line.nums} bonus={line.bonus} size="lg" />
        </div>
      )}

      <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)", marginTop: 22 }}>
        For entertainment only. Every combination has exactly the same odds —
        weighting changes nothing about your chance to win.
      </p>
    </div>
  );
}
