"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Balls } from "@/components/draws/Balls";
import { STRATEGIES, type Strategy } from "@/lib/number-strategy-meta";

/**
 * Number generator. Generation happens SERVER-side (/api/numbers/generate) for
 * every strategy except pure Quick Pick — the metered strategies carry a free
 * -tier monthly quota, and a quota counted in the browser is not a quota.
 *
 * Locked strategies stay visible with their real labels and descriptions
 * rather than being hidden: the point is that a free visitor can see what
 * exists and take one real run at it, not discover a wall.
 *
 * Quick Pick still renders instantly with no round trip — it protects nothing
 * and it's the free baseline every generator page needs to work signed-out.
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
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [quota, setQuota] = useState<{ signedIn: boolean; isPlus: boolean; runsLeft: number | null } | null>(null);

  useEffect(() => {
    fetch("/api/numbers/generate")
      .then((r) => r.json())
      .then((d) => d?.ok && setQuota({ signedIn: d.signedIn, isPlus: d.isPlus, runsLeft: d.runsLeft }))
      .catch(() => {});
  }, []);

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
    setNeedsUpgrade(false);
    setNeedsSignIn(false);
    setBusy(true);
    try {
      const res = await fetch("/api/numbers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug, strategy }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setNeedsSignIn(true);
        return;
      }
      if (res.status === 403 && data.code === "QUOTA_EXHAUSTED") {
        setNeedsUpgrade(true);
        setQuota((q) => (q ? { ...q, runsLeft: 0 } : q));
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error || "Couldn't generate right now. Try again shortly.");
        return;
      }
      setLine({ nums: data.numbers, bonuses: localBonuses() });
      if (data.quota && !data.quota.isPlus && data.quota.metered) {
        setQuota((q) => (q ? { ...q, runsLeft: data.quota.runsLeft } : q));
      }
    } finally {
      setBusy(false);
    }
  }

  const locked = (s: Strategy) =>
    STRATEGIES.find((x) => x.id === s)!.metered &&
    quota !== null &&
    !quota.isPlus &&
    (!quota.signedIn || (quota.runsLeft ?? 0) <= 0);

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="chip-row" style={{ marginBottom: 8, flexWrap: "wrap" }}>
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip ${strategy === s.id ? "active" : ""}`}
            onClick={() => setStrategy(s.id)}
            style={locked(s.id) ? { opacity: 0.62 } : undefined}
          >
            {locked(s.id) ? "🔒 " : ""}
            {s.label}
          </button>
        ))}
      </div>

      <p style={{ color: "var(--ink-2)", fontSize: 14, marginBottom: 18 }}>{active.blurb}</p>

      {quota && !quota.isPlus && active.metered && quota.signedIn && (quota.runsLeft ?? 0) > 0 && (
        <p className="field-hint" style={{ marginBottom: 14 }}>
          {quota.runsLeft} free run left this month on this pick style.
        </p>
      )}

      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? "Generating…" : "Generate numbers"}
      </button>

      {needsSignIn && (
        <div className="form-notice" style={{ marginTop: 18 }}>
          <Link href={`/subscribe?next=/`}>Sign in</Link> to use this pick style — free accounts
          get one run a month on each.
        </div>
      )}

      {needsUpgrade && (
        <div className="card" style={{ marginTop: 18, padding: "18px 20px" }}>
          <div className="section-eyebrow" style={{ marginBottom: 6 }}>
            Lottizen Plus
          </div>
          <p style={{ fontSize: 15, marginBottom: 14 }}>
            You&rsquo;ve used this month&rsquo;s free run on this pick style. Plus removes the
            limit on every style, and on number backtesting.
          </p>
          <Link href="/plus" className="btn btn-secondary">
            See Lottizen Plus
          </Link>
        </div>
      )}

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
