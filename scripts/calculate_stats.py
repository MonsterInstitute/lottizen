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
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper (replaces sqlite3)

ROOT = Path(__file__).resolve().parent.parent
DRAWS_DIR = ROOT / "data" / "draws"
STATS_DIR = ROOT / "data" / "stats"
HOT_WINDOW = 50

# All games that get number-pool statistics (lotto + keno format).
# Digit / card games are handled elsewhere (results-only pages).
GAMES = {
    # ---- Canada ----
    # Lotto Max matrix: 7/49 -> 7/50 on 2019-05-14 -> 7/52 on 2026-04-14. Cut at the
    # 2019 change (~740 draws) so stats span the modern 50/52-ball era but stay useful;
    # numbers 51-52 only exist since Apr 2026. (NOT 2026-04-14, which left only ~23 draws.)
    "lotto-max": {"pick": 7, "max": 52, "stats_from": "2019-05-14",
                  # 51 & 52 only entered the pool on 2026-04-14 (7/50 -> 7/52), so they
                  # exist for a fraction of the stats era. Flag them and keep them OUT of
                  # frequency/hot/cold/gap/pair rankings so they don't read as "cold".
                  "pool_added": {"since": "2026-04-14", "numbers": [51, 52]}},
    "lotto-6-49": {"pick": 6, "max": 49},
    "ontario-49": {"pick": 6, "max": 49},
    "daily-grand": {"pick": 5, "max": 49, "bonus_max": 7, "bonus_label": "Grand Number"},
    # Western Max: 7/49 until 2019-05-14, then 7/50 (never went to 7/52). Cut excludes
    # the 324 older 7/49 draws so the 50-ball pool isn't mixed with the 49-ball era.
    "western-max": {"pick": 7, "max": 50, "stats_from": "2019-05-14"},
    "western-6-49": {"pick": 6, "max": 49},
    "lottario": {"pick": 6, "max": 45, "bonus_max": 45, "bonus_label": "Bonus"},
    "megadice": {"pick": 6, "max": 39, "bonus_max": 39, "bonus_label": "Bonus"},
    "bc-49": {"pick": 6, "max": 49, "bonus_max": 49, "bonus_label": "Bonus"},
    "quebec-49": {"pick": 6, "max": 49, "bonus_max": 49, "bonus_label": "Bonus"},
    "quebec-max": {"pick": 7, "max": 52},
    "atlantic-49": {"pick": 6, "max": 49, "bonus_max": 49, "bonus_label": "Bonus"},
    "bucko": {"pick": 5, "max": 41},
    # ---- USA ----
    "powerball": {"pick": 5, "max": 69, "bonus_max": 26, "bonus_label": "Powerball",
                  "stats_from": "2015-10-07"},
    "mega-millions": {"pick": 5, "max": 70, "bonus_max": 24, "bonus_label": "Mega Ball",
                      "stats_from": "2017-10-31"},
    "cash4life": {"pick": 5, "max": 60, "bonus_max": 4, "bonus_label": "Cash Ball"},
    "new-york-lotto": {"pick": 6, "max": 59, "bonus_max": 59, "bonus_label": "Bonus"},
    "take-5": {"pick": 5, "max": 39},
    "pick-10": {"pick": 20, "max": 80},
    # ---- Europe ---- (two-secondary-ball games store both in bonus + bonus2)
    # EuroMillions: 5/50 + 2 Lucky Stars 1-12. Stars grew 1-11 -> 1-12 on 2016-09-24;
    # stats_from pins the star chart to the 12-star era.
    "euromillions": {"pick": 5, "max": 50, "bonus_max": 12, "bonus_label": "Lucky Stars",
                     "bonus_count": 2, "stats_from": "2016-09-24"},
    # EuroJackpot: 5/50 + 2 Euro numbers 1-12. Euro pool grew to 1-12 on 2022-03-25.
    "eurojackpot": {"pick": 5, "max": 50, "bonus_max": 12, "bonus_label": "Euro Numbers",
                    "bonus_count": 2, "stats_from": "2022-03-25"},
    # UK Lotto: 6/49 -> 6/59 on 2015-10-10; stats_from pins to the 59-ball era.
    "uk-lotto": {"pick": 6, "max": 59, "bonus_max": 59, "bonus_label": "Bonus Ball",
                 "stats_from": "2015-10-10"},
}


