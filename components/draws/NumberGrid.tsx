import Link from "next/link";
import type { NumberStat } from "@/lib/draws";

/**
 * Grid of every number in the pool, linking to its detail page. Each tile
 * shows frequency + a mini bar; hot/cold numbers are tinted.
 */
export function NumberGrid({
  country,
  slug,
  numbers,
}: {
  country: string;
  slug: string;
  numbers: NumberStat[];
}) {
  // New-to-pool numbers (e.g. Lotto Max 51/52) are excluded from the bar-scaling
  // baseline so one short-history number can't distort the grid, and flagged.
  const maxCount = Math.max(1, ...numbers.filter((n) => !n.newSince).map((n) => n.count));
  return (
    <div className="number-grid">
      {numbers.map((s) => (
        <Link
          key={s.n}
          href={`/${country}/${slug}/number/${s.n}`}
          className={`num-tile ${s.hot ? "is-hot" : ""} ${s.cold ? "is-cold" : ""} ${s.newSince ? "is-new" : ""}`}
          title={s.newSince ? "New to the pool — fewer draws than 1–50" : undefined}
        >
          <div className="nt-n">
            {String(s.n).padStart(2, "0")}
            {s.newSince && <span className="nt-new">NEW</span>}
          </div>
          <div className="nt-c">
            {s.newSince ? `${s.count}× · new` : `${s.count}× · ${(s.frequency * 100).toFixed(0)}%`}
          </div>
          <div className="nt-bar">
            <span style={{ width: `${Math.min(100, (s.count / maxCount) * 100)}%` }} />
          </div>
        </Link>
      ))}
    </div>
  );
}
