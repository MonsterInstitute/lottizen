/**
 * Shared plain data for /plus — deliberately NOT in the "use client"
 * PlusPricingClient.tsx: a server component (app/plus/page.tsx) importing
 * a named data export from a "use client" module crosses the RSC boundary
 * incorrectly (Next.js treats every export of a "use client" file as a
 * client reference, even plain arrays), which broke the build with
 * "Attempted to call map() from the server but map is on the client."
 * Both the server page (for FAQPage JSON-LD) and the client component (for
 * the rendered comparison table) import from here instead.
 */
export const COMPARISON: { label: string; free: string; plus: string }[] = [
  { label: "Value Score rankings, all 5 provinces", free: "✓", plus: "✓" },
  { label: "Full prize-tier detail & remaining counts", free: "✓", plus: "✓" },
  { label: "“Top prize claimed” alerts for tickets you follow", free: "—", plus: "✓" },
  { label: "New-ticket-launch alerts", free: "—", plus: "✓" },
  { label: "Ranking-drop alerts for tickets you follow", free: "—", plus: "✓" },
  { label: "Estimated remaining tickets & real EV per dollar", free: "—", plus: "✓" },
  { label: "Budget optimizer", free: "—", plus: "✓" },
  { label: "Goal-mode rankings (Best Overall / Jackpot Hunt / Mid Prize / Breakeven)", free: "—", plus: "✓" },
  { label: "Launch-vs-now odds comparison", free: "—", plus: "✓" },
  { label: "Follow scratch tickets", free: "Home province", plus: "All 5 provinces (428 games)" },
  { label: "Saved number combinations, all 19 draw games", free: "1", plus: "Unlimited" },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Does Lottizen Plus improve my odds of winning?",
    a: "No. Every ticket is still a game of chance and the house edge is unchanged. Plus tells you which tickets still have more remaining prize value on the table — it does not predict numbers, and it cannot improve your odds of winning.",
  },
  {
    q: "How does the 7-day trial work?",
    a: "You start the trial with a card on file. If you don't cancel before day 7, it converts automatically into a paid subscription at the plan you chose. Cancel any time from your account page — including during the trial, at no charge.",
  },
  {
    q: "What happens if I cancel?",
    a: "You keep Plus access until the end of your current billing period, then drop to Free automatically. No partial-period access is removed early.",
  },
  {
    q: "Can I switch between monthly and annual?",
    a: "Yes, any time, from the billing portal on your account page.",
  },
  {
    q: "Do you offer refunds?",
    a: "Yes — full refund within 7 days of any charge. See our refund policy for details.",
  },
];
