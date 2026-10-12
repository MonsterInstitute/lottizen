# Lottizen Health — Weekly Report

Generated 2026-10-12T21:30:16.888567+00:00

## Data freshness

✅ All draw games and all 5 scratch agencies are current.


## Deployment

✅ OK — live sitemap last rebuilt `2026-10-12T20:00:58+00:00` (-0.0h ago, threshold 12.0h)

## SEO health

❌ problem — 7 problem(s) this run

- Sitemap: 811 URLs, 115 distinct lastmod dates, 20/20 sampled URLs live
- Link graph: 2429 pages, 2228 reached from home, 197 orphan(s), 6 broken internal link(s), deepest reached 4 clicks
- Structured data: 57 JSON-LD blocks checked, 0 error(s)
- Meta descriptions: 2425 pages, 79 under 120 chars, 3 duplicated
- GSC: not integrated yet — skipped, no impact on the other checks

**Problems:**
- orphaned indexable pages found
- broken internal links found
- meta descriptions under 120 chars in game/overview
- duplicate meta descriptions in game/overview
- meta descriptions under 120 chars in other
- meta descriptions under 120 chars in plus
- meta descriptions under 120 chars in static

## Billing

Dormant: Lottizen Plus was retired on 2026-10-09 and every feature is free. The Stripe code and billing-health.yml are kept for a future paid plan.

## Email delivery

✅ OK — 0 problem(s) on 2026-10-11

- Draw-result: 3 game(s) with real drawn+followed activity checked, 0 missing
- Weekly digest: not checked today (only runs the Monday after a Sunday digest)
- Yesterday's email_log outcomes: {'sent': 3}; skip reasons {}
- Delivery (per Resend) of 3 sent: {'delivered': 3}, 0 unknown to Resend
- Delivered to subscribers in the last 3 days (per Resend): 10

## Business metrics

Last 12 weeks from `reports/metrics-history.csv` (full, append-only history there). "—" = not measured that week, never zero.

| Week | Subscribers | Plus (Stripe) | MRR | GSC pages w/ impr. 28d | GSC impr. 28d | GSC clicks 28d | Sitemap URLs | IndexNow URLs 7d | Bing indexed | Indexed (manual) | API subs (manual) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-03 | 4 | 0 | 0.00 | — | — | — | 551 | 551 | 420 | 61 | — |
| 2026-10-05 | 4 | 0 | 0.00 | — | — | — | 552 | 680 | 443 | — | — |
| 2026-10-12 | 4 | 0 | 0.00 | — | — | — | 811 | 2007 | 672 | — | — |

## Watching: number-page content similarity

907 number-detail pages score 76–86% textually similar within the same game once digits are masked (same sentence template, different stats) — flagged 2026-08-25 alongside the homepage geo-redirect fix as a possible contributor to low indexing, but left unchanged: the redirect was the much stronger suspect (Googlebot never saw real homepage content at all), and fixing content templating is expensive to redo if it turns out not to be the bottleneck.

**Plan**: watch the GSC "distinct pages with impressions" trend above for 2–3 weeks post-fix. If indexing recovers, this was never a content-quality problem. If it plateaus well below 2000 once the redirect fix has had time to take effect, revisit consolidating or diversifying the number-page template.
