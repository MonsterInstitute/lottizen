#!/usr/bin/env python3
"""scrape_prize_breakdowns.py — what each prize tier actually paid, per draw.

The ticket wallet can tell someone they matched 4 of 6. It cannot tell them
what that is worth, because most Canadian tiers are pari-mutuel: the amount
depends on that draw's pool and how many others matched. This script fetches
the operator's own published breakdown and writes it to `prize_breakdowns`
(supabase/migrations/0015), which is what turns "you matched 4" into "that
tier paid $89.30" — and, where no source publishes it, leaves the amount
genuinely absent rather than estimated.

SOURCES (verified 2026-09-04)

  playnow  BCLC's PlayNow draw service, JSON, keyed by date:
             https://www.playnow.com/services2/lotto/draw/<KEY>/<YYYY-MM-DD>
           `gameBreakdown` carries one object per prize division with the
           published winner count and prize-per-winner. Covers the three
           national games and BC/49. A date the game did not draw returns
           HTTP 400, which is a normal, expected answer here, not an error.

  wclc     WCLC's per-draw prize-details page:
             https://www.wclc.com/<game>-prize-details.htm?drawNumber=<N>
           HTML table: Prize Category | Winners | Prize. Draw numbers are not
           guessable, so they are read off the game's past-winning-numbers
           page, which pairs each draw date with its prize-details link.
           Covers the two Western regional games.

NOT COVERED, DELIBERATELY: Ontario 49, Lottario and MegaDice. OLG publishes
those breakdowns only inside a client-rendered page with no feed behind it
(probed 2026-09-04: the winning-numbers feed carries no prize data, and every
plausible middleware path 404s). Their claims keep amount_source 'unknown' and
the ledger prints "no data" — see CLAUDE.md: never invent a number the data
can't support. Adding a rough guess here would put a wrong dollar figure in
someone's personal ledger, which is worse than an empty one.

Usage:
  python scripts/scrape_prize_breakdowns.py                 # last 10 days
  python scripts/scrape_prize_breakdowns.py --days 30
  python scripts/scrape_prize_breakdowns.py --game bc-49 --date 2026-08-29
  python scripts/scrape_prize_breakdowns.py --months 6      # WCLC backfill
  python scripts/scrape_prize_breakdowns.py --dry-run
"""
from __future__ import annotations

import argparse
import html
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

PLAYNOW_DRAW = "https://www.playnow.com/services2/lotto/draw/{key}/{date}"
WCLC_RECENT = "https://www.wclc.com/winning-numbers/{page}.htm"
WCLC_MONTH = "https://www.wclc.com/{page}.htm?back={back}"
WCLC_BASE = "https://www.wclc.com"

# `pick` is the number of main balls, and it is a CHECK, not a hint: every
# parsed tier label carries its own denominator ("4/7", "3 of 6") and a row
# whose denominator disagrees with this is dropped with a warning rather than
# written. That way a matrix change at the operator (Lotto Max went 7/49 →
# 7/50 → 7/52 in living memory) or a mis-mapped PlayNow key surfaces as a
# visible skip instead of silently filing one game's amounts under another's.
GAMES: dict[str, dict] = {
    "lotto-max":    {"pick": 7, "playnow": "LMAX"},
    "lotto-6-49":   {"pick": 6, "playnow": "SIX49"},
    "daily-grand":  {"pick": 5, "playnow": "DGRD"},
    "bc-49":        {"pick": 6, "playnow": "BC49"},
    "western-max":  {"pick": 7, "wclc": "western-max-extra"},
    "western-6-49": {"pick": 6, "wclc": "western-649-extra"},
}

# Live draw games with no breakdown source, kept explicit so the gap is a
# documented fact rather than something you notice by its absence.
NO_SOURCE = {
    "ontario-49": "OLG publishes no prize-breakdown feed",
    "lottario": "OLG publishes no prize-breakdown feed",
    "megadice": "OLG publishes no prize-breakdown feed",
}


