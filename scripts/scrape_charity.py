#!/usr/bin/env python3
"""Scrape every charity lottery in scripts/charity/registry.py into Supabase.

  charity_lotteries  registry rows (names, URLs, platform)
  charity_editions   one row per edition / 50/50 event, figures as published
  charity_snapshots  one row per open edition per day (pot, sold out, days left)
  charity_results    winning numbers (never winners' names)

Each lottery is isolated: one failing site never stops the others. Rules-page
patterns that stop matching are written to data/charity/drift.json so the
workflow can open an [auto] issue (never guessed around).

    python scripts/scrape_charity.py              # all
    python scripts/scrape_charity.py --only jets-5050 --backfill
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
from charity import ascend, bump, rules, stride, tap  # noqa: E402
from charity.registry import LOTTERIES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TZ = ZoneInfo("America/Toronto")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def run_one(lot: dict, backfill: bool) -> tuple[list[dict], list[dict]]:
    p = lot["platform"]
    if p == "rules":
        return rules.scrape(lot)
    if p == "stride":
        return stride.scrape(lot)
    if p == "ascend":
        return ascend.scrape(lot)
    if p == "ascend-pot":
        return ascend.scrape_pot(lot)
    if p == "tap":
        return tap.scrape(lot)
    if p == "bump":
        eds, res = bump.scrape_5050(lot)
        if backfill:
            res += bump.history(lot)
        else:
            res += bump.history(lot, max_pages=1)
        return eds, res
    if p == "bump-home":
        eds, res = bump.scrape_home(lot)
        if lot.get("rules_url"):
            try:
                r_eds, _ = rules.scrape(lot)
            except Exception as e:  # noqa: BLE001
                print(f"  ! {lot['id']} rules page: {e}", file=sys.stderr)
                r_eds = []
            if eds and r_eds:  # the API's sales window and tiers + the rules page's facts
                api, rp = eds[0], r_eds[0]
                merged = {**rp, **{k: v for k, v in api.items() if v not in (None, [], {})}}
                merged["draws"] = rp.get("draws") or api.get("draws")
                merged["raw"] = {**(rp.get("raw") or {}), **(api.get("raw") or {})}
                eds = [merged]
            elif r_eds:
                eds = r_eds
        return eds, res
    raise ValueError(f"unknown platform {p}")


def lottery_row(l: dict) -> dict:
    return {
        "id": l["id"], "name": l["name"], "kind": l["kind"], "phase": l.get("phase", 1), "operator": l.get("operator"),
        "province": l["province"], "provinces": l.get("provinces") or [l["province"]], "platform": l["platform"],
        "platform_ref": l.get("ref"), "url": l.get("url"), "rules_url": l.get("rules_url"), "buy_url": l.get("buy_url"),
        "results_url": l.get("results_url"), "team": l.get("team"), "active": True, "updated_at": now_iso(),
    }


def days_to(close: str | None) -> int | None:
    if not close:
        return None
    d = datetime.fromisoformat(close).astimezone(TZ).date()
    return (d - datetime.now(TZ).date()).days


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--backfill", action="store_true", help="full results history where the vendor has it")
    args = ap.parse_args()
    lots = [l for l in LOTTERIES if not args.only or l["id"] in args.only.split(",")]
    db.upsert_rows("charity_lotteries", [lottery_row(l) for l in lots], on_conflict="id")

    today = datetime.now(TZ).date().isoformat()
    drift, failures = [], []
    n_ed = n_res = 0
    for l in lots:
        try:
            eds, res = run_one(l, args.backfill)
        except Exception as e:  # noqa: BLE001
            failures.append(l["id"])
            print(f"  ✗ {l['id']}: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
            continue
        rows = []
        for e in eds:
            miss = (e.get("raw") or {}).get("missing")
            if miss:
                drift.append({"lottery": l["id"], "missing": miss, "url": l.get("rules_url")})
            rows.append({
                "lottery_id": l["id"], "edition": e["edition"], "title": e.get("title"), "licence_no": e.get("licence_no"),
                "status": e.get("status"), "ticket_cap": e.get("ticket_cap"), "prize_count": e.get("prize_count"),
                "prize_value": e.get("prize_value"), "grand_prize": e.get("grand_prize"),
                "grand_prize_value": e.get("grand_prize_value"), "odds": e.get("odds"), "price_tiers": e.get("price_tiers"),
                "draws": e.get("draws"), "sales_open": e.get("sales_open"), "sales_close": e.get("sales_close"),
                "draw_date": e.get("draw_date"), "jackpot": e.get("jackpot"), "jackpot_at": e.get("jackpot_at"),
                "sold_out": e.get("sold_out"), "source_url": e.get("source_url"), "raw": e.get("raw"),
                "scraped_at": now_iso(), "updated_at": now_iso(),
            })
        if rows:
            db.upsert_rows("charity_editions", rows, on_conflict="lottery_id,edition")
            n_ed += len(rows)
            snaps = [{"lottery_id": l["id"], "edition": r["edition"], "captured_date": today, "jackpot": r["jackpot"],
                      "sold_out": r["sold_out"], "status": r["status"], "days_to_close": days_to(r["sales_close"]),
                      "captured_at": now_iso()}
                     for r in rows if r["status"] in ("on_sale", "sold_out", "upcoming")]
            if snaps:
                db.upsert_rows("charity_snapshots", snaps, on_conflict="lottery_id,edition,captured_date")
        seen = set()
        rres = []
        for r in res:
            key = (r["edition"], r["draw_name"])
            if key in seen:
                continue
            seen.add(key)
            rres.append({"lottery_id": l["id"], "edition": r["edition"], "draw_name": r["draw_name"],
                         "draw_date": r.get("draw_date"), "winning_numbers": r.get("winning_numbers"),
                         "prize": r.get("prize"), "prize_value": r.get("prize_value"), "pot": r.get("jackpot"),
                         "source_url": r.get("source_url"), "scraped_at": now_iso()})
        if rres:
            db.upsert_rows("charity_results", rres, on_conflict="lottery_id,edition,draw_name")
            n_res += len(rres)
        print(f"  ✓ {l['id']}: {len(rows)} edition(s), {len(rres)} result(s)")

    out = ROOT / "data" / "charity"
    out.mkdir(parents=True, exist_ok=True)
    (ROOT / "data" / "charity-drift.json").write_text(json.dumps({"drift": drift, "failures": failures}, indent=1))
    print(f"✓ {n_ed} editions, {n_res} results; {len(failures)} failed, {len(drift)} with unmatched patterns")
    # Too many failures at once means something systemic (network, schema): fail the run.
    return 1 if failures and len(failures) > len(lots) // 2 else 0


if __name__ == "__main__":
    sys.exit(main())
