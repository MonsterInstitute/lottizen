#!/usr/bin/env python3
"""weekly_picks.py — "This week's pick" and "Skip" for each province.

    python scripts/weekly_picks.py            # update weekly_picks, write data/picks/canada.json
    python scripts/weekly_picks.py --dry-run  # compute and print only

Rules (agreed 2026-10-10; CLAUDE.md honesty constraints apply):

  * Only games that are ON SALE (games.on_sale = true, i.e. in the agency's
    current catalog). An agency with no reliable on-sale signal gets no pick
    and no skip list — "still on the prize list" is never treated as on sale.
  * PICK: on sale, at least one top prize left, highest Value Score; ties
    (ALC scores most games 100) broken by more top prizes left, then lower
    price, then name. One overall pick plus one per price band. The page
    labels it "This week's pick" and always adds "This is about prize money
    left, not your odds."
  * Chosen once a week (Monday, Toronto) and kept for the week, but checked
    every day: a pick that stops being on sale or loses its last top prize
    is replaced that day, with the reason recorded and shown.
  * SKIP: on sale and every top prize claimed — a fact, recomputed daily.
    No "value line": Value Score assumes a 62% payout rate, so any cutoff on
    it would be a line we made up.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "picks" / "canada.json"
TZ = ZoneInfo("America/Toronto")
PROVINCE_OF = {"OLG": "ontario", "BCLC": "british-columbia", "WCLC": "western", "ALC": "atlantic", "QUEBEC": "quebec"}
LABEL = {"ontario": "Ontario", "british-columbia": "British Columbia", "western": "Alberta, Saskatchewan & Manitoba",
         "atlantic": "Atlantic Canada", "quebec": "Quebec"}
AGENCY_NAME = {"OLG": "OLG", "BCLC": "BCLC", "WCLC": "WCLC", "ALC": "Atlantic Lottery", "QUEBEC": "Loto-Québec"}
RETENTION = {"OLG", "BCLC", "QUEBEC"}  # publish printed AND remaining counts for every tier
BANDS = (("1-5", 1, 5), ("10", 6, 10), ("20+", 11, 10_000))


# ------------------------------------------------------------------ pure rules

def eligible(g: dict) -> bool:
    return g.get("on_sale") is True and (g.get("top_remaining") or 0) >= 1 and g.get("value_score") is not None


def pick_order(g: dict) -> tuple:
    return (-g["value_score"], -(g.get("top_remaining") or 0), g["price"], g["name"])


def choose(games: list[dict]) -> dict[str, dict | None]:
    """{'overall': game, '1-5': game, '10': game, '20+': game} (None where none qualifies)."""
    pool = sorted((g for g in games if eligible(g)), key=pick_order)
    out: dict[str, dict | None] = {"overall": pool[0] if pool else None}
    for band, lo, hi in BANDS:
        out[band] = next((g for g in pool if lo <= g["price"] <= hi), None)
    return out


def skip_list(games: list[dict]) -> list[dict]:
    return sorted((g for g in games if g.get("on_sale") is True and g.get("top_remaining") == 0),
                  key=lambda g: (-g["price"], g["name"]))


def why_replaced(g: dict | None) -> str | None:
    """None if a stored pick is still eligible, else the reason it isn't."""
    if g is None:
        return "no longer on the agency's prize list"
    if g.get("on_sale") is not True:
        return "no longer on sale"
    if (g.get("top_remaining") or 0) < 1:
        return "its last top prize was claimed"
    if g.get("value_score") is None:
        return "no longer scored"
    return None


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


# ------------------------------------------------------------------ data

def load_games() -> dict[str, list[dict]]:
    """agency -> games with on_sale, top-tier counts, Value Score and the
    published share of printed prize money still unclaimed (where it exists)."""
    import db
    games = db.fetch_all("games", "game_number,agency,name,slug,province,price,on_sale,launch_date")
    tiers = db.fetch_all("prize_tiers", "id,game_number,agency,amount,label,total,remaining,is_top")
    latest = max(r["captured_date"] for r in db.fetch_all(
        "scratch_rank_snapshots", "id,captured_date",
        filters=[("gte", "captured_date", (date.today() - timedelta(days=7)).isoformat())]))
    scores = {(r["agency"], r["game_slug"]): r for r in db.fetch_all(
        "scratch_rank_snapshots", "id,agency,game_slug,rank,value_score", filters=[("eq", "captured_date", latest)])}
    by_game: dict[tuple, list] = {}
    for t in tiers:
        by_game.setdefault((t["agency"], t["game_number"]), []).append(t)
    out: dict[str, list[dict]] = {}
    for g in games:
        ts = by_game.get((g["agency"], g["game_number"]), [])
        top = next((t for t in ts if t["is_top"]), None)
        valued = [t for t in ts if t["amount"] > 0 and t["total"] > 0]
        printed = sum(t["total"] * t["amount"] for t in valued)
        left = sum(t["remaining"] * t["amount"] for t in valued)
        sc = scores.get((g["agency"], g["slug"]))
        out.setdefault(g["agency"], []).append({
            "agency": g["agency"], "game_number": g["game_number"], "slug": g["slug"], "name": g["name"],
            "province": PROVINCE_OF[g["agency"]], "price": float(g["price"]), "on_sale": g["on_sale"],
            "launch_date": g["launch_date"],
            "top_label": top["label"] if top else None, "top_amount": float(top["amount"]) if top else None,
            "top_total": top["total"] if top and top["total"] else None,
            "top_remaining": top["remaining"] if top else None,
            "value_score": sc["value_score"] if sc else None, "rank": sc["rank"] if sc else None,
            "share_left_pct": round(100 * left / printed, 1) if g["agency"] in RETENTION and printed > 0 else None,
        })
    return out


