"""Shared Supabase data-layer helper for the Lottizen scrapers and calculators.

Replaces the old `sqlite3.connect(data/lottizen.db)` pattern. Every script that
used to open the SQLite file now calls `db.get_client()` and talks to Postgres
through the service-role REST API (PostgREST), which bypasses RLS.

Credentials come from the environment (CI: GitHub Actions secrets; Vercel build:
project env) or, for local runs, from a git-ignored `.env.local` in the repo root:

    SUPABASE_URL=...
    SUPABASE_SERVICE_ROLE_KEY=...

Design notes:
  * Batch writes go through `upsert_rows`, which chunks and retries on the
    transient TLS/HTTP2 read errors seen during bulk operations.
  * `fetch_all` pages past PostgREST's default 1000-row cap so callers that read
    the full draws table (~95k rows) get everything.
"""
from __future__ import annotations

import os
import re
import time
from pathlib import Path
from typing import Any, Iterable, Sequence

ROOT = Path(__file__).resolve().parent.parent
ENV_LOCAL = ROOT / ".env.local"

_client = None  # cached singleton


def _load_env() -> None:
    if ENV_LOCAL.exists():
        for line in ENV_LOCAL.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def get_client():
    """Return a cached service-role Supabase client."""
    global _client
    if _client is not None:
        return _client
    _load_env()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. In CI they come "
            "from secrets; locally put them in .env.local (git-ignored).")
    try:
        from supabase import create_client
    except ImportError as e:  # pragma: no cover
        raise RuntimeError('supabase not installed. Run: pip install "supabase>=2.0"') from e
    _client = create_client(url, key)
    return _client


def _reset_client():
    """Drop the cached client so the next call opens a fresh HTTP connection."""
    global _client
    _client = None


def upsert_rows(table: str, rows: Sequence[dict], on_conflict: str,
                chunk: int = 1000, tries: int = 6) -> int:
    """Chunked, retrying upsert. Returns the number of rows sent."""
    rows = list(rows)
    if not rows:
        return 0
    for i in range(0, len(rows), chunk):
        batch = rows[i:i + chunk]
        for attempt in range(1, tries + 1):
            try:
                get_client().table(table).upsert(
                    batch, on_conflict=on_conflict).execute()
                break
            except Exception:  # noqa: BLE001 — transient TLS/HTTP2 flakiness
                if attempt == tries:
                    raise
                time.sleep(min(2 * attempt, 8))
                _reset_client()  # poisoned connection → reconnect
    return len(rows)


def insert_rows(table: str, rows: Sequence[dict], chunk: int = 1000,
                tries: int = 6) -> int:
    """Plain chunked INSERT (no conflict handling) — for freshly-cleared tables.

    Used by the scratch full-refresh: prize_tiers rows carry no id, so the
    identity column auto-generates (from 100000).
    """
    rows = list(rows)
    if not rows:
        return 0
    for i in range(0, len(rows), chunk):
        batch = rows[i:i + chunk]
        for attempt in range(1, tries + 1):
            try:
                get_client().table(table).insert(batch).execute()
                break
            except Exception:  # noqa: BLE001 — transient TLS/HTTP2 flakiness
                if attempt == tries:
                    raise
                time.sleep(min(2 * attempt, 8))
                _reset_client()
    return len(rows)


def delete_all(table: str, pk_col: str, sentinel) -> None:
    """Delete every row. PostgREST requires a filter, so match on the PK being
    != a sentinel value it never actually takes (→ matches all rows)."""
    get_client().table(table).delete().neq(pk_col, sentinel).execute()


