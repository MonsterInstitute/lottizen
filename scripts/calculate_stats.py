#!/usr/bin/env python3
"""
calculate_stats.py — Read draws from SQLite and emit per-game JSON the Next.js
build reads at compile time (SSG):

  data/draws/<slug>.json  — full draw history (newest first) + next draw/jackpot
  data/stats/<slug>.json  — per-number stats + aggregate distributions
  data/draws/_latest.json — latest draw + next jackpot for every live game (home)

Stats per number (main pool 1..max): frequency, last seen, current gap,
historical max gap, hot/cold (last 50), and top-5 partner numbers. Aggregates:
hot/cold lists, most/least frequent, odd-even & high-low splits, sum
distribution, consecutive-pair rate, and the most common pairs.
"""
from __future__ import annotations

import json
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "lottizen.db"
DRAWS_DIR = ROOT / "data" / "draws"
STATS_DIR = ROOT / "data" / "stats"

# slug -> (pick, max) for the main pool. Mirrors config/games.ts live games.
GAME_POOL = {
    "lotto-max": (7, 50),
    "lotto-6-49": (6, 49),
    "ontario-49": (6, 49),
    "daily-grand": (5, 49),
    "western-max": (7, 50),
    "western-6-49": (6, 49),
}
HOT_WINDOW = 50


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_draws(conn: sqlite3.Connection, slug: str) -> list[dict]:
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT draw_date, numbers, bonus, jackpot FROM draws WHERE game_id=? ORDER BY draw_date ASC",
        (slug,),
    ).fetchall()
    out = []
    for r in rows:
        nums = [int(x) for x in r["numbers"].split(",") if x]
        out.append({"date": r["draw_date"], "numbers": nums,
                    "bonus": r["bonus"], "jackpot": r["jackpot"]})
    return out


