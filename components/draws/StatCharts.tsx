"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BRAND = "#dd8232";
const BRAND_DEEP = "#c2652a";
const INK3 = "#9c968a";
const BORDER = "#e6e0d4";

const axis = {
  tick: { fontFamily: "var(--font-mono)", fontSize: 11, fill: INK3 },
  tickLine: false,
  axisLine: { stroke: BORDER },
};

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        boxShadow: "0 4px 16px -8px rgba(0,0,0,0.2)",
      }}
    >
      <div style={{ color: INK3 }}>{label}</div>
      <div style={{ color: BRAND_DEEP, fontWeight: 700 }}>
        {payload[0].value} {unit}
      </div>
    </div>
  );
}

/** Frequency of every number across all draws. Hot numbers highlighted. */
export function FrequencyChart({
  data,
  hot,
}: {
  data: { n: number; count: number }[];
  hot: number[];
}) {
  const hotset = new Set(hot);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -24 }}>
        <CartesianGrid vertical={false} stroke={BORDER} />
        <XAxis dataKey="n" interval={4} {...axis} />
        <YAxis {...axis} />
        <Tooltip cursor={{ fill: "rgba(221,130,50,0.06)" }} content={<ChartTooltip unit="draws" />} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.n} fill={hotset.has(d.n) ? BRAND_DEEP : BRAND} fillOpacity={hotset.has(d.n) ? 1 : 0.55} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Sum-of-numbers distribution. */
export function SumChart({ data }: { data: { range: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -24 }}>
        <CartesianGrid vertical={false} stroke={BORDER} />
        <XAxis dataKey="range" {...axis} />
        <YAxis {...axis} />
        <Tooltip cursor={{ fill: "rgba(221,130,50,0.06)" }} content={<ChartTooltip unit="draws" />} />
        <Bar dataKey="count" fill={BRAND} fillOpacity={0.7} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Odd-count distribution (how many odd numbers per draw). */
export function OddEvenChart({ data }: { data: { odd: number; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -24 }}>
        <CartesianGrid vertical={false} stroke={BORDER} />
        <XAxis dataKey="odd" {...axis} />
        <YAxis {...axis} />
        <Tooltip cursor={{ fill: "rgba(221,130,50,0.06)" }} content={<ChartTooltip unit="draws" />} />
        <Bar dataKey="count" fill={BRAND} fillOpacity={0.7} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
