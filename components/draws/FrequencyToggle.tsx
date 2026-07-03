"use client";

import { useState } from "react";
import { FrequencyChart } from "@/components/draws/StatCharts";

interface View {
  chart: { n: number; count: number }[];
  top: number[];
  basis: string;
}

/**
 * Number-frequency chart with two self-consistent views. Within each view the
 * highlighted (deep-orange) bars ARE the tallest bars — bar height and the
 * highlight always come from the same time scale, so it never contradicts.
 */
export function FrequencyToggle({
  allTime,
  window,
  windowSize,
}: {
  allTime: View;
  window: View;
  windowSize: number;
}) {
  const [view, setView] = useState<"all" | "window">("all");
  const cur = view === "all" ? allTime : window;
  return (
    <div className="chart-card" style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h3>Number frequency</h3>
          <div className="sub" style={{ marginBottom: 0 }}>
            How often each number is drawn. The most-drawn are in deep orange.
          </div>
        </div>
        <div className="chip-row">
          <button type="button" className={`chip ${view === "all" ? "active" : ""}`} onClick={() => setView("all")}>
            All-time
          </button>
          <button type="button" className={`chip ${view === "window" ? "active" : ""}`} onClick={() => setView("window")}>
            Last {windowSize} draws
          </button>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <FrequencyChart data={cur.chart} hot={cur.top} />
      </div>
      <div className="sub" style={{ marginTop: 10, marginBottom: 0 }}>
        Based on {cur.basis}.
      </div>
    </div>
  );
}
