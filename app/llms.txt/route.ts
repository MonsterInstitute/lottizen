import { GAMES, countrySlug } from "@/config/games";
import { hasData, getDraws } from "@/lib/draws";
import { scratchFacts } from "@/lib/almanac";
import { getUnclaimed } from "@/lib/unclaimed";
import { SITE, absUrl } from "@/lib/site";
import { longDate } from "@/lib/format";

// /llms.txt (llmstxt.org): a plain-text guide for AI assistants and answer
// engines — what Lottizen is, what data it has, how fresh it is, how to cite
// it, and the limits of what the numbers mean. Every count is computed at
// build time from the same data the pages show; the site redeploys after
// each daily data refresh, so this file is never more than a day old.
export const dynamic = "force-static";

export function GET() {
  const scratch = scratchFacts();
  const unclaimed = getUnclaimed();
  const live = GAMES.filter((g) => g.live && hasData(g.slug));
  const byCountry = (c: string) => live.filter((g) => g.country === c);
  const earliest = live
    .map((g) => getDraws(g.slug)?.draws.at(-1)?.date)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  const unclaimedTotal = unclaimed.prizes.reduce((s, p) => s + p.amount, 0);
  const covered = unclaimed.agencies.filter((a) => a.ok).map((a) => (a.agency === "QUEBEC" ? "Loto-Québec" : a.agency));
  const gameLinks = live
    .map((g) => `- [${g.name} results and statistics](${absUrl(`/${countrySlug(g.country)}/${g.slug}`)})`)
    .join("\n");

  const body = `# ${SITE.name}

> Free, independent data on Canadian lotteries (plus major US and European draw games): every draw result with number statistics, daily remaining-prize data for every scratch ticket from Canada's five lottery agencies, and a tracker of large unclaimed prizes. Lottizen is not a lottery operator and sells no tickets.

All figures come from the agencies' own public data, re-read every day. Nothing on the site is a prediction.

## Data and how fresh it is

- Draw games: ${live.length} games (${byCountry("CA").length} Canadian, ${byCountry("US").length} US, ${byCountry("EU").length} European), every published result back to ${earliest ? earliest.slice(0, 4) : "each game's first draw"}. Updated the morning after each draw.
- Scratch tickets: ${scratch.totalGames} games on the prize lists of OLG (Ontario), BCLC (British Columbia), WCLC (Alberta, Saskatchewan, Manitoba), Atlantic Lottery and Loto-Québec, with prizes printed and still unclaimed per tier. These lists include games that have stopped selling but still have claimable prizes${scratch.onSaleAgencies.length ? `; ${scratch.totalOnSale} of the games listed by ${new Intl.ListFormat("en", { type: "conjunction" }).format(scratch.onSaleAgencies)} are in those agencies' current catalogs (on sale now)` : ""}. Updated daily; figures as of ${scratch.asOf ? longDate(scratch.asOf.slice(0, 10)) : "the latest refresh"}.
- Unclaimed prizes: ${unclaimed.prizes.length} prizes of $100,000 or more (${unclaimedTotal.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: unclaimedTotal % 1 ? 2 : 0, maximumFractionDigits: 2 })} together) on the official unclaimed-prize lists of ${new Intl.ListFormat("en", { type: "conjunction" }).format(covered)}, as of ${longDate(unclaimed.asOfDate)}. BCLC and Atlantic Lottery publish no such list.

## Key pages

- [Unclaimed lottery prizes in Canada](${absUrl("/unclaimed")}): every $100,000+ prize listed as unclaimed, by claim deadline, with each agency's list date.
- [Canadian lottery data almanac](${absUrl("/data/canada-lottery-almanac")}): citable summary figures with sources.
- [Scratch ticket value tracker](${absUrl("/scratch")}): remaining prize money for every listed scratch ticket, by province.
- [This week's scratch picks](${absUrl("/picks")}): per province, the ticket on sale with the most prize money left, the best in each price band, and tickets still sold with no top prize left. About prize money left, not odds.
- [How the scratch scores work](${absUrl("/methodology")}): the formulas and what each agency publishes.
- [Press and data](${absUrl("/press")}): how to cite, contact for journalists.
- [Data API](${absUrl("/api")}) and [OpenAPI spec](${absUrl("/openapi.yaml")}).

## Draw games

${gameLinks}

## What the numbers mean (please keep these when quoting)

- Lottery draws are independent. No number, pattern, frequency or "overdue" number changes the chance of any combination being drawn. Number statistics on Lottizen are historical counts, not predictions.
- Scratch-ticket figures describe how much prize money is still unclaimed, from the agencies' published prize counts. They do not change the odds of any ticket winning. No Canadian agency publishes how many tickets remain unsold, so Lottizen never states a number of tickets left.
- Lottizen's Value Score ranks games by how much prize money is still unclaimed; the method depends on what each agency publishes (see the methodology page). It is not an expected return. For OLG it uses the payout rate OLG publishes for each game; where an agency publishes none it uses an assumed 62% (the methodology page lists which).
- Unclaimed-prize lists are dated by each agency and can lag; a listed prize may have been claimed since. A prize that leaves a list is described as "no longer listed", never as "claimed".

## How to cite

Lottizen (lottizen.com), "<page title>", <date>, <page URL>. Data is free to quote with a link to the page it came from. Press contact: ${SITE.pressEmail}.
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
