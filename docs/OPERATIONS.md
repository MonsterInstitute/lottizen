# Lottizen — Operations Handbook

How the site runs day to day, what it depends on, and what to do when something
breaks. Written so a new owner can operate the site without the original author.
Everything here describes the system as of **2026-10-03**. Where something is
not known or not verified, it says so.

Contents:

1. [System architecture](#1-system-architecture)
2. [External services and accounts](#2-external-services-and-accounts)
3. [Environment variables and secrets](#3-environment-variables-and-secrets)
4. [Scheduled jobs](#4-scheduled-jobs)
5. [Monitoring](#5-monitoring)
6. [Runbooks](#6-runbooks)
7. [Data sources](#7-data-sources)
8. [Ownership transfer checklist](#8-ownership-transfer-checklist)

---

## 1. System architecture

```
 Public sources (agency JSON/HTML/PDF, data.ny.gov, EU result sites)
        │
        │  GitHub Actions, one workflow per source family, daily
        ▼
 scripts/scrape_*.py ──────────────► Supabase Postgres
   (keep last-good on failure)         games, prize_tiers, draws,
                                       scratch_snapshots, jackpot_snapshots …
        │
        ▼
 scripts/calculate_rankings.py   (scratch: Value Score, EV/$ — per agency)
 scripts/calculate_stats.py      (draw games: frequencies, gaps, pairs …)
        │  writes data/rankings/*.json, data/draws, data/stats
        ▼
 .github/actions/build-and-audit  ◄── DEPLOY GATE
   npm run build  +  scripts/audit_site.py
   any CRITICAL/HIGH finding fails the job → nothing below runs
        │
        ▼
 scripts/publish_site_json.py ─────► Supabase table site_json
        │                            (the generated JSON the site is built from)
        ▼
 curl $VERCEL_DEPLOY_HOOK ─────────► Vercel production build
                                       prebuild: scripts/prefetch_supabase.mjs
                                       pulls site_json → data/ → next build (SSG)
        │
        ▼
 lottizen.com  (≈2,000 statically generated pages + a few dynamic API/account routes)
        │
        └── email side-effects in the same workflows:
            send_draw_emails.py, scratch_alerts.py → Resend
```

Key properties:

- **Supabase is the source of truth.** Generated data is not committed to git
  (since 2026-07-16). A Vercel build always pulls the latest `site_json`.
- **Scrapers never wipe data.** Every scrape step runs `|| echo …` /
  `continue-on-error`, so a broken source leaves the last good data in place.
  The consequence: **a green workflow run does not mean fresh data.** Freshness
  is judged separately by the watchdog (§5).
- **The deploy gate** (`.github/actions/build-and-audit`) builds the full site
  and audits it before anything is published. Bad data blocks its own deploy.
- **Pages are static.** Vercel only serves; the only server code is the
  subscribe/auth/account/billing routes and the public `/api/v1` data API.

### Workflows

| Workflow | Role |
|---|---|
| `scratch-olg-daily.yml`, `scratch-bclc-daily.yml`, `scratch-wclc-daily.yml`, `scratch-alc-daily.yml`, `scratch-quebec-daily.yml` | One per agency: scrape → rankings (all 5 agencies) → gate → Plus scratch alerts → publish → deploy |
| `draws-daily.yml` | Canadian draw games (OLG, WCLC, PlayNow) → stats → gate → publish → deploy → draw-result emails |
| `usa-daily.yml` | US draw games from data.ny.gov → same chain |
| `europe-daily.yml` | EuroMillions / EuroJackpot / UK Lotto → same chain |
| `claim-reminders.yml` | Ticket wallet: check stored tickets against results, sync claims, send claim-deadline reminders |
| `weekly-digest.yml` | Sunday digest email |
| `freshness-watchdog.yml` | Monitoring: data freshness + deployed-site freshness, self-heal by re-dispatch |
| `ci-failure-alert.yml` | Monitoring: opens/closes an issue when any data workflow fails |
| `billing-health.yml` | Monitoring: real Stripe test-mode round trip + live config + Plus gating |
| `email-delivery-watchdog.yml` | Monitoring: did expected emails get queued |
| `seo-health.yml` | Monitoring: crawl/sitemap/structured-data checks, business metrics, weekly report commit |
| `resend-diagnose.yml` | Manual only: end-to-end Resend delivery probe |

---

## 2. External services and accounts

| Service | What it does here | Where it is managed |
|---|---|---|
| **Vercel** | Hosts and builds the site. Team `publicvision`, project `lottizen`. Production domains `lottizen.com`, `www.lottizen.com`, `lottizen.vercel.app`. Builds are triggered by the deploy hook (and by pushes to `main`). | vercel.com → publicvision → lottizen |
| **Supabase** | Postgres: all scraped data, subscribers, sessions, subscriptions, tickets, email log, published `site_json`. Schema in `supabase/migrations/` (apply with `scripts/apply_sql.py`, which uses the Management API). | supabase.com dashboard (project ref is in the `SUPABASE_URL` secret) |
| **GitHub** | Code (`MonsterInstitute/lottizen`, **public**), all scheduled jobs (Actions), monitoring issues. | github.com/MonsterInstitute/lottizen → Settings → Secrets / Actions |
| **Resend** | Transactional + bulk email. Sending domain `mail.lottizen.com` (SPF/DKIM/MX live on `send.mail.lottizen.com`; DMARC not set). From address `newsletter@mail.lottizen.com`. | resend.com → Domains / Logs |
| **Stripe** | Lottizen Plus subscriptions (monthly + annual). Checkout + Billing Portal + webhook at `https://lottizen.com/api/billing/webhook`. A second **test-mode** webhook endpoint points at the same URL for `billing-health.yml`. | dashboard.stripe.com → Products, Webhooks, Subscriptions |
| **RapidAPI** | Marketplace listing for the `/api/v1` data API. RapidAPI's proxy adds `X-RapidAPI-Proxy-Secret`; the site verifies it when `API_REQUIRE_RAPIDAPI_SECRET=true`. Listing copy and OpenAPI spec: `docs/rapidapi/`. | rapidapi.com provider dashboard |
| **Cloudflare** | DNS for `lottizen.com` and `lottizen.ca` (nameservers `noor`/`ram.ns.cloudflare.com`). | dash.cloudflare.com |
| **Registrars** | `lottizen.ca`: Namecheap, registered 2026-05-01, expires **2027-05-01**. `lottizen.com`: registrar not recorded here — check before transfer. | namecheap.com |
| **Google Search Console** | Indexing and search performance. The API integration (`GSC_SERVICE_ACCOUNT_JSON`) is **not configured yet**, so the weekly GSC numbers are blank until it is. | search.google.com/search-console |

---

## 3. Environment variables and secrets

Values are never in the repo. "Where" is where the value must be set.

### Vercel (runtime + build), Production environment

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL — build-time prefetch and server routes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access (bypasses RLS — server only) |
| `RESEND_API_KEY` | Sends magic-link / confirmation / account emails |
| `STRIPE_SECRET_KEY` | Live Stripe key for Checkout, Portal, webhook handling |
| `STRIPE_WEBHOOK_SECRET` | Verifies live webhook signatures |
| `STRIPE_WEBHOOK_SECRET_TEST` | Fallback verification for the test-mode endpoint used by billing-health |
| `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL` | The two Plus prices |
| `RAPIDAPI_PROXY_SECRET` | Expected value of RapidAPI's `X-RapidAPI-Proxy-Secret` |
| `API_REQUIRE_RAPIDAPI_SECRET` | `true` = `/api/v1` only answers RapidAPI-proxied calls |
| `NEXT_PUBLIC_SITE_URL` *(optional, unset)* | Canonical origin. Defaults to `https://lottizen.com` (`lib/site.ts`). Leave unset or set to the `.com`. |
| `RESEND_FROM_EMAIL` *(optional, unset)* | Overrides the sender address |
| `NEXT_PUBLIC_ADS_ENABLED` *(optional, unset)* | Turns ad slots on |

### GitHub Actions — repository secrets

| Name | Used by |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Every data and monitoring workflow |
| `VERCEL_DEPLOY_HOOK` | Data workflows (deploy after publish) and freshness watchdog (self-heal) |
| `RESEND_API_KEY` | Email-sending workflows, email watchdog, resend-diagnose |
| `STRIPE_SECRET_KEY` | **Live** key: billing-health live config check (read-only calls) and weekly MRR/Plus metrics. The owner chose the full key over a restricted one. |
| `STRIPE_TEST_SECRET_KEY` | billing-health test-mode subscribe/cancel round trip |
| `STRIPE_WEBHOOK_SECRET_TEST` | Present but not referenced by any workflow (the site uses its Vercel copy) |
| `GSC_SERVICE_ACCOUNT_JSON` | **Not set yet.** Service-account JSON (raw or base64) with read access to the GSC property. Enables GSC trend + metrics. |

Repository **variable** (optional): `SITE_URL` — origin the monitors check; defaults to `https://lottizen.com`.

### Local development only

`.env.local` (git-ignored): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ACCESS_TOKEN` (Management API token for `scripts/apply_sql.py`
migrations). `DEV_GEO` fakes the visitor country in `middleware.ts`.

---

## 4. Scheduled jobs

Times are the cron in UTC. **GitHub starts scheduled runs late, often by 4–7
hours** (e.g. the 10:00 UTC OLG job typically runs 14:00–17:00 UTC). Nothing
depends on exact timing; the watchdog tolerates it.

| Cron (UTC) | Workflow | What it does | If it fails |
|---|---|---|---|
| `0 10 * * *` | Scratch — OLG | Scrape OLG → rankings → gate → alerts → publish → deploy | Last-good data stays live. CI-failure issue opens; freshness watchdog re-dispatches if data goes stale (>48h). |
| `15 10 * * *` | Scratch — BCLC | same | same |
| `20 10 * * *` | Scratch — WCLC | same | same |
| `25 10 * * *` | Scratch — ALC | same | same |
| `35 10 * * *` | Scratch — Loto-Québec | same | same |
| `10 10 * * *` | Daily draw results (CA) | Scrape CA draws → stats → gate → publish → deploy → draw emails | Draw emails for that day are skipped; watchdog re-dispatches when a due draw is missing. Emails match today **or yesterday** so a late re-run still sends. |
| `30 10 * * *` | Daily US draw results | same, data.ny.gov | same |
| `0 23 * * 2,3,5,6` | Daily European draw results | same, evening of draw days | same |
| `30 11 * * *` | Claim reminders | Ticket wallet checks + claim-deadline reminders | Reminders delayed a day; CI-failure issue opens |
| `0 15 * * 0` | Weekly digest | Sunday digest to subscribers | No digest that week; email watchdog flags it Monday |
| `30 12 * * *` | Billing health | Stripe round trip, live config, Plus gating | Issue `[auto] Billing health: …` |
| `0 14 * * *` | Data freshness watchdog | Freshness of every game/agency + deployed site; re-dispatch; issues | If this itself doesn't run, nothing alerts — see §6.6 |
| `15 14 * * *` | Email delivery watchdog | Were expected draw/digest emails queued | Issue `[auto] Email delivery: …` |
| `0 13 * * 1` | SEO health watchdog | Crawl checks, business metrics, **commits the weekly report** | Report/metrics week missing — re-run manually the same week |

Every workflow also has `workflow_dispatch`, so any of them can be run from
Actions → *workflow* → **Run workflow**.

---

## 5. Monitoring

Four layers, each catching what the one before cannot.

| Layer | Watches | Mechanism | Alert |
|---|---|---|---|
| **1. Execution** | Did each data workflow finish successfully? | `ci-failure-alert.yml` fires on `workflow_run` completion — works even when the job never got a runner | Issue `[auto] CI failure: <workflow>`; a later success comments and auto-closes it |
| **2. Data freshness** | Is the newest stored draw on schedule for every game? Is every scratch agency scraped within 48h? | `audit_site.py --freshness` reads Supabase directly — never trusts exit codes | Issue `[auto] Stale data: <game> (missing <date>)` or `[auto] Stale scratch data: <AGENCY>`; workflows re-dispatched automatically; auto-close on recovery |
| **3. Deployment** | Is the live site actually rebuilding? | `check_deploy_freshness.py` compares the live sitemap's build `<lastmod>` to now (threshold 12h) | Issue `[auto] Deployment stale: live site not updating`; deploy hook pinged |
| **4. Product health** | Search visibility, billing, email | `seo_health.py` (weekly), `billing_health.py` (daily), `email_delivery_check.py` (daily) | Issues `[auto] SEO health: …`, `[auto] Billing health: …`, `[auto] Email delivery: …` |

**Weekly report.** Every Monday `seo-health.yml` writes
`reports/health-weekly.md` (current week), archives it to
`reports/weekly/<date>.md`, and appends a row to
`reports/metrics-history.csv` (subscribers, Plus, MRR, GSC). Start any
investigation there.

**Reading the issue list.**

- Title prefix `[auto]` + label `auto-monitor` = opened by a watchdog. These
  open, update (one comment per recurrence) and close themselves. An `[auto]`
  issue that **stays open for days** is the real signal.
- A closed `[auto]` issue with many comments is a recurring problem that kept
  recovering. Look at its comment timestamps.
- Issues without `[auto]` are human-filed product work.

**Known blind spots.**

- **All monitoring runs on GitHub Actions.** If Actions stops entirely (billing
  lock, org suspension), there are no alerts at all — just silence. See §6.6.
- **Email "sent" is not "delivered".** `email_log` rows are written *before*
  the send call to claim the idempotency slot. They record intent. Delivery
  can only be confirmed in Resend's logs or with `resend-diagnose.yml`.
- The GSC Page-indexing count is not available through Google's API; it is
  recorded manually (`gsc_indexed_manual` column).

---

## 6. Runbooks

### 6.1 Data stopped updating

1. Open the `[auto] Stale …` issue. It names the game/agency and the missing dates.
2. Actions → that workflow → latest run → the **Scrape** step log. A scrape
   failure is printed but does not fail the job (by design), so look at the
   log even if the run is green.
3. Open the source URL from §7 in a browser. Most breakages are upstream: a
   renamed field, a new page layout, bot protection, or the agency simply not
   publishing yet.
4. Fix the scraper, push, then **Run workflow** manually. The issue closes
   itself on the next watchdog run.

Real incidents:

- **Freshness compared UTC dates** (fixed 2026-07-11, `daf94f5`). After ~20:00
  Toronto time UTC is already tomorrow, so games looked a day late. All "today"
  logic uses `America/Toronto`.
- **Draw emails never fired** (fixed 2026-08-25, `3215f4a`). The sender
  checked "drawn today", but the CA/US workflows run the morning *after* an
  evening draw. It now accepts today or yesterday; per-day dedup keeps it from
  double-sending. When writing any date check, remember the workflow runs
  hours after the event and GitHub may start it hours late.
- **Daily Grand bonus missing for two months** (fixed 2026-08-10, `33f2408`).
  The WCLC scraper missed the Grand Number. Freshness doesn't catch
  wrong-but-present data; the audit gate and spot checks do.
- **NY Numbers stale 2026-07-11 → late September**, and **Loto-Québec scratch
  stale 2026-09-17 → 09-25** with green workflow runs both times. The fixes are
  not recorded in git. Both show why freshness is judged from the database,
  not from run status.

### 6.2 The live site isn't updating (deploy failure)

1. Vercel → Deployments. Look at the newest production deployment's state.
2. **Blocked** deployment → see *author block* below.
3. **Error** → open the build log. Common causes: Supabase unreachable in
   `prefetch_supabase.mjs`, a TypeScript error in a recent commit.
4. No new deployment at all → the deploy hook may have been deleted or
   regenerated. Create a new hook (Vercel → Settings → Git → Deploy Hooks) and
   update the `VERCEL_DEPLOY_HOOK` secret.
5. If the data workflow's **Build & audit** step failed, nothing was published
   or deployed that day. That is the gate working; read the audit output.

Real incidents:

- **Vercel author block** (2026-07, `4116cf4`). Vercel blocks production
  deployments for commits whose git author email isn't a recognised team
  member. Data commits authored as `bot@lottizen.ca` were created BLOCKED, so
  the live site silently froze between human commits. This is why layer 3
  monitoring exists. Data no longer goes through git, but `seo-health.yml`
  still commits the weekly report as `bot@lottizen.com`. If those commits show
  as Blocked in Vercel, it's harmless (report-only), but don't copy that
  author into anything that must deploy.
- **Intermittent `next/font` build failure** (2026-09-09 → 10-03, fixed
  2026-10-03). `next/font/google` fetched font CSS at build time and sometimes
  crashed with `TypeError: Cannot read properties of null (reading '1')`,
  failing the gate in a random workflow every few days. That skipped that
  run's publish, deploy and draw emails. Fonts are now self-hosted in
  `app/fonts/`; the build makes no external font requests.

### 6.3 Emails aren't arriving

Work through these in order. In August 2026 there were three separate causes at once.

1. **Is the subscriber eligible?** In Supabase `subscribers`: `confirmed_at`
   set, `unsubscribed_at` null, and they follow the game in `subscriber_games`.
   A stray `unsubscribed_at` is easy to miss.
2. **Did the sender decide to send?** Check the workflow log for the email
   step, and `email_log` for a row. A row means *attempted*, not delivered.
3. **Did Resend deliver it?** Resend dashboard → Logs, or run
   **Resend delivery diagnose** (`resend-diagnose.yml`) with the recipient. It
   sends a probe and the real template and reports the delivery status.
4. **DNS.** Resend records live on `send.mail.lottizen.com`, not
   `mail.lottizen.com`. Check the right host before concluding SPF/MX is missing.
5. Bulk mail must keep RFC 8058 `List-Unsubscribe` + `List-Unsubscribe-Post`
   headers, and the unsubscribe URL must accept POST. Without them, Gmail and
   Yahoo filter the mail even though Resend reports `delivered`.

### 6.4 Payments look wrong

1. Check the latest **Billing health** run and any `[auto] Billing health:` issue.
   It does a real test-mode subscribe → webhook → Plus → cancel → free cycle
   against production.
2. Stripe → Developers → Webhooks → the live endpoint → recent deliveries.
   Non-2xx responses are the usual cause of "paid but not Plus".
3. Supabase `subscriptions` row for the subscriber: `status`,
   `current_period_end`. Entitlement is computed from these at read time
   (`past_due` falls back to free).

Real incident: **second lifecycle event silently failed** (fixed 2026-08-25,
`a01b9ec`). The subscriptions upsert had no `on_conflict` target, so any
subscriber's second webhook (cancel, plan change) returned 409 and was
dropped. Billing health caught it on its first run.

### 6.5 Supabase: "table not found" right after a migration

**Symptom:** a new table or column returns 404 / `PGRST205` from the API even
though it exists in SQL.
**Cause:** DDL run through the Management API doesn't refresh PostgREST's
schema cache.
**Fix:** end every migration with `notify pgrst, 'reload schema';` (see
`0014_prize_claims.sql`, `0015_prize_breakdowns.sql`), or run it once in the
SQL editor.

### 6.6 Everything went quiet (GitHub Actions stopped)

**Symptom:** no workflow runs at all, no new issues, the live site's data
ages. Because every monitor runs on Actions, **you get no alert**.
**Cause seen in practice:** a GitHub account billing problem locks Actions for
the owning account or organisation. Scheduled runs don't start, and public-repo
minutes being free doesn't prevent this.
**Fix:** GitHub → Settings → Billing for the org/account that owns the repo;
resolve the payment problem. Then dispatch each data workflow once by hand
(or wait for the next day's schedule) and confirm with the freshness watchdog.
**Prevention (not built yet):** an external uptime check on
`https://lottizen.com/sitemap.xml` that alerts when its `<lastmod>` is older
than ~36h. This is the one failure mode the in-repo monitoring can't see.

### 6.7 Flaky failure that "fixes itself"

A `[auto] CI failure` issue that keeps getting reopened, or a closed one with
many comments, is a recurring cause, not bad luck. Compare the failing step
across runs: `gh run view <id> --log-failed`. That is how the `next/font`
issue (§6.2) was found.

---

## 7. Data sources

All public and unauthenticated unless noted. Each scraper's docstring has the
full field mapping and verification notes.

### Scratch tickets (remaining prizes)

| Agency | Source | Format | Fields | Weak points |
|---|---|---|---|---|
| **OLG** (Ontario) | `gateway.www.olg.ca/feeds/instant-unclaimed` | JSON via Azure API Management | per tier: total printed, unclaimed; price; name | Needs the site's public `x-client-id` header. If it rotates (401), the scraper falls back to Playwright and sniffs the new key. No odds or ticket totals. |
| **BCLC** (BC) | `playnow.com/services2/instant/prizes/bc`; launch dates from `playnow.com/resources/json/lottery/scratch-and-win/scratch-and-win-tickets.json` | JSON | per tier: total, claimed (remaining = total − claimed) | Two feeds keyed differently (game number vs URL slug); join can drift on renames |
| **WCLC** (AB/SK/MB) | `wclc.com/games/scratch-win/prizes-remaining-1.htm` | Server HTML, one table per game | release date, prize, **remaining only** (no printed total) | HTML layout change breaks it; no totals, so fewer metrics are supported (see `calculate_rankings.py`) |
| **ALC** (Atlantic) | Catalog `alc.ca/services/cfm?type=scratch…`; remaining from `alc.ca/content/alc/en/our-games/scratch-n-win/top-prizes-remaining.html` | JSON + HTML | catalog: price, odds, launch; top prizes remaining | Catalog endpoint was found by sniffing traffic, so it's undocumented and can change silently |
| **Loto-Québec** | `loteries.lotoquebec.com/fr/resultats/etat-de-reclamation-des-lots`; price/launch from GraphQL persisted queries at `loteries.assets.lotoquebec.com/api/exp/loteries` | HTML + GraphQL | per tier: total, claimed | Persisted-query hashes change on site redeploys. French-only names (slugs are ASCII-folded). Stale for 8 days in Sep 2026 with green runs. |

No Canadian agency publishes total tickets printed, so the site never shows a
"tickets remaining" number. See the honesty constraints in `CLAUDE.md`.

### Draw games (winning numbers)

| Region | Source | Notes |
|---|---|---|
| Canada (national + WCLC games) | WCLC "since inception" PDFs + month pages (`wclc.com`) | Full history back to 1982 (6/49); PDF text extraction |
| Ontario games | `gateway.www.olg.ca/feeds/winning-numbers`, `…/drawinformation` | Latest draw + next jackpot only |
| BC/49 + national cross-check | `playnow.com/services2/lotto/draw/<GAME>/<date>` | Returns HTTP 400 on non-draw dates (normal) |
| Ontario 49 / Lottario / MegaDice history | `ca.lottonumbers.com` | Third-party aggregator, backfill only |
| Prize breakdowns | PlayNow `gameBreakdown`; `wclc.com/<game>-prize-details.htm` | Pari-mutuel amounts; left blank where no source publishes them |
| USA | data.ny.gov SODA API (Powerball, Mega Millions, Cash4Life, NY Lotto, Take 5, Pick 10, Numbers, Win 4) | Official open data; updates daily. Matrix changes handled in `calculate_stats.py` |
| Europe | euro-millions.com, euro-jackpot.net, lottery.co.uk (history + cross-check); national-lottery.co.uk XML (latest) | Third-party HTML for history: most fragile group |

---

## 8. Ownership transfer checklist

- [ ] GitHub: transfer `MonsterInstitute/lottizen` (or the org); re-create all
      Actions secrets (§3). Secrets do not transfer with a repo.
- [ ] Vercel: transfer the project; re-add env vars; regenerate the deploy hook
      and update `VERCEL_DEPLOY_HOOK`; add the new owner's git email so their
      commits aren't author-blocked.
- [ ] Supabase: transfer the project (or `pg_dump` + restore and update `SUPABASE_URL`/keys everywhere).
- [ ] Stripe: subscriptions live in the Stripe account. Either hand over
      ownership of the account itself, or migrate (Stripe can copy customers
      and payment methods to another account; subscriptions are re-created
      there). Update the price IDs and webhook secrets afterwards.
- [ ] Resend: move the domain `mail.lottizen.com`, new API key.
- [ ] RapidAPI: transfer the listing; rotate `RAPIDAPI_PROXY_SECRET`.
- [ ] Domains: `lottizen.com` and `lottizen.ca` at the registrar; Cloudflare zones.
- [ ] Google Search Console: add the new owner as an owner of the property.
- [ ] Rotate every key the previous owner had access to.
