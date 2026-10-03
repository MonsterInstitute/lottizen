# Lottizen Data API — RapidAPI listing copy

This copy is pasted into RapidAPI's dashboard by hand, and nothing there is
recomputed. So it **states no counts that change** (number of games, scratch
tickets): those go stale silently. "40+ years" stays because it is a lower
bound that only becomes more true. The live counts are on
https://lottizen.com/api, which computes them at build time.

## Short description (RapidAPI "Short Description" field, ~200 chars)

> Canada, US & Europe lottery data: winning numbers, 40+ years of draw
> history, number stats, and remaining prizes for every scratch ticket listed
> by all 5 Canadian lottery agencies. Updated daily.

(195 characters)

Alternate, slightly punchier version if the field allows more:

> Lottery data API for Canada, the US and Europe: winning numbers, 40+ years
> of draw history, number statistics, and Canada's only scratch-ticket
> remaining-prize tracker covering every game listed by all 5 provincial
> lottery agencies. Rebuilt daily.

---

## Long description (RapidAPI "Description" / overview tab, Markdown supported)

```markdown
# Lottizen Data API

A REST/JSON API for North American and European lottery data — built on the
same pipeline that powers [lottizen.com](https://lottizen.com), rebuilt
daily. Scratch data comes from each lottery agency's own published
remaining-prize data; draw results come from the operators' result feeds,
with some older draw history taken from established results archives.

## What makes this different

**Canada, done properly.** Most lottery APIs cover the US and stop there, or
list Canadian games as an afterthought with stale data. Lottizen tracks every
major national and regional Canadian draw game — Lotto Max, Lotto 6/49,
Daily Grand, Ontario 49, Lottario, MegaDice, Western Max, Western 6/49,
BC/49 — alongside Powerball, Mega Millions, EuroMillions, EuroJackpot, UK
Lotto and more, across three regions. The current game list is always at
`GET /v1/games`.

**40+ years of draw history.** Lotto 6/49 results go back to 1982. That
depth powers real statistical analysis, not just "last week's numbers."

**Number statistics that go beyond frequency counts.** Every draw game
exposes hot/cold classification, current and maximum gap ("how overdue is
this number"), the most common partner numbers for any given ball, and
aggregate breakdowns (odd/even split, high/low split, sum distribution,
consecutive-number rate).

**The only remaining-prize tracker covering all 5 Canadian provinces.** Every
scratch/instant-win game the agencies currently list, across Ontario (OLG), British Columbia (BCLC),
Western Canada (WCLC — Alberta/Saskatchewan/Manitoba), Atlantic Canada (ALC —
New Brunswick/Nova Scotia/PEI/Newfoundland & Labrador), and Quebec
(Loto-Québec), each ranked by a transparent Value Score with the full
prize-tier breakdown — how many of each prize were printed, and how many are
still unclaimed. No other lottery data API tracks this in even one province,
let alone five. Not every agency publishes the same underlying data, so 3
different scoring methods apply depending on province — every response says
which one. See the methodology at lottizen.com/methodology.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/v1/games` | List all live games (country, agency, rules, draw days) |
| GET | `/v1/games/{slug}` | Single game details |
| GET | `/v1/games/{slug}/latest` | Most recent draw + next draw date |
| GET | `/v1/games/{slug}/draws` | Draw history, paginated, date-filterable |
| GET | `/v1/games/{slug}/statistics` | Frequency, hot/cold, overdue, pairs |
| GET | `/v1/scratch/{province}` | Scratch tickets for one of 5 provinces, ranked by remaining value |
| GET | `/v1/scratch/{province}/{slug}` | Single scratch ticket's full prize breakdown |
| GET | `/v1/scratch/ontario` | Alias of `/v1/scratch/{province}` for province=ontario (back-compat) |
| GET | `/v1/scratch/ontario/{slug}` | Alias of `/v1/scratch/{province}/{slug}` for province=ontario |

Full endpoint docs with live examples: https://lottizen.com/api

## Data freshness

Every dataset is rescraped and rebuilt daily. Responses are cached for one
hour at the edge, so you're always within an hour of the latest published
data.

## Coverage

- 🇨🇦 **Canada** — national draw games + scratch tickets from OLG, BCLC, WCLC, ALC, Loto-Québec (all 5 provincial agencies)
- 🇺🇸 **United States** — multi-state (Powerball, Mega Millions) + New York
- 🇪🇺 **Europe** — EuroMillions, EuroJackpot, UK Lotto

## Who this is for

Lottery-checker apps, statistics dashboards, number-generator tools, and
anyone building on top of verified, daily-refreshed lottery data instead of
scraping it themselves.
```
