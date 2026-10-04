#!/usr/bin/env python3
"""press_radar.py — notice when a lottery story is about to be news, and
email the owner a ready-to-use pitch package. Sends nothing to journalists.

Triggers (thresholds in config/outreach.toml [press]):
  * jackpot   — a game's next advertised jackpot reaches its threshold. One
                event per run of rollovers: it fires once when the estimate
                crosses the line and closes when it drops back (the jackpot
                was won), so a rolling $70M → $80M → $90M doesn't re-fire.
  * unclaimed — a listed unclaimed prize of at least unclaimed_min_amount
                whose one-year claim window ends within unclaimed_days_ahead.
                Fires once per prize.

Each event is a row in press_events (event_key unique). `emailed_at` is set
only after Resend accepts the pitch, so a failed send retries next run.

    python scripts/press_radar.py [--dry-run] [--preview-dir DIR]
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import outreach_common as oc  # noqa: E402
from game_meta import GAME_META  # noqa: E402

GAME_SLUG = {"lotto max": "lotto-max", "lotto 6/49": "lotto-6-49", "daily grand": "daily-grand",
             "lottario": "lottario", "ontario 49": "ontario-49", "western max": "western-max",
             "western 649": "western-6-49", "western 6/49": "western-6-49", "bc/49": "bc-49"}


# ================================================================= data

def draw_numbers(slug: str, ymd: str) -> dict | None:
    p = oc.DATA / "draws" / f"{slug}.json"
    if not p.exists():
        return None
    return next((d for d in json.loads(p.read_text())["draws"] if d["date"] == ymd), None)


def jackpot_trend(slug: str) -> str | None:
    """From jackpot_snapshots (one row per day): how far back the current
    unbroken climb goes. None when there's no history to say it from."""
    try:
        import db
        rows = (db.get_client().table("jackpot_snapshots").select("captured_date,amount")
                .eq("game_slug", slug).order("captured_date", desc=True).limit(120).execute().data)
    except Exception:  # noqa: BLE001
        return None
    if len(rows) < 2:
        return None
    start = rows[0]
    for r in rows[1:]:
        if r["amount"] > start["amount"]:
            break  # a drop going forward in time = the jackpot was won
        start = r
    if start is rows[0]:
        return None
    cur = GAME_META[slug]["currency"]
    return (f"Our daily snapshots show the estimate climbing from {oc.money(start['amount'], cur, compact=True)} "
            f"on {start['captured_date']} to {oc.money(rows[0]['amount'], cur, compact=True)} on {rows[0]['captured_date']} "
            f"without a jackpot win in between.")


def ranked_contacts(topic: str, limit: int = 15) -> list[dict]:
    try:
        import db
        rows = db.get_client().table("outreach_contacts").select("*").limit(1000).execute().data
    except Exception:  # noqa: BLE001
        return []
    today = oc.today_toronto()

    def score(c):
        s = 3 * (topic in (c.get("topics") or [])) + min(c.get("article_count") or 0, 5)
        days = (today - date.fromisoformat(c["last_seen"][:10])).days
        s += 2 if days <= 30 else (1 if days <= 90 else 0)
        s += 1 if (c.get("outlet_domain") or "").endswith(".ca") else 0
        return s

    return sorted(rows, key=score, reverse=True)[:limit]


# ================================================================= triggers

def jackpot_events(cfg: dict) -> tuple[list[dict], list[str]]:
    """(events that should be open, slugs whose open event should close)."""
    thresholds = cfg["press"]["jackpot_thresholds"]
    latest = {g["slug"]: g for g in oc.latest_draws()}
    today = oc.today_toronto().isoformat()
    events, closing = [], []
    for slug, threshold in thresholds.items():
        g = latest.get(slug)
        amount = g.get("nextJackpot") if g else None
        if amount is None or (g.get("nextDraw") or "") < today:
            print(f"  jackpot: {slug}: no current published estimate in our data; can't evaluate")
            closing.append(slug)
            continue
        cur = GAME_META[slug]["currency"]
        print(f"  jackpot: {slug}: {oc.money(amount, cur)} vs threshold {oc.money(threshold, cur)}")
        if amount < threshold:
            closing.append(slug)
            continue
        events.append({"kind": "jackpot", "slug": slug, "amount": amount, "next_draw": g["nextDraw"],
                       "threshold": threshold, "currency": cur})
    return events, closing


