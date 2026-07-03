"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { bucketForRegionCode } from "@/config/games";
import type { HubGame } from "@/lib/draws";

const CA_ORDER = ["National", "Ontario", "Western Canada", "British Columbia", "Québec", "Atlantic"];
const US_ORDER = ["National", "New York"];
const COUNTRY_NAME: Record<string, string> = { CA: "Canada", US: "United States" };

function readGeo(): string | null {
  const m = typeof document !== "undefined" && document.cookie.match(/(?:^|; )lottizen_geo=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function buildGroups(games: HubGame[], geo: string | null) {
  const [gc, gr] = geo ? geo.split("-") : [null, null];
  const userBucket = gr ? bucketForRegionCode(gr) : null;
  const countries = gc === "US" ? ["US", "CA"] : ["CA", "US"];
  const out: { country: string; buckets: { bucket: string; games: HubGame[] }[] }[] = [];
  for (const c of countries) {
    const cg = games.filter((g) => g.country === c);
    if (!cg.length) continue;
    const base = c === "CA" ? CA_ORDER : US_ORDER;
    const order = c === gc && userBucket ? [userBucket, ...base.filter((b) => b !== userBucket)] : base;
    const buckets = order
      .map((bucket) => ({ bucket, games: cg.filter((g) => g.bucket === bucket) }))
      .filter((x) => x.games.length);
    out.push({ country: c, buckets });
  }
  return out;
}

export function GeoHub({ games, kind }: { games: HubGame[]; kind: "statistics" | "generator" }) {
  const [geo, setGeo] = useState<string | null>(null);
  useEffect(() => setGeo(readGeo()), []);
  const groups = useMemo(() => buildGroups(games, geo), [games, geo]);
  const verb = kind === "statistics" ? "View stats" : "Open tool";

  return (
    <>
      {geo && (
        <p className="hero-meta" style={{ marginBottom: 28 }}>
          Sorted for your region ({geo}). Pick any game below.
        </p>
      )}
      {groups.map((grp) => (
        <div key={grp.country} style={{ marginBottom: 48 }}>
          <div className="section-eyebrow" style={{ marginBottom: 18 }}>
            {COUNTRY_NAME[grp.country] ?? grp.country}
          </div>
          {grp.buckets.map((b) => (
            <div key={b.bucket} style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                  marginBottom: 12,
                }}
              >
                {b.bucket}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 14,
                }}
              >
                {b.games.map((g) => (
                  <Link key={g.slug} href={g.href} className="game-card">
                    <div className="game-card-head">
                      <span className="game-card-name" style={{ fontSize: 19 }}>
                        {g.name}
                      </span>
                    </div>
                    <div className="game-card-meta" style={{ marginBottom: 14 }}>
                      {g.agency}
                      {g.depth ? ` · ${g.depth}` : ""}
                    </div>
                    <span className="chip" style={{ pointerEvents: "none" }}>
                      {verb} →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
