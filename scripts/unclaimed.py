#!/usr/bin/env python3
"""unclaimed.py — the data behind /unclaimed: every prize of $100,000 or more
that a Canadian lottery agency lists as won but not yet claimed.

    python scripts/unclaimed.py            # read lists, update the table, write data/unclaimed/canada.json
    python scripts/unclaimed.py --dry-run  # read lists and print, write nothing

Each agency's own published list is the only source (scrapers in
outreach_common.py and below). Nothing is estimated: amounts, draw dates and
locations are copied as listed; the deadline is the agency's claim period
applied to the draw date (OLG and WCLC: one year); Loto-Québec states each
deadline itself.

The daily run also keeps unclaimed_prizes (migration 0021) current: a prize
seen today gets last_seen = today; a prize that was on an agency's list and
isn't any more gets removed_on = today — but only when that agency's list
was read successfully today, so a broken scrape can't make every prize look
removed. The page says a prize is "no longer listed"; it never says it was
claimed, because the agency doesn't say why a prize leaves its list.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
import outreach_common as oc  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "unclaimed" / "canada.json"
TZ = ZoneInfo("America/Toronto")
PAGE_MIN = 100_000  # the page lists every prize at or above this

LQ_UNCLAIMED_URL = "https://loteries.lotoquebec.com/en/results/prize-claims-status"


def scrape_lotoquebec_unclaimed() -> list[dict]:
    """Loto-Québec's "Unclaimed prizes of $100,000 or more" (draw games). The
    page is CMS rich text, not a table: strip tags and split on each entry's
    "Product name:". Loto-Québec states each claim deadline itself, so it's
    used as listed rather than computed. "Administrative region" is a region
    of Québec, not a store."""
    import html as htmllib
    import re
    page = oc.http_get(LQ_UNCLAIMED_URL, browser=True)
    text = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", page)).replace("\xa0", " "))
    m = re.search(r"Unclaimed prizes of \$100,000 or more.*?Updated ([A-Za-z]+ \d{1,2}, \d{4})", text)
    as_of = m.group(1) if m else "date not stated"
    section = text[m.end():] if m else text
    section = section.split(" Note ")[0]
    fields = ["Product name", "Draw date", "Prize category", "Unclaimed amount", "Administrative region",
              "Winning selection", "Claim deadline"]
    pat = "".join(rf"{f}:\s*(?P<f{i}>.*?)\s*" for i, f in enumerate(fields)) + r"(?=Product name:|$)"
    out = []
    for e in re.finditer(pat, section):
        amt = re.match(r"\$([\d,]+(?:\.\d+)?)\s*(\((.*?)\))?", e["f3"])
        if not amt:
            continue
        drawn = datetime.strptime(e["f1"].strip(), "%B %d, %Y").date()
        expires = datetime.strptime(re.match(r"[A-Za-z]+ \d{1,2}, \d{4}", e["f6"].strip()).group(0), "%B %d, %Y").date()
        detail = f"{e['f2'].strip()}" + (f", {amt.group(3)}" if amt.group(3) else "")
        out.append({"agency": "QUEBEC", "location": f"{e['f4'].strip()} region", "game": e["f0"].strip(),
                    "draw_date": drawn.isoformat(), "amount": float(amt.group(1).replace(",", "")),
                    "expires": expires.isoformat(), "list_as_of": as_of, "source_url": LQ_UNCLAIMED_URL,
                    "detail": detail})
    return out


# agency -> (scraper, official list URL). Agencies without a published list
# are in NOT_COVERED with the reason, shown on the page (checked 2026-10-09).
SOURCES = {
    "OLG": (oc.scrape_olg_unclaimed, oc.OLG_UNCLAIMED_URL),
    "WCLC": (oc.scrape_wclc_unclaimed, oc.WCLC_UNCLAIMED_URL),
    "QUEBEC": (scrape_lotoquebec_unclaimed, LQ_UNCLAIMED_URL),
}
NOT_COVERED: dict[str, str] = {
    "BCLC": "BCLC doesn't publish a list of unclaimed prizes; it announces individual large ones in news releases.",
    "ALC": "Atlantic Lottery doesn't publish a list of unclaimed prizes.",
}

AGENCY_NAMES = {"OLG": "OLG (Ontario)", "WCLC": "Western Canada Lottery Corporation (Alberta, Saskatchewan, Manitoba)",
                "BCLC": "BCLC (British Columbia)", "ALC": "Atlantic Lottery", "QUEBEC": "Loto-Québec"}


def key(p: dict) -> str:
    return "|".join(str(p[k]) for k in ("agency", "game", "draw_date", "amount", "location"))


def read_lists() -> tuple[list[dict], dict[str, dict]]:
    """All listed prizes, plus per-agency status {ok, count, list_as_of, url, error}."""
    prizes, status = [], {}
    for agency, (fn, url) in SOURCES.items():
        try:
            rows = fn()
        except Exception as e:  # noqa: BLE001 — one agency failing must not hide the others
            status[agency] = {"ok": False, "count": 0, "url": url, "error": f"{type(e).__name__}: {e}"[:200]}
            print(f"::warning::unclaimed: {agency} list could not be read: {e}", file=sys.stderr)
            continue
        if not rows:
            # An official list is never empty in practice; treat as a parse failure.
            status[agency] = {"ok": False, "count": 0, "url": url, "error": "list parsed to zero rows"}
            print(f"::warning::unclaimed: {agency} list parsed to zero rows", file=sys.stderr)
            continue
        status[agency] = {"ok": True, "count": len(rows), "url": url, "list_as_of": rows[0].get("list_as_of")}
        prizes += rows
    return prizes, status


def sync_table(prizes: list[dict], status: dict[str, dict], today: date) -> None:
    client = db.get_client()
    t = today.isoformat()
    existing = {r["prize_key"]: r for r in db.fetch_all(
        "unclaimed_prizes", "id,prize_key,agency,first_seen,removed_on")}
    seen = set()
    for p in prizes:
        k = key(p)
        seen.add(k)
        row = {"prize_key": k, "agency": p["agency"], "game": p["game"], "draw_date": p["draw_date"],
               "amount": p["amount"], "location": p["location"], "expires": p["expires"],
               "source_url": p["source_url"], "list_as_of": p.get("list_as_of"), "detail": p.get("detail"),
               "last_seen": t, "removed_on": None,
               "first_seen": existing[k]["first_seen"] if k in existing else t}
        client.table("unclaimed_prizes").upsert(row, on_conflict="prize_key").execute()
    for k, r in existing.items():
        if k in seen or r["removed_on"] or not status.get(r["agency"], {}).get("ok"):
            continue
        client.table("unclaimed_prizes").update({"removed_on": t}).eq("id", r["id"]).execute()
        print(f"  removed from {r['agency']} list today: {k}")


def build_json(status: dict[str, dict], today: date) -> dict:
    rows = db.fetch_all("unclaimed_prizes", "id,agency,game,draw_date,amount,location,expires,source_url,"
                                            "list_as_of,detail,first_seen,last_seen,removed_on")
    t = today.isoformat()
    live = sorted((r for r in rows if not r["removed_on"] and r["expires"] >= t and float(r["amount"]) >= PAGE_MIN),
                  key=lambda r: (r["expires"], -float(r["amount"])))
    since = (today - timedelta(days=90)).isoformat()
    gone = sorted((r for r in rows if r["removed_on"] and r["removed_on"] >= since and float(r["amount"]) >= PAGE_MIN),
                  key=lambda r: r["removed_on"], reverse=True)

    def out(r: dict) -> dict:
        return {"agency": r["agency"], "game": r["game"], "drawDate": r["draw_date"], "amount": float(r["amount"]),
                "location": r["location"], "expires": r["expires"], "sourceUrl": r["source_url"],
                "listAsOf": r["list_as_of"], "detail": r["detail"], "firstSeen": r["first_seen"],
                **({"removedOn": r["removed_on"], "removedBeforeDeadline": r["removed_on"] < r["expires"]}
                   if r["removed_on"] else {})}

    return {
        "generatedAt": datetime.now(TZ).isoformat(timespec="seconds"),
        "asOfDate": t,
        "minAmount": PAGE_MIN,
        "agencies": [{"agency": a, "name": AGENCY_NAMES[a], "url": s["url"], "ok": s["ok"],
                      "listAsOf": s.get("list_as_of"), "error": None if s["ok"] else "list unavailable today"}
                     for a, s in status.items()],
        "notCovered": [{"agency": a, "name": AGENCY_NAMES[a], "reason": why} for a, why in NOT_COVERED.items()],
        "prizes": [out(r) for r in live],
        "noLongerListed": [out(r) for r in gone],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    today = datetime.now(TZ).date()
    prizes, status = read_lists()
    for ag, s in status.items():
        print(f"{ag}: {'ok' if s['ok'] else 'FAILED'} · {s['count']} rows · {s.get('list_as_of') or s.get('error')}")
    if a.dry_run:
        big = sorted((p for p in prizes if p["amount"] >= PAGE_MIN and p["expires"] >= today.isoformat()),
                     key=lambda p: p["expires"])
        for p in big:
            print(f"  {p['expires']} {p['agency']:5} {p['game']:18} ${p['amount']:>12,.0f}  {p['location']}")
        return 0
    if not any(s["ok"] for s in status.values()):
        print("✗ no agency list could be read — leaving the table and the published file untouched")
        return 1
    sync_table(prizes, status, today)
    data = build_json(status, today)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1))
    print(f"✓ wrote {OUT.relative_to(ROOT)}: {len(data['prizes'])} prizes ≥ ${PAGE_MIN:,}, "
          f"{len(data['noLongerListed'])} no longer listed (90 days)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
