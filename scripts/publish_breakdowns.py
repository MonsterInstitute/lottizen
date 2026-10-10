#!/usr/bin/env python3
"""publish_breakdowns.py — data/breakdowns/<game>.json for the "Did anyone
win?" and per-draw result pages (app/news/did-anyone-win-*, app/news/*-results-*).

Only the six games whose operator publishes a prize breakdown (BCLC PlayNow /
WCLC): for every other game, whether anyone won is not a fact we hold, so
those pages don't exist. Each file holds the last 60 draws that have a
breakdown: winning numbers, every tier's winners and per-ticket prize as
published, and the next draw / jackpot only when the operator's figure is
for that upcoming draw. Run by news-daily.yml, published as category
"breakdowns".
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
from game_meta import GAME_META  # noqa: E402

GAMES = ("lotto-max", "lotto-6-49", "daily-grand", "bc-49", "western-max", "western-6-49")
OUT = Path(__file__).resolve().parent.parent / "data" / "breakdowns"
KEEP = 60


def main() -> int:
    today = datetime.now(ZoneInfo("America/Toronto")).date().isoformat()
    OUT.mkdir(parents=True, exist_ok=True)
    for slug in GAMES:
        bd = db.fetch_all("prize_breakdowns", "id,draw_date,tier_code,tier_label,match_main,match_bonus,winners,"
                                              "prize_cents,prize_label,source,source_url",
                          filters=[("eq", "game_slug", slug)])
        by: dict[str, list[dict]] = defaultdict(list)
        for r in bd:
            by[r["draw_date"]].append(r)
        dates = sorted(by, reverse=True)[:KEEP]
        draws = {r["draw_date"]: r for r in db.fetch_all("draws", "draw_date,numbers,bonus",
                                                         filters=[("eq", "game_id", slug), ("gte", "draw_date", dates[-1])])} if dates else {}
        all_top = sorted(((d, sorted(v, key=lambda r: (-r["match_main"], not r["match_bonus"]))[0]) for d, v in by.items()),
                         key=lambda x: x[0])
        gm = db.get_client().table("game_meta").select("next_draw_date,next_jackpot").eq("game_id", slug).execute().data
        nd = gm[0]["next_draw_date"] if gm else None
        out = {
            "slug": slug, "name": GAME_META[slug]["name"], "generatedAt": datetime.now(ZoneInfo("America/Toronto")).isoformat(timespec="seconds"),
            "nextDraw": nd if nd and nd >= today else None,
            "nextJackpot": gm[0]["next_jackpot"] if gm and nd and nd >= today and GAME_META[slug].get("progressive") else None,
            # every top-prize win we hold a breakdown for, newest first
            "topWins": [{"date": d, "winners": t["winners"]} for d, t in reversed(all_top) if (t["winners"] or 0) > 0],
            "breakdownsSince": all_top[0][0] if all_top else None,
            "draws": [],
        }
        for d in dates:
            tiers = sorted(by[d], key=lambda r: (-r["match_main"], not r["match_bonus"]))
            dr = draws.get(d)
            out["draws"].append({
                "date": d,
                "numbers": [int(x) for x in str(dr["numbers"]).split(",")] if dr else None,
                "bonus": dr["bonus"] if dr else None,
                "sourceUrl": tiers[0]["source_url"],
                "source": tiers[0]["source"],
                "tiers": [{"code": t["tier_code"], "label": t["tier_label"], "winners": t["winners"],
                           "prize": t["prize_cents"] / 100 if t["prize_cents"] is not None else None,
                           "prizeLabel": t["prize_label"]} for t in tiers],
            })
        (OUT / f"{slug}.json").write_text(json.dumps(out, indent=1))
        print(f"✓ {slug}: {len(out['draws'])} draws, latest {dates[0] if dates else '—'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
