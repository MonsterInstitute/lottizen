#!/usr/bin/env python3
"""
scrape_wclc_scratch.py — WCLC (Western Canada: Alberta, Saskatchewan,
Manitoba) scratch/instant games.

REAL DATA SOURCE (verified 2026-08, fetched and parsed directly):
  https://www.wclc.com/games/scratch-win/prizes-remaining-1.htm
  Plain server-rendered HTML (no auth, no pagination — one page, confirmed
  by checking for a "-2.htm" variant, which 404s). 109 `<table class=
  "dataTable">` elements, one per active game, e.g.:

    <table class="dataTable" summary="$1 Christmas Colours - 21400">
      <caption>$1 Christmas Colours - 21400</caption>
      <tr><th>Release Date</th><th>Prizes</th><th>Prizes Remaining</th></tr>
      <tr><td>Oct 7/24</td><td>$100</td><td>31</td></tr>
      <tr><td></td><td>$1,000</td><td>0</td></tr>
      <tr><td></td><td>$10,000</td><td>0</td></tr>
    </table>

  Caption format "$<price> <name> - <game_number>[ *]" parses cleanly for
  all 109/109 games observed (regex verified against the full set). A
  trailing " *"/"*" appears on a handful of captions (e.g. "$50 Extreme -
  61003 *") with no discoverable legend/footnote anywhere on the page —
  treated as a decorative artifact of WCLC's own site and stripped.

  CRITICAL DATA-COMPLETENESS LIMIT (confirmed by this fetch, matches the
  phase-1 research finding): WCLC publishes ONLY a "Prizes Remaining"
  count per tier, for tiers >= $100. There is no "total printed" column
  anywhere on this page, and WCLC does not publish printed totals via any
  public feed — so remaining/total retention (the OLG/BCLC/Loto-Québec
  formula) is IMPOSSIBLE here. Per the approved plan, `total` is stored as
  the literal sentinel 0 (never a real prize count) rather than mirroring
  `remaining` — mirroring would silently read as "100% retention" to any
  code that forgets to special-case this agency, which is more dangerous
  than an obviously-fake 0. calculate_rankings.py MUST branch on
  agency == "WCLC" and use the Remaining Value Index formula (remaining
  count x amount / price, summed over the disclosed >=$100 tiers) instead
  of a retention ratio — see that script for the implementation.

Usage:
  python3 scripts/scrape_wclc_scratch.py            # live, silent fallback (exit 0) on failure
  python3 scripts/scrape_wclc_scratch.py --live      # live only, non-zero exit on failure
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402

try:
    from bs4 import BeautifulSoup
except ImportError as e:  # pragma: no cover
    raise RuntimeError('beautifulsoup4 not installed. Run: pip install beautifulsoup4') from e

AGENCY = "WCLC"
PROVINCE = "western"

REMAINING_URL = "https://www.wclc.com/games/scratch-win/prizes-remaining-1.htm"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

CAPTION_RE = re.compile(r"^\$([\d,]+(?:\.\d+)?)\s+(.+?)\s*-\s*(\d+)\s*\*?\s*$")


def parse_amount(label: str) -> float:
    m = re.search(r"\$([\d,]+(?:\.\d+)?)", label)
    return float(m.group(1).replace(",", "")) if m else 0.0


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def parse_games(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    games = []
    for table in soup.find_all("table", class_="dataTable"):
        cap_el = table.find("caption")
        if not cap_el:
            continue
        m = CAPTION_RE.match(cap_el.get_text(strip=True))
        if not m:
            print(f"  ! unparsed caption: {cap_el.get_text(strip=True)!r}", file=sys.stderr)
            continue
        price = float(m.group(1).replace(",", ""))
        name = m.group(2).strip()
        game_number = m.group(3).strip()

        tiers = []
        for tr in table.find_all("tr")[1:]:  # skip header row
            tds = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(tds) < 3:
                continue
            _release_date, amount_label, remaining_label = tds[0], tds[1], tds[2]
            try:
                remaining = int(remaining_label.replace(",", ""))
            except ValueError:
                continue
            tiers.append(
                {"amount": parse_amount(amount_label), "label": amount_label.strip(), "total": 0, "remaining": remaining}
            )
        if not tiers:
            continue

        tiers.sort(key=lambda t: t["amount"], reverse=True)
        top_i = next((i for i, t in enumerate(tiers) if t["remaining"] > 0), 0)
        for i, t in enumerate(tiers):
            t["is_top"] = i == top_i

        games.append({"game_number": game_number, "name": name, "slug": db.slugify(name), "price": price, "prize_tiers": tiers})
    return games


def run_live() -> int:
    print("→ fetching WCLC prizes-remaining page...")
    try:
        html = fetch_html(REMAINING_URL)
    except Exception as e:  # noqa: BLE001
        print(f"✗ could not fetch WCLC page: {e}", file=sys.stderr)
        return 0

    games = parse_games(html)
    if not games:
        print("✗ zero games parsed — page shape may have changed.", file=sys.stderr)
        return 0

    n = db.replace_scratch_games(AGENCY, PROVINCE, games, source="wclc-live")
    tier_n = sum(len(g["prize_tiers"]) for g in games)
    print(f"✓ stored {n} live games / {tier_n} prize tiers (remaining-count only, no printed totals)")
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape WCLC scratch/instant games -> Supabase")
    ap.add_argument("--live", action="store_true", help="non-zero exit on failure (no silent fallback)")
    args = ap.parse_args()
    n = run_live()
    if args.live:
        return 0 if n else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
