/**
 * AdSlot — a design-system placeholder for a future AdSense unit.
 * Renders an on-brand dashed frame; drop the AdSense <ins> markup (and the
 * loader script in app/layout.tsx) in later to go live. Keeping ad slots as
 * a single component means every ad on the site shares one style + one
 * place to wire up the network.
 *
 * Gated behind NEXT_PUBLIC_ADS_ENABLED — no ad network is actually
 * integrated yet, so the dashed "Ad space" frames were pure visual noise
 * for every visitor. Every call site, `slot` name, and format keeps
 * working unchanged; set NEXT_PUBLIC_ADS_ENABLED=true (Vercel env, then
 * redeploy) to bring the placeholders back with zero code changes, the
 * moment there's a real network to show instead.
 */
const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === "true";

export function AdSlot({
  slot = "in-article",
  format = "auto",
  className = "",
}: {
  slot?: string;
  format?: "auto" | "leaderboard" | "rectangle";
  className?: string;
}) {
  if (!ADS_ENABLED) return null;
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
