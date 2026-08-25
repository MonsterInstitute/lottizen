#!/usr/bin/env python3
"""
scrape_quebec_scratch.py — Loto-Québec scratch/instant games ("billets à
gratter").

REAL DATA SOURCES (verified 2026-08, both fetched and parsed directly):

  1) Prize tiers — full retention data, unlike WCLC/ALC:
     https://loteries.lotoquebec.com/fr/resultats/etat-de-reclamation-des-lots
     Plain server-rendered HTML (no auth). 30 `<h3 class="...NomProduit">`
     accordion headers, each formatted "Name (7-XXXX)", each immediately
     followed (verified by document-order pairing, not proximity guessing)
     by one `<table class="lqTableauDonnees">` with columns "Lots" /
     "Nombre de lots total" / "Nombre de lots réclamés" — i.e. a REAL
     printed total per tier, same shape as OLG/BCLC. remaining = total -
     claimed.

  2) Ticket price + launch date — the CMS-rendered catalog pages
     (loteries.lotoquebec.com/fr/loteries/a-gratter) load their game tiles
     client-side via a GraphQL persisted-query API (found by sniffing real
     network traffic with Playwright — the page itself ships no data in
     static HTML):
       https://loteries.assets.lotoquebec.com/api/exp/loteries
         ?operationName=GetGamesByCollection
         &variables={"device":"desktop","limit":48,"locale":"fr",
                     "url":"/loteries/collection/<slug>"}
         &extensions={"persistedQuery":{"version":1,"sha256Hash":"<HASH>"}}
     No auth/referer required — verified working via plain curl. The hash
     is a *persisted query* id and MAY rotate if Loto-Québec redeploys
     their CMS frontend; if this adapter starts getting 4xx/"PersistedQue
     ryNotFound" errors, re-sniff it the same way (open the collection
     page in a browser with devtools/Playwright network capture and grab
     the new hash from any GetGamesByCollection request).
     Each item has `lel_product_code` (matches the état page's "7-XXXX"
     code with the dash removed, verified directly, e.g. "7-5079" ==
     "75079") and `product_info.ticket_cost` (a list — almost always
     single-element; the one observed exception, "La Poule aux Œufs
     d'Or", has a non-numeric `lel_product_code` and is skipped).
     Five collections are queried and merged (three in-store price
     buckets + "populaires" + "nouveautés") to maximize price coverage;
     this reached 26/30 of the état page's games in direct testing. The 4
     unmatched (a $5,000,000 progressive game, and older "Bingo"/"Jeu de
     mots"/"Scrabble" editions) are retired/legacy editions still being
     tracked for claims but no longer in the live catalog — these are
     skipped rather than guessed, and logged.

  PRINTED-TOTAL PRIMARY-SOURCE DECISION (this was the open question the
  build plan asked to resolve): the plan referenced a PDF-vs-live-page
  drift for Loto-Québec's printed totals. During this build, direct
  verification could NOT locate any separate downloadable PDF that
  republishes this same per-game total/claimed data — the one prize-
  related PDF discoverable from the site's own "Règles de jeux" page
  (tableau-de-repartition-des-lots-fr.pdf) is a generic prize-formula
  table for a draw-based game, unrelated to scratch tickets. Given that,
  the live état-de-réclamation HTML page above is used as the SOLE
  source for Loto-Québec printed totals — there is no second source to
  cross-validate against or take a conservative value from. If a genuine
  PDF snapshot of this report exists elsewhere, reconciling it is a
  candidate follow-up, not a blocker (documented in the final report).

Usage:
  python3 scripts/scrape_quebec_scratch.py            # live, silent fallback (exit 0) on failure
  python3 scripts/scrape_quebec_scratch.py --live      # live only, non-zero exit on failure
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402

try:
    from bs4 import BeautifulSoup
except ImportError as e:  # pragma: no cover
    raise RuntimeError('beautifulsoup4 not installed. Run: pip install beautifulsoup4') from e

AGENCY = "QUEBEC"
PROVINCE = "quebec"

ETAT_URL = "https://loteries.lotoquebec.com/fr/resultats/etat-de-reclamation-des-lots"
GRAPHQL_URL = "https://loteries.assets.lotoquebec.com/api/exp/loteries"
PERSISTED_QUERY_HASH = "043e70afae1b923481e88b538d1b42842f39a19d9cbca01b9840b44e5afc46bb"
COLLECTION_SLUGS = [
    "/loteries/collection/en-magasin-3-et-moins",
    "/loteries/collection/en-magasin-5-a-10",
    "/loteries/collection/en-magasin-15-et-plus",
    "/loteries/collection/jeux-populaires-a-gratter-loteries",
    "/loteries/collection/nouveautes-a-gratter-loteries",
]

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

CAPTION_RE = re.compile(r"^(.+?)\s*\((\d+-\d+)\)\s*$")


def parse_amount(label: str) -> float:
    m = re.search(r"([\d\s]+(?:,\d+)?)\s*\$", label)
    if not m:
        return 0.0
    return float(m.group(1).replace(" ", "").replace("\xa0", "").replace(",", "."))


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def fetch_price_lookup() -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for slug in COLLECTION_SLUGS:
        variables = json.dumps({"device": "desktop", "limit": 48, "locale": "fr", "url": slug})
        extensions = json.dumps({"persistedQuery": {"version": 1, "sha256Hash": PERSISTED_QUERY_HASH}})
        qs = urllib.parse.urlencode({"operationName": "GetGamesByCollection", "variables": variables, "extensions": extensions})
        try:
            data = json.loads(http_get(f"{GRAPHQL_URL}?{qs}"))
        except Exception as e:  # noqa: BLE001
            print(f"  ! collection fetch failed ({slug}): {e}", file=sys.stderr)
            continue
        for g in data.get("data", {}).get("games", {}).get("items", []):
            code = g.get("lel_product_code")
            if not code or not str(code).isdigit():
                continue
            cost = g.get("product_info", {}).get("ticket_cost")
            if not cost:
                continue
            price = cost[0] if isinstance(cost, list) else cost
            lookup[str(code)] = {
                "price": float(price),
                "launch_date": (g.get("launch_date") or "")[:10] or None,
            }
    return lookup


def fetch_prize_tiers() -> list[tuple[str, str, list[dict]]]:
    """Returns [(name, game_number, tiers), ...] in document order."""
    html = http_get(ETAT_URL).decode("utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")

    games = []
    current_name = current_code = None
    seen_for_current = False
    for el in soup.find_all(["h3", "table"]):
        if el.name == "h3":
            m = CAPTION_RE.match(el.get_text(strip=True))
            if m:
                current_name, current_code = m.group(1).strip(), m.group(2).replace("-", "")
            else:
                current_name = current_code = None
            seen_for_current = False
        elif el.name == "table" and "lqTableauDonnees" in (el.get("class") or []):
            if current_code and not seen_for_current:
                seen_for_current = True
                tiers = []
                for tr in el.find_all("tr")[1:]:  # skip header
                    tds = [td.get_text(strip=True) for td in tr.find_all("td")]
                    if len(tds) < 3:
                        continue
                    label, total_s, claimed_s = tds[0], tds[1], tds[2]
                    try:
                        total = int(total_s.replace("\xa0", "").replace(" ", ""))
                        claimed = int(claimed_s.replace("\xa0", "").replace(" ", ""))
                    except ValueError:
                        continue
                    tiers.append(
                        {"amount": parse_amount(label), "label": label, "total": total, "remaining": max(total - claimed, 0)}
                    )
                if tiers:
                    games.append((current_name, current_code, tiers))
    return games


def run_live() -> int:
    print("→ fetching Loto-Québec état de réclamation + game catalog...")
    try:
        raw_games = fetch_prize_tiers()
    except Exception as e:  # noqa: BLE001
        print(f"✗ could not fetch état-de-réclamation page: {e}", file=sys.stderr)
        return 0
    if not raw_games:
        print("✗ zero games parsed from état-de-réclamation page.", file=sys.stderr)
        return 0

    price_lookup = fetch_price_lookup()
    if not price_lookup:
        print("✗ could not build any price lookup — aborting (would write games with no price).", file=sys.stderr)
        return 0

    games = []
    unmatched = 0
    for name, code, tiers in raw_games:
        meta = price_lookup.get(code)
        if not meta:
            unmatched += 1
            print(f"  ! no price match for {name} ({code}) — skipped", file=sys.stderr)
            continue
        tiers = sorted(tiers, key=lambda t: t["amount"], reverse=True)
        top_i = next((i for i, t in enumerate(tiers) if t["remaining"] > 0), 0)
        for i, t in enumerate(tiers):
            t["is_top"] = i == top_i
        games.append(
            {
                "game_number": code,
                "name": name,
                "slug": db.slugify(name),
                "price": meta["price"],
                "launch_date": meta["launch_date"],
                "prize_tiers": tiers,
            }
        )

    if not games:
        print("✗ zero games joined between état page and price catalog.", file=sys.stderr)
        return 0

    n = db.replace_scratch_games(AGENCY, PROVINCE, games, source="quebec-live")
    tier_n = sum(len(g["prize_tiers"]) for g in games)
    print(f"✓ stored {n} live games / {tier_n} prize tiers ({unmatched}/{len(raw_games)} état-page games had no price match, skipped)")
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape Loto-Québec scratch/instant games -> Supabase")
    ap.add_argument("--live", action="store_true", help="non-zero exit on failure (no silent fallback)")
    args = ap.parse_args()
    n = run_live()
    if args.live:
        return 0 if n else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
