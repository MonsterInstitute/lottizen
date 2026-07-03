#!/usr/bin/env python3
"""
calculate_stats.py — Read draws from SQLite and emit per-game JSON for the SSG
build: data/draws/<slug>.json (full history), data/stats/<slug>.json (number
stats over the current-rules era), data/draws/_latest.json (home).

Handles: main-pool frequency/gap/hot-cold/partners/pairs, secondary-ball
("bonus") stats for double-zone games (Powerball, Mega Millions, Cash4Life, …),
and rule-era filtering (Powerball 2015-10-07+, Mega Millions 2017-10-31+) so
statistics reflect the current matrix while the archive keeps every draw.
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
HOT_WINDOW = 50

# All games that get number-pool statistics (lotto + keno format).
# Digit / card games are handled elsewhere (results-only pages).
GAMES = {
    # ---- Canada ----
    "lotto-max": {"pick": 7, "max": 50},
    "lotto-6-49": {"pick": 6, "max": 49},
    "ontario-49": {"pick": 6, "max": 49},
    "daily-grand": {"pick": 5, "max": 49, "bonus_max": 7, "bonus_label": "Grand Number"},
    "western-max": {"pick": 7, "max": 50},
    "western-6-49": {"pick": 6, "max": 49},
    "lottario": {"pick": 6, "max": 45, "bonus_max": 45, "bonus_label": "Bonus"},
    "megadice": {"pick": 6, "max": 45, "bonus_max": 45, "bonus_label": "Bonus"},
    "bc-49": {"pick": 6, "max": 49, "bonus_max": 49, "bonus_label": "Bonus"},
    "quebec-49": {"pick": 6, "max": 49, "bonus_max": 49, "bonus_label": "Bonus"},
    "quebec-max": {"pick": 7, "max": 50},
    "atlantic-49": {"pick": 6, "max": 49, "bonus_max": 49, "bonus_label": "Bonus"},
    "bucko": {"pick": 5, "max": 41},
    # ---- USA ----
    "powerball": {"pick": 5, "max": 69, "bonus_max": 26, "bonus_label": "Powerball",
                  "stats_from": "2015-10-07"},
    "mega-millions": {"pick": 5, "max": 70, "bonus_max": 25, "bonus_label": "Mega Ball",
                      "stats_from": "2017-10-31"},
    "cash4life": {"pick": 5, "max": 60, "bonus_max": 4, "bonus_label": "Cash Ball"},
    "new-york-lotto": {"pick": 6, "max": 59, "bonus_max": 59, "bonus_label": "Bonus"},
    "take-5": {"pick": 5, "max": 39},
    "pick-10": {"pick": 20, "max": 80},
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_draws(conn, slug):
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT draw_date, numbers, bonus, jackpot FROM draws WHERE game_id=? ORDER BY draw_date ASC",
        (slug,),
    ).fetchall()
    return [{"date": r["draw_date"], "numbers": [int(x) for x in r["numbers"].split(",") if x],
             "bonus": r["bonus"], "jackpot": r["jackpot"]} for r in rows]


def compute_stats(slug, cfg, draws):
    pick, mx = cfg["pick"], cfg["max"]
    n = len(draws)
    all_nums = list(range(1, mx + 1))
    freq = Counter(); last_idx = {}; max_gap = {k: 0 for k in all_nums}; prev = {}
    partners = defaultdict(Counter); pair_counter = Counter()
    sums, odds, lows, cons = [], [], [], 0
    for i, d in enumerate(draws):
        nums = [x for x in d["numbers"] if 1 <= x <= mx]
        for num in nums:
            freq[num] += 1
            if num in prev:
                max_gap[num] = max(max_gap[num], i - prev[num])
            prev[num] = i; last_idx[num] = i
        for a, b in combinations(sorted(nums), 2):
            pair_counter[(a, b)] += 1; partners[a][b] += 1; partners[b][a] += 1
        sums.append(sum(nums)); odds.append(sum(1 for x in nums if x % 2))
        lows.append(sum(1 for x in nums if x <= mx // 2))
        s = sorted(nums)
        if any(s[j + 1] - s[j] == 1 for j in range(len(s) - 1)):
            cons += 1
    numbers = []
    for num in all_nums:
        li = last_idx.get(num)
        cur = (n - 1 - li) if li is not None else n
        numbers.append({
            "n": num, "count": freq.get(num, 0),
            "frequency": round(freq.get(num, 0) / n, 4) if n else 0,
            "lastDate": draws[li]["date"] if li is not None else None,
            "drawsAgo": cur, "currentGap": cur, "maxGap": max(max_gap[num], cur),
            "hot": False, "cold": False,
            "partners": [{"n": p, "count": c} for p, c in partners[num].most_common(5)],
        })
    window = draws[-HOT_WINDOW:] if n > HOT_WINDOW else draws
    wf = Counter()
    for d in window:
        for x in d["numbers"]:
            if 1 <= x <= mx:
                wf[x] += 1
    hot = [k for k, _ in wf.most_common(6)]
    cold = [z["n"] for z in sorted(numbers, key=lambda z: z["currentGap"], reverse=True)[:6]]
    hs, cs = set(hot), set(cold)
    for z in numbers:
        z["hot"] = z["n"] in hs; z["cold"] = z["n"] in cs

    def hist(vals, buckets):
        c = Counter()
        for v in vals:
            for lo, hi in buckets:
                if lo <= v <= hi:
                    c[f"{lo}-{hi}"] += 1; break
        return [{"range": f"{lo}-{hi}", "count": c.get(f"{lo}-{hi}", 0)} for lo, hi in buckets]

    ms = pick * mx; step = max(1, ms // 8)
    sb = [(i, min(i + step - 1, ms)) for i in range(0, ms + 1, step)]
    agg = {
        "hot": hot, "cold": cold,
        "mostFrequent": [{"n": z["n"], "count": z["count"]}
                         for z in sorted(numbers, key=lambda z: z["count"], reverse=True)[:10]],
        "leastFrequent": [{"n": z["n"], "count": z["count"]}
                          for z in sorted(numbers, key=lambda z: z["count"])[:10]],
        "oddEven": {"avgOdd": round(sum(odds) / n, 2) if n else 0,
                    "avgEven": round(pick - sum(odds) / n, 2) if n else 0,
                    "dist": [{"odd": k, "count": v} for k, v in sorted(Counter(odds).items())]},
        "highLow": {"avgLow": round(sum(lows) / n, 2) if n else 0,
                    "avgHigh": round(pick - sum(lows) / n, 2) if n else 0},
        "sum": {"avg": round(sum(sums) / n, 1) if n else 0, "min": min(sums) if sums else 0,
                "max": max(sums) if sums else 0, "buckets": hist(sums, sb)},
        "consecutive": {"drawsWith": cons, "pct": round(cons / n * 100, 1) if n else 0},
        "topPairs": [{"a": a, "b": b, "count": c} for (a, b), c in pair_counter.most_common(10)],
        "frequencyChart": [{"n": z["n"], "count": z["count"]} for z in numbers],
    }
    # secondary ball (Powerball / Mega Ball / Cash Ball / Bonus)
    if cfg.get("bonus_max"):
        bmax = cfg["bonus_max"]
        bf = Counter(d["bonus"] for d in draws if d.get("bonus") and 1 <= d["bonus"] <= bmax)
        if bf:
            agg["bonus"] = {
                "label": cfg.get("bonus_label", "Bonus"), "max": bmax,
                "chart": [{"n": k, "count": bf.get(k, 0)} for k in range(1, bmax + 1)],
                "hot": [k for k, _ in bf.most_common(6)],
            }
    return {"game": slug, "dataSince": draws[0]["date"] if draws else None,
            "drawCount": n, "pick": pick, "max": mx, "generatedAt": now_iso(),
            "statsFrom": cfg.get("stats_from"), "numbers": numbers, "aggregate": agg}


def write_draws(conn, slug, draws):
    m = conn.execute("SELECT next_draw_date, next_jackpot FROM game_meta WHERE game_id=?",
                     (slug,)).fetchone() if table_has(conn, "game_meta") else None
    payload = {"game": slug, "dataSince": draws[0]["date"] if draws else None,
               "drawCount": len(draws), "nextDraw": m[0] if m else None,
               "nextJackpot": m[1] if m else None, "generatedAt": now_iso(),
               "draws": list(reversed(draws))}
    (DRAWS_DIR / f"{slug}.json").write_text(json.dumps(payload, indent=2) + "\n")
    return payload


def table_has(conn, name):
    return conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                        (name,)).fetchone() is not None


def main() -> int:
    if not DB_PATH.exists():
        print(f"✗ {DB_PATH} not found."); return 1
    DRAWS_DIR.mkdir(parents=True, exist_ok=True); STATS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    latest_all = []
    try:
        for slug, cfg in GAMES.items():
            draws = load_draws(conn, slug)
            if not draws:
                continue
            payload = write_draws(conn, slug, draws)
            era = [d for d in draws if not cfg.get("stats_from") or d["date"] >= cfg["stats_from"]]
            stats = compute_stats(slug, cfg, era)
            stats["allTimeDrawCount"] = len(draws)
            (STATS_DIR / f"{slug}.json").write_text(json.dumps(stats, indent=2) + "\n")
            newest = draws[-1]
            latest_all.append({"slug": slug, "latestDate": newest["date"], "numbers": newest["numbers"],
                               "bonus": newest["bonus"], "nextDraw": payload["nextDraw"],
                               "nextJackpot": payload["nextJackpot"], "drawCount": len(draws),
                               "dataSince": payload["dataSince"]})
            era_note = f" (stats era {cfg['stats_from']}+: {len(era)})" if cfg.get("stats_from") else ""
            print(f"✓ {slug}: {len(draws)} draws{era_note}, hot={stats['aggregate']['hot'][:3]}")
    finally:
        conn.close()
    (DRAWS_DIR / "_latest.json").write_text(json.dumps(
        {"generatedAt": now_iso(), "games": latest_all}, indent=2) + "\n")
    print(f"✓ _latest.json ({len(latest_all)} games)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
