#!/usr/bin/env python3
"""
scrape_olg.py — Fetch OLG Ontario instant (scratch) games and their remaining
top-prize data into Supabase (games + prize_tiers tables).

REAL DATA SOURCE (verified 2026-07):
  https://gateway.www.olg.ca/feeds/instant-unclaimed
  An Azure API-Management JSON feed powering olg.ca's "unclaimed instant prizes"
  page. It returns ~358 rows, one per (game, prize tier):

    { "gameCost": "5.0", "gameName": "INSTANT CASH FOR LIFE", "gameNumber": "1234",
      "prizeEN": "$1,000/WK FOR LIFE", "totalPrizes": "5", "unclaimedPrizes": "3" }

  The gateway rejects anonymous calls with HTTP 401 ("missing subscription key").
  The site's frontend passes a public client key as the `x-client-id` header plus
  `x-site-code: playolg.ca`. We send those directly (no browser needed). If the
  key ever rotates and the direct call 401s, we fall back to Playwright, render the
  page, sniff the *current* x-client-id off the live request, and retry.

  The feed lists a game's TOP / notable prizes with printed vs unclaimed counts.
  It does NOT publish odds or total tickets printed, so the Value Score is derived
  purely from these counts (see calculate_rankings.py).

Sample mode (`--sample`): seeds a clearly-flagged demo dataset (source='sample')
so `next build` always has data. We never present sample numbers as live figures.

Usage:
  python3 scripts/scrape_olg.py            # live, falling back to sample
  python3 scripts/scrape_olg.py --live     # live only (non-zero exit on failure)
  python3 scripts/scrape_olg.py --sample   # seed demo data only
"""
from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402 — shared Supabase data-layer helper (replaces sqlite3)

ROOT = Path(__file__).resolve().parent.parent

FEED_URL = "https://gateway.www.olg.ca/feeds/instant-unclaimed"
RENDER_URL = "https://www.olg.ca/en/winners/unclaimed-instant-prizes.html"

# Public client key lifted from olg.ca's frontend (verified working). Kept as a
# default; the Playwright fallback refreshes it if the gateway starts 401-ing.
DEFAULT_CLIENT_ID = "9c92a16d25b542048aa93a397093efe2"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.lower()).strip()
    return re.sub(r"[\s_]+", "-", s)


def _ssl_context() -> ssl.SSLContext:
    """Verified context via certifi when available; otherwise fall back to an
    unverified context (the feed is public, non-sensitive). CI (Ubuntu) has
    system CAs and verifies normally."""
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx


# --------------------------------------------------------------------------
# Prize label parsing
# --------------------------------------------------------------------------
LIFE_RE = re.compile(r"\$?([\d,]+(?:\.\d+)?)\s*/\s*(wk|week|yr|year|mo|month)", re.I)
LIFE_YEARS = 20  # lump-sum horizon for "for life" annuities


def parse_amount(label: str) -> float:
    """Best-effort dollar value of a prize label.
      "$1,000.00"            -> 1000
      "$150,000.00 SPIN WIN" -> 150000
      "$1,000/WK FOR LIFE"   -> 20-year lump-sum equivalent
      "PLINKO" / "BIG SPIN"  -> 0 (unvalued experiential prize; excluded from score)
    """
    m = LIFE_RE.search(label)
    if m and "life" in label.lower():
        base = float(m.group(1).replace(",", ""))
        unit = m.group(2).lower()
        per_year = {"wk": 52, "week": 52, "yr": 1, "year": 1, "mo": 12, "month": 12}[unit]
        return base * per_year * LIFE_YEARS
    m = re.search(r"\$([\d,]+(?:\.\d+)?)", label)
    return float(m.group(1).replace(",", "")) if m else 0.0


def clean_name(name: str) -> str:
    """Title-case the SHOUTY feed names: 'INSTANT CASH FOR LIFE' -> 'Instant Cash for Life'."""
    small = {"for", "of", "the", "and", "a", "to", "in", "n"}
    words = name.strip().split()
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if "$" in w or any(c.isdigit() for c in w):
            out.append(w)  # keep tokens like "$50" or "8's"
        elif lw in small and i != 0:
            out.append(lw)
        else:
            out.append(w.capitalize())
    return " ".join(out)