def unclaimed_events(cfg: dict) -> list[dict]:
    pc = cfg["press"]
    today = oc.today_toronto()
    out = []
    for p in oc.unclaimed_prizes():
        days = (date.fromisoformat(p["expires"]) - today).days
        if p["amount"] >= pc["unclaimed_min_amount"] and 0 <= days <= pc["unclaimed_days_ahead"]:
            out.append({"kind": "unclaimed", **p, "days_left": days})
    return out


def event_key(e: dict) -> str:
    if e["kind"] == "jackpot":
        return f"jackpot:{e['slug']}:{e['next_draw']}"
    return f"unclaimed:{e['agency'].lower()}:{e['game'].lower().replace(' ', '-')}:{e['draw_date']}:{int(e['amount'])}"


# ================================================================= pitch packages

def _li(items: list[str]) -> str:
    return "<ul style='font-size:14px;padding-left:18px;margin:8px 0'>" + "".join(
        f"<li style='margin:0 0 6px'>{x}</li>" for x in items) + "</ul>"


def _contacts_html(contacts: list[dict]) -> str:
    if not contacts:
        return ("<p style='font-size:13.5px;color:#6d685f'>No contacts collected yet. The daily outreach radar adds the "
                "byline of every Canadian lottery story it finds; this list fills up over the coming weeks.</p>")
    rows = "".join(
        f"<tr><td style='padding:6px 8px 6px 0'><b>{html.escape(c['name'])}</b><br>"
        f"<span style='color:#6d685f'>{html.escape(c['outlet'])}</span></td>"
        f"<td style='padding:6px 8px;color:#6d685f'>{c['article_count']} article{'s' if c['article_count'] != 1 else ''} · "
        f"last {c['last_seen'][:10]}<br>{html.escape(', '.join(c.get('topics') or []) or 'general')}</td>"
        f"<td style='padding:6px 0'><a href='{html.escape(c.get('last_article_url') or '')}' style='color:#c2652a'>"
        f"{html.escape(oc.clip(c.get('last_article_title') or '', 70))}</a></td></tr>"
        for c in contacts)
    return (f"<table style='font-size:13px;border-collapse:collapse;width:100%'>{rows}</table>"
            "<p style='font-size:12px;color:#9c968a'>Ranked by topic match, how often they cover lotteries, recency, and "
            "Canadian outlet. Find each reporter's address on their outlet's staff page; the radar doesn't guess emails.</p>")