def public(g: dict | None) -> dict | None:
    if g is None:
        return None
    return {k: g[k] for k in ("agency", "game_number", "slug", "name", "province", "price", "top_label", "top_amount",
                              "top_total", "top_remaining", "share_left_pct", "rank")}


def run(dry: bool) -> int:
    import db
    today = datetime.now(TZ).date()
    ws = week_start(today)
    games = load_games()
    client = db.get_client()
    stored = db.fetch_all("weekly_picks", "id,week_start,province,band,agency,game_number,game_slug,chosen_on,"
                                          "replaced_on,replaced_reason",
                          filters=[("eq", "week_start", ws.isoformat())])
    result = {"generatedAt": datetime.now(TZ).isoformat(timespec="seconds"), "asOf": today.isoformat(),
              "weekStart": ws.isoformat(), "provinces": {}}
    for agency, gs in sorted(games.items()):
        prov = PROVINCE_OF[agency]
        known = any(g["on_sale"] is not None for g in gs)
        entry = {"province": prov, "label": LABEL[prov], "agency": agency, "agencyName": AGENCY_NAME[agency],
                 "onSaleKnown": known, "onSaleCount": sum(1 for g in gs if g["on_sale"] is True),
                 "listedCount": len(gs), "picks": {}, "replacements": [], "skip": []}
        result["provinces"][prov] = entry
        if not known:
            continue  # no reliable on-sale signal: no pick, no skip list
        by_key = {g["game_number"]: g for g in gs}
        fresh = choose(gs)
        for band in ("overall", *(b for b, _, _ in BANDS)):
            current = next((r for r in stored if r["province"] == prov and r["band"] == band and not r["replaced_on"]), None)
            chosen = by_key.get(current["game_number"]) if current else None
            reason = why_replaced(chosen) if current else None
            if current and reason is None:
                entry["picks"][band] = public(chosen)
                continue
            new = fresh[band]
            if current and not dry:
                client.table("weekly_picks").update({"replaced_on": today.isoformat(), "replaced_reason": reason}) \
                    .eq("id", current["id"]).execute()
            if current:
                old = by_key.get(current["game_number"])
                entry["replacements"].append({"band": band, "on": today.isoformat(), "reason": reason,
                                              "old": {"name": old["name"] if old else current["game_slug"],
                                                      "slug": current["game_slug"]}})
            if new and not dry:
                client.table("weekly_picks").insert({
                    "week_start": ws.isoformat(), "province": prov, "band": band, "agency": agency,
                    "game_number": new["game_number"], "game_slug": new["slug"], "chosen_on": today.isoformat()}).execute()
            entry["picks"][band] = public(new)
        # earlier replacements this week, so the page can say what changed
        for r in stored:
            if r["province"] == prov and r["replaced_on"] and r["replaced_on"] != today.isoformat():
                entry["replacements"].append({"band": r["band"], "on": r["replaced_on"], "reason": r["replaced_reason"],
                                              "old": {"name": (by_key.get(r["game_number"]) or {}).get("name", r["game_slug"]),
                                                      "slug": r["game_slug"]}})
        entry["skip"] = [public(g) for g in skip_list(gs)]
    for prov, e in result["provinces"].items():
        p = e["picks"].get("overall")
        print(f"{e['label']}: " + (f"pick {p['name']} (${p['price']:.0f}); " if p else "no pick; ")
              + (f"{len(e['skip'])} to skip" if e["onSaleKnown"] else "on-sale status unknown")
              + (f"; {len(e['replacements'])} replacement(s)" if e["replacements"] else ""))
    if not dry:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(result, indent=1))
        print(f"✓ wrote {OUT.relative_to(ROOT)}")
        # Redeploy only when what a reader sees changed (not just generatedAt).
        published = db.get_client().table("site_json").select("content").eq("path", "picks/canada.json").execute().data
        strip = lambda d: {k: v for k, v in d.items() if k != "generatedAt"}  # noqa: E731
        changed = not published or strip(json.loads(published[0]["content"])) != strip(result)
        import os
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
                fh.write(f"changed={'true' if changed else 'false'}\n")
        print("picks changed" if changed else "picks unchanged")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    return run(ap.parse_args().dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
