"use client";

import { useState } from "react";
import { FrequencyChart } from "@/components/draws/StatCharts";
import { nDraws } from "@/lib/format";

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
  newNums = [],
  poolSince,
}: {
  allTime: View;
  window: View;
  windowSize: number;
  /** Numbers that joined the pool mid-era — rendered hatched and footnoted. */
  newNums?: number[];
  poolSince?: string;
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
            Last {nDraws(windowSize)}
          </button>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <FrequencyChart data={cur.chart} hot={cur.top} newNums={newNums} />
      </div>
      <div className="sub" style={{ marginTop: 10, marginBottom: 0 }}>
        Based on {cur.basis}.
        {newNums.length > 0 && (
          <>
            {" "}
            <span style={{ color: "#5b6b80" }}>
              Hatched bars ({newNums.join(", ")}) joined the pool
              {poolSince ? ` ${new Date(poolSince).toLocaleDateString("en-CA", { month: "short", year: "numeric", timeZone: "UTC" })}` : ""},
              so they have fewer draws and sit outside the hot ranking.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