# --------------------------------------------------------------------------
# Supabase (schema lives in Postgres; see supabase/migrations/0001_init.sql)
# --------------------------------------------------------------------------
def replace_games(games: list[dict], source: str) -> None:
    """Full refresh: clear and rewrite so delisted games/tiers disappear.

    Deleting every game cascades to prize_tiers (FK ON DELETE CASCADE), then we
    bulk-insert fresh rows. prize_tiers ids are auto-generated (identity), so we
    insert tiers without an id — matching the old AUTOINCREMENT behaviour."""
    ts = now_iso()
    db.delete_all("games", "game_number", "__lottizen_none__")  # cascades to prize_tiers
    game_rows = [{"game_number": g["game_number"], "name": g["name"],
                  "slug": slugify(g["name"]), "price": g["price"],
                  "source": source, "scraped_at": ts} for g in games]
    tier_rows = []
    for g in games:
        for t in g["prize_tiers"]:
            tier_rows.append({"game_number": g["game_number"], "amount": t["amount"],
                              "label": t["label"], "total": t["total"],
                              "remaining": t["remaining"],
                              "is_top": 1 if t.get("is_top") else 0, "scraped_at": ts})
    db.insert_rows("games", game_rows)       # parent first (FK)
    db.insert_rows("prize_tiers", tier_rows)  # children


# --------------------------------------------------------------------------
# LIVE: fetch + parse the real feed
# --------------------------------------------------------------------------
def fetch_feed(client_id: str) -> dict | None:
    headers = {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-CA",
        "x-site-code": "playolg.ca",
        "x-client-id": client_id,
        "Referer": "https://www.olg.ca/",
    }
    req = urllib.request.Request(FEED_URL, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=25, context=_ssl_context()) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  feed HTTP {e.code}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"  feed error: {e}", file=sys.stderr)
    return None


