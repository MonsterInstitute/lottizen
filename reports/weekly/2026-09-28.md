# Lottizen Health — Weekly Report

Generated 2026-09-28T19:55:58.714063+00:00

## Data freshness

✅ All draw games and all 5 scratch agencies are current.


## Deployment

✅ OK — live sitemap last rebuilt `2026-09-28T18:11:52+00:00` (0.0h ago, threshold 12.0h)

## SEO health

✅ OK — 0 problem(s) this run

- Sitemap: 2022 URLs, 282 distinct lastmod dates, 20/20 sampled URLs live
- Link graph: 2023 pages, 2019 reached from home, 0 orphan(s), 0 broken internal link(s), deepest reached 5 clicks
- Structured data: 77 JSON-LD blocks checked, 0 error(s)
- GSC: not integrated yet — skipped, no impact on the other checks

## Billing & Plus feature health

✅ OK — 0 problem(s) on 2026-09-28

- Test-mode subscribe → webhook → plus → cancel → free: upgrade ✅ OK, downgrade ✅ OK
- Live product/price/webhook health: ✅ OK
- Plus feature gating (budget optimizer, goal ranking, cross-province follow limit): ✅ OK

## Email delivery

✅ OK — 0 problem(s) on 2026-09-27

- Draw-result: 3 game(s) with real drawn+followed activity checked, 0 missing
- Weekly digest: not checked today (only runs the Monday after a Sunday digest)
- Any send in the last 3 days: ✅ OK

## Watching: number-page content similarity

907 number-detail pages score 76–86% textually similar within the same game once digits are masked (same sentence template, different stats) — flagged 2026-08-25 alongside the homepage geo-redirect fix as a possible contributor to low indexing, but left unchanged: the redirect was the much stronger suspect (Googlebot never saw real homepage content at all), and fixing content templating is expensive to redo if it turns out not to be the bottleneck.

**Plan**: watch the GSC "distinct pages with impressions" trend above for 2–3 weeks post-fix. If indexing recovers, this was never a content-quality problem. If it plateaus well below 2000 once the redirect fix has had time to take effect, revisit consolidating or diversifying the number-page template.
