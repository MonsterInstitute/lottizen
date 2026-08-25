import Link from "next/link";
import { getActivePricePoints } from "@/lib/data";
import type { Province } from "@/config/scratch";

/** Row of price-filter chips shown on a province's board + price pages. */
export function PriceNav({ province, active }: { province: Province; active?: number }) {
  const prices = getActivePricePoints(province);
  return (
    <div className="chip-row">
      <Link href={`/scratch/${province}`} className={`chip ${active === undefined ? "active" : ""}`}>
        All prices
      </Link>
      {prices.map((p) => (
        <Link
          key={p}
          href={`/scratch/${province}/price/${p}`}
          className={`chip ${active === p ? "active" : ""}`}
        >
          ${p}
        </Link>
      ))}
    </div>
  );
}
