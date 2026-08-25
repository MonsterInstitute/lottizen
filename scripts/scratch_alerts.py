#!/usr/bin/env python3
"""scratch_alerts.py — Lottizen Plus scratch-ticket alerts.

Run AFTER calculate_rankings.py in each of the 5 scratch workflows (it needs
today's fresh scratch_snapshots + scratch_rank_snapshots, both written by
that script). Diffs today's snapshot against the most recent PRIOR one, per
agency, to detect three events:

  1. TOP PRIZE CLAIMED — a game's top-tier `remaining` went from >0 to 0
     between the two snapshots.
  2. NEW GAME — a game_number present today wasn't in the prior snapshot.
  3. RANK DROP — a game's rank (scratch_rank_snapshots) fell by at least
     max(5, 20% of that province's game count) positions.

Like calculate_rankings.py, this always processes all 5 agencies regardless
of which workflow invoked it — cheap (a handful of Supabase reads), and
keeps behavior identical no matter which of the 5 daily workflows happens to
run it. Only Plus subscribers ever get an email, and only for games they've
favourited (claimed/rank_drop) or games in a province they have at least one
favourite in (new_game — there's no "favourite a game that doesn't exist
yet" concept, so province-level interest is the closest real proxy).

Sent immediately (not batched into the weekly digest), deduped via
email_log same as every other automated email — a re-run today never
double-sends because claim_send() already claimed the slot.
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
from send_draw_emails import send_email, claim_send  # noqa: E402
from email_templates import scratch_alert_email  # noqa: E402

SITE_URL = "https://lottizen.com"
AGENCIES = ["OLG", "BCLC", "WCLC", "ALC", "QUEBEC"]
RANK_DROP_MIN = 5  # never alert on a drop smaller than this, even in tiny provinces


def today_toronto() -> str:
    return datetime.now(ZoneInfo("America/Toronto")).date().isoformat()


def latest_snapshot_date_before(agency: str, before_date: str) -> str | None:
    res = (
        db.get_client()
        .table("scratch_snapshots")
        .select("captured_date")
        .eq("agency", agency)
        .lt("captured_date", before_date)
        .order("captured_date", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0]["captured_date"] if res.data else None


def snapshots_for(agency: str, date: str) -> dict[str, list[dict]]:
    rows = db.fetch_all(
        "scratch_snapshots", "game_number,prizes_remaining_json",
        filters=[("eq", "agency", agency), ("eq", "captured_date", date)],
    )
    return {r["game_number"]: r["prizes_remaining_json"] for r in rows}


def ranks_for(agency: str, date: str) -> dict[str, int]:
    rows = db.fetch_all(
        "scratch_rank_snapshots", "game_slug,rank",
        filters=[("eq", "agency", agency), ("eq", "captured_date", date)],
    )
    return {r["game_slug"]: r["rank"] for r in rows}


def top_tier(tiers: list[dict]) -> dict | None:
    return next((t for t in tiers if t.get("isTop")), None)


def plus_subscribers() -> dict[str, dict]:
    rows = db.fetch_all(
        "subscribers", "id,email,magic_token,tier,confirmed_at,unsubscribed_at",
        filters=[("eq", "tier", "plus")],
    )
    return {
        r["id"]: r
        for r in rows
        if r.get("confirmed_at") and not r.get("unsubscribed_at")
    }


def favourites_by_agency() -> dict[str, dict[str, list[str]]]:
    """agency -> {slug: [subscriber_id, ...]} for every favourite, any tier
    (filtered to Plus subscribers by the caller — cheaper to fetch once)."""
    rows = db.fetch_all("scratch_favourites", "subscriber_id,agency,game_slug")
    out: dict[str, dict[str, list[str]]] = {a: {} for a in AGENCIES}
    for r in rows:
        out.setdefault(r["agency"], {}).setdefault(r["game_slug"], []).append(r["subscriber_id"])
    return out


def send_alert(sub: dict, kind: str, game_name: str, game_url: str, province_label: str, detail: str, dedup_key: str) -> bool:
    if not claim_send(sub["id"], f"scratch_{kind}", dedup_key):
        return False
    subject, html = scratch_alert_email(
        kind=kind,
        game_name=game_name,
        game_url=game_url,
        province_label=province_label,
        detail=detail,
        preferences_url=f"{SITE_URL}/subscribe/preferences?token={sub['magic_token']}",
        unsubscribe_url=f"{SITE_URL}/api/subscribe/unsubscribe?token={sub['magic_token']}",
    )
    return send_email(sub["email"], subject, html)


def main() -> int:
    today = today_toronto()
    subs = plus_subscribers()
    if not subs:
        print("No confirmed Plus subscribers — nothing to check.")
        return 0
    favs = favourites_by_agency()

    sent = 0
    for agency in AGENCIES:
        games = db.fetch_all("games", "game_number,slug,name,province", filters=[("eq", "agency", agency)])
        games_by_number = {g["game_number"]: g for g in games}
        province_label = games[0]["province"].replace("-", " ").title() if games else agency

        prior_date = latest_snapshot_date_before(agency, today)
        if not prior_date:
            print(f"  [{agency}] no prior snapshot yet — skipping (day-1 data, nothing to diff).")
            continue

        today_snap = snapshots_for(agency, today)
        prior_snap = snapshots_for(agency, prior_date)
        if not today_snap:
            print(f"  [{agency}] no snapshot for {today} yet — skipping.")
            continue

        agency_favs = favs.get(agency, {})
        agency_interested_subs = {sid for subs_list in agency_favs.values() for sid in subs_list if sid in subs}

        # 1) Top prize claimed + 2) new game
        for game_number, tiers_today in today_snap.items():
            g = games_by_number.get(game_number)
            if not g:
                continue
            game_url = f"{SITE_URL}/scratch/{g['province']}/{g['slug']}"

            if game_number not in prior_snap:
                for sid in agency_interested_subs:
                    if send_alert(
                        subs[sid], "new_game", g["name"], game_url, province_label,
                        f"A new ticket just launched in {province_label}: {g['name']}. Freshest prize pool — nothing claimed yet.",
                        f"{agency}:{g['slug']}",
                    ):
                        sent += 1
                continue

            prior_top = top_tier(prior_snap[game_number])
            today_top = top_tier(tiers_today)
            if prior_top and today_top and prior_top.get("remaining", 0) > 0 and today_top.get("remaining", 0) == 0:
                for sid in agency_favs.get(g["slug"], []):
                    if sid not in subs:
                        continue
                    if send_alert(
                        subs[sid], "claimed", g["name"], game_url, province_label,
                        f"The {today_top['label']} top prize on {g['name']} was just claimed — you're following this ticket.",
                        f"{agency}:{g['slug']}",
                    ):
                        sent += 1

        # 3) Rank drop
        rank_today = ranks_for(agency, today)
        rank_prior = ranks_for(agency, prior_date)
        threshold = max(RANK_DROP_MIN, round(len(rank_today) * 0.2))
        for slug, rank_now in rank_today.items():
            rank_before = rank_prior.get(slug)
            if rank_before is None or rank_now - rank_before < threshold:
                continue
            g = next((v for v in games_by_number.values() if v["slug"] == slug), None)
            if not g:
                continue
            game_url = f"{SITE_URL}/scratch/{g['province']}/{g['slug']}"
            for sid in agency_favs.get(slug, []):
                if sid not in subs:
                    continue
                if send_alert(
                    subs[sid], "rank_drop", g["name"], game_url, province_label,
                    f"{g['name']} dropped from rank #{rank_before} to #{rank_now} — you're following this ticket.",
                    f"{agency}:{slug}",
                ):
                    sent += 1

    print(f"✓ sent {sent} scratch alert email(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
