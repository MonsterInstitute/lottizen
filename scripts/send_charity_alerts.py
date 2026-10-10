#!/usr/bin/env python3
"""Emails for subscribers who follow a charity lottery (charity_follows):

  deadline   3 days (or less, if a run was missed) before each deadline,
             saying which draw a ticket bought after it misses and quoting
             the rules' own eligibility sentence where there is one
  selling    the lottery's own site says it's over N% sold, or it sold out
  result     a winning number the lottery published since the last run

Run after scripts/scrape_charity.py. Only confirmed, subscribed addresses.
Each event is sent once per subscriber: email_log rows are claimed before
sending (mailer.claim_send) and an event key already in email_log is never
sent again on a later day. Logs carry subscriber ids, never addresses.
"""
from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
from email_templates import charity_alert_email, money  # noqa: E402
from mailer import claim_send, deliver  # noqa: E402

SITE_URL = "https://lottizen.com"
TZ = ZoneInfo("America/Toronto")
PROV_SLUG = {"ON": "ontario", "QC": "quebec", "BC": "british-columbia", "AB": "alberta", "SK": "saskatchewan",
             "MB": "manitoba", "NS": "nova-scotia", "NB": "new-brunswick", "PE": "prince-edward-island",
             "NL": "newfoundland-and-labrador", "YT": "yukon", "NT": "northwest-territories", "NU": "nunavut"}
PROV_TZ = {"ON": "America/Toronto", "QC": "America/Toronto", "BC": "America/Vancouver", "AB": "America/Edmonton",
           "SK": "America/Regina", "MB": "America/Winnipeg", "NS": "America/Halifax", "NB": "America/Moncton",
           "PE": "America/Halifax", "NL": "America/St_Johns"}


