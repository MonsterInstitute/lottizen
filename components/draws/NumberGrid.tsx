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
  const maxCount = Math.max(1, ...numbers.map((n) => n.count));
  return (
    <div className="number-grid">
      {numbers.map((s) => (
        <Link
          key={s.n}
          href={`/${country}/${slug}/number/${s.n}`}
          className={`num-tile ${s.hot ? "is-hot" : ""} ${s.cold ? "is-cold" : ""}`}
        >
          <div className="nt-n">{String(s.n).padStart(2, "0")}</div>
          <div className="nt-c">
            {s.count}× · {(s.frequency * 100).toFixed(0)}%
          </div>
          <div className="nt-bar">
            <span style={{ width: `${(s.count / maxCount) * 100}%` }} />
          </div>
        </Link>
      ))}
    </div>
  );
}
