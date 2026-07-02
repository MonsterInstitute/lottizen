import { score } from "@/lib/format";

/**
 * Value Score badge. `hot` (top ranks) gets the filled orange treatment.
 */
export function ScoreBadge({
  value,
  hot = false,
  className = "",
}: {
  value: number;
  hot?: boolean;
  className?: string;
}) {
  return (
    <div className={`score-badge ${hot ? "hot" : ""} ${className}`}>
      <span className="score-val">{score(value)}</span>
      <span className="score-cap">Value</span>
    </div>
  );
}
