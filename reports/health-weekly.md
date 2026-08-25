# Lottizen Health — Weekly Report

Generated 2026-08-25T16:14:32.928729+00:00

## Data freshness

⚠️ 1 draw game(s) behind schedule:

- **Numbers** — latest `2026-07-11`, due `2026-08-24` (45d late)

## Deployment

⚠️ Could not check: HTTPError: HTTP Error 404: Not Found

## SEO health

✅ OK — 0 problem(s) this run

- Sitemap: 2019 URLs, 236 distinct lastmod dates, 20/20 sampled URLs live
- Link graph: 2020 pages, 2016 reached from home, 0 orphan(s), 0 broken internal link(s), deepest reached 5 clicks
- Structured data: 78 JSON-LD blocks checked, 0 error(s)
- GSC: not configured yet (see setup notes in the repo)

## Billing & Plus feature health

✅ OK — 0 problem(s) on 2026-08-25

- Test-mode subscribe → webhook → plus → cancel → free: upgrade ✅ OK, downgrade ✅ OK
- Live product/price/webhook health: skipped (no restricted live key configured)
- Plus feature gating (budget optimizer, goal ranking, cross-province follow limit): ✅ OK

## Watching: number-page content similarity

907 number-detail pages score 76–86% textually similar within the same game once digits are masked (same sentence template, different stats) — flagged 2026-08-25 alongside the homepage geo-redirect fix as a possible contributor to low indexing, but left unchanged: the redirect was the much stronger suspect (Googlebot never saw real homepage content at all), and fixing content templating is expensive to redo if it turns out not to be the bottleneck.

**Plan**: watch the GSC "distinct pages with impressions" trend above for 2–3 weeks post-fix. If indexing recovers, this was never a content-quality problem. If it plateaus well below 2000 once the redirect fix has had time to take effect, revisit consolidating or diversifying the number-page template.