def unclaimed_package(e: dict) -> tuple[str, str, str]:
    agency_rows = [p for p in oc.unclaimed_prizes() if p["agency"] == e["agency"]]
    big = [p for p in agency_rows if p["amount"] >= 1_000_000]
    total = sum(p["amount"] for p in agency_rows)
    slug = GAME_SLUG.get(e["game"].lower())
    draw = draw_numbers(slug, e["draw_date"]) if slug else None
    amount = oc.money(e["amount"])
    expires = date.fromisoformat(e["expires"])
    drawn = date.fromisoformat(e["draw_date"])
    headline = f"{amount} {e['game']} prize still on {e['agency']}'s unclaimed list, {e['days_left']} days left"

    why = [
        f"{e['agency']}'s unclaimed list shows a <b>{amount} {html.escape(e['game'])}</b> prize from the "
        f"{drawn:%B %-d, %Y} draw, sold in the area {e['agency']} lists as <b>{html.escape(e['location'])}</b>.",
        f"Draw-game prizes must be claimed within one year of the draw, so the window closes around "
        f"<b>{expires:%B %-d, %Y}</b>: <b>{e['days_left']} days</b> from today.",
        f"List date: {html.escape(e['list_as_of'])}. The ticket may have been claimed since; {e['agency']} is the "
        f"authority, so confirm with them before anyone publishes.",
    ]
    numbers = ""
    if draw:
        nums = " ".join(f"{n:02d}" for n in draw["numbers"]) + (f" + bonus {draw['bonus']:02d}" if draw.get("bonus") is not None else "")
        numbers = f"Winning numbers for that draw: {nums}"
    facts = [
        f"{e['agency']} currently lists {len(agency_rows)} unclaimed prizes worth {oc.money(total)} in total; "
        f"{len(big)} of them are $1 million or more.",
        "Claim windows: one year from the draw at OLG, WCLC, ALC and Loto-Québec; 52 weeks at BCLC. Scratch tickets "
        "expire on the date printed on the ticket.",
    ]
    if numbers:
        facts.append(numbers + (f" (<a href='{oc.game_url(slug, '/results/' + e['draw_date'][:4])}'>source</a>)" if slug else ""))
    other = sorted([p for p in oc.unclaimed_prizes() if p["amount"] >= 1_000_000
                    and p["expires"] >= oc.today_toronto().isoformat() and p["draw_date"] != e["draw_date"]],
                   key=lambda p: p["expires"])[:4]
    if other:
        facts.append("Other $1M+ prizes on agency lists: " + "; ".join(
            f"{oc.money(p['amount'])} {p['game']} ({p['agency']}, {p['location']}, drawn {p['draw_date']}, "
            f"window ends ~{p['expires']})" for p in other) + ".")
    facts.append(f"Sources: <a href='{e['source_url']}'>{e['agency']} unclaimed list</a>, "
                 f"<a href='{oc.url('/data/canada-lottery-almanac')}'>Lottizen almanac</a> (claim rules by agency, with citations).")

    subject_for_journalist = f"Data for a story: {amount} {e['game']} prize, claim window closes {expires:%B %-d}"
    pitch = (
        f"Hi [first name],\n\n"
        f"{e['agency']}'s unclaimed-prize list still shows the {amount} {e['game']} prize from the {drawn:%B %-d, %Y} "
        f"draw, sold in the area {e['agency']} calls {e['location']}. Draw prizes have to be claimed within a year, so "
        f"the window closes around {expires:%B %-d}, {e['days_left']} days from now. (The list is dated "
        f"{e['list_as_of']}; {e['agency']} can confirm it's still unclaimed.)\n\n"
        f"If you cover it, a few figures you're welcome to use:\n"
        f"- {e['agency']} lists {len(agency_rows)} unclaimed prizes worth {oc.money(total)}; {len(big)} are $1 million or more.\n"
        f"- Claim windows by province, with sources: {oc.url('/data/canada-lottery-almanac')}\n"
        + (f"- {numbers}\n" if numbers else "")
        + f"\nThe data is free to use with a credit to Lottizen. If a different cut would help, reply and I'll pull it.\n\n"
        f"[your name]\nLottizen · {oc.url('/press')}"
    )
    return headline, subject_for_journalist, _package(headline, why, facts, subject_for_journalist, pitch, "unclaimed")


def jackpot_package(e: dict) -> tuple[str, str, str]:
    slug, cur = e["slug"], e["currency"]
    name = GAME_META[slug]["name"]
    amt = oc.money(e["amount"], cur, compact=True)
    nd = date.fromisoformat(e["next_draw"])
    headline = f"{name} jackpot at {amt} for {nd:%a %b %-d}"
    trend = jackpot_trend(slug)
    x = oc.number_extremes(slug)
    why = [f"The {name} jackpot for the {nd:%A, %B %-d} draw is estimated at <b>{amt}</b>, above the "
           f"{oc.money(e['threshold'], cur, compact=True)} pitch threshold set in config/outreach.toml."]
    if trend:
        why.append(trend)
    facts = []
    if x:
        facts.append(f"Across {x['draws']:,} draws since {x['since']}, the most-drawn numbers are "
                     f"{', '.join(map(str, x['most']))} ({x['most_count']} times) and the least-drawn "
                     f"{', '.join(map(str, x['least']))} ({x['least_count']} times). Every number has the same chance in "
                     f"every draw; these are historical counts (<a href='{oc.game_url(slug, '/statistics')}'>source</a>).")
    facts.append("The one number-picking point that holds up: many players choose birthdays (1 to 31), so a ticket with "
                 "higher numbers would split a jackpot with fewer people if it won. The odds are the same.")
    facts.append(f"Results archive back to the game's launch and a free embeddable jackpot widget: "
                 f"<a href='{oc.game_url(slug)}'>{name} page</a>, <a href='{oc.url('/embed')}'>widgets</a>.")
    subject_for_journalist = f"{name} at {amt}: number history and a free jackpot widget"
    pitch = (
        f"Hi [first name],\n\n"
        f"With {name} at an estimated {amt} for {nd:%A}'s draw, here is some data you're welcome to use:\n\n"
        + (f"- Across {x['draws']:,} draws since {x['since'][:4]}, the most-drawn numbers are {', '.join(map(str, x['most']))} "
           f"and the least-drawn {', '.join(map(str, x['least']))}. Every number has the same chance in every draw, so "
           f"this is history, not a tip.\n" if x else "")
        + "- The one picking point that holds up: lots of people play birthdays (1 to 31), so higher numbers would split "
          "a jackpot with fewer people. Same odds, bigger share if it hits.\n"
        + f"- A live jackpot widget you can embed in a story or live blog for free: {oc.url('/embed')}\n\n"
        f"Free to use with a credit to Lottizen. Happy to pull anything more specific.\n\n"
        f"[your name]\nLottizen · {oc.url('/press')}"
    )
    return headline, subject_for_journalist, _package(headline, why, facts, subject_for_journalist, pitch, "jackpot")


