import Link from "next/link";
import { provinceConfig, type Province, type ScoringMethod } from "@/config/scratch";

const COPY: Record<Exclude<ScoringMethod, "retention">, { tag: string; text: string }> = {
  remaining_value_index: {
    tag: "Different methodology",
    text:
      "This agency never publishes how many prizes a ticket printed with — only how many are still unclaimed. " +
      "So instead of the usual Value Score, these rankings use a Remaining Value Index (remaining prize $ per $1 of ticket price), " +
      "which is NOT comparable to other provinces' scores.",
  },
  top_prize_fraction: {
    tag: "Different methodology",
    text:
      "This agency only discloses counts for each game's own top prize tier, not the full prize table. " +
      "So these rankings use Top Prize Remaining % instead of the usual Value Score — how much of the headline prize is left, not the whole game.",
  },
};

/** Sits at the top of a province's ranking board and individual ticket
 * pages when that province's scoring method differs from the standard
 * retention formula (WCLC, ALC) — explains why in place, with a link to
 * the full breakdown on /methodology. Always shows the data-completeness
 * badge, even for full-data provinces, so the difference across provinces
 * is visible at a glance. */
export function ScoringMethodNotice({ method, province }: { method: ScoringMethod; province: Province }) {
  const cfg = provinceConfig(province);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="chip" style={{ display: "inline-flex", width: "fit-content" }}>
        {cfg.completenessBadge}
      </span>
      {method !== "retention" ? (
        <div className="notice">
          <span className="notice-tag">{COPY[method].tag}</span>
          <span>
            {COPY[method].text}{" "}
            <Link href="/methodology#scoring-methods" style={{ color: "var(--brand-deep)" }}>
              See how each province is scored
            </Link>
            .
          </span>
        </div>
      ) : null}
    </div>
  );
}