def ts(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def local(dt: datetime, prov: str) -> datetime:
    return dt.astimezone(ZoneInfo(PROV_TZ.get(prov, "America/Toronto")))


def fmt_day(dt: datetime, prov: str) -> str:
    d = local(dt, prov)
    return d.strftime("%A, %B ") + str(d.day)


def sent_before(keys: set[str]) -> set[tuple[str, str]]:
    """(subscriber_id, game_slug) pairs already in email_log for charity types."""
    if not keys:
        return set()
    rows = db.fetch_all("email_log", "subscriber_id,game_slug,type",
                        filters=[("in_", "type", ["charity_deadline", "charity_selling", "charity_result"])])
    return {(r["subscriber_id"], r["game_slug"]) for r in rows if r["game_slug"] in keys}


def main() -> int:
    dry = "--dry-run" in sys.argv
    follows = db.fetch_all("charity_follows", "subscriber_id,lottery_id")
    if not follows and not dry:
        print("no charity follows; nothing to send")
        return 0
    subs = {s["id"]: s for s in db.fetch_all("subscribers", "id,email,magic_token,confirmed_at,unsubscribed_at")
            if s.get("confirmed_at") and not s.get("unsubscribed_at")}
    lots = {l["id"]: l for l in db.fetch_all("charity_lotteries", "*")}
    eds = db.fetch_all("charity_editions", "*")
    now = datetime.now(timezone.utc)
    recent_cut = (now - timedelta(days=3)).date().isoformat()
    results = [r for r in db.fetch_all("charity_results", "*", filters=[("gte", "draw_date", recent_cut)])
               if (ts(r.get("scraped_at")) or now) > now - timedelta(hours=36)]

    events: dict[str, list[dict]] = {}  # lottery_id -> events
    for e in eds:
        l = lots.get(e["lottery_id"])
        if not l or e.get("status") not in ("on_sale", "sold_out"):
            continue
        path = f"{SITE_URL}/charity/{PROV_SLUG.get(l['province'], 'canada')}/{l['id']}"
        elig = (e.get("raw") or {}).get("eligibility") or []
        draws = e.get("draws") or []
        cands = [(d.get("name"), d.get("cutoff"), d.get("draw_date")) for d in draws if d.get("cutoff")]
        if e.get("sales_close") and not any(c[0] == "Final" for c in cands) and l["kind"] in ("home", "raffle"):
            cands.append(("Final", e["sales_close"], e.get("draw_date")))
        for name, cut, drw in cands:
            c = ts(cut)
            if not c:
                continue
            days = (local(c, l["province"]).date() - local(now, l["province"]).date()).days
            if 0 <= days <= 3:
                after = next((s for s in elig if f"after the {name}".lower() in s.lower()), None)
                lines = [f"The {name} deadline for {l['name']} is {fmt_day(c, l['province'])}, end of day."]
                if name == "Final":
                    lines.append("It's the last day to buy a ticket for this edition.")
                elif drw:
                    lines.append(f"A ticket bought after it isn't in the {name} draw on {date.fromisoformat(drw[:10]):%B %-d}.")
                if after:
                    lines.append(f"The rules: “{after}.”")
                events.setdefault(l["id"], []).append({
                    "type": "charity_deadline", "key": f"{l['id']}:{name}:{cut[:10]}",
                    "subject": f"{days} day{'s' if days != 1 else ''} to the {name} deadline: {l['name']}" if days else f"Last day: {l['name']} {name} deadline",
                    "eyebrow": f"{l['name']} · deadline", "title": f"{name} deadline: {fmt_day(c, l['province'])}",
                    "lines": lines, "url": path, "button": "See the deadlines and draws"})
        raw = e.get("raw") or {}
        if e.get("status") == "sold_out" or (raw.get("sold_pct") or 0) >= 80:
            what = "is sold out" if e.get("status") == "sold_out" else f"says it's {raw['sold_pct_text'].lower()}"
            events.setdefault(l["id"], []).append({
                "type": "charity_selling", "key": f"{l['id']}:{e['edition']}:{'out' if e.get('status') == 'sold_out' else raw.get('sold_pct')}",
                "subject": f"{l['name']} {what}", "eyebrow": f"{l['name']}", "title": f"{l['name']} {what}",
                "lines": [f"The lottery's own site {what}." if e.get("status") != "sold_out" else
                          "The lottery's site shows it as sold out. The rules usually move the remaining draws earlier when that happens; the dates are on the page below."],
                "url": path, "button": "See the details"})
    grouped: dict[tuple, list[dict]] = {}
    for r in results:
        if r.get("winning_numbers") and r["lottery_id"] in lots:
            grouped.setdefault((r["lottery_id"], r.get("draw_date") or ""), []).append(r)
    for (lid, day), rs in grouped.items():
        l = lots[lid]
        path = f"{SITE_URL}/charity/{PROV_SLUG.get(l['province'], 'canada')}/{l['id']}/winning-numbers"
        rs.sort(key=lambda r: -(r.get("prize_value") or 0))
        lines = []
        for r in rs[:12]:
            draw, _, ev = (r.get("draw_name") or "").partition(" · ")
            prize = f"winner's prize {money(r['prize_value'])}" if r.get("prize_value") else draw
            lines.append(f"{', '.join(r['winning_numbers'])} — {prize}" + (f" ({ev})" if ev else ""))
        main = rs[0]
        when = date.fromisoformat(day).strftime("%B %-d") if day else ""
        events.setdefault(lid, []).append({
            "type": "charity_result", "key": f"{lid}:{day}:results",
            "subject": f"{l['name']} winning number{'s' if len(rs) > 1 else ''}{' for ' + when if when else ''}: {', '.join(main['winning_numbers'])}",
            "eyebrow": f"{l['name']} · winning numbers", "title": f"Drawn {when}" if when else l["name"],
            "lines": lines + ["Check your ticket with the lottery itself; its records decide every claim."],
            "url": path, "button": "All winning numbers"})

    keys = {ev["key"] for evs in events.values() for ev in evs}
    if dry:
        for lid, evs in events.items():
            for ev in evs:
                print(f"  [dry] {ev['type']}: {ev['subject']} | {' '.join(ev['lines'])[:220]}")
        return 0
    done = sent_before(keys)
    sent = skipped = 0
    for f in follows:
        sub = subs.get(f["subscriber_id"])
        if not sub:
            continue
        for ev in events.get(f["lottery_id"], []):
            if (sub["id"], ev["key"]) in done:
                continue
            log_id = claim_send(sub["id"], ev["type"], ev["key"])
            if log_id is None:
                continue
            unsub = f"{SITE_URL}/api/subscribe/unsubscribe?token={sub['magic_token']}"
            subject, html = charity_alert_email(
                subject=ev["subject"], eyebrow=ev["eyebrow"], title=ev["title"], lines=ev["lines"], url=ev["url"],
                button=ev["button"], preferences_url=f"{SITE_URL}/subscribe/preferences?token={sub['magic_token']}",
                unsubscribe_url=unsub)
            if deliver(log_id, sub["email"], subject, html, unsubscribe_url=unsub):
                sent += 1
            else:
                skipped += 1
            print(f"  {ev['type']} → subscriber {sub['id']}: {ev['key']}")
    print(f"✓ charity alerts: {sent} sent, {skipped} not sent, {len(keys)} events")
    return 0


if __name__ == "__main__":
    sys.exit(main())