def compute_stats(slug: str, draws: list[dict]) -> dict:
    pick, mx = GAME_POOL[slug]
    n_draws = len(draws)
    # draws ascending; index 0 oldest, last = newest
    all_nums = list(range(1, mx + 1))

    freq = Counter()
    last_idx: dict[int, int] = {}
    max_gap: dict[int, int] = {n: 0 for n in all_nums}
    prev_idx: dict[int, int] = {}
    partners: dict[int, Counter] = defaultdict(Counter)
    pair_counter: Counter = Counter()
    sums, odds, lows, cons_draws = [], [], [], 0

    for i, d in enumerate(draws):
        nums = [x for x in d["numbers"] if 1 <= x <= mx]
        for n in nums:
            freq[n] += 1
            if n in prev_idx:
                gap = i - prev_idx[n]
                if gap > max_gap[n]:
                    max_gap[n] = gap
            prev_idx[n] = i
            last_idx[n] = i
        for a, b in combinations(sorted(nums), 2):
            pair_counter[(a, b)] += 1
            partners[a][b] += 1
            partners[b][a] += 1
        sums.append(sum(nums))
        odds.append(sum(1 for x in nums if x % 2 == 1))
        lows.append(sum(1 for x in nums if x <= mx // 2))
        s = sorted(nums)
        if any(s[j + 1] - s[j] == 1 for j in range(len(s) - 1)):
            cons_draws += 1

    numbers = []
    for n in all_nums:
        li = last_idx.get(n)
        current_gap = (n_draws - 1 - li) if li is not None else n_draws
        # count max gap including trailing gap to "now"
        mg = max(max_gap[n], current_gap)
        top_partners = [{"n": p, "count": c} for p, c in partners[n].most_common(5)]
        numbers.append({
            "n": n,
            "count": freq.get(n, 0),
            "frequency": round(freq.get(n, 0) / n_draws, 4) if n_draws else 0,
            "lastDate": draws[li]["date"] if li is not None else None,
            "drawsAgo": current_gap,
            "currentGap": current_gap,
            "maxGap": mg,
            "hot": False,
            "cold": False,
            "partners": top_partners,
        })

    # hot/cold over the last HOT_WINDOW draws
    window = draws[-HOT_WINDOW:] if n_draws > HOT_WINDOW else draws
    win_freq = Counter()
    for d in window:
        for x in d["numbers"]:
            if 1 <= x <= mx:
                win_freq[x] += 1
    hot = [n for n, _ in win_freq.most_common(6)]
    by_gap = sorted(numbers, key=lambda z: z["currentGap"], reverse=True)
    cold = [z["n"] for z in by_gap[:6]]
    hotset, coldset = set(hot), set(cold)
    for z in numbers:
        z["hot"] = z["n"] in hotset
        z["cold"] = z["n"] in coldset

    most_freq = sorted(numbers, key=lambda z: z["count"], reverse=True)[:10]
    least_freq = sorted(numbers, key=lambda z: z["count"])[:10]

    def hist(values, buckets):
        c = Counter()
        for v in values:
            for lo, hi in buckets:
                if lo <= v <= hi:
                    c[f"{lo}-{hi}"] += 1
                    break
        return [{"range": f"{lo}-{hi}", "count": c.get(f"{lo}-{hi}", 0)} for lo, hi in buckets]

    max_sum = pick * mx
    step = max(1, max_sum // 8)
    sum_buckets = [(i, min(i + step - 1, max_sum)) for i in range(0, max_sum + 1, step)]

    aggregate = {
        "hot": hot,
        "cold": cold,
        "mostFrequent": [{"n": z["n"], "count": z["count"]} for z in most_freq],
        "leastFrequent": [{"n": z["n"], "count": z["count"]} for z in least_freq],
        "oddEven": {
            "avgOdd": round(sum(odds) / n_draws, 2) if n_draws else 0,
            "avgEven": round(pick - sum(odds) / n_draws, 2) if n_draws else 0,
            "dist": [{"odd": k, "count": v} for k, v in sorted(Counter(odds).items())],
        },
        "highLow": {
            "avgLow": round(sum(lows) / n_draws, 2) if n_draws else 0,
            "avgHigh": round(pick - sum(lows) / n_draws, 2) if n_draws else 0,
        },
        "sum": {
            "avg": round(sum(sums) / n_draws, 1) if n_draws else 0,
            "min": min(sums) if sums else 0,
            "max": max(sums) if sums else 0,
            "buckets": hist(sums, sum_buckets),
        },
        "consecutive": {
            "drawsWith": cons_draws,
            "pct": round(cons_draws / n_draws * 100, 1) if n_draws else 0,
        },
        "topPairs": [{"a": a, "b": b, "count": c}
                     for (a, b), c in pair_counter.most_common(10)],
        "frequencyChart": [{"n": z["n"], "count": z["count"]} for z in numbers],
    }
    return {
        "game": slug,
        "dataSince": draws[0]["date"] if draws else None,
        "drawCount": n_draws,
        "pick": pick,
        "max": mx,
        "generatedAt": now_iso(),
        "numbers": numbers,
        "aggregate": aggregate,
    }


def write_draws_json(conn: sqlite3.Connection, slug: str, draws: list[dict]) -> dict:
    meta = conn.execute(
        "SELECT next_draw_date, next_jackpot FROM game_meta WHERE game_id=?", (slug,)
    ).fetchone()
    newest_first = list(reversed(draws))
    payload = {
        "game": slug,
        "dataSince": draws[0]["date"] if draws else None,
        "drawCount": len(draws),
        "nextDraw": meta[0] if meta else None,
        "nextJackpot": meta[1] if meta else None,
        "generatedAt": now_iso(),
        "draws": newest_first,
    }
    (DRAWS_DIR / f"{slug}.json").write_text(json.dumps(payload, indent=2) + "\n")
    return payload


def main() -> int:
    if not DB_PATH.exists():
        print(f"✗ {DB_PATH} not found. Run scrape_draws.py first.")
        return 1
    DRAWS_DIR.mkdir(parents=True, exist_ok=True)
    STATS_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    latest_all = []
    try:
        for slug in GAME_POOL:
            draws = load_draws(conn, slug)
            if not draws:
                print(f"  {slug}: no draws, skipping")
                continue
            payload = write_draws_json(conn, slug, draws)
            stats = compute_stats(slug, draws)
            (STATS_DIR / f"{slug}.json").write_text(json.dumps(stats, indent=2) + "\n")
            newest = draws[-1]
            latest_all.append({
                "slug": slug,
                "latestDate": newest["date"],
                "numbers": newest["numbers"],
                "bonus": newest["bonus"],
                "nextDraw": payload["nextDraw"],
                "nextJackpot": payload["nextJackpot"],
                "drawCount": len(draws),
                "dataSince": payload["dataSince"],
            })
            print(f"✓ {slug}: {len(draws)} draws, {stats['drawCount']} analyzed, "
                  f"hot={stats['aggregate']['hot'][:3]} since {stats['dataSince']}")
    finally:
        conn.close()

    (DRAWS_DIR / "_latest.json").write_text(json.dumps(
        {"generatedAt": now_iso(), "games": latest_all}, indent=2) + "\n")
    print(f"✓ wrote _latest.json ({len(latest_all)} games)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
