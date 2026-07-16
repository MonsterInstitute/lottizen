#!/usr/bin/env python3
"""Publish the generated site JSON to the Supabase `site_json` table.

Runs in the data-refresh workflows AFTER the calculators (calculate_stats.py /
calculate_rankings.py) have written data/rankings.json, data/draws/*.json and
data/stats/*.json. Uploads each file's exact text so the Vercel build's Node
prefetch can materialize them without recomputing anything.

    python scripts/calculate_rankings.py
    python scripts/calculate_stats.py
    python scripts/publish_site_json.py     # -> site_json table
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def collect() -> list[tuple[str, Path]]:
    """(path-relative-to-data, absolute file) for every file the site imports."""
    items: list[tuple[str, Path]] = []
    rankings = DATA / "rankings.json"
    if rankings.exists():
        items.append(("rankings.json", rankings))
    for sub in ("draws", "stats"):
        d = DATA / sub
        if d.is_dir():
            for f in sorted(d.glob("*.json")):
                items.append((f"{sub}/{f.name}", f))
    return items


def main() -> int:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    items = collect()
    if not items:
        print("✗ no generated JSON found under data/ — run the calculators first.")
        return 1
    # One row per file (contents can be multiple MB, so avoid giant batch bodies).
    for rel, path in items:
        db.upsert_rows("site_json",
                       [{"path": rel, "content": path.read_text(encoding="utf-8"),
                         "updated_at": now}],
                       on_conflict="path")
        print(f"  ↑ {rel} ({path.stat().st_size} bytes)")
    # Drop stale rows (e.g. a delisted game), but ONLY within the categories this
    # run actually regenerated — otherwise the draws workflow (draws/ + stats/)
    # would wipe rankings.json that the scratch workflow owns, and vice-versa.
    live = {rel for rel, _ in items}

    def category(p: str) -> str:
        return p if "/" not in p else p.split("/", 1)[0]

    live_cats = {category(p) for p in live}
    existing = {r["path"] for r in db.fetch_all("site_json", "path")}
    for stale in existing - live:
        if category(stale) in live_cats:
            db.get_client().table("site_json").delete().eq("path", stale).execute()
            print(f"  ✗ removed stale {stale}")
    print(f"✓ published {len(items)} files to site_json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
