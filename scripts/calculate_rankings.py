#!/usr/bin/env python3
"""
calculate_rankings.py — Read scraped instant-game data from Supabase for all
5 Canadian scratch-ticket agencies, compute each game's Value Score with the
agency-appropriate formula, and write one data/rankings/{province}.json per
province for the Next.js build to read at build time (SSG). Also writes
scratch_snapshots (full tier-level state, every game, every run — feeds
future "prize just claimed" alerts) and scratch_rank_snapshots (rank/score
history, per agency).

THREE SCORING METHODS — see /methodology for the user-facing writeup.
--------------------------------------------------------------------
Not every agency publishes the same data, so games are NOT all scored the
same way. This is disclosed on every province ranking page, not hidden.

1) RETENTION (agency in OLG, BCLC, QUEBEC — "full tier data")
   These publish a real printed total AND a remaining count for every
   valued prize tier. Over a game's valued tiers:
     printed_pool    = Σ (total     × amount)
     remaining_pool  = Σ (remaining × amount)
     count_total     = Σ total
     count_remaining = Σ remaining
     g = remaining_pool / printed_pool     (value-weighted share left)
     f = count_remaining / count_total     (head-count share left)
     retention = g / f
   Value Score = NOMINAL_RTP × retention × 100. retention > 1 means the
   big prizes are disproportionately still unclaimed (buy signal).

2) REMAINING VALUE INDEX (agency == WCLC — "remaining counts only")
   WCLC publishes ONLY a remaining count per tier (>= $100), never a
   printed total — retention is mathematically impossible here. Approved
   substitute (2026-08 build plan): for each disclosed tier,
     remaining_value_index = Σ (remaining × amount) / price
   i.e. dollars of prize value still on the table, per dollar of ticket
   price. This is NOT on the same 0-100ish scale as Value Score and is
   NOT comparable across agencies — the province page and methodology
   page both say so explicitly.

3) TOP PRIZE REMAINING % (agency == ALC — "top prizes only")
   ALC publishes a real (total, remaining) pair, but only for each game's
   own top prize tier(s) — never any lower tier. Score:
     top_prize_pct = Σ remaining / Σ total   (over the top tier row(s))
   Value Score = round(top_prize_pct × 100, 1) — literally "% of top
   prizes left". Comparable in spirit to retention's 0-100ish scale by
   coincidence of units, but a different measurement and labeled as such.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "rankings"

NOMINAL_RTP = 0.62  # documented display scale; does not affect rank order within an agency

# Agency -> (province slug, display label, scoring method, data-completeness badge)
AGENCY_META = {
    "OLG":    {"province": "ontario",           "label": "Ontario",           "method": "retention",             "completeness": "full"},
    "BCLC":   {"province": "british-columbia",   "label": "British Columbia",  "method": "retention",             "completeness": "full"},
    "QUEBEC": {"province": "quebec",             "label": "Quebec",            "method": "retention",             "completeness": "full"},
    "WCLC":   {"province": "western",            "label": "Western Canada",    "method": "remaining_value_index", "completeness": "remaining_counts_only"},
    "ALC":    {"province": "atlantic",           "label": "Atlantic Canada",   "method": "top_prize_fraction",    "completeness": "top_prizes_only"},
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_all_games() -> dict[str, list[dict]]:
    """Every game+tiers, grouped by agency."""
    rows = db.fetch_all("games")
    all_tiers = db.fetch_all("prize_tiers", "id,game_number,agency,amount,label,total,remaining,is_top")
    tiers_by_key: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for t in all_tiers:
        tiers_by_key[(t["agency"], t["game_number"])].append(t)

    by_agency: dict[str, list[dict]] = defaultdict(list)
    for g in rows:
        tiers = sorted(
            tiers_by_key.get((g["agency"], g["game_number"]), []),
            key=lambda t: (-t["amount"], t["id"]),
        )
        by_agency[g["agency"]].append({
            "slug": g["slug"],
            "name": g["name"],
            "gameNumber": g["game_number"],
            "agency": g["agency"],
            "province": g["province"],
            "price": float(g["price"]),
            "launchDate": g.get("launch_date"),
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
            "source": g["source"],
        })
    return by_agency


def compute_retention(game: dict) -> dict | None:
    tiers = game["prizeTiers"]
    scored = [t for t in tiers if t["amount"] > 0]

    printed_pool = sum(t["total"] * t["amount"] for t in scored)
    remaining_pool = sum(t["remaining"] * t["amount"] for t in scored)
    count_total = sum(t["total"] for t in scored)
    count_remaining = sum(t["remaining"] for t in scored)

    if printed_pool <= 0 or count_total <= 0 or count_remaining <= 0:
        return None

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
        "scoringMethod": "retention",
    })
    return game


def compute_remaining_value_index(game: dict) -> dict | None:
    """WCLC: no printed totals exist anywhere, ever — only remaining counts
    for tiers >= $100. total is stored as the literal sentinel 0."""
    tiers = game["prizeTiers"]
    scored = [t for t in tiers if t["amount"] > 0]
    if not scored or game["price"] <= 0:
        return None

    remaining_pool = sum(t["remaining"] * t["amount"] for t in scored)
    count_remaining = sum(t["remaining"] for t in scored)
    if remaining_pool <= 0:
        return None  # every disclosed tier fully claimed

    index = round(remaining_pool / game["price"], 1)
    top = next((t for t in tiers if t["isTop"]), scored[0])

    game.update({
        "topPrizeLabel": top["label"],
        "topPrizeAmount": top["amount"],
        "topPrizesTotal": top["total"],       # sentinel 0 — never a real count for WCLC
        "topPrizesRemaining": top["remaining"],
        "prizeTierCount": len(tiers),
        "remainingPrizePool": round(remaining_pool),
        "printedPrizePool": None,             # not published by WCLC, ever
        "valueRetention": None,               # retention is undefined without a printed total
        "valueScore": index,                  # Remaining Value Index — NOT the same scale as retention
        "scoringMethod": "remaining_value_index",
        "countRemaining": count_remaining,
    })
    return game


def compute_top_prize_fraction(game: dict) -> dict | None:
    """ALC: real (total, remaining) counts, but only for the top prize
    tier(s) — never any lower tier."""
    tiers = game["prizeTiers"]
    scored = [t for t in tiers if t["amount"] > 0 and t["total"] > 0]
    if not scored:
        return None

    count_total = sum(t["total"] for t in scored)
    count_remaining = sum(t["remaining"] for t in scored)
    if count_total <= 0:
        return None

    fraction = count_remaining / count_total
    value_score = round(fraction * 100, 1)
    top = max(scored, key=lambda t: t["amount"])
    remaining_pool = sum(t["remaining"] * t["amount"] for t in scored)
    printed_pool = sum(t["total"] * t["amount"] for t in scored)

    game.update({
        "topPrizeLabel": top["label"],
        "topPrizeAmount": top["amount"],
        "topPrizesTotal": count_total,
        "topPrizesRemaining": count_remaining,
        "prizeTierCount": len(tiers),
        "remainingPrizePool": round(remaining_pool),  # top tier(s) only — not the whole game
        "printedPrizePool": round(printed_pool),
        "valueRetention": None,
        "valueScore": value_score,
        "scoringMethod": "top_prize_fraction",
    })
    return game


COMPUTE_BY_METHOD = {
    "retention": compute_retention,
    "remaining_value_index": compute_remaining_value_index,
    "top_prize_fraction": compute_top_prize_fraction,
}


def write_scratch_snapshots(all_games_by_agency: dict[str, list[dict]]) -> None:
    """One row per game per day, every agency, regardless of scoring
    outcome — the whole point is a historical trail of raw tier state
    (for future "top prize just claimed" alerts), not just ranked games."""
    rows = []
    for agency, games in all_games_by_agency.items():
        for g in games:
            rows.append({
                "game_number": g["gameNumber"],
                "agency": agency,
                "prizes_remaining_json": g["prizeTiers"],
            })
    if not rows:
        return
    try:
        db.insert_ignore("scratch_snapshots", rows, on_conflict="game_number,agency,captured_date")
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] scratch_snapshots write failed: {e}")


def snapshot_rankings(agency: str, ranked: list[dict]) -> None:
    rows = [
        {
            "game_slug": g["slug"], "agency": agency, "rank": g["rank"], "value_score": g["valueScore"],
            "remaining_prize_pool": g["remainingPrizePool"] or 0, "top_prizes_remaining": g["topPrizesRemaining"],
            "price": g["price"],
        }
        for g in ranked
    ]
    try:
        db.insert_ignore("scratch_rank_snapshots", rows, on_conflict="agency,game_slug,captured_date")
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] scratch rank snapshot failed ({agency}): {e}")


def build_province(agency: str, games: list[dict]) -> dict | None:
    meta = AGENCY_META[agency]
    compute = COMPUTE_BY_METHOD[meta["method"]]

    ranked = [g for g in (compute(g) for g in games) if g]
    if not ranked:
        print(f"  ✗ {agency}: no scorable games.")
        return None

    ranked.sort(key=lambda g: (g["valueScore"], g["remainingPrizePool"] or 0), reverse=True)
    for i, g in enumerate(ranked, start=1):
        g["rank"] = i
    snapshot_rankings(agency, ranked)

    sources = {g["source"] for g in games}
    source = next(iter(sources)) if len(sources) == 1 else "mixed"

    return {
        "generatedAt": now_iso(),
        "source": source,
        "currency": "CAD",
        "agency": agency,
        "province": meta["province"],
        "provinceLabel": meta["label"],
        "scoringMethod": meta["method"],
        "dataCompleteness": meta["completeness"],
        "gameCount": len(ranked),
        "games": ranked,
    }


def main() -> int:
    all_games_by_agency = load_all_games()
    if not all_games_by_agency:
        print("✗ no games in the database at all.")
        return 1

    write_scratch_snapshots(all_games_by_agency)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wrote = 0
    for agency in AGENCY_META:
        games = all_games_by_agency.get(agency, [])
        payload = build_province(agency, games)
        if payload is None:
            continue
        out_path = OUT_DIR / f"{payload['province']}.json"
        out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        wrote += 1
        top = payload["games"][0]
        print(f"✓ {agency} ({payload['province']}): {payload['gameCount']} games -> {out_path.name} "
              f"[{payload['scoringMethod']}] top: {top['name']} — score {top['valueScore']}")

    if wrote == 0:
        print("✗ zero provinces produced any output.")
        return 1
    print(f"✓ wrote {wrote}/{len(AGENCY_META)} province ranking files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
