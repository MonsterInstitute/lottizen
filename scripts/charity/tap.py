"""TAP 5050 (Saskatchewan Roughriders and other SK teams).

RSS https://rss.tap5050.com/bug.rss?EID=<orgId>: <title> event, <link> the
current pot ("$70,099"), <description> the winning ticket after the draw.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from .common import fetch, num


def scrape(lot: dict) -> tuple[list[dict], list[dict]]:
    url = f"https://rss.tap5050.com/bug.rss?EID={lot['ref']}"
    x = fetch(url)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    editions, results = [], []
    for item in re.findall(r"<item>(.*?)</item>", x, re.S):
        tag = lambda n: (re.search(fr"<{n}>(.*?)</{n}>", item, re.S) or [None, None])[1]  # noqa: E731
        title = (tag("title") or "").strip()
        pot = num((tag("link") or "").strip())
        win = re.sub(r"<[^>]+>|\s+", " ", tag("description") or "").strip()
        ed = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:80] or "current"
        editions.append({"edition": ed, "title": title, "status": "drawn" if win else "on_sale", "jackpot": pot,
                         "jackpot_at": now, "source_url": url, "raw": {}})
        if win and re.search(r"\d", win):
            results.append({"edition": ed, "draw_name": f"50/50 · {title}"[:200], "draw_date": None,
                            "winning_numbers": [win[:40]], "prize": None, "prize_value": None, "source_url": url})
    return editions, results
