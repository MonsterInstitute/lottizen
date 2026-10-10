"""TAP 5050 (Saskatchewan Roughriders and other SK teams; some NS raffles).

Two ways in:

RSS https://rss.tap5050.com/bug.rss?EID=<feed id>: <title> event, <link> the
current pot ("$70,099"), <description> the winning ticket after the draw.
Feed ids aren't published anywhere; registry `ref` may list several
candidates ("1099,1092") and `seen` the stale titles they showed when found,
so a feed only counts once it has moved on to a new game.

Checkout page (charities with no RSS feed): the charity's own page links to
cloud.tap5050.com/apex/f?p=127:PICKTICKET::::APP:P0_EVENT_ID:<event>, whose
hidden fields carry the event name, dates, licence and running jackpot
(P0_EVENT_SALES, shown as "50/50 Jackpot $680"). The page also carries the
charity's contact email: only the whitelisted fields below are ever read.
"""
from __future__ import annotations

import html as htmlmod
import re
from datetime import date, datetime, timezone

from .common import end_of_day, fetch, num, parse_date, text_of

MON = r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?"


def title_date(title: str, today: date) -> date | None:
    """'Game 3 Sept 30', 'GM 5 vs LAR OCT 16/26', 'Game 16 Oct 12 2026'."""
    m = re.search(MON + r"\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[/,]?\s*(\d{4}|\d{2})\b)?", title, re.I)
    if not m:
        return None
    mon, day, yr = m.group(1), m.group(2), m.group(3)
    years = [2000 + int(yr) if yr and len(yr) == 2 else int(yr)] if yr else [today.year - 1, today.year, today.year + 1]
    best = None
    for y in years:
        iso = parse_date(mon, day, str(y))
        try:
            d = date.fromisoformat(iso) if iso else None
        except ValueError:
            d = None
        if d and (best is None or abs((d - today).days) < abs((best - today).days)):
            best = d
    return best


def scrape(lot: dict) -> tuple[list[dict], list[dict]]:
    now = datetime.now(timezone.utc)
    today = now.date()
    stamp = now.replace(microsecond=0).isoformat()
    seen = {s.strip().lower() for s in lot.get("seen") or []}
    editions, results, eds_seen = [], [], set()
    for ref in str(lot["ref"]).split(","):
        url = f"https://rss.tap5050.com/bug.rss?EID={ref.strip()}"
        x = fetch(url)
        for item in re.findall(r"<item>(.*?)</item>", x, re.S):
            tag = lambda n: (re.search(fr"<{n}>(.*?)</{n}>", item, re.S) or [None, None])[1]  # noqa: E731
            title = htmlmod.unescape((tag("title") or "").strip())
            if title.lower() in seen:
                continue
            pot = num((tag("link") or "").strip())
            win = re.sub(r"<[^>]+>|\s+", " ", tag("description") or "").strip()
            ed = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:80] or "current"
            if ed in eds_seen:
                continue
            eds_seen.add(ed)
            d = title_date(title, today)
            # A dated game that's already past with no winner posted isn't on sale.
            status = "drawn" if win else "closed" if d and d < today else "on_sale"
            editions.append({"edition": ed, "title": title, "status": status, "jackpot": pot,
                             "draw_date": d.isoformat() if d else None,
                             "jackpot_at": stamp, "source_url": url, "raw": {}})
            if win and re.search(r"\d", win):
                results.append({"edition": ed, "draw_name": f"50/50 · {title}"[:200],
                                "draw_date": d.isoformat() if d else None,
                                "winning_numbers": [win[:40]], "prize": None, "prize_value": None, "source_url": url})
    return editions, results


CHECKOUT = "https://cloud.tap5050.com/apex/f?p=127:PICKTICKET::::APP:P0_EVENT_ID:{}"
FIELDS = ("P0_EVENT_NAME", "P0_EVENT_DATE", "P0_EVENT_END_TIME", "P0_DRAW_DATE", "P0_LICENCE_NUMBER", "P0_EVENT_SALES")


def _tap_date(s: str | None) -> str | None:
    m = re.match(r"([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})", re.sub(r"\s+", " ", s or "").strip())
    return parse_date(*m.groups()) if m else None


def scrape_checkout(lot: dict) -> tuple[list[dict], list[dict]]:
    """The newest event the charity's own page links to (registry
    `event_page`). No link, or an expired event, means nothing on sale."""
    ids = {int(i) for i in re.findall(r"P0_EVENT_ID:(\d+)", fetch(lot["event_page"]))}
    if not ids:
        return [], []
    ev = max(ids)
    url = CHECKOUT.format(ev)
    try:
        page = fetch(url)
    except Exception:  # noqa: BLE001 — expired events don't render
        return [], []
    f = {}
    for k in FIELDS:
        m = re.search(fr'id="{k}"[^>]*\bvalue="([^"]*)"', page)
        f[k] = htmlmod.unescape(m.group(1)).strip() if m else None
    if not f["P0_EVENT_NAME"]:
        return [], []
    close_day = _tap_date(f["P0_EVENT_END_TIME"])
    draw_day = _tap_date(f["P0_DRAW_DATE"]) or close_day
    close = end_of_day(close_day, lot["province"]) if close_day else None
    now = datetime.now(timezone.utc)
    on = close is None or now <= datetime.fromisoformat(close)
    tiers, got = [], set()
    for n, price in re.findall(r"(\d+) ticket\(s\) for \$(\d+(?:\.\d\d)?)", text_of(page)):
        if n not in got:
            got.add(n)
            tiers.append({"tickets": int(n), "price": float(price)})
    return [{
        "edition": str(ev), "title": f["P0_EVENT_NAME"], "status": "on_sale" if on else "closed",
        "licence_no": f["P0_LICENCE_NUMBER"] or None, "price_tiers": sorted(tiers, key=lambda x: x["price"]) or None,
        "sales_open": None, "sales_close": close, "draw_date": draw_day,
        "jackpot": num(f["P0_EVENT_SALES"]) if on else None,
        "jackpot_at": now.replace(microsecond=0).isoformat() if on else None,
        "sold_out": None, "source_url": url,
        "raw": {"percent_prize": 50 if re.search(r"(?i)winner gets half|50% of the total", text_of(page)) else None},
    }], []
