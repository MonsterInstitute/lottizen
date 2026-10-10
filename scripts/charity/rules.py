"""Home / prize lotteries read from their own rules page, with the
per-lottery patterns in specs.py. Each figure keeps the exact text it was
read from (raw.quotes); patterns that stop matching are reported (raw.missing)."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from .common import fetch, text_of
from .specs import extract

SOLD_PCT = re.compile(r"(?:over|more than)\s+(\d{2})%\s+sold", re.I)
SOLD_OUT = re.compile(r"(?<!last lottery )(?<!last )\b(?:tickets are|lottery is|lottery has|we are|now|is)\s+(?:officially\s+)?sold out\b", re.I)


def build(lot: dict, rules_text: str, home_text: str = "") -> dict | None:
    f, missing = extract(lot["id"], rules_text, lot["province"])
    dls = f.get("deadlines") or []
    if not (f.get("ticket_cap") or dls or f.get("prize_count")):
        return None
    for d in dls:
        if re.match(r"final", d["name"], re.I):
            d["name"] = "Final"
        elif d["name"].lower() in ("first", "second", "third", "fourth", "fifth"):
            d["name"] = f"{d['name']} draw"
    final = next((d for d in dls if d["name"] == "Final"), dls[-1] if dls else None)
    if final and not re.search(r"final|bonus|bird|loyal|vip|anniversary|grand|first|second|third|fourth|fifth", final["name"], re.I):
        final["name"] = "Final"
    close = final["cutoff"] if final else None
    grand = f.get("grand_draw") or (final or {}).get("draw_date")
    now = datetime.now(timezone.utc)
    sold_out = bool(SOLD_OUT.search(home_text)) if home_text else None
    if not close and grand and grand < now.date().isoformat():
        status = "drawn"
    elif close and now > datetime.fromisoformat(close):
        status = "drawn" if grand and grand < now.date().isoformat() else "closed"
    else:
        status = "sold_out" if sold_out else "on_sale"
    if status in ("on_sale", "sold_out") and not close and not grand:
        status = None  # no dates published yet
    return {
        "edition": (close or grand or "current")[:10], "title": None, "licence_no": f.get("licence_no"), "status": status,
        "ticket_cap": f.get("ticket_cap"), "prize_count": f.get("prize_count"), "prize_value": f.get("prize_value"),
        "odds": [{"label": "Published odds", "text": s} for s in f.get("odds") or []] or None,
        "price_tiers": f.get("price_tiers"),
        "draws": [{"name": d["name"], "cutoff": d["cutoff"], "draw_date": d.get("draw_date"), "prize": None, "prize_value": None}
                  for d in dls],
        "sales_close": close, "draw_date": grand, "sold_out": sold_out, "source_url": lot.get("rules_url"),
        "raw": {"sold_pct": int(m.group(1)) if (m := SOLD_PCT.search(home_text or "")) else None,
                "sold_pct_text": m.group(0) if m else None,
                "quotes": f["quotes"], "eligibility": f.get("eligibility"), "missing": missing,
                "deadline_quotes": [d["quote"] for d in dls]},
    }


def scrape(lot: dict) -> tuple[list[dict], list[dict]]:
    rules_html = fetch(lot["rules_url"])
    home = ""
    if lot.get("url") and lot["url"] != lot["rules_url"]:
        try:
            home = text_of(fetch(lot["url"]))
        except Exception:  # noqa: BLE001
            home = ""
    ed = build(lot, text_of(rules_html), home)
    return ([ed] if ed else []), []
