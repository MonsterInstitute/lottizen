#!/usr/bin/env python3
"""send_claim_reminders.py — the claim engine: work out what was won, then
make sure nobody loses it to the calendar.

Runs daily, in six passes:

  1. check tickets      Draw tickets logged in the wallet, against the draw
                        that has since happened.
  2. sync claims        Saved combinations the nightly checker matched, into
                        prize_claims — the one place a prize needing collection
                        lives, whichever of the two ways it arrived (0014).
  3. fill amounts       Claims still carrying amount_source 'unknown', once the
                        operator's breakdown has landed (it is published a day
                        or so after the draw, i.e. usually after the claim was
                        created).
  4. expire             Tickets whose deadline has passed.
  5. win notice         One email the day a prize is found (win_notified_at,
                        0028) — before this, a win surfaced only in the
                        dashboard and the deadline reminders.
  6. remind             30 / 7 / 3 days before a deadline.

WHAT COUNTS AS A WIN. Nothing here decides that on its own. A ticket wins when
the operator's own published prize breakdown (prize_breakdowns, 0015) lists a
tier for that many matches and that tier paid cash. So:

  * Ontario 49, Lottario and MegaDice produce no claims at all — OLG publishes
    no breakdown, so there is no published fact to stand on. Their tickets stay
    'pending' rather than being marked "no win", because we did not check them;
    the wallet says exactly that. Marking them checked would be a claim we
    can't support (CLAUDE.md).
  * Free-play tiers (WCLC prints "FREE PLAY" for the bottom Western tiers) do
    not become claims. A free play is redeemed at the counter, carries no
    dollar value for a ledger, and there are ~15,000 of them per Western Max
    draw — turning those into countdowns would bury real cash wins.

THE BONUS BALL. For every Canadian game except Daily Grand, the bonus is drawn
from the same pool as the main numbers, so a saved combination alone settles
whether it matched: it did if the bonus is one of the numbers they picked.
Daily Grand's Grand Number is a separate 1–7 ball that we hold no pick for, so
when its two tiers differ ($500 vs $1,000 for 4 of 5) the claim is created with
NO amount and a tier label that says so, rather than quietly choosing one.

NOT TIER-GATED. Free accounts get these reminders too. A deadline reminder
withheld from free users is a decision to let their money expire, which is not
a feature.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
from email_templates import claim_reminder_email, win_notice_email  # noqa: E402
from game_meta import (  # noqa: E402
    CANADIAN_DRAW_CLAIM_DAYS,
    CURRENCY_SYMBOL,
    GAME_META,
    MATRIX,
    REMINDER_DAYS,
)
from mailer import claim_send, deliver, mask_email  # noqa: E402

SITE_URL = "https://lottizen.com"

# How far back to re-examine saved-combination checks. Long enough to survive a
# few days of workflow failure, short enough that the daily sweep stays cheap.
LOOKBACK_DAYS = 45


def today_toronto():
    return datetime.now(ZoneInfo("America/Toronto")).date()


def days_until(deadline: str, today) -> int:
    return (datetime.strptime(deadline, "%Y-%m-%d").date() - today).days


def money(cents: int | None, currency: str = "CAD") -> str | None:
    if cents is None:
        return None
    sym = CURRENCY_SYMBOL.get(currency, "$")
    return f"{sym}{cents / 100:,.2f}"


def pretty_tier(code: str | None) -> str | None:
    """'5/6+B' -> '5 of 6 + Bonus'. The stored code stays machine-readable so
    pass 3 can look the amount up again later. An undetermined Daily Grand tier
    arrives as '4/5 or 4/5+B' and each half is expanded."""
    if not code:
        return None
    parts = []
    for piece in code.split(" or "):
        bonus = piece.endswith("+B")
        main = piece[:-2] if bonus else piece
        parts.append(main.replace("/", " of ") + (" + Bonus" if bonus else ""))
    return " or ".join(parts)


# ---------------------------------------------------------------------------
# Tier resolution
# ---------------------------------------------------------------------------
class Tier:
    """A resolved prize tier. `amount_cents` None means the amount is genuinely
    not established — either the operator published words instead of a figure,
    or two tiers are in play and we can't tell which (see `ambiguous`)."""

    def __init__(self, code: str, amount_cents: int | None, ambiguous: bool = False):
        self.code = code
        self.amount_cents = amount_cents
        self.ambiguous = ambiguous


