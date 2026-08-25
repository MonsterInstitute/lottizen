import { getRankings } from "@/lib/data";
import type { Province } from "@/config/scratch";
import { humanDateTime } from "@/lib/format";

/**
 * Honesty banner. When a province's rankings are seeded sample data we say
 * so plainly — we never present demo numbers as live agency figures. Once
 * the scraper runs in CI (source: "{agency}-live") this renders the
 * last-updated timestamp instead.
 */
export function DemoNotice({ province }: { province: Province }) {
  const { source, generatedAt, agency } = getRankings(province);
  if (source === "sample") {
    return (
      <div className="notice">
        <span className="notice-tag">Demo data</span>
        <span>
          These rankings use <strong>illustrative sample figures</strong>, not
          live {agency} data. The daily scraper replaces them with real remaining-prize
          numbers once deployed.
        </span>
      </div>
    );
  }
  return (
    <div className="notice">
      <span className="notice-tag">Live · {agency}</span>
      <span>
        Updated <strong>{humanDateTime(generatedAt)}</strong> from {agency}&rsquo;s
        public unclaimed-prize data. Figures change as prizes are claimed —
        always confirm with the official lottery operator before buying.
      </span>
    </div>
  );
}
