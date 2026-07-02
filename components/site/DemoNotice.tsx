import { getRankings } from "@/lib/data";
import { humanDateTime } from "@/lib/format";

/**
 * Honesty banner. When rankings.json is seeded sample data we say so plainly —
 * we never present demo numbers as live OLG figures. Once the scraper runs in
 * CI (source: "olg-live") this renders the last-updated timestamp instead.
 */
export function DemoNotice() {
  const { source, generatedAt } = getRankings();
  if (source === "sample") {
    return (
      <div className="notice" style={{ marginTop: 28 }}>
        <span className="notice-tag">Demo data</span>
        <span>
          These rankings use <strong>illustrative sample figures</strong>, not
          live OLG data. The daily scraper replaces them with real remaining-prize
          numbers from olg.ca once deployed.
        </span>
      </div>
    );
  }
  return (
    <div className="notice" style={{ marginTop: 28 }}>
      <span className="notice-tag">Live · OLG</span>
      <span>
        Updated <strong>{humanDateTime(generatedAt)}</strong> from OLG&rsquo;s
        public unclaimed-prize data. Figures change as prizes are claimed —
        always confirm on olg.ca before buying.
      </span>
    </div>
  );
}