def resolve_tier(rows: list[dict], matched: int, bonus_matched: bool | None) -> Tier | None:
    """The published tier this ticket landed in, or None for no cash prize.

    `rows` is every prize_breakdowns row for one (game, draw). `bonus_matched`
    is None only when the game's bonus comes from a separate pool we hold no
    pick for.
    """
    at_count = [r for r in rows if r["match_main"] == matched]
    if not at_count:
        return None  # that many matches doesn't pay in this game
    with_bonus = next((r for r in at_count if r["match_bonus"]), None)
    plain = next((r for r in at_count if not r["match_bonus"]), None)

    if bonus_matched is True:
        row = with_bonus or plain
    elif bonus_matched is False:
        # A tier that requires the bonus is not theirs. If the game pays
        # nothing at this count without it, they won nothing.
        row = plain
    else:
        if plain and with_bonus:
            # They won at least the plain tier, but which one is undetermined
            # and the two pay different amounts. Say so; don't pick.
            code = f"{plain['tier_code']} or {with_bonus['tier_code']}"
            return Tier(code, None, ambiguous=True)
        row = plain or None  # bonus-only tier can't be confirmed without the ball

    if row is None or row.get("prize_cents") is None:
        # No row, or the operator printed 'FREE PLAY' / 'NOT WON' instead of an
        # amount. Neither is a cash claim.
        return None
    return Tier(row["tier_code"], row["prize_cents"])


def bonus_matched_for(slug: str, picked: list[int], bonus: int | None) -> bool | None:
    cfg = MATRIX.get(slug)
    if not cfg or cfg["bonus_pool"] != "main" or bonus is None:
        return None
    return bonus in picked


# ---------------------------------------------------------------------------
# Shared loaders
# ---------------------------------------------------------------------------
def load_draws(pairs: set[tuple[str, str]]) -> dict[tuple[str, str], dict]:
    out: dict[tuple[str, str], dict] = {}
    for slug in {s for s, _ in pairs}:
        dates = sorted({d for s, d in pairs if s == slug})
        rows = db.fetch_all(
            "draws", "game_id,draw_date,numbers,bonus",
            filters=[("eq", "game_id", slug), ("gte", "draw_date", dates[0])],
        )
        for r in rows:
            if (slug, r["draw_date"]) in pairs:
                out[(slug, r["draw_date"])] = r
    return out


def load_breakdowns(pairs: set[tuple[str, str]]) -> dict[tuple[str, str], list[dict]]:
    out: dict[tuple[str, str], list[dict]] = {}
    for slug in {s for s, _ in pairs}:
        dates = sorted({d for s, d in pairs if s == slug})
        rows = db.fetch_all(
            "prize_breakdowns", "game_slug,draw_date,tier_code,match_main,match_bonus,prize_cents",
            filters=[("eq", "game_slug", slug), ("gte", "draw_date", dates[0])],
        )
        for r in rows:
            out.setdefault((slug, r["draw_date"]), []).append(r)
    return out


def existing_claim_keys() -> set[tuple[str, int, str | None]]:
    """(source, source_id, draw_date) already claimed. Read up front instead of
    relying on ON CONFLICT: prize_claims' unique index is on an expression
    (coalesce(draw_date, …)), which PostgREST's on_conflict can't name."""
    rows = db.fetch_all("prize_claims", "source,source_id,draw_date")
    return {(r["source"], r["source_id"], r["draw_date"]) for r in rows}


def claim_deadline_for(draw_date: str) -> str:
    d = datetime.strptime(draw_date, "%Y-%m-%d").date() + timedelta(days=CANADIAN_DRAW_CLAIM_DAYS)
    return d.isoformat()