# Positional digit games: slug -> number of digit positions.
DIGIT_GAMES = {"numbers": 3, "win-4": 4}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def compute_digit_stats(slug, positions, draws):
    n = len(draws)
    per_pos = [Counter() for _ in range(positions)]
    overall = Counter()
    combos = Counter()
    sums = []
    for d in draws:
        digs = d["numbers"][:positions]
        if len(digs) != positions:
            continue
        for i, dv in enumerate(digs):
            per_pos[i][dv] += 1
            overall[dv] += 1
        combos["".join(str(x) for x in digs)] += 1
        sums.append(sum(digs))
    positional = [
        {"pos": i + 1, "digits": [{"d": dv, "count": per_pos[i].get(dv, 0)} for dv in range(10)]}
        for i in range(positions)
    ]
    return {
        "game": slug, "format": "digit", "positions": positions,
        "dataSince": draws[0]["date"] if draws else None, "drawCount": n,
        "allTimeDrawCount": n, "generatedAt": now_iso(),
        "positional": positional,
        "overall": [{"d": dv, "count": overall.get(dv, 0)} for dv in range(10)],
        "hotDigits": [dv for dv, _ in overall.most_common(3)],
        "topCombos": [{"combo": c, "count": ct} for c, ct in combos.most_common(12)],
        "sum": {"avg": round(sum(sums) / n, 1) if n else 0,
                "min": min(sums) if sums else 0, "max": max(sums) if sums else 0},
    }


def load_draws(slug):
    # Postgres text-date ordering is lexicographic = chronological (same as the old
    # "ORDER BY draw_date ASC"); (game_id, draw_date) is unique so there are no ties.
    rows = db.fetch_all(
        "draws", "draw_date,numbers,bonus,bonus2,jackpot",
        filters=[("eq", "game_id", slug)], order="draw_date")
    return [{"date": r["draw_date"], "numbers": [int(x) for x in r["numbers"].split(",") if x],
             "bonus": r["bonus"], "bonus2": r["bonus2"], "jackpot": r["jackpot"]} for r in rows]