def slugify(name: str) -> str:
    """Shared slug generator for all 5 scratch adapters. ASCII-folds accented
    characters (é->e, à->a, û->u, ...) rather than leaving them in the URL —
    Loto-Québec game names are the only source that actually has any (Élite,
    Années 90, Mots Cachés, Diva à Paris, La Voûte, Slingo Sucré, ...); the
    other 4 adapters' input is already pure ASCII, so this is a no-op there.

    ASCII slugs were chosen over percent-encoded accented ones on purpose:
    they work correctly in every tool/integration without requiring
    encoding-awareness, match how people actually type/search without a
    French keyboard, and stay consistent with the other 4 agencies' slugs —
    while costing nothing for SEO, since ranking-relevant text (title, h1,
    body) keeps the real accented name regardless of what the URL slug is.
    """
    import unicodedata

    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^\w\s-]", "", ascii_name.lower()).strip()
    return re.sub(r"[\s_]+", "-", s)


def dedupe_slugs(games: list[dict]) -> list[dict]:
    """Guarantee unique `slug` within one agency's game list.

    Real, observed collisions (not hypothetical): OLG has two separate
    "Bingo" editions (game numbers 3043/3044), ALC has three different
    tickets that all slugify to "777", etc. — 26 cases found across the
    5 agencies when this was first checked. Any game whose base slug is
    shared with another game in the same batch gets `-{game_number}`
    appended, deterministically for EVERY game in that collision group
    (not just the 2nd+ one) so the winner of the bare slug never flips
    from one day's scrape to the next.
    """
    from collections import Counter

    counts = Counter(g["slug"] for g in games)
    for g in games:
        if counts[g["slug"]] > 1:
            g["slug"] = f"{g['slug']}-{g['game_number']}"
    return games


def replace_scratch_games(agency: str, province: str, games: list[dict], source: str) -> int:
    """Full refresh of one agency's scratch/instant games + prize tiers —
    the shared pattern every scratch adapter (OLG, BCLC, WCLC, ALC,
    Loto-Québec) uses. Scoped to `agency` via delete_where, NOT a table-wide
    delete_all: games.game_number is an agency-native code with no
    cross-agency coordination, so a table-wide wipe here would delete every
    OTHER agency's games on every single-agency scrape (a real bug caught
    when OLG's original replace_games() used delete_all — see
    supabase/migrations/0007_scratch_multi_agency.sql).

    `games`: [{"game_number", "name", "price", "prize_tiers": [{"amount",
    "label", "total", "remaining", "is_top"}], "launch_date"?, "overall_odds"?,
    "top_prize_odds"?}, ...]. Returns the number of games written.

    `data_changed_at` (sitemap lastmod source — see app/sitemap.ts) is NOT
    just "now" on every run: it's diffed against the prior state before the
    delete below, and only advances when a game's tier data (amount/label/
    total/remaining per tier) genuinely differs from what was there
    yesterday. A game whose prizes haven't moved keeps its old timestamp
    even though `scraped_at` (which DOES update every run) says otherwise —
    without this, every scratch page would report a fake daily lastmod and
    crawlers would learn to ignore the signal site-wide.
    """
    from datetime import datetime, timezone

    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    def tier_signature(tiers: list[dict]) -> tuple:
        return tuple(sorted((t["amount"], t["label"], t["total"], t["remaining"]) for t in tiers))

    prior_rows = fetch_all("games", "game_number,data_changed_at", filters=[("eq", "agency", agency)])
    prior_changed_at = {r["game_number"]: r["data_changed_at"] for r in prior_rows}
    prior_tiers_rows = fetch_all("prize_tiers", "game_number,amount,label,total,remaining", filters=[("eq", "agency", agency)])
    prior_tiers_by_game: dict[str, list[dict]] = {}
    for t in prior_tiers_rows:
        prior_tiers_by_game.setdefault(t["game_number"], []).append(t)

    delete_where("games", "agency", agency)  # cascades to prize_tiers + scratch_snapshots

    games = dedupe_slugs(games)

    game_rows = []
    for g in games:
        prior_sig = tier_signature(prior_tiers_by_game[g["game_number"]]) if g["game_number"] in prior_tiers_by_game else None
        new_sig = tier_signature(g["prize_tiers"])
        unchanged = prior_sig is not None and prior_sig == new_sig
        data_changed_at = prior_changed_at.get(g["game_number"], ts) if unchanged else ts
        game_rows.append(
            {
                "game_number": g["game_number"],
                "agency": agency,
                "province": province,
                "name": g["name"],
                "slug": g["slug"],
                "price": g["price"],
                "overall_odds": g.get("overall_odds"),
                "top_prize_odds": g.get("top_prize_odds"),
                "launch_date": g.get("launch_date"),
                "source": source,
                "scraped_at": ts,
                "data_changed_at": data_changed_at,
            }
        )
    tier_rows = []
    for g in games:
        for t in g["prize_tiers"]:
            tier_rows.append(
                {
                    "game_number": g["game_number"],
                    "agency": agency,
                    "amount": t["amount"],
                    "label": t["label"],
                    "total": t["total"],
                    "remaining": t["remaining"],
                    "is_top": 1 if t.get("is_top") else 0,
                    "scraped_at": ts,
                }
            )
    insert_rows("games", game_rows)  # parent first (FK)
    insert_rows("prize_tiers", tier_rows)  # children
    return len(game_rows)


