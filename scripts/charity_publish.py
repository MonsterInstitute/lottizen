#!/usr/bin/env python3
"""Build data/charity/index.json (lib/charity.ts) from the charity_* tables.

Per lottery: registry fields, the current edition (the open one closing
soonest, else the most recent), up to 12 recent editions, daily snapshots of
the current edition, and published winning numbers (newest first, up to 300).
Winners' names are never stored, so they can't appear here.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
from charity.registry import LOTTERIES  # noqa: E402

TARGET = {x["id"]: x.get("target_card") for x in LOTTERIES}

ROOT = Path(__file__).resolve().parent.parent
OPEN = ("on_sale", "sold_out", "upcoming")


def edition_json(e: dict, snaps: list[dict]) -> dict:
    raw = e.get("raw") or {}
    return {
        "edition": e["edition"], "title": e.get("title"), "status": e.get("status"), "licenceNo": e.get("licence_no"),
        "ticketCap": e.get("ticket_cap"), "prizeCount": e.get("prize_count"),
        "prizeValue": float(e["prize_value"]) if e.get("prize_value") is not None else None,
        "grandPrize": e.get("grand_prize"),
        "grandPrizeValue": float(e["grand_prize_value"]) if e.get("grand_prize_value") is not None else None,
        "odds": e.get("odds") or [], "priceTiers": [t for t in (e.get("price_tiers") or []) if t.get("tickets") and t.get("price")],
        "draws": [{"name": d.get("name"), "cutoff": d.get("cutoff"), "drawDate": d.get("draw_date"),
                   "prize": d.get("prize"), "prizeValue": d.get("prize_value")} for d in (e.get("draws") or [])],
        "salesOpen": e.get("sales_open"), "salesClose": e.get("sales_close"), "drawDate": e.get("draw_date"),
        "jackpot": float(e["jackpot"]) if e.get("jackpot") is not None else None, "jackpotAt": e.get("jackpot_at"),
        "soldOut": e.get("sold_out"), "sourceUrl": e.get("source_url"), "scrapedAt": e.get("scraped_at"),
        "percentPrize": raw.get("percent_prize"), "guarantee": raw.get("guarantee"),
        "cardsLeft": raw.get("cards_left"), "cardsTotal": raw.get("cards_total"),
        "weeklyPot": raw.get("weekly_pot"), "weeklyPrize": raw.get("weekly_prize"), "potOnly": bool(raw.get("pot_only")),
        "eligibility": raw.get("eligibility") or [], "quotes": raw.get("quotes") or {},
        "history": [{"date": s["captured_date"], "jackpot": float(s["jackpot"]) if s.get("jackpot") is not None else None,
                     "soldOut": s.get("sold_out")} for s in sorted(snaps, key=lambda s: s["captured_date"])],
    }


OLG_LOTTO_MAX = "https://www.olg.ca/en/lottery/play-lotto-max-encore/about.html"


def lotto_max_odds() -> dict | None:
    """Lotto Max's published odds per $6 play, read from OLG's own page (for
    the province pages' "$100 three ways" comparison). None if not found."""
    import re
    from charity.common import fetch, text_of
    try:
        t = text_of(fetch(OLG_LOTTO_MAX))
    except Exception as e:  # noqa: BLE001
        print(f"  ! Lotto Max odds: {e}", file=sys.stderr)
        return None
    anyp = re.search(r"The odds of winning any prize are (1 in [\d.,]+) per \$(\d+) play", t)
    jack = re.search(r"jackpot odds are (1 in [\d,]+) per \$\d+ play", t)
    if not (anyp and jack):
        return None
    return {"name": "Lotto Max", "price": int(anyp.group(2)), "anyPrize": anyp.group(1), "jackpot": jack.group(1),
            "quotes": [anyp.group(0), jack.group(0)], "sourceUrl": OLG_LOTTO_MAX}


def main() -> int:
    lots = db.fetch_all("charity_lotteries", "*")
    eds = db.fetch_all("charity_editions", "*")
    snaps = db.fetch_all("charity_snapshots", "*")
    res = db.fetch_all("charity_results", "lottery_id,edition,draw_name,draw_date,winning_numbers,prize,prize_value,pot,source_url")
    now = datetime.now(timezone.utc).isoformat()
    by_lot: dict[str, list] = {}
    for e in eds:
        by_lot.setdefault(e["lottery_id"], []).append(e)
    snaps_of: dict[tuple, list] = {}
    for s in snaps:
        snaps_of.setdefault((s["lottery_id"], s["edition"]), []).append(s)
    res_of: dict[str, list] = {}
    for r in res:
        res_of.setdefault(r["lottery_id"], []).append(r)

    out = []
    for l in sorted(lots, key=lambda x: x["id"]):
        if not l.get("active", True):
            continue
        mine = by_lot.get(l["id"], [])
        open_ = [e for e in mine if e.get("status") in OPEN and (not e.get("sales_close") or e["sales_close"] > now)]
        open_.sort(key=lambda e: e.get("sales_close") or "9999")
        recent = sorted(mine, key=lambda e: e.get("sales_close") or e.get("draw_date") or e.get("scraped_at") or "", reverse=True)
        current = open_[0] if open_ else (recent[0] if recent else None)
        results = []
        for r in sorted(res_of.get(l["id"], []), key=lambda r: (r.get("draw_date") or "", r["draw_name"]), reverse=True)[:300]:
            draw, _, event = r["draw_name"].partition(" · ")
            results.append({"edition": r["edition"], "drawName": draw, "event": event or None, "drawDate": r.get("draw_date"),
                            "winningNumbers": r.get("winning_numbers") or [], "prize": r.get("prize"),
                            "prizeValue": float(r["prize_value"]) if r.get("prize_value") is not None else None,
                            "pot": float(r["pot"]) if r.get("pot") is not None else None, "sourceUrl": r.get("source_url")})
        out.append({
            "id": l["id"], "name": l["name"], "kind": l["kind"], "phase": l.get("phase") or 1, "operator": l.get("operator"),
            "province": l["province"], "provinces": l.get("provinces") or [l["province"]],
            "licenceAuthority": l.get("licence_authority"), "platform": l.get("platform"), "url": l.get("url"),
            "rulesUrl": l.get("rules_url"), "buyUrl": l.get("buy_url"), "resultsUrl": l.get("results_url"),
            "team": l.get("team"), "targetCard": TARGET.get(l["id"]),
            "current": edition_json(current, snaps_of.get((l["id"], current["edition"]), [])) if current else None,
            "editions": [edition_json(e, []) for e in recent[:12]],
            "results": results,
        })
    path = ROOT / "data" / "charity" / "index.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                                "drawGame": lotto_max_odds(), "lotteries": out}, separators=(",", ":")))
    print(f"✓ wrote {path.relative_to(ROOT)}: {len(out)} lotteries, {sum(len(x['results']) for x in out)} results "
          f"({path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
