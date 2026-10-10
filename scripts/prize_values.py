"""prize_values.py — what a scratch prize tier is worth, and which tier is
the top prize. Shared by all five scratch scrapers so the two rules below
can't drift apart again.

1. Annuities ("$1,000 a week for life") are valued at the lump-sum option
   the agency itself offers winners, from the table below — one row per
   game, each with its source. Never a formula: until 2026-10-09 OLG's
   scraper valued "$1,000/WK FOR LIFE" at 20 years x 52 weeks ($1,040,000),
   a number OLG never published (its lump sum is $675,000), and Loto-
   Québec's scraper stored "1 000 $ par semaine à vie" as $1,000 (its lump
   sum is $1,000,000). Both skewed Value Score for those games.

   An annuity with no row here is NOT guessed: it's valued at 0, which the
   scoring code already treats as "unvalued, excluded from the score" (like
   OLG's experiential "PLINKO" prizes), and the scraper emits a GitHub
   Actions warning so someone adds the row.

2. The top prize is the highest-value tier, whether or not any remain.
   Until 2026-10-09 four scrapers marked "the highest tier with prizes
   left", so the flag slid down to the next tier the moment the real top
   prize ran out — which meant "top prize claimed" (a remaining count
   reaching 0 on the top tier) could never be observed.
"""
from __future__ import annotations

import re
import sys

ANNUITY_RE = re.compile(
    r"for life|à vie|a vie|/\s*wk|/\s*week|per week|a week|par semaine|/\s*yr|per year|par année|par an\b|for \d+ years|pendant \d+ ans",
    re.I,
)

# (agency, game_number) -> (lump-sum value, what the agency calls it, source)
LUMP_SUMS: dict[tuple[str, str], tuple[float, str, str]] = {
    ("OLG", "1184"): (675_000, "Instant Cash for Life: $1,000/week for life or $675,000 lump sum",
                      "https://dailyhive.com/canada/lottery-winner-suzette-lamothe"),
    ("QUEBEC", "76901"): (1_000_000, "Gagnant à vie: 1 000 $ par semaine à vie ou 1 000 000 $",
                          "https://www.ctvnews.ca/montreal/article/montreal-woman-wins-1000-a-week-for-life/"),
}


def is_annuity(label: str) -> bool:
    return bool(ANNUITY_RE.search(label or ""))


def value_tier(agency: str, game_number: str, label: str, parsed: float) -> float:
    """The tier's dollar value: `parsed` (what the scraper read off the label)
    unless the label is an annuity, in which case the agency's lump sum from
    LUMP_SUMS, or 0 with a warning if there's no row for it."""
    if not is_annuity(label):
        return parsed
    row = LUMP_SUMS.get((agency, str(game_number)))
    if row:
        return float(row[0])
    # ::warning:: surfaces as an annotation on the workflow run.
    print(f"::warning::{agency} game {game_number} has an annuity prize ({label!r}) with no lump sum in "
          f"scripts/prize_values.py LUMP_SUMS — valued at 0 (unscored) until a sourced row is added.",
          file=sys.stderr)
    print(f"  ! {agency} {game_number}: annuity {label!r} has no LUMP_SUMS row — unscored", file=sys.stderr)
    return 0.0


def finalize_tiers(agency: str, game_number: str, tiers: list[dict]) -> list[dict]:
    """Apply both rules to one game's tiers in place-ish: value annuities,
    sort by value (highest first), and flag tier 0 as the top prize."""
    for t in tiers:
        t["amount"] = value_tier(agency, game_number, t.get("label") or "", t.get("amount") or 0.0)
    tiers.sort(key=lambda t: t["amount"], reverse=True)
    for i, t in enumerate(tiers):
        t["is_top"] = i == 0
    return tiers