# ---------------------------------------------------------------------------
# Pass 1 — draw tickets logged in the wallet
# ---------------------------------------------------------------------------
def check_tickets(today, dry: bool) -> tuple[int, int]:
    tickets = [
        t for t in db.fetch_all(
            "user_tickets", "*",
            filters=[("eq", "ticket_type", "draw"), ("eq", "status", "pending")],
        )
        if t.get("draw_date") and t["draw_date"] <= today.isoformat() and t.get("numbers")
    ]
    if not tickets:
        return 0, 0

    pairs = {(t["game_slug"], t["draw_date"]) for t in tickets if t.get("game_slug")}
    draws, breakdowns = load_draws(pairs), load_breakdowns(pairs)
    known = existing_claim_keys()
    checked = won = 0

    for t in tickets:
        key = (t.get("game_slug"), t["draw_date"])
        draw = draws.get(key)
        if not draw:
            continue  # results not scraped yet — leave it pending, say nothing
        rows = breakdowns.get(key)
        if not rows:
            # No published breakdown for this game (OLG's three) or not fetched
            # yet. We haven't checked it, so we don't say we have.
            continue

        drawn = [int(n) for n in draw["numbers"].split(",")]
        picked = list(t["numbers"])
        matched = len(set(picked) & set(drawn))
        tier = resolve_tier(rows, matched, bonus_matched_for(t["game_slug"], picked, draw.get("bonus")))
        checked += 1

        if tier is None:
            if not dry:
                db.update_row("user_tickets", {"status": "checked_no_win"}, {"id": t["id"]})
            continue

        won += 1
        if dry:
            print(f"  [dry] ticket {t['id']} {t['game_slug']} {t['draw_date']}: "
                  f"{tier.code} {money(tier.amount_cents) or '(amount undetermined)'}")
            continue
        db.update_row("user_tickets", {"status": "won_unclaimed"}, {"id": t["id"]})
        if ("ticket", t["id"], t["draw_date"]) in known:
            continue
        db.insert_rows("prize_claims", [{
            "subscriber_id": t["subscriber_id"],
            "source": "ticket",
            "source_id": t["id"],
            "game_slug": t["game_slug"],
            "draw_date": t["draw_date"],
            "matched": matched,
            "prize_tier": tier.code,
            "amount_cents": tier.amount_cents,
            "amount_source": "published" if tier.amount_cents is not None else "unknown",
            # The ticket's own deadline: it was set when the ticket was logged,
            # from config/claim-deadlines.ts, and a user-entered date wins there.
            "claim_deadline": t.get("claim_deadline") or claim_deadline_for(t["draw_date"]),
        }])
    return checked, won


# ---------------------------------------------------------------------------
# Pass 2 — saved combinations the nightly checker already matched
# ---------------------------------------------------------------------------
def sync_combination_claims(today, dry: bool) -> int:
    since = (today - timedelta(days=LOOKBACK_DAYS)).isoformat()
    checks = [
        c for c in db.fetch_all(
            "combination_checks", "subscriber_id,combination_id,game_slug,draw_date,matched_main",
            filters=[("gte", "draw_date", since)],
        )
        if c["game_slug"] in MATRIX
    ]
    if not checks:
        return 0

    combos = {
        c["id"]: c for c in db.fetch_all(
            "subscriber_numbers", "id,numbers",
            filters=[("in_", "id", sorted({c["combination_id"] for c in checks}))],
        )
    }
    pairs = {(c["game_slug"], c["draw_date"]) for c in checks}
    draws, breakdowns = load_draws(pairs), load_breakdowns(pairs)
    known = existing_claim_keys()
    created = 0

    for c in checks:
        if ("combination", c["combination_id"], c["draw_date"]) in known:
            continue
        key = (c["game_slug"], c["draw_date"])
        rows, draw = breakdowns.get(key), draws.get(key)
        combo = combos.get(c["combination_id"])
        if not rows or not draw or not combo:
            continue
        picked = list(combo["numbers"])
        tier = resolve_tier(
            rows, c["matched_main"],
            bonus_matched_for(c["game_slug"], picked, draw.get("bonus")),
        )
        if tier is None:
            continue
        created += 1
        if dry:
            print(f"  [dry] combination {c['combination_id']} {c['game_slug']} {c['draw_date']}: "
                  f"{tier.code} {money(tier.amount_cents) or '(amount undetermined)'}")
            continue
        db.insert_rows("prize_claims", [{
            "subscriber_id": c["subscriber_id"],
            "source": "combination",
            "source_id": c["combination_id"],
            "game_slug": c["game_slug"],
            "draw_date": c["draw_date"],
            "matched": c["matched_main"],
            "prize_tier": tier.code,
            "amount_cents": tier.amount_cents,
            "amount_source": "published" if tier.amount_cents is not None else "unknown",
            "claim_deadline": claim_deadline_for(c["draw_date"]),
        }])
    return created