def compute_stats(slug, cfg, draws):
    pick, mx = cfg["pick"], cfg["max"]
    # Numbers added to the pool partway through the stats era (e.g. Lotto Max 51-52).
    # They're excluded from ranking-type stats and flagged in the per-number list.
    pool_added = cfg.get("pool_added") or {}
    new_nums = set(pool_added.get("numbers", []))
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
        if num in new_nums:
            numbers[-1]["newSince"] = pool_added["since"]
    window = draws[-HOT_WINDOW:] if n > HOT_WINDOW else draws
    win_size = len(window)
    wf = Counter()
    for d in window:
        for x in d["numbers"]:
            if 1 <= x <= mx:
                wf[x] += 1
    # Rankings exclude pool-addition numbers (e.g. Lotto Max 51-52): they've existed for
    # only part of the era, so ranking them against full-era numbers would mislabel them
    # as "cold"/"least frequent". They still appear in the per-number grid and charts.
    rankable = [z for z in numbers if z["n"] not in new_nums]
    hot = [k for k, _ in wf.most_common() if k not in new_nums][:6]
    cold = [z["n"] for z in sorted(rankable, key=lambda z: z["currentGap"], reverse=True)[:6]]
    # top-7 by ALL-TIME count vs top-7 in the recent WINDOW — each paired with its
    # own bar heights so a chart never mixes time scales (see statistics UI).
    all_time_top = [z["n"] for z in sorted(rankable, key=lambda z: z["count"], reverse=True)[:7]]
    window_top = [k for k, _ in wf.most_common() if k not in new_nums][:7]
    window_chart = [{"n": num, "count": wf.get(num, 0)} for num in all_nums]
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
                         for z in sorted(rankable, key=lambda z: z["count"], reverse=True)[:10]],
        "leastFrequent": [{"n": z["n"], "count": z["count"]}
                          for z in sorted(rankable, key=lambda z: z["count"])[:10]],
        "oddEven": {"avgOdd": round(sum(odds) / n, 2) if n else 0,
                    "avgEven": round(pick - sum(odds) / n, 2) if n else 0,
                    "dist": [{"odd": k, "count": v} for k, v in sorted(Counter(odds).items())]},
        "highLow": {"avgLow": round(sum(lows) / n, 2) if n else 0,
                    "avgHigh": round(pick - sum(lows) / n, 2) if n else 0},
        "sum": {"avg": round(sum(sums) / n, 1) if n else 0, "min": min(sums) if sums else 0,
                "max": max(sums) if sums else 0, "buckets": hist(sums, sb)},
        "consecutive": {"drawsWith": cons, "pct": round(cons / n * 100, 1) if n else 0},
        "topPairs": [{"a": a, "b": b, "count": c} for (a, b), c in pair_counter.most_common()
                     if a not in new_nums and b not in new_nums][:10],
        "frequencyChart": [{"n": z["n"], "count": z["count"]} for z in numbers],
        "allTimeTop": all_time_top,
        "windowChart": window_chart,
        "windowTop": window_top,
        "windowSize": win_size,
    }
    # secondary pool (Powerball / Mega Ball / Bonus / EuroMillions Lucky Stars …).
    # Two-secondary games (bonus_count=2) draw two from the same pool — count both.
    if cfg.get("bonus_max"):
        bmax = cfg["bonus_max"]
        bcount = cfg.get("bonus_count", 1)
        bf = Counter()
        for d in draws:
            for bv in ((d.get("bonus"), d.get("bonus2")) if bcount > 1 else (d.get("bonus"),)):
                if bv and 1 <= bv <= bmax:
                    bf[bv] += 1
        if bf:
            agg["bonus"] = {
                "label": cfg.get("bonus_label", "Bonus"), "max": bmax, "count": bcount,
                "chart": [{"n": k, "count": bf.get(k, 0)} for k in range(1, bmax + 1)],
                "hot": [k for k, _ in bf.most_common(6)],
            }
    out = {"game": slug, "dataSince": draws[0]["date"] if draws else None,
           "drawCount": n, "pick": pick, "max": mx, "generatedAt": now_iso(),
           "statsFrom": cfg.get("stats_from"), "numbers": numbers, "aggregate": agg}
    if new_nums:
        out["poolAdded"] = {"since": pool_added["since"], "numbers": sorted(new_nums)}
    return out


WEEKDAY = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
           "Friday": 4, "Saturday": 5, "Sunday": 6}

# Games whose next-draw date is NOT scraped into game_meta (the European scraper
# only records draw results, not the operator's announced next draw/jackpot). Their
# schedule is fixed, so derive the next draw from it — mirroring lib/format.ts
# nextDrawDate/resolveNextDraw so JSON and UI agree. Source of truth: config/games.ts
# drawDays. Games with scraped meta ignore this and keep their real announced date.
DRAW_DAYS = {
    "euromillions": ["Tuesday", "Friday"],
    "eurojackpot": ["Tuesday", "Friday"],
    "uk-lotto": ["Wednesday", "Saturday"],
}


def next_scheduled_draw(draw_days, after: str):
    """First scheduled draw date strictly after `after` (the latest stored draw).
    'After the most recent draw' rather than 'after today' so a draw already held
    today isn't shown as upcoming; a stale DB self-corrects on the frontend via
    resolveNextDraw (which discards a past value)."""
    wanted = {WEEKDAY[d] for d in draw_days if d in WEEKDAY}
    if not wanted:
        return None
    start = date.fromisoformat(after) + timedelta(days=1)
    for off in range(8):
        d = start + timedelta(days=off)
        if d.weekday() in wanted:
            return d.isoformat()
    return None


def snapshot_jackpot(slug: str, amount) -> None:
    """One row/day in jackpot_snapshots for a game's current next-jackpot
    estimate (see supabase/migrations/0005_jackpot_snapshots.sql) — feeds a
    real trend into the weekly digest / news once a few weeks accumulate.
    Runs multiple times a day (each regional workflow's calculate_stats.py
    sees the full game_meta table); the unique (game_slug, captured_date)
    index + ignore_duplicates makes repeats a no-op. Never fails the stats
    run — a snapshot miss just costs one day of trend data."""
    if amount is None:
        return
    try:
        db.get_client().table("jackpot_snapshots").upsert(
            {"game_slug": slug, "amount": amount},
            on_conflict="game_slug,captured_date", ignore_duplicates=True,
        ).execute()
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] jackpot snapshot failed for {slug}: {e}")