def ssl_ctx() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        c = ssl.create_default_context()
        c.check_hostname = False
        c.verify_mode = ssl.CERT_NONE
        return c


def http_text(url: str, timeout: int = 30) -> str | None:
    """GET as text. Returns None on 400/404 — for PlayNow that is simply
    'no draw on that date', which happens on most calendar days per game."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx()) as r:
            return r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return None
        print(f"  ! {url} -> HTTP {e.code}", file=sys.stderr)
        return None
    except Exception as e:  # noqa: BLE001 — network/timeout: log and move on
        print(f"  ! {url} -> {type(e).__name__}: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Tier-label parsing
#
# The two sources word the same thing differently, so both normalise to one
# canonical tier_code: '<main>/<pick>' with '+B' appended when the tier also
# requires the bonus ball.
#   PlayNow  '7/7'  '6/7+Bonus'  '2/6+Bonus'   and, for Daily Grand's separate
#            Grand Number, '4/5 + 1/1' / '4/5 + 0/1'
#   WCLC     '7 of 7'  '6 of 7 + Bonus'
# ---------------------------------------------------------------------------
PLAYNOW_TIER = re.compile(r"^\s*(\d+)\s*/\s*(\d+)\s*(?:\+\s*(Bonus|\d\s*/\s*1))?\s*$", re.I)
WCLC_TIER = re.compile(r"^\s*(\d+)\s+of\s+(\d+)\s*(\+\s*Bonus)?\s*$", re.I)


def tier_code(main: int, pick: int, bonus: bool) -> str:
    return f"{main}/{pick}{'+B' if bonus else ''}"


def parse_playnow_tier(desc: str) -> tuple[int, int, bool] | None:
    m = PLAYNOW_TIER.match(desc or "")
    if not m:
        return None  # 'MAXPLUS', '$1,000,000.00' (Gold Ball) — see write_rows
    extra = (m.group(3) or "").replace(" ", "").lower()
    bonus = extra == "bonus" or extra.startswith("1/")
    return int(m.group(1)), int(m.group(2)), bonus


def parse_wclc_tier(label: str) -> tuple[int, int, bool] | None:
    m = WCLC_TIER.match(label or "")
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), bool(m.group(3))


MONEY = re.compile(r"^\$?\s*([\d,]+(?:\.\d{1,2})?)\s*$")


def money_cents(text: str) -> int | None:
    """Cents from a published prize string, or None when the operator printed
    words instead of an amount ('FREE PLAY', 'CARRIED OVER', 'NOT WON'). Those
    stay None and keep their wording in prize_label — coercing them to 0 would
    render in the wallet as 'your prize is $0.00', which is a different and
    false statement."""
    m = MONEY.match((text or "").strip())
    if not m:
        return None
    return int(round(float(m.group(1).replace(",", "")) * 100))


def int_or_none(text: str) -> int | None:
    t = (text or "").replace(",", "").strip()
    return int(t) if t.isdigit() else None


# ---------------------------------------------------------------------------
# Adapter: BCLC PlayNow (JSON, by date)
# ---------------------------------------------------------------------------
def playnow_breakdown(slug: str, key: str, pick: int, draw_date: str) -> list[dict]:
    url = PLAYNOW_DRAW.format(key=key, date=draw_date)
    body = http_text(url, timeout=25)
    if not body:
        return []
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        print(f"  ! {slug} {draw_date}: PlayNow returned non-JSON", file=sys.stderr)
        return []

    rows: list[dict] = []
    seen: set[str] = set()
    for entry in data.get("gameBreakdown") or []:
        desc = str(entry.get("desc") or "")
        parsed = parse_playnow_tier(desc)
        if not parsed:
            # Not a main-number match tier: Lotto Max's MAXPLUS lines (fifteen
            # separate side draws) and 6/49's Gold Ball. Both are real prizes,
            # but neither can be resolved from a saved combination — we don't
            # hold a Gold Ball serial or a MaxPlus selection — so writing them
            # would create tiers nothing can ever match against.
            continue
        main, label_pick, bonus = parsed
        if label_pick != pick:
            print(f"  ! {slug} {draw_date}: tier '{desc}' says /{label_pick}, "
                  f"config says /{pick} — skipped", file=sys.stderr)
            continue
        code = tier_code(main, pick, bonus)
        if code in seen:
            # PlayNow repeats some divisions verbatim (6/49's 5/6+Bonus arrives
            # twice, identical). Keep the first; the repeat is the same figure,
            # not a second set of winners to add up.
            continue
        seen.add(code)
        amount = entry.get("prizeAmount")
        rows.append({
            "game_slug": slug,
            "draw_date": draw_date,
            "tier_code": code,
            "tier_label": desc.strip(),
            "match_main": main,
            "match_bonus": bonus,
            "winners": entry.get("winnersTotal"),
            "prize_cents": int(round(float(amount) * 100)) if amount is not None else None,
            "prize_label": None,
            "source": "playnow",
            "source_url": url,
        })
    return rows


# ---------------------------------------------------------------------------
# Adapter: WCLC (HTML, by draw number)
# ---------------------------------------------------------------------------
DATE_BLOCK = re.compile(
    r'pastWinNumPrizeBreakdown"\s+rel="([^"]+)".*?pastWinNumDate">\s*<h4>\s*([^<]+?)\s*</h4>',
    re.S,
)
ROW_CELLS = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.S | re.I)


def wclc_draw_index(page: str, back: int | None = None) -> list[tuple[str, str]]:
    """(draw_date, prize-details path) for one WCLC listing page.

    The prize-details link sits in each draw's sidebar, which is emitted before
    that draw's date heading, so the two are read as one ordered pair per block
    rather than zipped from two independent lists — a zip would silently pair
    the wrong date with the wrong draw the moment one draw lacked a link.
    """
    url = WCLC_RECENT.format(page=page) if back is None else WCLC_MONTH.format(page=page, back=back)
    body = http_text(url)
    if not body:
        return []
    out: list[tuple[str, str]] = []
    for rel, date_text in DATE_BLOCK.findall(body):
        try:
            d = datetime.strptime(date_text.split(", ", 1)[1], "%B %d, %Y").date().isoformat()
        except (ValueError, IndexError):
            continue
        out.append((d, rel))
    return out


def wclc_breakdown(slug: str, pick: int, draw_date: str, rel: str) -> list[dict]:
    url = f"{WCLC_BASE}{rel}"
    body = http_text(url)
    if not body:
        return []

    rows: list[dict] = []
    seen: set[str] = set()
    for table in re.findall(r"<table[^>]*>.*?</table>", body, re.S | re.I):
        if "prize category" not in table.lower():
            continue
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S | re.I):
            cells = [
                re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", c))).strip()
                for c in ROW_CELLS.findall(tr)
            ]
            if len(cells) < 3:
                continue
            parsed = parse_wclc_tier(cells[0])
            if not parsed:
                continue  # header row, or the EXTRA table's 'Last 4 digits'
            main, label_pick, bonus = parsed
            if label_pick != pick:
                print(f"  ! {slug} {draw_date}: tier '{cells[0]}' says /{label_pick}, "
                      f"config says /{pick} — skipped", file=sys.stderr)
                continue
            code = tier_code(main, pick, bonus)
            if code in seen:
                continue
            seen.add(code)
            cents = money_cents(cells[2])
            rows.append({
                "game_slug": slug,
                "draw_date": draw_date,
                "tier_code": code,
                "tier_label": cells[0],
                "match_main": main,
                "match_bonus": bonus,
                "winners": int_or_none(cells[1]),
                "prize_cents": cents,
                # 'FREE PLAY' / 'CARRIED OVER' / 'NOT WON' — the operator's own
                # wording, kept only when there is no amount to keep instead.
                "prize_label": None if cents is not None else (cells[2] or None),
                "source": "wclc",
                "source_url": url,
            })
        if rows:
            break  # first Prize Category table is the main game's
    return rows


# ---------------------------------------------------------------------------
def stored_draw_dates(slug: str, since: str) -> list[str]:
    """Draw dates we already hold for this game — the list of dates worth
    asking about. Reading them from `draws` rather than walking the calendar
    means one request per real draw instead of one per day per game."""
    rows = db.fetch_all(
        "draws", "draw_date",
        filters=[("eq", "game_id", slug), ("gte", "draw_date", since)],
    )
    return sorted({r["draw_date"] for r in rows})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", help="restrict to one game slug")
    ap.add_argument("--date", help="one draw date (YYYY-MM-DD); PlayNow games only")
    ap.add_argument("--days", type=int, default=10, help="look back this many days (default 10)")
    ap.add_argument("--months", type=int, default=1,
                    help="WCLC listing pages to walk back (1 = the recent page only)")
    ap.add_argument("--dry-run", action="store_true", help="print, don't write")
    args = ap.parse_args()

    targets = {args.game: GAMES[args.game]} if args.game in GAMES else GAMES
    if args.game and args.game not in GAMES:
        reason = NO_SOURCE.get(args.game)
        print(f"✗ No prize-breakdown source for '{args.game}'"
              + (f": {reason}." if reason else "."))
        return 1

    since = (date.today() - timedelta(days=args.days)).isoformat()
    all_rows: list[dict] = []

    for slug, cfg in targets.items():
        if cfg.get("playnow"):
            dates = [args.date] if args.date else stored_draw_dates(slug, since)
            found = 0
            for d in dates:
                rows = playnow_breakdown(slug, cfg["playnow"], cfg["pick"], d)
                if rows:
                    found += 1
                    all_rows.extend(rows)
                time.sleep(0.4)  # polite: this is someone else's public service
            print(f"{slug:14s} playnow  {found}/{len(dates)} draw(s) with a breakdown")

        elif cfg.get("wclc"):
            if args.date:
                print(f"{slug:14s} wclc     --date not supported (draws are addressed "
                      f"by draw number, discovered from the listing page) — skipped")
                continue
            index: list[tuple[str, str]] = []
            for back in range(args.months):
                index.extend(wclc_draw_index(cfg["wclc"], None if back == 0 else back))
                time.sleep(0.4)
            wanted = sorted({(d, rel) for d, rel in index if d >= since or args.months > 1})
            found = 0
            for d, rel in wanted:
                rows = wclc_breakdown(slug, cfg["pick"], d, rel)
                if rows:
                    found += 1
                    all_rows.extend(rows)
                time.sleep(0.4)
            print(f"{slug:14s} wclc     {found}/{len(wanted)} draw(s) with a breakdown")

    for slug, reason in NO_SOURCE.items():
        if not args.game:
            print(f"{slug:14s} —        no source ({reason})")

    if not all_rows:
        print("\nNothing to write.")
        return 0

    if args.dry_run:
        for r in all_rows[:40]:
            amount = f"${r['prize_cents'] / 100:,.2f}" if r["prize_cents"] is not None else (r["prize_label"] or "—")
            print(f"  {r['game_slug']:14s} {r['draw_date']}  {r['tier_code']:8s} "
                  f"{str(r['winners']):>9s} winners  {amount}")
        print(f"\n[dry run] {len(all_rows)} tier row(s) across "
              f"{len({(r['game_slug'], r['draw_date']) for r in all_rows})} draw(s).")
        return 0

    db.upsert_rows("prize_breakdowns", all_rows, on_conflict="game_slug,draw_date,tier_code")
    print(f"\n✓ {len(all_rows)} tier row(s) upserted across "
          f"{len({(r['game_slug'], r['draw_date']) for r in all_rows})} draw(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