# ---------------------------------------------------------------------------
# Pass 3 — amounts that weren't published yet when the claim was created
# ---------------------------------------------------------------------------
def fill_amounts(dry: bool) -> int:
    open_claims = [
        c for c in db.fetch_all(
            "prize_claims", "id,game_slug,draw_date,prize_tier,amount_cents,amount_source",
            filters=[("eq", "amount_source", "unknown"), ("is_", "claimed_at", "null")],
        )
        # An ambiguous tier ('4/5 or 4/5+B') is not a lookup key and never
        # becomes one: only the ticket-holder can resolve it.
        if c.get("game_slug") and c.get("draw_date") and c.get("prize_tier") and " or " not in c["prize_tier"]
    ]
    if not open_claims:
        return 0
    breakdowns = load_breakdowns({(c["game_slug"], c["draw_date"]) for c in open_claims})
    filled = 0
    for c in open_claims:
        row = next(
            (r for r in breakdowns.get((c["game_slug"], c["draw_date"]), [])
             if r["tier_code"] == c["prize_tier"] and r.get("prize_cents") is not None),
            None,
        )
        if not row:
            continue
        filled += 1
        if dry:
            print(f"  [dry] claim {c['id']} -> {money(row['prize_cents'])}")
            continue
        db.update_row(
            "prize_claims",
            {"amount_cents": row["prize_cents"], "amount_source": "published"},
            {"id": c["id"]},
        )
    return filled


# ---------------------------------------------------------------------------
# Pass 4 — deadlines that have passed
# ---------------------------------------------------------------------------
def expire_tickets(today, dry: bool) -> int:
    stale = [
        t for t in db.fetch_all(
            "user_tickets", "id,claim_deadline",
            filters=[("eq", "status", "won_unclaimed")],
        )
        if t.get("claim_deadline") and t["claim_deadline"] < today.isoformat()
    ]
    if not dry:
        for t in stale:
            db.update_row("user_tickets", {"status": "expired"}, {"id": t["id"]})
    return len(stale)


# ---------------------------------------------------------------------------
# Pass 5 — the reminders themselves
# ---------------------------------------------------------------------------
def send_win_notices(today, dry: bool) -> tuple[int, int, int]:
    """One email per newly found prize (win_notified_at is null), sent the day
    the engine finds it. Expired and already-collected prizes are skipped."""
    claims = [
        c for c in db.fetch_all("prize_claims", "*", filters=[("is_", "win_notified_at", "null")])
        if not c.get("claimed_at") and (not c.get("claim_deadline") or days_until(c["claim_deadline"], today) >= 0)
    ]
    if not claims:
        return 0, 0, 0
    configured = bool(os.environ.get("RESEND_API_KEY"))
    subs = {
        s["id"]: s for s in db.fetch_all(
            "subscribers", "id,email,magic_token,confirmed_at,unsubscribed_at",
            filters=[("in_", "id", sorted({c["subscriber_id"] for c in claims}))],
        )
    }
    sent = skipped = failed = 0
    now = datetime.now(timezone.utc).isoformat()
    for claim in claims:
        sub = subs.get(claim["subscriber_id"])
        if not sub or not sub.get("confirmed_at") or sub.get("unsubscribed_at"):
            skipped += 1
            continue
        if dry or not configured:
            # As with reminders: never mark on the back of a no-op send.
            print(f"  [{'dry' if dry else 'skip'}] win notice for claim {claim['id']} -> {mask_email(sub['email'])}")
            skipped += 1
            continue
        log_id = claim_send(sub["id"], "win_notice", f"claim-{claim['id']}")
        if not log_id:
            skipped += 1
            continue
        meta = GAME_META.get(claim.get("game_slug") or "", {})
        unsubscribe_url = f"{SITE_URL}/api/subscribe/unsubscribe?token={sub['magic_token']}"
        subject, html = win_notice_email(
            game_name=meta.get("name"),
            prize_tier=pretty_tier(claim.get("prize_tier")),
            amount=money(claim.get("amount_cents"), meta.get("currency", "CAD")),
            draw_date=claim.get("draw_date"),
            deadline=claim.get("claim_deadline"),
            from_saved_numbers=claim.get("source") == "combination",
            dashboard_url=f"{SITE_URL}/dashboard",
            preferences_url=f"{SITE_URL}/subscribe/preferences?token={sub['magic_token']}",
            unsubscribe_url=unsubscribe_url,
        )
        if deliver(log_id, sub["email"], subject, html, unsubscribe_url=unsubscribe_url):
            sent += 1
        else:
            failed += 1
        # Marked after the attempt either way (a failure shows up in the email
        # watchdog as a 'failed' email_log row rather than as daily retries).
        db.update_row("prize_claims", {"win_notified_at": now}, {"id": claim["id"]})
    return sent, skipped, failed