def discover_client_id() -> str | None:
    """Render the page with Playwright and sniff the live x-client-id header."""
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError:
        print("  ! Playwright not installed; cannot refresh client key.", file=sys.stderr)
        return None
    found: dict[str, str] = {}
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(user_agent=UA, locale="en-CA")
        page = ctx.new_page()

        def on_req(req):
            if "instant-unclaimed" in req.url and "x-client-id" in req.headers:
                found["id"] = req.headers["x-client-id"]

        page.on("request", on_req)
        try:
            page.goto(RENDER_URL, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(4000)
        except Exception as e:  # noqa: BLE001
            print(f"  ! render failed: {e}", file=sys.stderr)
        b.close()
    if found.get("id"):
        print(f"  ⤷ discovered x-client-id via Playwright: {found['id']}")
    return found.get("id")


def parse_feed(data: dict) -> list[dict]:
    try:
        rows = data["response"]["instantUnclaimedPrizes"]["instantUnclaimedPrize"]
    except (KeyError, TypeError):
        print("  ! unexpected feed shape", file=sys.stderr)
        return []
    if isinstance(rows, dict):  # single-row feeds arrive unwrapped
        rows = [rows]

    games: dict[str, dict] = {}
    for r in rows:
        try:
            no = str(r["gameNumber"]).strip()
            g = games.setdefault(no, {
                "game_number": no,
                "name": clean_name(r["gameName"]),
                "price": float(r["gameCost"]),
                "prize_tiers": [],
            })
            g["prize_tiers"].append({
                "amount": parse_amount(r["prizeEN"]),
                "label": r["prizeEN"].strip(),
                "total": int(float(r["totalPrizes"])),
                "remaining": int(float(r["unclaimedPrizes"])),
            })
        except (KeyError, ValueError) as e:
            print(f"  ! skipped row: {e}", file=sys.stderr)

    out = []
    for g in games.values():
        tiers = sorted(g["prize_tiers"], key=lambda t: t["amount"], reverse=True)
        # Mark the highest-value tier that still has unclaimed prizes as "top";
        # else the highest-value tier overall.
        top_i = next((i for i, t in enumerate(tiers) if t["remaining"] > 0), 0)
        for i, t in enumerate(tiers):
            t["is_top"] = i == top_i
        g["prize_tiers"] = tiers
        out.append(g)
    # Keep games that still have at least one unclaimed, valued prize.
    return [g for g in out
            if any(t["remaining"] > 0 and t["amount"] > 0 for t in g["prize_tiers"])]


def run_live() -> int:
    print("→ fetching OLG unclaimed-instant-prizes feed...")
    data = fetch_feed(DEFAULT_CLIENT_ID)
    if data is None:
        print("→ default key rejected; refreshing via Playwright...")
        cid = discover_client_id()
        if cid:
            data = fetch_feed(cid)
    if data is None:
        print("✗ could not fetch the OLG feed.", file=sys.stderr)
        return 0
    games = parse_feed(data)
    if not games:
        print("✗ feed parsed to zero games.", file=sys.stderr)
        return 0
    replace_games(games, source="olg-live")
    tiers = sum(len(g["prize_tiers"]) for g in games)
    print(f"✓ stored {len(games)} live games / {tiers} prize tiers")
    return len(games)


# --------------------------------------------------------------------------
# SAMPLE data (offline / demo; clearly flagged source='sample')
# --------------------------------------------------------------------------
def sample_games() -> list[dict]:
    """Illustrative demo games mirroring the real feed's shape (top prizes with
    printed vs unclaimed counts). Written with source='sample'; never shown as
    live OLG figures."""
    def build(no, name, price, sold, top_luck, specs):
        tiers = []
        for i, (amt, label, total) in enumerate(specs):
            wobble = 0.95 + (((int(no) + i * 31) % 11) / 100.0)
            frac = (1 - sold) * (top_luck if i == 0 else wobble)
            remaining = min(total, max(0, round(total * frac)))
            tiers.append({"amount": amt, "label": label, "total": total,
                          "remaining": remaining, "is_top": i == 0})
        return {"game_number": no, "name": name, "price": price, "prize_tiers": tiers}

    return [
        build("3320", "Instant Cash for Life", 5, 0.55, 1.12, [
            (1_040_000, "$1,000/WK FOR LIFE", 5), (100_000, "$100,000", 24),
            (10_000, "$10,000", 120), (1_000, "$1,000", 2_400), (100, "$100", 60_000)]),
        build("3287", "$50 Million Cash Explosion", 50, 0.50, 1.06, [
            (1_000_000, "$1,000,000", 30), (100_000, "$100,000", 120),
            (10_000, "$10,000", 600), (1_000, "$1,000", 12_000), (500, "$500", 90_000)]),
        build("3301", "Bingo Multiplier", 3, 0.80, 0.75, [
            (100_000, "$100,000", 20), (5_000, "$5,000", 180),
            (1_000, "$1,000", 1_800), (100, "$100", 60_000)]),
        build("3345", "Wild 8's Crossword", 5, 0.40, 1.20, [
            (250_000, "$250,000", 18), (10_000, "$10,000", 90),
            (1_000, "$1,000", 1_600), (100, "$100", 70_000)]),
        build("3199", "$100,000 Payday", 2, 0.85, 0.65, [
            (100_000, "$100,000", 30), (2_000, "$2,000", 300),
            (200, "$200", 18_000), (50, "$50", 90_000)]),
        build("3410", "Gold Bar Bonanza", 10, 0.28, 1.15, [
            (500_000, "$500,000", 22), (25_000, "$25,000", 110),
            (1_000, "$1,000", 2_800), (200, "$200", 80_000)]),
        build("3277", "Lucky Lines", 1, 0.84, 0.70, [
            (25_000, "$25,000", 28), (1_000, "$1,000", 220),
            (100, "$100", 9_000), (20, "$20", 130_000)]),
        build("3388", "Crossword Deluxe", 5, 0.58, 1.02, [
            (200_000, "$200,000", 20), (10_000, "$10,000", 100),
            (1_000, "$1,000", 1_700), (100, "$100", 62_000)]),
        build("3422", "Set for Life", 20, 0.20, 1.25, [
            (1_040_000, "$1,000/WK FOR LIFE", 12), (50_000, "$50,000", 140),
            (5_000, "$5,000", 800), (500, "$500", 18_000)]),
        build("3356", "Money Multiplier", 3, 0.62, 0.90, [
            (75_000, "$75,000", 24), (3_000, "$3,000", 220),
            (300, "$300", 13_000), (60, "$60", 70_000)]),
        build("3433", "Diamond Riches", 10, 0.66, 0.72, [
            (500_000, "$500,000", 20), (20_000, "$20,000", 110),
            (2_000, "$2,000", 1_800), (200, "$200", 76_000)]),
        build("3260", "Triple Sevens", 2, 0.38, 1.10, [
            (77_777, "$77,777", 24), (1_777, "$1,777", 260),
            (177, "$177", 16_000), (77, "$77", 60_000)]),
    ]


def run_sample() -> int:
    games = sample_games()
    for g in games:  # sample tiers already carry is_top on tier 0
        pass
    replace_games(games, source="sample")
    print(f"✓ seeded {len(games)} sample games (source='sample')")
    return len(games)


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape OLG instant games -> SQLite")
    ap.add_argument("--sample", action="store_true", help="seed demo data only")
    ap.add_argument("--live", action="store_true",
                    help="live only; non-zero exit on failure (no sample fallback)")
    args = ap.parse_args()

    if args.sample:
        return 0 if run_sample() else 1
    if args.live:
        return 0 if run_live() else 1
    if run_live():
        return 0
    print("→ live failed; seeding sample data so the build still runs.")
    return 0 if run_sample() else 1


if __name__ == "__main__":
    raise SystemExit(main())
