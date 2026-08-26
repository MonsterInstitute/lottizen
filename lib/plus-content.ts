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

/**
 * A row with `section: true` is a group header: the client renders it as a
 * single full-width bold cell spanning all three columns, so `free`/`plus`
 * are left empty on those rows.
 */
export const COMPARISON: { label: string; free: string; plus: string; section?: boolean }[] = [
  { label: "Before you buy", free: "", plus: "", section: true },
  { label: "Which tickets still have money left in them, all 5 provinces", free: "✓", plus: "✓" },
  { label: "Every prize tier and how many are left", free: "✓", plus: "✓" },
  { label: "How much you actually get back per $1 on this ticket", free: "—", plus: "✓" },
  { label: "How much colder this ticket is than the day it launched", free: "—", plus: "✓" },
  { label: "Got $50 to spend today? Here's how to spend it best", free: "—", plus: "✓" },
  { label: "Chasing a jackpot, or want to win something? Two different lists", free: "—", plus: "✓" },
  { label: "Someone just claimed the top prize on a ticket you follow — told instantly", free: "—", plus: "✓" },
  { label: "A new ticket just hit shelves", free: "—", plus: "✓" },
  { label: "A ticket you follow just dropped down the rankings", free: "—", plus: "✓" },
  { label: "Follow tickets in", free: "1 province", plus: "All 5 (428 tickets)" },
  { label: "Your numbers", free: "", plus: "", section: true },
  { label: "Every past draw, every number's history, all 19 games", free: "✓", plus: "✓" },
  { label: "Random numbers, same as the store terminal", free: "✓", plus: "✓" },
  {
    label:
      "Numbers picked by what's actually been drawn — hot, cold, or avoiding the dates everyone else plays",
    free: "1 free run/month",
    plus: "✓",
  },
  {
    label: "Have your numbers ever actually won? Check them against every draw on record",
    free: "1 free run/month",
    plus: "✓",
  },
  { label: "We check your numbers after every draw and tell you", free: "1 set", plus: "Unlimited" },
  { label: "Exactly which number you missed it by", free: "✓", plus: "✓" },
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