def insert_ignore(table: str, rows: Sequence[dict], on_conflict: str,
                  tries: int = 6) -> int:
    """INSERT ... ON CONFLICT DO NOTHING (PostgREST ignore-duplicates).

    Used by the daily draw path: never overwrite reconciled/verified history —
    insert only rows whose (game_id, draw_date) isn't present yet.
    """
    rows = list(rows)
    if not rows:
        return 0
    for attempt in range(1, tries + 1):
        try:
            get_client().table(table).upsert(
                rows, on_conflict=on_conflict, ignore_duplicates=True).execute()
            return len(rows)
        except Exception:  # noqa: BLE001 — transient TLS/HTTP2 flakiness
            if attempt == tries:
                raise
            time.sleep(min(2 * attempt, 8))
            _reset_client()
    return len(rows)


def max_draw_date(game_id: str) -> str | None:
    """Latest stored draw_date for a game, or None (daily incremental cursor)."""
    res = (get_client().table("draws").select("draw_date")
           .eq("game_id", game_id).order("draw_date", desc=True).limit(1).execute())
    return res.data[0]["draw_date"] if res.data else None


def fetch_all(table: str, columns: str = "*", *, filters: Iterable = (),
              order: str | None = None, page: int = 1000) -> list[dict]:
    """Fetch every row from `table`, paging past PostgREST's 1000-row cap.

    `filters` is an iterable of (method, *args) tuples applied to the query,
    e.g. [("eq", "game_id", "lotto-max")].
    """
    out: list[dict] = []
    start = 0
    while True:
        q = get_client().table(table).select(columns)
        for f in filters:
            q = getattr(q, f[0])(*f[1:])
        if order:
            q = q.order(order)
        q = q.range(start, start + page - 1)
        rows = q.execute().data or []
        out.extend(rows)
        if len(rows) < page:
            return out
        start += page


def delete_where(table: str, column: str, value: Any) -> None:
    """Delete rows where column == value (used by scratch tier refresh)."""
    get_client().table(table).delete().eq(column, value).execute()


def update_row(table: str, values: dict, match: dict, tries: int = 6) -> None:
    """UPDATE `table` SET values WHERE all match columns equal (retrying)."""
    for attempt in range(1, tries + 1):
        try:
            q = get_client().table(table).update(values)
            for k, v in match.items():
                q = q.eq(k, v)
            q.execute()
            return
        except Exception:  # noqa: BLE001 — transient TLS/HTTP2 flakiness
            if attempt == tries:
                raise
            time.sleep(min(2 * attempt, 8))
            _reset_client()


def count(table: str) -> int:
    res = get_client().table(table).select("*", count="exact", head=True).execute()
    return res.count or 0
