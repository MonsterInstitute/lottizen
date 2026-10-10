"""Moitié-Moitié (moitiemoitie.com, Technologies 5050 inc.) — most Quebec
hospital and community 50/50s. Its terms don't restrict automated access;
we read only the public API the raffle pages themselves call.

API base: https://app.moitiemoitie.com/api/v1/public
  /organization/<id>        the organisation's raffles (monthly series), with
                            sales window, running pot and winning number
  /raffle/<id>/options      ticket tiers (nb_of_draw_numbers, amount_in_cents)

Personal data: /raffle/<id> also carries staff emails, recent buyers and the
winner's contact. Only the whitelisted fields below are ever read — never
store or log a raw response.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from .common import fetch_json

API = "https://app.moitiemoitie.com/api/v1/public"


def _dt(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def scrape(lot: dict) -> tuple[list[dict], list[dict]]:
    org = fetch_json(f"{API}/organization/{lot['ref']}")
    match = re.compile(lot["match"]) if lot.get("match") else None
    now = datetime.now(timezone.utc)
    stamp = now.replace(microsecond=0).isoformat()
    editions, results = [], []
    raffles = [r for r in org.get("raffles") or []
               if not r.get("archived") and not r.get("is_test") and r.get("display_on_website", True)
               and (not match or match.search(f"{r.get('name')} {r.get('dashboard_option_name')}"))]
    # Keep what has started, plus the next one to open within a month.
    raffles = [r for r in raffles if (_dt(r.get("sales_start_date")) or now) <= now + timedelta(days=31)]
    for r in raffles:
        start, end = _dt(r.get("sales_start_date")), _dt(r.get("sales_end_date"))
        win = r.get("winner_draw_number")
        status = ("drawn" if win else "upcoming" if start and start > now
                  else "on_sale" if r.get("sales_is_active") and (not end or end > now) else "closed")
        cents = r.get("jackpot_amount_in_cents")
        title = " · ".join(x for x in (r.get("name"), r.get("dashboard_option_name")) if x)
        tiers = None
        if status in ("on_sale", "upcoming"):
            try:
                opts = fetch_json(f"{API}/raffle/{r['id']}/options") or []
                tiers = [{"tickets": o["nb_of_draw_numbers"], "price": o["amount_in_cents"] / 100}
                         for o in sorted(opts, key=lambda o: o.get("amount_in_cents") or 0)
                         if not o.get("archived") and o.get("nb_of_draw_numbers") and o.get("amount_in_cents")] or None
            except Exception:  # noqa: BLE001
                tiers = None
        draw = r.get("pick_winner_date") or r.get("sales_end_date")
        src = f"{API}/organization/{lot['ref']}"
        editions.append({
            "edition": str(r["id"]), "title": title, "status": status, "licence_no": r.get("license_details") or None,
            "price_tiers": tiers, "sales_open": r.get("sales_start_date"), "sales_close": r.get("sales_end_date"),
            "draw_date": draw, "jackpot": cents / 100 if cents is not None and status != "upcoming" else None,
            "jackpot_at": stamp if status == "on_sale" else None, "sold_out": None, "source_url": src,
            "raw": {"percent_prize": r.get("winner_percentage")},
        })
        if win:
            results.append({"edition": str(r["id"]), "draw_name": f"50/50 · {title}"[:200],
                            "draw_date": draw[:10] if draw else None, "winning_numbers": [str(win)],
                            "prize": None, "prize_value": None,  # the winner's share isn't in the listing
                            "jackpot": cents / 100 if cents else None, "source_url": src})
    return editions, results
