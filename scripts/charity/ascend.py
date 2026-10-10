"""Ascend Fundraising Solutions ("5050central") — Canucks, BC Lions, Blue
Bombers, Tiger-Cats and many junior teams.

Base: <host>/rest/v1/<fragment>.5050central.com
  getactiveevents         open events (salesStart/salesEnd, guarantee)
  getpot/<eventNo>        currentEventPot = live total pot (= max(guarantee, gross sales))
  getpricepoints/<n>      ticket tiers
  getrecentwinners        last ~10 draws: ticketNo, prizeAmount (winner's share)
  getrecentjackpot        last drawn event's total pot
The recent-winners list is short, so results accumulate in charity_results.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .common import fetch_json, num


def scrape(lot: dict) -> tuple[list[dict], list[dict]]:
    b = lot["ref"].rstrip("/")
    now = datetime.now(timezone.utc)
    editions, results = [], []
    import re
    match = re.compile(lot["match"]) if lot.get("match") else None
    events = fetch_json(f"{b}/getactiveevents") or []
    for ev in events:
        if match and not match.search(ev.get("title") or ""):
            continue
        n = ev.get("eventNo")
        try:
            pot = fetch_json(f"{b}/getpot/{n}") or {}
        except Exception:  # noqa: BLE001
            pot = {}
        try:
            pts = fetch_json(f"{b}/getpricepoints/{n}") or []
        except Exception:  # noqa: BLE001
            pts = []
        start, end = ev.get("salesStart"), ev.get("salesEnd")
        closed = bool(ev.get("sellingClosed")) or (end and datetime.fromisoformat(end.replace("Z", "+00:00")) < now)
        guarantee = num(str(ev.get("guarantee"))) if ev.get("guarantee") else None
        editions.append({
            "edition": str(n), "title": ev.get("title"), "status": "closed" if closed else "on_sale",
            "price_tiers": [{"tickets": p.get("numberOfTickets"), "price": num(str(p.get("price"))), "label": p.get("title")}
                            for p in pts if p.get("display", True) and p.get("numberOfTickets")] or None,
            "sales_open": start, "sales_close": end, "draw_date": end,
            "jackpot": num(str(pot.get("currentEventPot"))) if pot.get("currentEventPot") is not None else None,
            "jackpot_at": now.replace(microsecond=0).isoformat(),
            "sold_out": None, "source_url": f"{b}/getpot/{n}",
            "raw": {"guarantee": guarantee, "funds": ev.get("fundsBreakdown")},
        })
    try:
        winners = fetch_json(f"{b}/getrecentwinners") or []
    except Exception:  # noqa: BLE001
        winners = []
    for w in winners:
        if match and not match.search(w.get("eventTitle") or ""):
            continue
        if not w.get("ticketNo"):
            continue
        d = (w.get("isoDrawDate") or "")[:10] or None
        results.append({
            "edition": str(w.get("eventNo")), "draw_name": ((w.get("prizeTitle") or "50/50") + " · " + (w.get("eventTitle") or ""))[:200],
            "draw_date": d, "winning_numbers": [str(w["ticketNo"])], "prize": None,
            "prize_value": num(str(w.get("prizeAmount"))) if w.get("prizeAmount") is not None else None,
            "source_url": f"{b}/getrecentwinners",
        })
    return editions, results
