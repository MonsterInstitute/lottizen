#!/usr/bin/env python3
"""
scrape_alc_scratch.py — ALC (Atlantic: New Brunswick, Nova Scotia, PEI,
Newfoundland & Labrador) scratch/instant games.

REAL DATA SOURCES (verified 2026-08 — the catalog endpoint was found by
sniffing real network traffic with Playwright against
alc.ca/.../scratch-n-win.html, since the page renders its game tiles via
client-side Knockout.js bindings with no data in the static HTML):

  1) https://www.alc.ca/services/cfm?type=scratch&gameType=Scratch&language=en&sort=effectiveDate&offset=0&limit=200
     Public JSON, no auth. `limit=200` comfortably covers the live catalog
     (observed totalResults=77, all returned in one page — no real
     pagination needed). One object per game:
       {"gameID": "3401", "title": "Diamond 7s", "cost": "5.0",
        "effectiveDate": "2026-08-05T07:00:00.000-03:00",
        "chanceOfWinning": "3.96", "topCashPrizeGameDetails": "$70,000",
        "prizes": "$5, $10, $20, ... $70,000", ...}
     `prizes` lists every tier's dollar LABEL only — no counts, so it
     cannot be used for tier-level data, only as a reference. `cost` is
     ticket price; `chanceOfWinning` is "1 in N" with just the N.

  2) https://www.alc.ca/content/alc/en/our-games/scratch-n-win/top-prizes-remaining.html
     Plain server-rendered HTML table (unlike the catalog page, this one
     IS static — verified by direct fetch), columns: Game Name, Game
     Number, Launch Date, Top Prize Value, Number of Top Prizes, Number
     of Top Prizes Unclaimed. 73 rows / 72 distinct game numbers observed
     (a handful of the 77 catalog games aren't listed here yet — likely
     too new for claims data — and are simply skipped, same as any game
     with zero scorable tiers).

  CRITICAL DATA-COMPLETENESS LIMIT (confirmed by this fetch, matches the
  phase-1 research finding): ALC discloses a real total+remaining pair,
  but ONLY for the single TOP prize tier of each game — never for any
  lower tier. So unlike WCLC (remaining-only, no total, multiple tiers),
  ALC gives real (total, remaining) pairs only for the game's own
  self-defined "top prize(s)" and nothing else — almost always exactly
  one row per game, but a handful of games (e.g. "ELITE"/4120) disclose
  two top-tier rows, a grand prize plus a secondary top tier, both kept
  and ranked by amount (highest = is_top). total is NOT a sentinel for
  ALC — it's a real printed count — only the *coverage* is limited to the
  top tier(s).
  calculate_rankings.py must branch on agency == "ALC" and score by "top
  prize remaining fraction" (remaining/total on that single tier) rather
  than an all-tier retention formula, since there is nothing else to sum.

Usage:
  python3 scripts/scrape_alc_scratch.py            # live, silent fallback (exit 0) on failure
  python3 scripts/scrape_alc_scratch.py --live      # live only, non-zero exit on failure
"""
from __future__ import annotations

import argparse
import json
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

AGENCY = "ALC"
PROVINCE = "atlantic"

CATALOG_URL = "https://www.alc.ca/services/cfm?type=scratch&gameType=Scratch&language=en&sort=effectiveDate&offset=0&limit=200"
TOP_PRIZES_URL = "https://www.alc.ca/content/alc/en/our-games/scratch-n-win/top-prizes-remaining.html"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.lower()).strip()
    return re.sub(r"[\s_]+", "-", s)


