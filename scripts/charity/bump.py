"""BUMP 50/50 (bumpcbn.com) — most NHL/MLB/NBA/MLS/CFL 50/50s and two home
lotteries (CHEO, Maison Enfant Soleil).

API base: https://<tenant>.bumpcbnraffle.net/api
  /web/config          time zone of the tenant's naive timestamps
  /web/event           current / recent events (jackpot = total pot, prize = winner's share)
  /web/event/<id>      + prices[], percent_prize, addons[]
  /web/winners?page=N  full history of drawn events

Personal data: draws carry the winner's first/last name. Those fields are
never read into anything we store or log — only ticket numbers and amounts.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from .common import fetch_json, num

NAME_KEYS = {"first_name", "last_name", "formatted_winners_name", "winner_name", "name"}


def base(ref: str) -> str:
    return f"https://{ref}.bumpcbnraffle.net/api"


def _tz(ref: str) -> ZoneInfo:
    try:
        return ZoneInfo(fetch_json(base(ref) + "/web/config").get("timeZone") or "America/Toronto")
    except Exception:  # noqa: BLE001
        return ZoneInfo("America/Toronto")


def _iso(naive: str | None, tz: ZoneInfo) -> str | None:
    if not naive:
        return None
    try:
        return datetime.fromisoformat(naive.replace(" ", "T")).replace(tzinfo=tz).isoformat()
    except ValueError:
        return None


def _scrub(d):
    """Drop every personal-name field, recursively."""
    if isinstance(d, dict):
        return {k: _scrub(v) for k, v in d.items() if k not in NAME_KEYS}
    if isinstance(d, list):
        return [_scrub(x) for x in d]
    return d


def _status(start: str | None, end: str | None, drawn: bool, now: datetime) -> str:
    if drawn:
        return "drawn"
    if start and now < datetime.fromisoformat(start):
        return "upcoming"
    if end and now > datetime.fromisoformat(end):
        return "closed"
    return "on_sale"


def scrape_5050(lot: dict) -> tuple[list[dict], list[dict]]:
    ref = lot["ref"]
    tz = _tz(ref)
    now = datetime.now(timezone.utc)
    match = re.compile(lot["match"]) if lot.get("match") else None
    events = fetch_json(base(ref) + "/web/event") or []
    if isinstance(events, dict):
        events = events.get("data") or [events]
    editions, results = [], []
    for ev in events:
        title = ev.get("title") or ""
        if match and not match.search(title):
            continue
        if ev.get("percent_prize") == 0 and not num(str(ev.get("jackpot"))):
            continue
        start, end = _iso(ev.get("start_at"), tz), _iso(ev.get("end_at"), tz)
        draws = ev.get("draws") or []
        drawn = any(d.get("number") for d in draws)
        status = _status(start, end, drawn, now)
        detail = {}
        if status in ("on_sale", "upcoming"):
            try:
                detail = fetch_json(f"{base(ref)}/web/event/{ev['id']}")
            except Exception:  # noqa: BLE001
                detail = {}
        by_qty: dict[int, dict] = {}
        for p in detail.get("prices") or []:
            if p.get("type", "web") == "web" and p.get("quantity") and not p.get("is_donation"):
                by_qty.setdefault(int(p["quantity"]), {"tickets": int(p["quantity"]), "price": num(str(p.get("price"))),
                                                      "label": p.get("label") or None})
        prices = [by_qty[q] for q in sorted(by_qty)]
        pct = detail.get("percent_prize", ev.get("percent_prize"))
        jackpot = num(str(ev.get("jackpot"))) if ev.get("jackpot") is not None else None
        cta = {}
        if lot.get("kind") == "catch_the_ace":
            cards = detail.get("cards") or ev.get("cards")
            if isinstance(cards, str):
                import ast
                try:
                    cards = ast.literal_eval(cards)
                except (ValueError, SyntaxError):
                    cards = None
            if isinstance(cards, list) and cards:
                cta = {"cards_total": len(cards), "cards_left": sum(1 for c in cards if not c.get("drawn"))}
            if ev.get("prize") is not None:
                cta["weekly_prize"] = num(str(ev.get("prize")))
        editions.append({
            "edition": str(ev["id"]), "title": title, "status": status,
            "price_tiers": prices or None, "sales_open": start, "sales_close": end,
            "draw_date": _iso(next((d.get("draw_at") for d in draws if d.get("draw_at")), None), tz) or end,
            "jackpot": jackpot, "jackpot_at": now.replace(microsecond=0).isoformat() if status == "on_sale" else None,
            "sold_out": None, "source_url": f"{base(ref)}/web/event/{ev['id']}",
            "raw": {"percent_prize": pct, "prize": num(str(ev.get("prize"))) if ev.get("prize") is not None else None,
                    "addons": [{"title": a.get("title"), "jackpot": num(str(a.get("jackpot")))}
                               for a in (detail.get("addons") or [])], **cta},
        })
        for d in draws:
            if d.get("number"):
                results.append(_result(lot, str(ev["id"]), title, d, tz, f"{base(ref)}/web/event/{ev['id']}"))
    return editions, results


def _result(lot, edition, title, d, tz, src) -> dict:
    draw_at = _iso(d.get("draw_at"), tz)
    return {
        "edition": edition, "draw_name": (d.get("title") or "50/50")[:120] + f" · {title}"[:200],
        "draw_date": draw_at[:10] if draw_at else None, "winning_numbers": [str(d["number"])],
        "prize": None, "prize_value": num(str(d.get("prize"))) if d.get("prize") is not None else None,
        "jackpot": num(str(d.get("jackpot"))) if d.get("jackpot") is not None else None, "source_url": src,
    }


def history(lot: dict, max_pages: int = 6) -> list[dict]:
    """Drawn events from /web/winners (newest first), up to max_pages × 100."""
    ref = lot["ref"]
    tz = _tz(ref)
    match = re.compile(lot["match"]) if lot.get("match") else None
    out = []
    page, last = 1, 1
    while page <= min(last, max_pages):
        j = fetch_json(f"{base(ref)}/web/winners?page={page}")
        last = j.get("last_page") or 1
        for ev in j.get("data") or []:
            title = ev.get("title") or ""
            if match and not match.search(title):
                continue
            for th in ev.get("threads") or [{"draws": ev.get("draws") or []}]:
                for d in th.get("draws") or []:
                    if d.get("number"):
                        out.append(_result(lot, str(ev.get("id")), title, _scrub(d), tz,
                                           f"{base(ref)}/web/winners?page={page}"))
        page += 1
    return out


def scrape_home(lot: dict) -> tuple[list[dict], list[dict]]:
    """A home lottery sold through BUMP: price tiers, sales window and the
    published draw schedule. The API's `jackpot` field is not explained for
    home raffles, so it is not used."""
    ref = lot["ref"]
    tz = _tz(ref)
    now = datetime.now(timezone.utc)
    events = fetch_json(base(ref) + "/web/event") or []
    if isinstance(events, dict):
        events = events.get("data") or [events]
    editions, results = [], []
    for ev in events[:1]:
        det = fetch_json(f"{base(ref)}/web/event/{ev['id']}")
        start, end = _iso(det.get("start_at"), tz), _iso(det.get("end_at"), tz)
        draws = []
        grand_date = None
        for d in det.get("draws") or []:
            when = _iso(d.get("draw_at"), tz)
            if d.get("is_grand"):
                grand_date = d.get("draw_at_text")
            draws.append({"name": d.get("title"), "cutoff": None, "draw_date": when[:10] if when else None,
                          "prize": d.get("title"), "prize_value": None})
            if d.get("number"):
                results.append(_result(lot, str(ev["id"]), det.get("title") or "", _scrub(d), tz,
                                       f"{base(ref)}/web/event/{ev['id']}"))
        grand = None
        if grand_date:
            m = re.search(r"(\w+) (\d{1,2}), (\d{4})", grand_date)
            if m:
                from .common import parse_date
                grand = parse_date(m.group(1), m.group(2), m.group(3))
        editions.append({
            "edition": str(ev["id"]), "title": det.get("title"),
            "status": _status(start, end, False, now) if not (end and now > datetime.fromisoformat(end)) else "closed",
            "price_tiers": [{"tickets": p.get("quantity"), "price": num(str(p.get("price")))}
                            for p in det.get("prices") or [] if p.get("type", "web") == "web" and p.get("quantity")],
            "sales_open": start, "sales_close": end, "draw_date": grand, "draws": draws,
            "grand_prize": det.get("prize") or None, "source_url": f"{base(ref)}/web/event/{ev['id']}",
            "raw": {},
        })
    return editions, results
