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
LABEL = {"ontario": "Ontario", "british-columbia": "British Columbia", "alberta": "Alberta",
         "saskatchewan": "Saskatchewan", "manitoba": "Manitoba", "territories": "Yukon, Northwest Territories & Nunavut",
         "atlantic": "Atlantic Canada", "quebec": "Quebec"}
# Where buyers are. Each agency sells across one or more of these; a game
# with sold_in set (0032) is only shown in the regions it's sold in. The
# territories get WCLC's region-wide games only.
REGIONS = {"OLG": [("ontario", None)], "BCLC": [("british-columbia", None)], "ALC": [("atlantic", None)],
           "QUEBEC": [("quebec", None)],
           "WCLC": [("alberta", "AB"), ("saskatchewan", "SK"), ("manitoba", "MB"), ("territories", "")]}


def sold_here(g: dict, code: str | None) -> bool:
    """code None = the agency's single region; "" = only region-wide games."""
    if code is None or not g.get("sold_in"):
        return True
    return code in g["sold_in"]
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


NEW_DAYS = 35
MONTH_DAYS = 30


def monthly(games: list[dict], ranks: dict[str, list[int]], days: int) -> list[dict]:
    """Steadier than a week: on-sale games with a top prize left today, ranked
    by their average daily rank over the last MONTH_DAYS days. A game needs a
    rank on at least 75% of those days to count (new games aren't in it)."""
    out = []
    for g in games:
        r = ranks.get(g["slug"]) or []
        if not eligible(g) or days == 0 or len(r) < 0.75 * days:
            continue
        out.append(g | {"avg_rank": round(sum(r) / len(r), 1), "days_ranked": len(r)})
    return sorted(out, key=lambda g: (g["avg_rank"], g["price"], g["name"]))


def new_tickets(games: list[dict], today: date) -> list[dict]:
    """On sale and launched within the last NEW_DAYS days, newest first. A new
    game has had the least time for its prizes to be claimed — a statement
    about prize money, never about odds."""
    since = (today - timedelta(days=NEW_DAYS)).isoformat()
    return sorted((g for g in games if g.get("on_sale") is True and g.get("launch_date") and since <= g["launch_date"] <= today.isoformat()),
                  key=lambda g: (g["launch_date"], g["price"]), reverse=True)


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
    games = db.fetch_all("games", "game_number,agency,name,slug,province,price,on_sale,launch_date,sold_in")
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
            "launch_date": g["launch_date"], "sold_in": g.get("sold_in"),
            "top_label": top["label"] if top else None, "top_amount": float(top["amount"]) if top else None,
            "top_total": top["total"] if top and top["total"] else None,
            "top_remaining": top["remaining"] if top else None,
            "value_score": sc["value_score"] if sc else None, "rank": sc["rank"] if sc else None,
            "share_left_pct": round(100 * left / printed, 1) if g["agency"] in RETENTION and printed > 0 else None,
        })
    return out


def lotto_max_facts(today: date) -> dict | None:
    """For the "$20 four ways" comparison: Lotto Max's next draw, its jackpot
    only if published for that draw, and what each prize tier paid in the
    latest draw with a published breakdown (amounts change every draw)."""
    import db
    gm = db.get_client().table("game_meta").select("next_draw_date,next_jackpot").eq("game_id", "lotto-max").execute().data
    bd = db.fetch_all("prize_breakdowns", "id,draw_date,tier_code,match_main,match_bonus,winners,prize_cents,prize_label,source_url",
                      filters=[("eq", "game_slug", "lotto-max")])
    if not bd:
        return None
    latest = max(r["draw_date"] for r in bd)
    tiers = sorted((r for r in bd if r["draw_date"] == latest), key=lambda r: (-r["match_main"], not r["match_bonus"]))
    nd = gm[0]["next_draw_date"] if gm else None
    return {
        "nextDraw": nd if nd and nd >= today.isoformat() else None,
        "jackpot": gm[0]["next_jackpot"] if gm and nd and nd >= today.isoformat() else None,
        "breakdownDate": latest,
        "sourceUrl": tiers[0]["source_url"] if tiers else None,
        "tiers": [{"tier": r["tier_code"], "winners": r["winners"],
                   "prize": (r["prize_cents"] / 100) if r["prize_cents"] else None, "label": r["prize_label"]} for r in tiers],
    }


def public(g: dict | None) -> dict | None:
    if g is None:
        return None
    return {k: g[k] for k in ("agency", "game_number", "slug", "name", "province", "price", "top_label", "top_amount",
                              "top_total", "top_remaining", "share_left_pct", "rank", "sold_in")}


def run(dry: bool) -> int:
    import db
    today = datetime.now(TZ).date()
    ws = week_start(today)
    games = load_games()
    client = db.get_client()
    coming = db.fetch_all("scratch_coming_soon", "agency,game_number,name,price")
    since = (today - timedelta(days=MONTH_DAYS)).isoformat()
    hist = db.fetch_all("scratch_rank_snapshots", "id,agency,game_slug,captured_date,rank",
                        filters=[("gte", "captured_date", since)])
    ranks_by: dict[str, dict[str, list[int]]] = {}
    days_by: dict[str, set] = {}
    for r in hist:
        ranks_by.setdefault(r["agency"], {}).setdefault(r["game_slug"], []).append(r["rank"])
        days_by.setdefault(r["agency"], set()).add(r["captured_date"])
    stored = db.fetch_all("weekly_picks", "id,week_start,province,band,agency,game_number,game_slug,chosen_on,"
                                          "replaced_on,replaced_reason",
                          filters=[("eq", "week_start", ws.isoformat())])
    result = {"generatedAt": datetime.now(TZ).isoformat(timespec="seconds"), "asOf": today.isoformat(),
              "weekStart": ws.isoformat(), "provinces": {}}
    regions = [(agency, prov, code, [g for g in all_gs if sold_here(g, code)])
               for agency, all_gs in sorted(games.items()) for prov, code in REGIONS[agency]]
    for agency, prov, code, gs in regions:
        known = any(g["on_sale"] is not None for g in gs)
        entry = {"province": prov, "scratchSlug": PROVINCE_OF[agency], "label": LABEL[prov], "agency": agency,
                 "agencyName": AGENCY_NAME[agency],
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
        entry["newTickets"] = [public(g) | {"launch_date": g["launch_date"]} for g in new_tickets(gs, today)]
        entry["launchDatesKnown"] = any(g.get("launch_date") for g in gs)
        entry["month"] = {"days": len(days_by.get(agency, ())), "since": since,
                          "top": [public(g) | {"avg_rank": g["avg_rank"], "days_ranked": g["days_ranked"]}
                                  for g in monthly(gs, ranks_by.get(agency, {}), len(days_by.get(agency, ())))[:5]]}
        entry["comingSoon"] = [{"name": c["name"], "price": float(c["price"]), "game_number": c["game_number"]}
                               for c in coming if c["agency"] == agency]
    result["lottoMax"] = lotto_max_facts(today)
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