def send_reminders(today, dry: bool) -> tuple[int, int, int]:
    claims = [
        c for c in db.fetch_all("prize_claims", "*", filters=[("is_", "claimed_at", "null")])
        if c.get("claim_deadline")
    ]
    due: list[tuple[dict, int, list[int]]] = []
    for c in claims:
        left = days_until(c["claim_deadline"], today)
        if left < 0:
            continue
        # Every threshold this deadline has now reached. Sending for all of
        # them at once (and marking all of them) is what makes a missed day
        # harmless: a sweep that doesn't run on the 30-day mark still sends
        # once on day 28, saying 28, instead of silently skipping the notice.
        reached = [t for t in REMINDER_DAYS if left <= t]
        fresh = [t for t in reached if t not in (c.get("reminders_sent") or [])]
        if fresh:
            due.append((c, left, reached))
    if not due:
        return 0, 0, 0

    # With no key, send_email() only logs "would send". The whole send is
    # skipped before it claims an email_log slot or marks a threshold: a
    # threshold marked on the back of a no-op would permanently spend the
    # 30-day notice for every claim standing when the key is finally
    # configured, and a burnt email_log slot would block today's real send.
    configured = bool(os.environ.get("RESEND_API_KEY"))

    subs = {
        s["id"]: s for s in db.fetch_all(
            "subscribers", "id,email,magic_token,confirmed_at,unsubscribed_at",
            filters=[("in_", "id", sorted({c["subscriber_id"] for c, _, _ in due}))],
        )
    }
    sent = skipped = failed = 0

    for claim, left, reached in due:
        sub = subs.get(claim["subscriber_id"])
        if not sub or not sub.get("confirmed_at") or sub.get("unsubscribed_at"):
            skipped += 1
            continue
        if dry or not configured:
            tag = "dry" if dry else "skip"
            print(f"  [{tag}] claim {claim['id']} -> {mask_email(sub['email'])}: {left} day(s) left, "
                  f"would mark {reached}")
            skipped += 1
            continue
        # The claim id is the uniqueness key, so two prizes expiring on the
        # same day each get their own email rather than one silently winning.
        log_id = claim_send(sub["id"], "claim_reminder", f"claim-{claim['id']}")
        if not log_id:
            skipped += 1
            continue

        meta = GAME_META.get(claim.get("game_slug") or "", {})
        unsubscribe_url = f"{SITE_URL}/api/subscribe/unsubscribe?token={sub['magic_token']}"
        subject, html = claim_reminder_email(
            days_left=left,
            deadline=claim["claim_deadline"],
            game_name=meta.get("name"),
            prize_tier=pretty_tier(claim.get("prize_tier")),
            amount=money(claim.get("amount_cents"), meta.get("currency", "CAD")),
            draw_date=claim.get("draw_date"),
            dashboard_url=f"{SITE_URL}/dashboard",
            preferences_url=f"{SITE_URL}/subscribe/preferences?token={sub['magic_token']}",
            unsubscribe_url=unsubscribe_url,
        )
        if deliver(log_id, sub["email"], subject, html, unsubscribe_url=unsubscribe_url):
            sent += 1
        else:
            failed += 1
        # Marked whether or not Resend accepted it: the alternative is retrying
        # the same threshold every day after a transient failure. The next
        # tighter threshold (7, then 3) still fires.
        merged = sorted(set((claim.get("reminders_sent") or []) + reached), reverse=True)
        db.update_row("prize_claims", {"reminders_sent": merged}, {"id": claim["id"]})

    return sent, skipped, failed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report, write nothing, send nothing")
    args = ap.parse_args()
    today = today_toronto()
    dry = args.dry_run

    checked, won = check_tickets(today, dry)
    print(f"Tickets checked: {checked} ({won} won)")
    print(f"Claims created from saved combinations: {sync_combination_claims(today, dry)}")
    print(f"Amounts filled from published breakdowns: {fill_amounts(dry)}")
    print(f"Tickets expired: {expire_tickets(today, dry)}")

    w_sent, w_skipped, w_failed = send_win_notices(today, dry)
    print(f"Win notices: {w_sent} sent, {w_skipped} skipped, {w_failed} failed")
    sent, skipped, failed = send_reminders(today, dry)
    print(f"Reminders: {sent} sent, {skipped} skipped, {failed} failed")
    failed += w_failed
    # Same reasoning as send_draw_emails.py: continue-on-error keeps a bad send
    # from blocking anything, but a real Resend failure has to be visible in
    # the Actions UI rather than looking like a quiet day.
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
