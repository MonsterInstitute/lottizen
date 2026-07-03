import type { DigitStatsFile } from "@/lib/draws";
import { FrequencyChart } from "@/components/draws/StatCharts";

/** Statistics view for positional digit games (Numbers, Win 4). */
export function DigitStats({ stats, name }: { stats: DigitStatsFile; name: string }) {
  return (
    <>
      {/* Per-position digit frequency */}
      <div className="section-eyebrow" style={{ marginBottom: 16 }}>
        Digit frequency by position
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${stats.positions}, minmax(0, 1fr))`,
          gap: 16,
          marginBottom: 40,
        }}
        className="digit-pos-grid"
      >
        {stats.positional.map((p) => {
          const pmax = Math.max(1, ...p.digits.map((d) => d.count));
          const topD = p.digits.reduce((a, b) => (b.count > a.count ? b : a));
          return (
            <div className="chart-card" key={p.pos}>
              <h3>Position {p.pos}</h3>
              <div className="sub">Most common: {topD.d}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                {p.digits.map((d) => (
                  <div key={d.d} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, width: 12, color: "var(--ink-2)" }}>
                      {d.d}
                    </span>
                    <div style={{ flex: 1, height: 8, background: "var(--border-2)", borderRadius: 4, overflow: "hidden" }}>
                      <span
                        style={{
                          display: "block",
                          height: "100%",
                          width: `${(d.count / pmax) * 100}%`,
                          background: d.d === topD.d ? "var(--brand-deep)" : "var(--brand)",
                          opacity: d.d === topD.d ? 1 : 0.55,
                        }}
                      />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", width: 34, textAlign: "right" }}>
                      {d.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Overall digit frequency */}
      <div className="chart-card" style={{ marginBottom: 40 }}>
        <h3>Overall digit frequency</h3>
        <div className="sub">Every digit across all {stats.positions} positions. Hottest in deep orange.</div>
        <FrequencyChart
          data={stats.overall.map((o) => ({ n: o.d, count: o.count }))}
          hot={stats.hotDigits}
        />
      </div>

      {/* Top straight combinations */}
      <div className="chart-card" style={{ marginBottom: 40 }}>
        <h3>Most drawn combinations</h3>
        <div className="sub">Exact ({name}) numbers drawn most often (straight order).</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
          {stats.topCombos.map((c) => (
            <div key={c.combo} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="balls">
                {c.combo.split("").map((d, i) => (
                  <span className="ball sm" key={i}>
                    {d}
                  </span>
                ))}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)" }}>×{c.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Straight vs boxed explainer */}
      <div className="prose" style={{ maxWidth: 760 }}>
        <h2>Straight vs. boxed</h2>
        <p>
          A <strong>straight</strong> bet wins only if your digits match the draw in exact
          order — {stats.positions === 3 ? "1 in 1,000" : "1 in 10,000"} odds, biggest payout.
          A <strong>boxed</strong> bet wins if your digits match in <em>any</em> order, so the
          odds improve (more the more your digits differ) but the payout is split across the
          winning arrangements. The combination stats above are counted straight (exact order).
        </p>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-3)" }}>
          Digit sum: avg {stats.sum.avg} · range {stats.sum.min}–{stats.sum.max}.
        </p>
      </div>
    </>
  );
}