def _package(headline, why, facts, subject_j, pitch, topic) -> str:
    bad = oc.check_honesty(pitch)
    if bad:  # templates are fixed text; this firing means someone edited them badly
        raise SystemExit(f"✗ pitch template trips the honesty guard: {bad}")
    body = (
        oc.card("<div style='font-size:12px;font-weight:700'>Why it's news now</div>" + _li(why))
        + oc.card("<div style='font-size:12px;font-weight:700'>Figures we can offer (live from our data)</div>" + _li(facts))
        + oc.card("<div style='font-size:12px;font-weight:700'>Email to a journalist (edit, then send yourself)</div>"
                  f"<div style='font-size:13px;margin-top:6px'><b>Subject:</b> {html.escape(subject_j)}</div>"
                  + oc.draft_box(pitch))
        + oc.card("<div style='font-size:12px;font-weight:700'>Who to send it to</div>" + _contacts_html(ranked_contacts(topic)))
    )
    return oc.email_shell(headline, "A press-timing trigger fired. Everything below is prepared for you; nothing has been sent to anyone.", body)


# ================================================================= main

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="no Supabase writes, no email")
    ap.add_argument("--preview-dir", help="with --dry-run: write each pitch package here as HTML")
    args = ap.parse_args()
    cfg = oc.load_config()

    jack, closing = jackpot_events(cfg)
    events = jack + unclaimed_events(cfg)
    print(f"  {len(events)} event(s) currently over a threshold")

    client = None
    if not args.dry_run:
        import db
        client = db.get_client()
        # Close finished jackpot runs so the next crossing fires again.
        for slug in closing:
            open_rows = (client.table("press_events").select("id,payload").eq("kind", "jackpot")
                         .eq("payload->>slug", slug).eq("payload->>open", "true").execute().data)
            for r in open_rows:
                client.table("press_events").update({"payload": {**r["payload"], "open": False}}).eq("id", r["id"]).execute()

    sent = 0
    for e in events:
        key = event_key(e)
        if client is not None:
            if e["kind"] == "jackpot":
                run = (client.table("press_events").select("id,event_key,emailed_at").eq("kind", "jackpot")
                       .eq("payload->>slug", e["slug"]).eq("payload->>open", "true").execute().data)
                if run and run[0]["emailed_at"]:
                    print(f"  = {key}: same jackpot run as {run[0]['event_key']}; already pitched")
                    continue
                if run:
                    key = run[0]["event_key"]
            existing = client.table("press_events").select("emailed_at").eq("event_key", key).execute().data
            if existing and existing[0]["emailed_at"]:
                print(f"  = {key}: already pitched")
                continue
            if not existing:
                client.table("press_events").insert({
                    "event_key": key, "kind": e["kind"],
                    "payload": {**e, "open": True} if e["kind"] == "jackpot" else e,
                }).execute()

        headline, _, body = (jackpot_package if e["kind"] == "jackpot" else unclaimed_package)(e)
        subject = f"Press timing: {headline}"
        if args.dry_run:
            if args.preview_dir:
                out = Path(args.preview_dir) / (re.sub(r"[^a-z0-9]+", "-", key.lower()) + ".html")
                out.write_text(body)
                print(f"  [dry-run] {key}: preview at {out}")
            else:
                print(f"  [dry-run] {key}: would email '{subject}'")
            continue
        if oc.send_to_owner(subject, body):
            client.table("press_events").update({"emailed_at": oc.now_utc().isoformat()}).eq("event_key", key).execute()
            sent += 1
            print(f"  ✓ {key}: pitch package emailed")
        else:
            print(f"  ✗ {key}: Resend did not accept; will retry next run")
    print(f"✓ press radar: {sent} pitch package(s) emailed")


if __name__ == "__main__":
    main()
