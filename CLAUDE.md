# Lottizen — project rules

## Honesty constraints (non-negotiable)

These are product-defining, not style preferences. The entire site's credibility
rests on them, and violating one is a correctness bug, not a wording nit.

### Number strategies must never imply better odds

Any copy, UI label, tooltip, email, or schema text describing a number-selection
strategy (stats-weighted generation, hot/cold numbers, avoiding common
combinations, avoiding birthday-range numbers, backtesting) **must not state or
imply that it improves the chance of winning.** Lottery draws are independent;
no selection strategy changes the probability of any combination being drawn.

The one real, defensible benefit of avoiding popular numbers is **jackpot
dilution**: huge numbers of players pick calendar dates (1–31), so avoiding
those ranges reduces the chance of *splitting* a jackpot you win. Say that, and
only that.

- ✅ "Avoid the dates everyone else plays — so you split a jackpot with fewer people."
- ✅ "Win a bigger share."
- ❌ "Better odds", "improve your chances", "win more often", "smarter picks that win".

Backtesting output is a factual historical statement ("this combination has
matched N times in 4,417 recorded draws"), never a prediction and never a
suggestion that past results inform future ones.

### Scratch-ticket analytics describe remaining value, not odds

Value Score, EV per dollar, and launch-vs-now comparisons describe **how much
prize money is still unclaimed**, which is real and published. They do not
change the odds of any individual ticket winning. Every surface presenting them
carries that distinction — see `/methodology` and `ScratchDisclaimer`.

### Never invent a number the data can't support

No Canadian agency publishes total printed ticket counts, so a literal "N
tickets remain" is impossible and must never be shown. See the HONESTY
CONSTRAINT block in `lib/plus-analytics.ts` and the three scoring methods in
`scripts/calculate_rankings.py` — where a metric isn't supported for an agency,
say so explicitly rather than approximating.

Marketing examples must use real, current, verifiable data from the live
dataset. If the story you want to tell isn't true today, tell a different one.

## Email

Every bulk email must carry RFC 8058 one-click unsubscribe headers
(`List-Unsubscribe` + `List-Unsubscribe-Post`), pointing at a URL that accepts
POST. Gmail/Yahoo require it for bulk senders and its absence causes inbox
filtering even when delivery succeeds.

`email_log` rows are written *before* the send call to claim the idempotency
slot — they record intent, **not** delivery. Never cite them as proof an email
arrived.
