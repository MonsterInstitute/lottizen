"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { COMPARISON, FAQ } from "@/lib/plus-content";
import { AdSlot } from "@/components/site/AdSlot";

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
            Canada&rsquo;s scratch ticket <em>intelligence.</em>
          </h1>
          <p className="section-lede" style={{ maxWidth: "38em" }}>
            $3 a month — the price of one Lotto 6/49 ticket. Avoid buying one wrong $20 ticket
            whose jackpot is already gone, and you&rsquo;ve paid for half a year.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
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
                {COMPARISON.map((row) => (
                  <tr key={row.label}>
                    <td className="amount">{row.label}</td>
                    <td className="num">{row.free}</td>
                    <td className="num" style={{ fontWeight: 700, color: "var(--brand-deep)" }}>
                      {row.plus}
                    </td>
                  </tr>
                ))}
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
