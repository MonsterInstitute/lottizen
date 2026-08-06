# Pricing plans

Configure these under the listing's **Pricing** tab (Basic is required; add
Pro and Ultra as additional paid plans).

| Plan | Price | Quota | Overage | Notes |
|---|---|---|---|---|
| **Basic** | Free | 25 requests / day | — (hard limit, blocked once exceeded) | No overage allowed — set "Hard Limit" ON so requests are rejected past quota instead of billed. |
| **Pro** | $15 / month | 5,000 requests / day | Not offered (recommended) | Everyday usage — a checker app or dashboard polling a handful of games. |
| **Ultra** | $49 / month | 50,000 requests / day | Not offered (recommended) | High-volume integrations, multiple games/regions polled frequently. |

## Rationale

- **Basic free tier** exists to let developers try the API and get past
  RapidAPI's discovery/trust signals (free tier increases listing visibility
  and conversion). 25/day is enough to explore every endpoint but not enough
  to build a production integration on — that's the nudge toward Pro.
- **Pro at $15/mo, 5,000/day** (~208/hour) comfortably covers a single app
  polling all 19 games + scratch rankings hourly, with headroom.
- **Ultra at $49/mo, 50,000/day** targets integrators serving their own
  users' traffic (a checker app with many end users) rather than a single
  internal poller.
- Leave **rate limiting itself** to RapidAPI's gateway (per the brief) — do
  not add app-level throttling in the Next.js routes. RapidAPI enforces the
  daily quota per subscriber key before a request ever reaches
  lottizen.com.

## RapidAPI Pricing-tab field mapping

When creating each plan in the RapidAPI dashboard:

- **Plan name**: `Basic` / `Pro` / `Ultra`
- **Price**: `0` / `15` / `49` (monthly)
- **Quotas** → add a single rule: `Requests` — `25` / `5000` / `50000` per
  `Day`
- **Overage**: leave unchecked on Basic (hard limit). Pro/Ultra: leave
  overage off for the initial listing — simpler to reason about and matches
  the brief's flat-tier design. Revisit once there's usage data.
- **Rate limit (requests per second)**: RapidAPI also lets you cap
  burst rate independent of the daily quota — a reasonable default is `5`
  req/sec on Basic, `20` on Pro/Ultra, to smooth traffic without affecting
  normal usage.