def write_draws(slug, draws, meta):
    # `meta` is this slug's game_meta row dict (or None).
    # Prefer the scraped next-draw date; for games without one (Europe), compute it
    # from the fixed schedule so nextDraw is never null.
    next_draw = meta["next_draw_date"] if (meta and meta.get("next_draw_date")) else None
    if not next_draw and slug in DRAW_DAYS and draws:
        next_draw = next_scheduled_draw(DRAW_DAYS[slug], draws[-1]["date"])
    # Emit bonus2 only for games that use it, so single-bonus draw JSON stays lean.
    out_draws = []
    for d in reversed(draws):
        row = {"date": d["date"], "numbers": d["numbers"], "bonus": d["bonus"], "jackpot": d["jackpot"]}
        if d.get("bonus2") is not None:
            row["bonus2"] = d["bonus2"]
        out_draws.append(row)
    payload = {"game": slug, "dataSince": draws[0]["date"] if draws else None,
               "drawCount": len(draws), "nextDraw": next_draw,
               "nextJackpot": meta["next_jackpot"] if meta else None, "generatedAt": now_iso(),
               "draws": out_draws}
    (DRAWS_DIR / f"{slug}.json").write_text(json.dumps(payload, indent=2) + "\n")
    return payload


def main() -> int:
    DRAWS_DIR.mkdir(parents=True, exist_ok=True); STATS_DIR.mkdir(parents=True, exist_ok=True)
    # One fetch of the tiny game_meta table; look up per slug below.
    meta_by_game = {m["game_id"]: m for m in db.fetch_all("game_meta")}
    latest_all = []
    for slug, cfg in GAMES.items():
        draws = load_draws(slug)
        if not draws:
            continue
        payload = write_draws(slug, draws, meta_by_game.get(slug))
        snapshot_jackpot(slug, payload["nextJackpot"])
        era = [d for d in draws if not cfg.get("stats_from") or d["date"] >= cfg["stats_from"]]
        stats = compute_stats(slug, cfg, era)
        stats["allTimeDrawCount"] = len(draws)
        (STATS_DIR / f"{slug}.json").write_text(json.dumps(stats, indent=2) + "\n")
        newest = draws[-1]
        latest_all.append({"slug": slug, "latestDate": newest["date"], "numbers": newest["numbers"],
                           "bonus": newest["bonus"], "bonus2": newest.get("bonus2"),
                           "nextDraw": payload["nextDraw"],
                           "nextJackpot": payload["nextJackpot"], "drawCount": len(draws),
                           "dataSince": payload["dataSince"]})
        era_note = f" (stats era {cfg['stats_from']}+: {len(era)})" if cfg.get("stats_from") else ""
        print(f"✓ {slug}: {len(draws)} draws{era_note}, hot={stats['aggregate']['hot'][:3]}")

    # positional digit games (separate stats shape)
    for slug, positions in DIGIT_GAMES.items():
        draws = load_draws(slug)
        if not draws:
            continue
        payload = write_draws(slug, draws, meta_by_game.get(slug))
        stats = compute_digit_stats(slug, positions, draws)
        (STATS_DIR / f"{slug}.json").write_text(json.dumps(stats, indent=2) + "\n")
        newest = draws[-1]
        latest_all.append({"slug": slug, "latestDate": newest["date"], "numbers": newest["numbers"],
                           "bonus": None, "nextDraw": payload["nextDraw"], "nextJackpot": None,
                           "drawCount": len(draws), "dataSince": payload["dataSince"]})
        print(f"✓ {slug}: {len(draws)} digit draws, hot digits={stats['hotDigits']}")

    (DRAWS_DIR / "_latest.json").write_text(json.dumps(
        {"generatedAt": now_iso(), "games": latest_all}, indent=2) + "\n")
    print(f"✓ _latest.json ({len(latest_all)} games)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