def parse_amount(label: str) -> float:
    m = re.search(r"\$([\d,]+(?:\.\d+)?)", label)
    return float(m.group(1).replace(",", "")) if m else 0.0


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json, text/html"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def fetch_catalog() -> dict[str, dict]:
    data = json.loads(http_get(CATALOG_URL))
    out: dict[str, dict] = {}
    for r in data.get("results", []):
        gid = str(r.get("gameID") or "").strip()
        if not gid:
            continue
        try:
            price = float(r.get("cost"))
        except (TypeError, ValueError):
            continue
        try:
            odds = float(r.get("chanceOfWinning"))
        except (TypeError, ValueError):
            odds = None
        out[gid] = {
            "name": str(r.get("title") or "").strip(),
            "price": price,
            "launch_date": (r.get("effectiveDate") or "")[:10] or None,
            # numeric column stores the "N" in "1 in N" odds, matching the schema's
            # `double precision` type (OLG's scraper leaves it null; this is the
            # first adapter to actually populate it).
            "overall_odds": odds,
        }
    return out


def fetch_top_prizes() -> list[dict]:
    html = http_get(TOP_PRIZES_URL).decode("utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    rows = []
    for tr in table.find_all("tr")[1:]:
        tds = [td.get_text(strip=True) for td in tr.find_all("td")]
        if len(tds) < 6:
            continue
        _name, game_number, _launch, top_prize_value, total_label, remaining_label = tds[:6]
        try:
            total = int(total_label.replace(",", ""))
            remaining = int(remaining_label.replace(",", ""))
        except ValueError:
            continue
        rows.append(
            {
                "game_number": game_number.strip(),
                "amount": parse_amount(top_prize_value),
                "label": top_prize_value.strip(),
                "total": total,
                "remaining": remaining,
            }
        )
    return rows


def run_live() -> int:
    print("→ fetching ALC catalog + top-prizes-remaining...")
    try:
        catalog = fetch_catalog()
    except Exception as e:  # noqa: BLE001
        print(f"✗ could not fetch ALC catalog: {e}", file=sys.stderr)
        return 0
    if not catalog:
        print("✗ empty ALC catalog.", file=sys.stderr)
        return 0

    try:
        top_prize_rows = fetch_top_prizes()
    except Exception as e:  # noqa: BLE001
        print(f"✗ could not fetch ALC top-prizes-remaining: {e}", file=sys.stderr)
        return 0
    if not top_prize_rows:
        print("✗ zero rows parsed from top-prizes-remaining table.", file=sys.stderr)
        return 0

    # A handful of games (e.g. "ELITE"/4120) disclose TWO top-tier rows —
    # a grand prize plus a secondary top tier — so group by game_number
    # rather than assuming one row per game.
    by_game: dict[str, list[dict]] = {}
    unmatched = 0
    for row in top_prize_rows:
        if row["game_number"] not in catalog:
            unmatched += 1
            continue
        by_game.setdefault(row["game_number"], []).append(row)

    games = []
    tier_count = 0
    for gnum, rows in by_game.items():
        meta = catalog[gnum]
        rows = sorted(rows, key=lambda r: r["amount"], reverse=True)
        tiers = [
            {"amount": r["amount"], "label": r["label"], "total": r["total"], "remaining": r["remaining"], "is_top": i == 0}
            for i, r in enumerate(rows)
        ]
        tier_count += len(tiers)
        games.append(
            {
                "game_number": gnum,
                "name": meta["name"] or rows[0]["label"],
                "slug": slugify(meta["name"] or gnum),
                "price": meta["price"],
                "launch_date": meta["launch_date"],
                "overall_odds": meta["overall_odds"],
                "prize_tiers": tiers,
            }
        )

    if not games:
        print("✗ zero games joined between catalog and top-prizes table.", file=sys.stderr)
        return 0

    n = db.replace_scratch_games(AGENCY, PROVINCE, games, source="alc-live")
    print(f"✓ stored {n} live games / {tier_count} prize tiers (top tier(s) only; {unmatched} top-prizes rows had no catalog match)")
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape ALC scratch/instant games -> Supabase")
    ap.add_argument("--live", action="store_true", help="non-zero exit on failure (no silent fallback)")
    args = ap.parse_args()
    n = run_live()
    if args.live:
        return 0 if n else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
