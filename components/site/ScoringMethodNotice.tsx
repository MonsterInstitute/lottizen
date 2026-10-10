import Link from "next/link";
import type { Province, ScoringMethod } from "@/config/scratch";

const METHOD_NAME: Record<ScoringMethod, string> = {
  retention: "Value Score",
  remaining_value_index: "Remaining Value Index (prize money left per $1 of ticket price)",
  top_prize_fraction: "share of top prizes still unclaimed",
};

/** One line naming how this board is ranked, with a link to /methodology.
 *  What each agency does or doesn't publish is explained there, not on
 *  user-facing pages. */
export function ScoringMethodNotice({ method }: { method: ScoringMethod; province?: Province }) {
  return (
    <p className="field-hint" style={{ margin: 0 }}>
      Ranked by {METHOD_NAME[method]}.{" "}
      <Link href="/methodology#by-province" style={{ color: "var(--brand-deep)" }}>
        How each province is ranked →
      </Link>
    </p>
  );
}
