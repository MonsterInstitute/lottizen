import Link from "next/link";
import { getActivePricePoints } from "@/lib/data";

/** Row of price-filter chips shown on the home + price pages. */
export function PriceNav({ active }: { active?: number }) {
  const prices = getActivePricePoints();
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 28 }}>
      <Link href="/" className={`chip ${active === undefined ? "active" : ""}`}>
        All
      </Link>
      {prices.map((p) => (
        <Link
          key={p}
          href={`/price/${p}`}
          className={`chip ${active === p ? "active" : ""}`}
        >
          ${p}
        </Link>
      ))}
    </div>
  );
}
