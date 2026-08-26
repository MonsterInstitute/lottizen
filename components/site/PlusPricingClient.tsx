"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { COMPARISON, FAQ } from "@/lib/plus-content";
import { AdSlot } from "@/components/site/AdSlot";

const EXAMPLE_ROWS: { label: string; vault: string; eighties: string; emphasis?: boolean }[] = [
  { label: "Price", vault: "$20", eighties: "$20" },
  { label: "Advertised top prize", vault: "$2,000,000", eighties: "$80,000" },
  { label: "Top prizes still unclaimed", vault: "1 of 6", eighties: "5 of 8", emphasis: true },
  { label: "Its $500,000 tier", vault: "0 of 1 — already gone", eighties: "—", emphasis: true },
  {
    label: "Prize money still unclaimed",
    vault: "$2.5M of $13.2M printed",
    eighties: "$1.1M of $3.1M printed",
  },
  { label: "Est. prize value per $20 spent", vault: "~$4.54", eighties: "~$15.64", emphasis: true },
  { label: "Today's rank", vault: "48th of 49", eighties: "8th of 49" },
];

export function PlusPricingClient() {
  const [busy, setBusy] = useState<"monthly" | "annual" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upgrade(plan: "monthly" | "annual") {
    setBusy(plan);
    setError(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.status === 401) {
      window.location.href = "/subscribe?next=/plus";
      return;
    }
    if (!res.ok || !data.ok) {
      setError(data.error || "Couldn't start checkout. Try again shortly.");
      return;
    }
    if (data.url) window.location.href = data.url;
  }

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="section-eyebrow">Lottizen Plus</div>
          <h1 className="section-headline">
            Don&rsquo;t buy the $20 ticket whose jackpot is <em>already gone.</em>
          </h1>
          <p className="section-lede" style={{ maxWidth: "38em" }}>
            Two scratch tickets can cost the same $20 and be worth wildly different amounts —
            because the prizes behind one of them have already been claimed. The prize data is
            public. Nobody reads it. We read it every morning, for all 428 tickets across 5
            provinces.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <p className="section-lede" style={{ maxWidth: "38em", marginBottom: 24 }}>
            $3 a month — the price of one Lotto 6/49 ticket.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
              marginBottom: 40,
            }}
          >
            <div className="card" style={{ padding: 32 }}>
              <div className="section-eyebrow">Monthly</div>
              <div style={{ fontSize: "clamp(32px,4vw,44px)", fontWeight: 700, margin: "8px 0" }}>
                {PLANS.plus.priceMonthlyLabel}
              </div>
              <p className="field-hint" style={{ marginBottom: 20 }}>
                7-day free trial, then {PLANS.plus.priceMonthlyLabel.toLowerCase()}. Cancel any time.
              </p>
              <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy !== null} onClick={() => upgrade("monthly")}>
                {busy === "monthly" ? "Starting checkout…" : "Start free trial"}
              </button>
            </div>
            <div className="card" style={{ padding: 32, border: "2px solid var(--brand)" }}>
              <div className="section-eyebrow">
                Annual <span className="status-pill" style={{ marginLeft: 8 }}>{PLANS.plus.annualSavingsLabel}</span>
              </div>
              <div style={{ fontSize: "clamp(32px,4vw,44px)", fontWeight: 700, margin: "8px 0" }}>
                {PLANS.plus.priceAnnualLabel}
              </div>
              <p className="field-hint" style={{ marginBottom: 20 }}>
                Ten tickets a year. 7-day free trial, then billed annually. Cancel any time.
              </p>
              <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy !== null} onClick={() => upgrade("annual")}>
                {busy === "annual" ? "Starting checkout…" : "Start free trial"}
              </button>
            </div>
          </div>

          {error ? <div className="form-notice error" style={{ marginBottom: 24 }}>{error}</div> : null}

          <div className="notice" style={{ marginBottom: 40 }}>
            <span className="notice-tag">19+</span>
            <span>
              We don&rsquo;t predict numbers and we don&rsquo;t improve your odds of winning. We
              only tell you which tickets still have money left in them. Play for entertainment
              only — see <Link href="/responsible-play">responsible play</Link>.
            </span>
          </div>

          <h2 className="section-headline" style={{ fontSize: "clamp(26px,3.2vw,38px)", marginBottom: 20 }}>
            Same store. Same day. Same <em>$20.</em>
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table className="prize-table">
              <thead>
                <tr>
                  <th />
                  <th>Vault (game #2559)</th>
                  <th>The 80s (game #2579)</th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <td className="amount">{row.label}</td>
                    <td className="num" style={row.emphasis ? { fontWeight: 700 } : undefined}>
                      {row.vault}
                    </td>
                    <td className="num">{row.eighties}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="prose" style={{ marginTop: 24 }}>
            <p>
              The $2,000,000 headline is still on the front of the Vault ticket. Five of those six
              jackpots have already been won. So has its only half-million-dollar prize.
            </p>
            <p style={{ fontWeight: 700 }}>
              Buy Vault instead of The 80s today and you hand back about $11.10 of expected value —
              on a $20 ticket. That one decision costs more than three months of Plus.
            </p>
          </div>

          <p className="field-hint" style={{ marginTop: 12, marginBottom: 40 }}>
            Estimated from each agency&rsquo;s published remaining-prize counts against a nominal
            payout scale — see <Link href="/methodology">methodology</Link>. This tells you which
            tickets still have money left in them. It does not improve your odds of winning.
          </p>

          <h2 className="section-headline" style={{ fontSize: "clamp(26px,3.2vw,38px)", marginBottom: 20 }}>
            Free vs <em>Plus.</em>
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table className="prize-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Free</th>
                  <th>Plus</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) =>
                  row.section ? (
                    <tr key={row.label}>
                      <td className="amount" colSpan={3} style={{ fontWeight: 700 }}>
                        {row.label}
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.label}>
                      <td className="amount">{row.label}</td>
                      <td className="num">{row.free}</td>
                      <td className="num" style={{ fontWeight: 700, color: "var(--brand-deep)" }}>
                        {row.plus}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <div style={{ height: 40 }} />
          <AdSlot slot="plus-mid" format="leaderboard" />
          <div style={{ height: 40 }} />

          <h2 className="section-headline" style={{ fontSize: "clamp(26px,3.2vw,38px)", marginBottom: 20 }}>
            Questions.
          </h2>
          <div className="prose">
            {FAQ.map((item) => (
              <div key={item.q} style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 6 }}>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>

          <p className="field-hint" style={{ marginTop: 40 }}>
            By subscribing you agree to our <Link href="/terms">terms</Link> and{" "}
            <Link href="/refund-policy">refund policy</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
