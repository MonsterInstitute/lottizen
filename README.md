# Lottizen — Smarter Scratch. Better Odds.

Independent value rankings for Ontario scratch (instant) tickets. Lottizen
reads OLG's public remaining-prize data, computes a **Value Score** for every
game, and tells you which scratch ticket is worth buying right now.

Built with **Next.js 14 (App Router) + TypeScript + Tailwind + shadcn-ready
tokens**. Every page is statically generated (SSG) from build-time data for SEO.
The visual system (colors, fonts, brutalist offset-shadow cards, the "After
Hours" dark mode, the interactive scratch-ticket hero) is ported 1:1 from the
original Lottizen v5 design.

## Data pipeline

```
scripts/scrape_olg.py       # OLG instant games -> data/lottizen.db (SQLite)
scripts/calculate_rankings.py  # value score -> data/rankings.json
```

- **scrape_olg.py** — probes OLG for a public JSON feed; falls back to a
  Playwright render of `/en/winners/unclaimed-instant-prizes.html` (the data is
  Vue-rendered behind Akamai) and sniffs the XHR. `--sample` seeds a clearly
  flagged demo dataset so the build always has data.
- **calculate_rankings.py** — computes the Value Score (see `/methodology`) and
  writes `data/rankings.json`, which the Next.js build reads at compile time.

```bash
npm run data:refresh   # scrape + rank
npm run data:scrape -- --sample   # reseed demo data
```

Live scraping needs Playwright:

```bash
pip install -r scripts/requirements.txt
python -m playwright install chromium
python scripts/scrape_olg.py --live
```

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to ./out
```

## Routes

| Route              | Description                                     |
| ------------------ | ----------------------------------------------- |
| `/`                | Today's full value ranking + scratch-ticket hero |
| `/scratch/[slug]`  | Per-game detail: prize breakdown, odds, score    |
| `/price/[price]`   | Games filtered by ticket price ($1–$50)          |
| `/methodology`     | How the Value Score is computed                  |
| `/responsible-play`| PlaySmart / ConnexOntario / self-exclusion       |

SEO: per-page `metadata`, `sitemap.xml`, `robots.txt`, and JSON-LD
(Organization, ItemList, Product, BreadcrumbList, FAQPage).

## Automation

`.github/workflows/daily.yml` runs ~6 AM ET: scrape → recompute → commit
`data/rankings.json` → push. Vercel's Git integration redeploys on push (or set
a `VERCEL_DEPLOY_HOOK` secret to trigger explicitly). If a scrape fails, the
last-good committed data is kept.

## Notes

- `output: "export"` — fully static; deploy the `out/` directory anywhere.
- Set `NEXT_PUBLIC_SITE_URL` for canonical/OG/sitemap URLs (default
  `https://lottizen.ca`).
- Ad slots are on-brand placeholders (`components/site/AdSlot.tsx`); drop in
  AdSense markup + loader when ready.
- Independent tool, **not affiliated with OLG**. 19+. Entertainment only.
