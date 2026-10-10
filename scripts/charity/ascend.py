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

import re
from datetime import datetime, timezone

from .common import fetch_json, num


# Members-only / season-ticket-holder tiers aren't open to the public.
MEMBERS = re.compile(r"(?i)\bmembres?\b|\bmembers?\b|season.?ticket|abonn")


def on_sale_now(p: dict, now: datetime) -> bool:
    """A tier's schedule: availableByDefault, flipped inside each exceptPeriod
    (e.g. a "6 for $5" promo that only runs for a few days)."""
    s = p.get("schedule") or {}
    avail = s.get("availableByDefault", True)
    for per in s.get("exceptPeriods") or []:
        try:
            a, b = datetime.fromisoformat(per["startTime"]), datetime.fromisoformat(per["endTime"])
        except (KeyError, ValueError):
            continue
        if a <= now <= b:
            return not avail
    return avail


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
        cta = {}
        if lot.get("kind") == "catch_the_ace":
            try:
                deck = fetch_json(f"{b}/getcarddeck") or {}
                total = deck.get("cardCount")
                if total:
                    cta = {"cards_total": total, "cards_left": total - len(deck.get("revealedCards") or [])}
            except Exception:  # noqa: BLE001
                pass
            if pot.get("jackpot"):
                cta["weekly_pot"] = pot.get("currentEventPot")
        start, end = ev.get("salesStart"), ev.get("salesEnd")
        closed = bool(ev.get("sellingClosed")) or (end and datetime.fromisoformat(end.replace("Z", "+00:00")) < now)
        guarantee = num(str(ev.get("guarantee"))) if ev.get("guarantee") else None
        editions.append({
            "edition": str(n), "title": ev.get("title"), "status": "closed" if closed else "on_sale",
            "price_tiers": sorted([{"tickets": p.get("numberOfTickets"), "price": num(str(p.get("price"))),
                                    "label": p.get("title")}
                                   for p in pts if p.get("display", True) and p.get("numberOfTickets")
                                   and not p.get("soldOut") and on_sale_now(p, now)
                                   and not MEMBERS.search(p.get("title") or "")],
                                  key=lambda x: (x["price"] or 0, x["tickets"])) or None,
            "sales_open": start, "sales_close": end, "draw_date": end,
            # Catch the Ace: the progressive (ace) jackpot; 50/50: the running pot.
            "jackpot": (num(str(pot["jackpot"])) if lot.get("kind") == "catch_the_ace" and pot.get("jackpot")
                        else num(str(pot.get("currentEventPot"))) if pot.get("currentEventPot") is not None else None),
            "jackpot_at": now.replace(microsecond=0).isoformat(),
            "sold_out": None, "source_url": f"{b}/getpot/{n}",
            "raw": {"guarantee": guarantee, "funds": ev.get("fundsBreakdown"), **cta},
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


def scrape_pot(lot: dict) -> tuple[list[dict], list[dict]]:
    """Older Ascend WordPress sites publish only the running pot."""
    j = fetch_json(lot["ref"]) or {}
    total = num(str(j.get("total"))) if j.get("total") is not None else None
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    if not total:
        return [], []
    return [{"edition": "current", "title": None, "status": "on_sale", "jackpot": total, "jackpot_at": now,
             "source_url": lot["url"], "raw": {"pot_only": True}}], []
