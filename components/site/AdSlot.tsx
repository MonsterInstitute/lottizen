/**
 * AdSlot — a design-system placeholder for a future AdSense unit.
 * Renders an on-brand dashed frame now; drop the AdSense <ins> markup (and
 * the loader script in app/layout.tsx) in later to go live. Keeping ad slots
 * as a single component means every ad on the site shares one style + one
 * place to wire up the network.
 */
export function AdSlot({
  slot = "in-article",
  format = "auto",
  className = "",
}: {
  slot?: string;
  format?: "auto" | "leaderboard" | "rectangle";
  className?: string;
}) {
  return (
    <div
      className={`ad-slot ${format === "leaderboard" ? "leaderboard" : ""} ${className}`}
      data-ad-slot={slot}
      aria-hidden="true"
    >
      <span className="ad-tag">Advertisement</span>
      <span>Ad space · {slot}</span>
    </div>
  );
}
