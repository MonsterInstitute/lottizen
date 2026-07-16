#!/usr/bin/env python3
"""
calculate_rankings.py — Read scraped instant-game data from Supabase,
compute each game's Value Score, and write data/rankings.json for the Next.js
build to read at build time (SSG).

VALUE SCORE (from OLG's public remaining-prize counts)
------------------------------------------------------
OLG's feed gives, per game, its top prize tiers with how many were printed
(`total`) and how many are still unclaimed (`remaining`). It does NOT publish
odds or total tickets, so we score using only these counts.

For each game, over its valued prize tiers:

  printed_pool   = Σ (total     × amount)     # prize $ the game launched with
  remaining_pool = Σ (remaining × amount)     # prize $ still on the table
  count_total    = Σ total                    # prizes printed
  count_remaining= Σ remaining                # prizes left

  g = remaining_pool / printed_pool   # value-weighted fraction of prizes left
  f = count_remaining / count_total   # head-count fraction of prizes left
  retention = g / f

`f` is the brief's "remaining top-prize ratio" — a proxy for the fraction of
tickets still unsold. `retention` compares the DOLLARS left to the COUNT left:

  retention > 1  → the big prizes are disproportionately STILL unclaimed
                   (better-than-average value remaining — buy signal)
  retention = 1  → prizes depleting evenly with sales (baseline)
  retention < 1  → jackpots already claimed, mostly small prizes left (avoid)

  Value Score = NOMINAL_RTP × retention × 100

NOMINAL_RTP (0.62, the rough Ontario instant-game average return-to-player) is a
fixed display scale so a baseline game reads ~62 "cents of value per dollar". It
is a constant multiplier and does NOT affect the ranking order — the ranking is
driven entirely by `retention`, i.e. by OLG's own counts. See /methodology.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper (replaces sqlite3)

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "rankings.json"

NOMINAL_RTP = 0.62  # documented display scale; does not affect rank order


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_games() -> tuple[list[dict], str]:
    rows = db.fetch_all("games")
    all_tiers = db.fetch_all(
        "prize_tiers", "id,game_number,amount,label,total,remaining,is_top")
    tiers_by_game: dict[str, list[dict]] = {}
    for t in all_tiers:
        tiers_by_game.setdefault(t["game_number"], []).append(t)
    sources = set()
    games: list[dict] = []
    for g in rows:
        sources.add(g["source"])
        # Match SQLite's "ORDER BY amount DESC" with a stable id tiebreak so
        # equal-amount tiers keep their original insertion order.
        tiers = sorted(tiers_by_game.get(g["game_number"], []),
                       key=lambda t: (-t["amount"], t["id"]))
        games.append({
            "slug": g["slug"],
            "name": g["name"],
            "gameNumber": g["game_number"],
            "price": float(g["price"]),
            "prizeTiers": [
                {
                    "amount": float(t["amount"]),
                    "label": t["label"],
                    "total": int(t["total"]),
                    "remaining": int(t["remaining"]),
                    "isTop": bool(t["is_top"]),
                }
                for t in tiers
            ],
            "scrapedAt": g["scraped_at"],
        })
    source = "olg-live" if "olg-live" in sources else "sample"
    return games, source


def compute(game: dict) -> dict | None:
    tiers = game["prizeTiers"]
    scored = [t for t in tiers if t["amount"] > 0]

    printed_pool = sum(t["total"] * t["amount"] for t in scored)
    remaining_pool = sum(t["remaining"] * t["amount"] for t in scored)
    count_total = sum(t["total"] for t in scored)
    count_remaining = sum(t["remaining"] for t in scored)

    if printed_pool <= 0 or count_total <= 0 or count_remaining <= 0:
        return None  # nothing valued left to score

    g_frac = remaining_pool / printed_pool
    f_frac = count_remaining / count_total
    retention = g_frac / f_frac if f_frac > 0 else 0.0
    value_score = round(NOMINAL_RTP * retention * 100, 1)

    top = next((t for t in tiers if t["isTop"]), scored[0])

    game.update({
        "topPrizeLabel": top["label"],
        "topPrizeAmount": top["amount"],
        "topPrizesTotal": top["total"],
        "topPrizesRemaining": top["remaining"],
        "prizeTierCount": len(tiers),
        "remainingPrizePool": round(remaining_pool),
        "printedPrizePool": round(printed_pool),
        "valueRetention": round(retention, 3),
        "valueScore": value_score,
    })
    return game


def main() -> int:
    games, source = load_games()

    ranked = [g for g in (compute(g) for g in games) if g]
    if not ranked:
        print("✗ no scorable games.")
        return 1

    # Rank by value score; tiebreak on more prize money still on the table.
    ranked.sort(key=lambda g: (g["valueScore"], g["remainingPrizePool"]), reverse=True)
    for i, g in enumerate(ranked, start=1):
        g["rank"] = i

    payload = {
        "generatedAt": now_iso(),
        "source": source,
        "currency": "CAD",
        "province": "ON",
        "gameCount": len(ranked),
        "games": ranked,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"✓ wrote {len(ranked)} ranked games (source='{source}') -> {OUT_PATH}")
    print(f"  top: {ranked[0]['name']} — score {ranked[0]['valueScore']} "
          f"(retention {ranked[0]['valueRetention']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
