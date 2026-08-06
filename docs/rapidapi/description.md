# Lottizen Data API — RapidAPI listing copy

## Short description (RapidAPI "Short Description" field, ~200 chars)

> Canada, US & Europe lottery data — winning numbers, 40+ years of draw
> history, hot/cold number stats, and the only Ontario scratch-ticket
> remaining-prize tracker. Updated daily.

(193 characters)

Alternate, slightly punchier version if the field allows more:

> Lottery data API for Canada, the US and Europe: winning numbers, 40+ years
> of draw history, number statistics, and Canada's only scratch-ticket
> remaining-prize tracker. Rebuilt daily from official sources.

---

## Long description (RapidAPI "Description" / overview tab, Markdown supported)

```markdown
# Lottizen Data API

A REST/JSON API for North American and European lottery data — built on the
same pipeline that powers [lottizen.com](https://lottizen.com), rebuilt
daily from official lottery-operator sources.

## What makes this different

**Canada, done properly.** Most lottery APIs cover the US and stop there, or
list Canadian games as an afterthought with stale data. Lottizen tracks every
major national and regional Canadian draw game — Lotto Max, Lotto 6/49,
Daily Grand, Ontario 49, Lottario, MegaDice, Western Max, Western 6/49,
BC/49 — alongside Powerball, Mega Millions, EuroMillions, EuroJackpot, UK
Lotto and more. 19 live games across three regions today, with **Japan
coverage coming soon.**

**40+ years of draw history.** Lotto 6/49 results go back to 1982. That
depth powers real statistical analysis, not just "last week's numbers."

**Number statistics that go beyond frequency counts.** Every draw game
exposes hot/cold classification, current and maximum gap ("how overdue is
this number"), the most common partner numbers for any given ball, and
aggregate breakdowns (odd/even split, high/low split, sum distribution,
consecutive-number rate).

**The only remaining-prize tracker for Ontario scratch tickets.** Every
current OLG instant-win game, ranked by a transparent Value Score, with the
full prize-tier breakdown — how many of each prize were printed, and how
many are still unclaimed. No other lottery data API tracks this. See the
methodology at lottizen.com/methodology.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/v1/games` | List all live games (country, agency, rules, draw days) |
| GET | `/v1/games/{slug}` | Single game details |
| GET | `/v1/games/{slug}/latest` | Most recent draw + next draw date |
| GET | `/v1/games/{slug}/draws` | Draw history, paginated, date-filterable |
| GET | `/v1/games/{slug}/statistics` | Frequency, hot/cold, overdue, pairs |
| GET | `/v1/scratch/ontario` | Ontario scratch tickets ranked by remaining value |
| GET | `/v1/scratch/ontario/{slug}` | Single scratch ticket's full prize breakdown |

Full endpoint docs with live examples: https://lottizen.com/api

## Data freshness

Every dataset is rescraped and rebuilt daily. Responses are cached for one
hour at the edge, so you're always within an hour of the latest published
data.

## Coverage

- 🇨🇦 **Canada** — national games + OLG, WCLC, BCLC, ALC
- 🇺🇸 **United States** — multi-state (Powerball, Mega Millions) + New York
- 🇪🇺 **Europe** — EuroMillions, EuroJackpot, UK Lotto
- 🇯🇵 **Japan** — coming soon

## Who this is for

Lottery-checker apps, statistics dashboards, number-generator tools, and
anyone building on top of verified, daily-refreshed lottery data instead of
scraping it themselves.
```
