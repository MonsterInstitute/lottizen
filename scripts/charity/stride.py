"""Stride Management (SMC checkout) — Alberta Children's Hospital, Red Deer
Hospital, STARS and Calgary Stampede lotteries.

GET https://checkoutapiv4az.smccheckout.com/api/v1/lottery          (header smc-lid: <GUID>)
    LotteryName, LicenceNumber, AvailableMainStubs (tickets printed for the
    main lottery), deadlines, JackpotTotal (50/50), Milestones
GET .../api/v1/lottery/tickets   packages with price and IsSoldOut

Packages-sold counts are in the API but the charities choose not to show
them (ShowTicketsSold false), so they are not stored.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .common import PROVINCE_TZ, fetch_json, num

API = "https://checkoutapiv4az.smccheckout.com/api/v1"


def _iso(s: str | None, province: str) -> str | None:
    if not s:
        return None
    from zoneinfo import ZoneInfo
    return datetime.fromisoformat(s).replace(tzinfo=ZoneInfo(PROVINCE_TZ.get(province, "America/Edmonton"))).isoformat()


def scrape(lot: dict) -> tuple[list[dict], list[dict]]:
    h = {"smc-lid": lot["ref"]}
    p = (fetch_json(f"{API}/lottery", h) or {}).get("Payload") or {}
    t = (fetch_json(f"{API}/lottery/tickets", h) or {}).get("Payload") or {}
    prov = lot["province"]
    now = datetime.now(timezone.utc)
    main = (t.get("Main") or {}).get("Tickets") or []
    tiers = [{"tickets": x.get("NumberOfTickets"), "price": num(str(x.get("PackageCost"))), "label": x.get("PackageName")}
             for x in main if x.get("Enabled") and x.get("NumberOfTickets")]
    all_sold_out = bool(main) and all(x.get("IsSoldOut") for x in main if x.get("Enabled"))
    open_ = _iso(p.get("LotteryStartDate"), prov)
    close = _iso(p.get("TicketDeadlineDate"), prov)
    draws = []
    for name, key in (("Loyalty", "LoyaltyDeadlineDate"), ("Bonus", "BonusDeadlineDate"),
                      ("Early Bird", "EarlyBirdDeadlineDate")):
        if p.get(key):
            draws.append({"name": name, "cutoff": _iso(p[key][:10] + "T23:59:59", prov), "draw_date": None,
                          "prize": None, "prize_value": None})
    status = "on_sale"
    if close and now > datetime.fromisoformat(close):
        status = "closed"
    elif open_ and now < datetime.fromisoformat(open_):
        status = "upcoming"
    elif all_sold_out:
        status = "sold_out"
    year = p.get("CampaignYear") or (close or "")[:4]
    ed = {
        "edition": f"{year}-{p.get('LotteryId')}", "title": p.get("LotteryName"), "licence_no": p.get("LicenceNumber"),
        "status": status, "ticket_cap": p.get("AvailableMainStubs") or None, "price_tiers": tiers or None,
        "draws": draws, "sales_open": open_, "sales_close": close, "sold_out": all_sold_out,
        "jackpot": num(str(p.get("JackpotTotal"))) if p.get("Has5050") and p.get("DisplayJackpot") else None,
        "jackpot_at": now.replace(microsecond=0).isoformat() if p.get("Has5050") else None,
        "source_url": f"{API}/lottery",
        "raw": {"quotes": {"ticket_cap": "AvailableMainStubs in the lottery's checkout API (main lottery tickets printed)"}},
    }
    return [ed], []
