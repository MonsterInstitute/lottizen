# Lottizen

**[lottizen.com](https://lottizen.com)** is an independent lottery data site
for Canada, the US and Europe:

- **Scratch-ticket value tracker** for all five Canadian lottery agencies
  (OLG, BCLC, WCLC, ALC, Loto-Québec). It ranks every active instant game by
  how much of its prize money is still unclaimed, refreshed daily from each
  agency's published remaining-prize data.
- **Draw-game results and statistics.** Winning numbers, full draw history,
  number frequencies and a number generator for the major draw games: Lotto Max,
  6/49, Daily Grand, regional games, Powerball, Mega Millions, EuroMillions,
  EuroJackpot, UK Lotto and others.
- **Accounts and Lottizen Plus** (paid, via Stripe): draw-result emails,
  scratch alerts, a ticket wallet with claim-deadline reminders, and a weekly
  digest.
- **A public data API** (`/api/v1`), listed on RapidAPI.

The site is careful about what the data can and cannot say. Remaining-prize
analytics describe **unclaimed value, not odds**. No number-selection feature
claims to improve anyone's chance of winning. No agency publishes total tickets
printed, so the site never shows an invented "tickets remaining" count. These
rules are in [`CLAUDE.md`](CLAUDE.md) and on `/methodology`.

## Data sources

All data comes from public, official or long-standing sources: each agency's
own remaining-prize feeds and pages, WCLC and OLG winning-number feeds, BCLC
PlayNow, New York State Open Data (US games), and established European results
archives. The per-source list with URLs, formats and known weak points is in
[`docs/OPERATIONS.md` §7](docs/OPERATIONS.md#7-data-sources). Lottizen is not
affiliated with any lottery operator.

## How it runs

```
public sources ──► GitHub Actions scrapers (daily, one workflow per source)
                     │
                     ▼
                Supabase Postgres  ──► rankings / statistics ──► build + audit gate
                                                                     │
                                       published JSON (site_json) ◄──┘
                                                │
                                Vercel deploy hook ──► static Next.js site (≈2,000 pages)
```

- **Next.js 14 (App Router), TypeScript, Tailwind.** Pages are statically
  generated from data pulled from Supabase at build time.
- **Python scrapers and calculators** in `scripts/`, run on schedule by
  `.github/workflows/`. A failed scrape keeps the last good data live.
- **Deploy gate.** Every data refresh builds the site and runs
  `scripts/audit_site.py` before publishing. Any critical finding blocks the deploy.
- **Self-monitoring.** Separate watchdog workflows check data freshness, the
  live deployment, billing, email delivery and SEO health. They open, update
  and close GitHub issues on their own. Those issues are titled `[auto] …` and
  labelled `auto-monitor`. Issues without that prefix are real product work.
- **Weekly report** in [`reports/health-weekly.md`](reports/health-weekly.md),
  archived per week in `reports/weekly/`. Long-run business metrics
  (subscribers, Plus, MRR, search) are in
  [`reports/metrics-history.csv`](reports/metrics-history.csv).

Day-to-day operation, accounts, secrets, schedules and incident runbooks:
**[`docs/OPERATIONS.md`](docs/OPERATIONS.md)**.

## Develop

```bash
npm install
# create .env.local with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run dev                         # prefetches published data from Supabase, then next dev
npm run build                       # production build (same prefetch runs as prebuild)
```

Data scripts (Python 3.12; `pip install -r scripts/requirements.txt`):

```bash
npm run data:draws     # Canadian draws  → stats → publish
npm run data:usa       # US draws        → stats → publish
npm run data:scratch   # OLG scratch     → rankings → publish
python scripts/audit_site.py --freshness   # what is stale right now
```

The canonical origin is `https://lottizen.com` (`lib/site.ts`). Override it
with `NEXT_PUBLIC_SITE_URL` only for staging.

## Layout

| Path | Contents |
|---|---|
| `app/` | Routes: `/[country]` hubs, `/scratch`, `/statistics`, `/generator`, `/plus`, `/dashboard`, `/api/*` |
| `components/`, `lib/` | UI and shared server logic (Supabase, Stripe, email, analytics) |
| `config/games.ts` | Every game the site knows about: matrix, schedule, sources |
| `scripts/` | Scrapers, calculators, publishers, email senders, health checks |
| `supabase/migrations/` | Database schema, in order |
| `.github/workflows/` | All scheduled jobs and monitors |
| `docs/` | Operations handbook, RapidAPI listing material |
| `reports/` | Weekly health reports and the metrics history |
