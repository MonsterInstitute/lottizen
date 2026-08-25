#!/usr/bin/env python3
"""
scrape_bclc_scratch.py — BCLC (British Columbia) scratch/instant games.

REAL DATA SOURCE (verified 2026-08, both endpoints hit and inspected directly):
  https://www.playnow.com/services2/instant/prizes/bc
  Public JSON, NO auth needed (unlike OLG's gated feed) — a bare array,
  ~1150 rows, one per (game, prize tier):
    {"ticketPrice": 5, "gameName": "$5 Set for Life XII", "prodCode": 37,
     "gameNumber": "116004", "prizeDiv": "$1,000", "totalPrizes": 11,
     "claimedPrizes": 0, "itemNumber": 0}

  No `remaining`/`unclaimed` field — BCLC reports CLAIMED prizes instead;
  remaining = totalPrizes - claimedPrizes (sanity-checked: never negative
  in the live feed).

  game_number is prodCode+gameNumber concatenated as a string ("37" +
  "116004" -> "37116004") — matches the site's own ticket numbering, and
  matches the `number` field in the second feed below (verified directly:
  the "$5 Set for Life XII" entry there has number: "37116004").

  Launch date, second feed (dict keyed by URL slug, not by game number):
  https://www.playnow.com/resources/json/lottery/scratch-and-win/scratch-and-win-tickets.json
    {"5-set-for-life-37116004": {"id": ..., "name": "Set for Life",
     "number": "37116004", "topPrize": 675000, "price": 5,
     "publishedDate": "2026-06-01", ...}, ...}
  Joined by `number` (best-effort — a handful of split/variant editions have
  a "-01"/"-02" suffix on `number` that doesn't always cleanly match the
  prizes feed's concatenated key; when no match is found, launch_date is
  just left null rather than guessed).

  Overall odds are published per-game on static HTML pages (one fetch per
  of ~170 games) — NOT scraped in this version, to keep the adapter fast
  and low-risk on a first pass; overall_odds stays null, same gap OLG's
  feed already has. Can be added later (see the final report).

  No anti-bot friction observed on any playnow.com endpoint — plain HTTP
  with a desktop User-Agent is enough (empty/no UA does fail, so always
  send one). bclc.com/corporate.bclc.com are Akamai-blocked entirely but
  are not needed; playnow.com is BCLC's own consumer platform and is the
  same domain this repo already scrapes for BC/49 draw results.

Usage:
  python3 scripts/scrape_bclc_scratch.py            # live, falling back silently (exit 0) on failure
  python3 scripts/scrape_bclc_scratch.py --live      # live only, non-zero exit on failure
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper

AGENCY = "BCLC"
PROVINCE = "british-columbia"

PRIZES_URL = "https://www.playnow.com/services2/instant/prizes/bc"
TICKETS_URL = "https://www.playnow.com/resources/json/lottery/scratch-and-win/scratch-and-win-tickets.json"

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


def http_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read())


def fetch_launch_dates() -> dict[str, str]:
    try:
        data = http_json(TICKETS_URL)
    except Exception as e:  # noqa: BLE001
        print(f"  ! tickets feed failed (launch dates will be missing): {e}", file=sys.stderr)
        return {}
    out: dict[str, str] = {}
    for v in data.values():
        num = str(v.get("number") or "").strip()
        d = v.get("publishedDate")
        if num and d:
            out[num] = d
    return out


def parse_prizes(rows: list[dict]) -> list[dict]:
    games: dict[str, dict] = {}
    for r in rows:
        try:
            gnum = f"{r['prodCode']}{r['gameNumber']}"
            g = games.setdefault(
                gnum,
                {"game_number": gnum, "name": str(r["gameName"]).strip(), "price": float(r["ticketPrice"]), "prize_tiers": []},
            )
            total = int(r["totalPrizes"])
            claimed = int(r.get("claimedPrizes") or 0)
            remaining = max(total - claimed, 0)
            g["prize_tiers"].append(
                {"amount": parse_amount(str(r["prizeDiv"])), "label": str(r["prizeDiv"]).strip(), "total": total, "remaining": remaining}
            )
        except (KeyError, ValueError, TypeError) as e:
            print(f"  ! skipped row: {e}", file=sys.stderr)

    out = []
    for g in games.values():
        tiers = sorted(g["prize_tiers"], key=lambda t: t["amount"], reverse=True)
        top_i = next((i for i, t in enumerate(tiers) if t["remaining"] > 0), 0)
        for i, t in enumerate(tiers):
            t["is_top"] = i == top_i
        g["prize_tiers"] = tiers
        out.append(g)
    return [g for g in out if any(t["remaining"] > 0 and t["amount"] > 0 for t in g["prize_tiers"])]


def run_live() -> int:
    print("→ fetching BCLC (PlayNow) instant-prizes feed...")
    try:
        rows = http_json(PRIZES_URL)
    except Exception as e:  # noqa: BLE001
        print(f"✗ could not fetch BCLC prizes feed: {e}", file=sys.stderr)
        return 0
    if not isinstance(rows, list) or not rows:
        print("✗ unexpected/empty feed shape.", file=sys.stderr)
        return 0

    games = parse_prizes(rows)
    if not games:
        print("✗ zero scorable games after parsing.", file=sys.stderr)
        return 0

    launch_dates = fetch_launch_dates()
    for g in games:
        g["slug"] = slugify(g["name"])
        g["launch_date"] = launch_dates.get(g["game_number"])

    n = db.replace_scratch_games(AGENCY, PROVINCE, games, source="bclc-live")
    tier_n = sum(len(g["prize_tiers"]) for g in games)
    matched = sum(1 for g in games if g["launch_date"])
    print(f"✓ stored {n} live games / {tier_n} prize tiers (launch date matched for {matched}/{n})")
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape BCLC scratch/instant games -> Supabase")
    ap.add_argument("--live", action="store_true", help="non-zero exit on failure (no silent fallback)")
    args = ap.parse_args()
    n = run_live()
    if args.live:
        return 0 if n else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
