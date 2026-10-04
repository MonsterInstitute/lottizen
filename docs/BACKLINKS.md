# Backlinks — API directory submissions

Checklist for listing the Lottizen API in developer directories. Researched
2026-10-03; directories change, so re-check each before submitting.

**Facts every submission depends on**

- Docs: `https://lottizen.com/api`. OpenAPI spec: `https://lottizen.com/openapi.yaml`
  (served from `docs/rapidapi/openapi.yaml`).
- Access is through RapidAPI only. A direct call to `/api/v1/*` returns 401 while
  `API_REQUIRE_RAPIDAPI_SECRET=true`. The free Basic plan allows 25 requests/day.
  So **Auth = `X-Mashape-Key`** (RapidAPI's header) wherever a directory asks.
- HTTPS yes. CORS: `Access-Control-Allow-Origin: *` (`lib/api.ts`).
- Wording: results, statistics, remaining prizes. Never "better odds",
  "predictions" or "win more" (`CLAUDE.md`).

## Tracker

Update **Status** and **Submitted** by hand after each submission. Status is
one of `To submit` → `Submitted` → `Listed` (or `Rejected`, with the reason
in Notes). Dates are YYYY-MM-DD. When a listing goes live, put its URL in
Notes so it can be re-checked.

| # | Directory | Submit at | Materials needed | Status | Submitted | Notes |
|---|---|---|---|---|---|---|
| 1 | public-apis/public-apis | [GitHub PR](https://github.com/public-apis/public-apis) (target `master`) | One README table row (below), PR title `Add Lottizen API`, commit `Add Lottizen API to Open Data` | To submit | | Biggest reach; large backlog |
| 2 | marcelscruz/public-apis | [GitHub PR](https://github.com/marcelscruz/public-apis) (target `main`) | One README table row (below), PR title `Add Lottizen API` | To submit | | Active; automated URL check |
| 3 | publicapis.io | [publicapis.io/submit](https://publicapis.io/submit) | Name, docs URL, category, 1–2 line description, contact email | To submit | | Free listing takes 4–5 weeks; $99 for 72 h |
| 4 | APIs.io | [apis.io/add](https://apis.io/add/) | Name, email; website, docs URL; spec URL in notes | To submit | | Human-reviewed |
| 5 | APIs.guru | [apis.guru/add-api](https://apis.guru/add-api) | Spec URL `https://lottizen.com/openapi.yaml`, OpenAPI 3, "official", category `open_data` | To submit | | They poll the spec URL; keep it stable |
| 6 | Postman API Network | [postman.com](https://www.postman.com/) public workspace | Public team profile, public workspace, collection with descriptions | To submit | | Optional; its link also fits public-apis' "Call this API" column |
| 7 | APIList.fun | [apilist.fun/new](https://apilist.fun/new) | Name, URL, logo, description, official = yes, SSL = yes, auth = API key, JSON | To submit | | Footer says © 2019; may be unmaintained |

### 1. public-apis/public-apis

- Category **Open Data** (has a lottery precedent, LottoLens PH). Insert
  alphabetically between "LinkPreview" and "LottoLens PH".
- Rules: description ≤ 100 chars; no TLD or the word "API" in the name; one
  link per PR; PR title `Add Lottizen API`; commit `Add Lottizen API to Open Data`;
  squash commits; target `master`; search for duplicates first; the CI check
  must pass. Keep the PR description factual. Marketing-sounding PRs get
  rejected.
- The live README tables have 5 columns (CONTRIBUTING mentions a 6th; match
  the README).

```
| [Lottizen](https://lottizen.com/api) | Lottery draw history and stats (Canada, US, Europe) and Canadian scratch-ticket remaining prizes | `X-Mashape-Key` | Yes | Yes |
```

### 2. marcelscruz/public-apis

- Edit `README.md` only (`/db` is generated). Columns: API, Description, Auth,
  CORS. No HTTPS column; description ≤ 160 chars. Alphabetical; one API per PR;
  title `Add Lottizen API`; target `main`.

```
| [Lottizen](https://lottizen.com/api) | Lottery draw results and number statistics for Canada, US and Europe, plus Canadian scratch-ticket remaining prizes | `X-Mashape-Key` | Yes |
```

### 3–7. Forms

- **publicapis.io:** name, docs URL, category, a 1–2 line description, contact email.
- **APIs.io:** name and email required; website, docs URL, notes optional. Put
  the spec URL in notes.
- **APIs.guru:** spec URL `https://lottizen.com/openapi.yaml`, format OpenAPI 3,
  "official", category "open_data". They poll the URL, so keep it stable.
- **Postman:** public team profile + public workspace + a collection with
  descriptions. Domain verification optional.
- **APIList.fun:** name, URL, logo, description, official = yes, SSL = yes,
  auth = API key, JSON.

Suggested short description (≤ 100 chars), reusable on any form:
> Lottery draw history and stats (Canada, US, Europe) and Canadian scratch-ticket remaining prizes

## Not eligible today

| Directory | Why |
|---|---|
| freepublicapis.com | Needs at least one endpoint that works without a key |
| awesome-public-datasets | Data must be downloadable without login |
| ProgrammableWeb | Shut down (announced 2023-02-03) |
| any-api.com | Redirects to the APILayer marketplace |
| n0shake/Public-APIs | Dormant since 2024 |

The first two become possible only if a rate-limited unauthenticated endpoint
(e.g. latest results) is offered. That's a product decision.

## Other link sources

- `/press` and `/data/canada-lottery-almanac` exist to be cited. Use them when
  pitching journalists or bloggers writing about lotteries, unclaimed prizes or
  scratch tickets. `scripts/press_radar.py` emails a pitch package when a
  jackpot or an expiring unclaimed prize makes that timely.
- `/embed`: free iframe widgets (latest numbers, jackpot, a province's top 3
  scratch tickets, one number's history). The copy-paste code carries a plain
  text credit link under the iframe, which is the part that counts as a link
  from the host page; links inside an iframe are generally credited to the
  iframe's own URL, not the page embedding it.
- `scripts/outreach_radar.py` emails a daily digest of Reddit / news / HN
  threads where our data answers someone's question, with a reply draft.
