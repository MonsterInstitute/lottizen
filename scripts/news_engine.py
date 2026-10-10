#!/usr/bin/env python3
"""news_engine.py — turn the day's data changes into news items for /news.

    python scripts/news_engine.py            # detect, verify, upsert news_items, write data/news/index.json
    python scripts/news_engine.py --dry-run  # detect and verify, print, write nothing

Run by news-daily.yml after each data workflow finishes.

THE RULE: every number in a headline, dek, paragraph or table cell is read
from the database (or an agency's official list) by the detector that wrote
the item. Detectors may only put a number into text through the Fmt
helpers, which register each formatted value; verify() then extracts every
number from the finished text and rejects the item if any number isn't one
of the registered values. A digit typed into a template string fails the
check — on purpose. No language model writes any of it.

Honesty (CLAUDE.md): no item states or implies better odds; scratch items
describe unclaimed prize money, never odds or tickets left; partial history
is stated as such ("in Lottizen's records, which begin …"), never "ever";
an unclaimed prize that leaves a list is "no longer listed", never
"claimed". check_honesty() from outreach_common is applied to every item.

Stories that develop are updated in place (same event_key and slug): a
jackpot run gets one story per run, an unclaimed prize one story through
its 60/30/7-day stages.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
from game_meta import GAME_META  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "news" / "index.json"
TZ = ZoneInfo("America/Toronto")
SITE = "https://lottizen.com"
AGENCY = {"OLG": "OLG", "BCLC": "BCLC", "WCLC": "WCLC", "ALC": "Atlantic Lottery", "QUEBEC": "Loto-Québec"}
PROVINCE_SLUG = {"OLG": "ontario", "BCLC": "british-columbia", "WCLC": "western", "ALC": "atlantic", "QUEBEC": "quebec"}
PROVINCE = {"OLG": "Ontario", "BCLC": "British Columbia", "WCLC": "Western Canada", "ALC": "Atlantic Canada",
            "QUEBEC": "Quebec"}
# Games with a published prize breakdown (BCLC PlayNow / WCLC): the only ones
# where "did anyone win the top prize" is a fact we hold.
BREAKDOWN_GAMES = ("lotto-max", "lotto-6-49", "daily-grand", "bc-49", "western-max", "western-6-49")
# Top prizes that are annuities: the breakdown's figure is a lump-sum option,
# not "the prize", so win stories don't state an amount for these.
ANNUITY_TOP = {"daily-grand"}


# --------------------------------------------------------------------- format

class Fmt:
    """Every number that reaches text goes through here and is registered."""

    def __init__(self) -> None:
        self.tokens: list[str] = []

    def _r(self, s: str) -> str:
        self.tokens.append(s)
        return s

    def money(self, v: float) -> str:
        if v >= 1_000_000 and v % 100_000 == 0:
            m = v / 1_000_000
            return self._r(f"${m:,.0f} million" if m == int(m) else f"${m:,.1f} million")
        if v % 1:
            return self._r(f"${v:,.2f}")
        return self._r(f"${v:,.0f}")

    def n(self, v: int | float) -> str:
        return self._r(f"{v:,}" if isinstance(v, int) or v == int(v) else f"{v:,.1f}")

    def pct(self, v: float) -> str:
        return self._r(f"{v:.1f}%" if v < 10 else f"{v:.0f}%")

    def date(self, d: str | date) -> str:
        d = d if isinstance(d, date) else date.fromisoformat(str(d)[:10])
        return self._r(f"{d:%B} {d.day}, {d.year}")

    def raw(self, s) -> str:
        """A value copied verbatim from the data (tier codes like "7/7",
        winning numbers, agency labels)."""
        return self._r(str(s))


NUM_RE = re.compile(r"\d+(?:,\d{3})*(?:\.\d+)?")


def verify(item: "Item") -> list[str]:
    """Every number in the item's text must be inside a registered token."""
    texts = [item.headline, item.dek, *item.body]
    if item.table:
        texts += [str(c) for row in item.table["rows"] for c in row]
    problems = []
    for t in texts:
        for m in NUM_RE.finditer(t):
            if not any(m.group(0) in tok for tok in item.fmt.tokens):
                problems.append(f"unregistered number {m.group(0)!r} in: {t[:90]!r}")
    if len(item.facts) < 3:
        problems.append(f"only {len(item.facts)} facts (minimum 3)")
    import outreach_common as oc
    bad = oc.check_honesty(" ".join(texts))
    if bad:
        problems.append(f"honesty check matched {bad!r}")
    return problems


@dataclass
class Item:
    event_key: str
    slug: str
    kind: str
    category: str
    game: str | None
    data_date: str
    fmt: Fmt
    headline: str = ""
    dek: str = ""
    body: list[str] = field(default_factory=list)
    table: dict | None = None
    facts: list[dict] = field(default_factory=list)

    def fact(self, label: str, value: str, source: str, url: str | None = None) -> None:
        self.facts.append({"label": label, "value": value, "source": source, "url": url})


def slugify(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()  # Québec -> Quebec
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ------------------------------------------------------------------ draw games

def breakdowns(slug: str) -> dict[str, list[dict]]:
    rows = db.fetch_all("prize_breakdowns", "id,draw_date,tier_code,match_main,match_bonus,winners,prize_cents,"
                                            "prize_label,source,source_url", filters=[("eq", "game_slug", slug)])
    out: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        out[r["draw_date"]].append(r)
    for d in out:
        out[d].sort(key=lambda r: (-r["match_main"], not r["match_bonus"]))
    return out


_DRAWS: dict[str, list[dict]] = {}


def draw_rows(slug: str) -> list[dict]:
    if slug not in _DRAWS:
        rows = db.fetch_all("draws", "draw_date,numbers,bonus", filters=[("eq", "game_id", slug)])
        for r in rows:
            r["nums"] = [int(x) for x in str(r["numbers"]).split(",") if x.strip()]
        _DRAWS[slug] = sorted(rows, key=lambda r: r["draw_date"])
    return _DRAWS[slug]


def numbers_text(f: Fmt, row: dict) -> str:
    s = f.raw(", ".join(str(x) for x in row["nums"]))
    return s + (f" with bonus {f.raw(row['bonus'])}" if row.get("bonus") is not None else "")


def jackpot_run(slug: str, today: date) -> Item | None:
    """One story per jackpot run, updated each draw, once the run is at least
    8 draws long or the jackpot reaches $30 million."""
    meta = GAME_META[slug]
    if not meta.get("progressive") or slug not in BREAKDOWN_GAMES:
        return None
    gm = db.get_client().table("game_meta").select("next_draw_date,next_jackpot,updated_at").eq("game_id", slug).execute().data
    if not gm or not gm[0]["next_jackpot"] or not gm[0]["next_draw_date"]:
        return None
    nxt = gm[0]
    bd = breakdowns(slug)
    top = {d: rows[0] for d, rows in bd.items() if rows}
    wins = sorted(d for d, r in top.items() if (r["winners"] or 0) > 0)
    if not wins:
        return None
    last_win = wins[-1]
    run = [r["draw_date"] for r in draw_rows(slug) if r["draw_date"] > last_win]
    if not run:
        return jackpot_run_ended(slug, today, top, wins)
    snaps = sorted(db.fetch_all("jackpot_snapshots", "id,captured_date,amount", filters=[("eq", "game_slug", slug)]),
                   key=lambda r: r["captured_date"])
    run_snaps = [s for s in snaps if s["captured_date"] > last_win]
    # Two independent confirmations nobody won during the run: the breakdowns
    # we hold show 0 top-prize winners, and the jackpot never reset.
    if any((top[d]["winners"] or 0) > 0 for d in run if d in top):
        return None
    if any(b["amount"] < a["amount"] for a, b in zip(run_snaps, run_snaps[1:])):
        return None
    if len(run) < 8 and nxt["next_jackpot"] < 30_000_000:
        return None
    f = Fmt()
    it = Item(f"jackpot-run:{slug}:{run[0]}", f"{slug}-jackpot-run-{run[0]}", "jackpot_run", "draw", meta["name"],
              today.isoformat(), f)
    record = max(s["amount"] for s in snaps)
    is_record = nxt["next_jackpot"] >= record
    covered = [d for d in run if d in top]
    first = top.get(run[0])
    latest = run[-1]
    lt = bd.get(latest, [])
    second = lt[1] if len(lt) > 1 and lt[1]["winners"] and lt[1]["prize_cents"] else None
    latest_row = next(r for r in draw_rows(slug) if r["draw_date"] == latest)

    it.headline = (f"{f.raw(meta['name'])} jackpot reaches {f.money(nxt['next_jackpot'])} for {f.date(nxt['next_draw_date'])} "
                   f"after {f.n(len(run))} straight draws without a winner")
    it.dek = (f"No ticket has matched every number since the {f.date(last_win)} draw."
              + (f" It is the largest {f.raw(meta['name'])} jackpot in Lottizen's records, which begin on "
                 f"{f.date(snaps[0]['captured_date'])}." if is_record else ""))
    lw = top[last_win]["winners"]
    it.body = [
        f"The {f.raw(meta['name'])} jackpot for the {f.date(nxt['next_draw_date'])} draw is {f.money(nxt['next_jackpot'])}, "
        f"the figure Lottizen recorded from the operator on {f.date(str(nxt['updated_at']))}.",
        f"The top prize was last won in the {f.date(last_win)} draw by {f.n(lw)} ticket{'s' if lw != 1 else ''}. "
        f"It has rolled over in all {f.n(len(run))} draws since"
        + (f", starting from {f.money(first['prize_cents'] / 100)} in the {f.date(run[0])} draw"
           if first and first["prize_cents"] else "") + ".",
        f"In the latest draw, on {f.date(latest)}, the winning numbers were {numbers_text(f, latest_row)}."
        + (f" No ticket matched {f.raw(lt[0]['tier_code'])}" + (
            f"; {f.n(second['winners'])} ticket{'s' if second['winners'] != 1 else ''} matched "
            f"{f.raw(second['tier_code'])} for {f.money(second['prize_cents'] / 100)}"
            + (" each" if second["winners"] > 1 else "") if second else "") + "."
           if lt else ""),
        "A larger jackpot doesn't change the odds of winning it; only the prize changes.",
    ]
    it.fact("Next draw", f.date(nxt["next_draw_date"]), "Operator jackpot feed, via Lottizen")
    it.fact("Jackpot", f.money(nxt["next_jackpot"]), "Operator jackpot feed, via Lottizen")
    it.fact("Last won", f.date(last_win), "Published prize breakdown", top[last_win]["source_url"])
    it.fact("Draws since without a top-prize winner", f.n(len(run)),
            f"Lottizen draw history; prize breakdowns for {len(covered)} of {len(run)} of those draws show no "
            f"winner, and the recorded jackpot never reset")
    it.fact("Largest jackpot in Lottizen's records", f"{f.money(record)} (records begin {f.date(snaps[0]['captured_date'])})",
            "Lottizen jackpot snapshots")
    return it


def jackpot_run_ended(slug: str, today: date, top: dict, wins: list[str]) -> Item | None:
    """The latest draw was a win: close the story of the run it ended (same
    event_key as that run's story, so the story is updated, not duplicated),
    if that run was long or large enough to have had a story."""
    if len(wins) < 2:
        return None
    meta = GAME_META[slug]
    prev_win, win = wins[-2], wins[-1]
    run = [r["draw_date"] for r in draw_rows(slug) if prev_win < r["draw_date"] <= win]
    if not run:
        return None
    won = top[win]
    amount = won["prize_cents"] / 100 if won["prize_cents"] else None
    if len(run) < 8 and (amount or 0) < 30_000_000:
        return None
    f = Fmt()
    it = Item(f"jackpot-run:{slug}:{run[0]}", f"{slug}-jackpot-run-{run[0]}", "jackpot_run", "draw", meta["name"],
              win, f)
    w = won["winners"]
    it.headline = (f"{f.raw(meta['name'])} jackpot run ends after {f.n(len(run))} draws"
                   + (f": {f.n(w)} ticket{'s' if w != 1 else ''} {'share' if w > 1 else 'wins'} {f.money(amount)}" if amount else "")
                   + f" on {f.date(win)}")
    it.dek = (f"The top prize had gone unwon since the {f.date(prev_win)} draw. The prize breakdown for the "
              f"{f.date(win)} draw shows {f.n(w)} winning ticket{'s' if w != 1 else ''}.")
    nums = next((r for r in draw_rows(slug) if r["draw_date"] == win), None)
    it.body = [
        f"The {f.raw(meta['name'])} top prize rolled over from the {f.date(run[0])} draw until the {f.date(win)} draw, "
        f"when {f.n(w)} ticket{'s' if w != 1 else ''} matched {f.raw(won['tier_code'])}"
        + (f" for {f.money(amount)}" if amount else "") + ".",
    ]
    if nums:
        it.body.append(f"The winning numbers were {numbers_text(f, nums)}.")
    it.body.append("The breakdown does not say where the winning ticket was sold; the operator announces that "
                   "separately once the prize is claimed.")
    it.fact("Draw won", f.date(win), "Published prize breakdown", won["source_url"])
    it.fact("Winning tickets", f.n(w), "Published prize breakdown", won["source_url"])
    it.fact("Draws in the run", f.n(len(run)), "Lottizen draw history")
    if amount:
        it.fact("Top prize", f.money(amount), "Published prize breakdown", won["source_url"])
    return it


def jackpot_won(slug: str, today: date) -> Item | None:
    """The latest draw's breakdown shows at least one top-prize winner."""
    bd = breakdowns(slug)
    if not bd:
        return None
    latest = max(bd)
    if (today - date.fromisoformat(latest)).days > 4:
        return None
    rows = bd[latest]
    top = rows[0]
    if not (top["winners"] or 0) > 0:
        return None
    if jackpot_run_ended(slug, today, {d: r[0] for d, r in bd.items() if r},
                         sorted(d for d, r in bd.items() if r and (r[0]["winners"] or 0) > 0)):
        return None  # told as the end of the run instead
    meta = GAME_META[slug]
    f = Fmt()
    it = Item(f"jackpot-won:{slug}:{latest}", f"{slug}-top-prize-won-{latest}", "jackpot_won", "draw", meta["name"],
              latest, f)
    nums = next((r for r in draw_rows(slug) if r["draw_date"] == latest), None)
    amount = top["prize_cents"] / 100 if top["prize_cents"] and slug not in ANNUITY_TOP else None
    w = top["winners"]
    it.headline = (f"{f.raw(meta['name'])}: {f.n(w)} ticket{'s' if w != 1 else ''} matched {f.raw(top['tier_code'])} "
                   f"in the {f.date(latest)} draw"
                   + (f", sharing {f.money(amount)}" if amount and w > 1 else f", winning {f.money(amount)}" if amount else ""))
    it.dek = (f"The published prize breakdown for the {f.date(latest)} {f.raw(meta['name'])} draw shows "
              f"{f.n(w)} top-prize winner{'s' if w != 1 else ''}.")
    it.body = []
    if nums:
        it.body.append(f"The winning numbers were {numbers_text(f, nums)}.")
    others = [r for r in rows[1:4] if r["winners"]]
    if others:
        it.body.append("Other prize tiers in the same draw: " + "; ".join(
            f"{f.raw(r['tier_code'])}: {f.n(r['winners'])} winning ticket{'s' if r['winners'] != 1 else ''}"
            + (f" at {f.money(r['prize_cents'] / 100)}" if r["prize_cents"] else "") for r in others) + ".")
    it.body.append("The breakdown does not say where the winning tickets were sold; the operator announces that "
                   "separately once a prize is claimed.")
    it.fact("Draw", f.date(latest), "Lottizen draw history")
    it.fact("Top-prize winners", f.n(w), "Published prize breakdown", top["source_url"])
    it.fact("Top tier", f.raw(top["tier_code"]), "Published prize breakdown", top["source_url"])
    if amount:
        it.fact("Top prize", f.money(amount), "Published prize breakdown", top["source_url"])
    return it


def longest_run(ns: list[int]) -> int:
    ns, best, cur = sorted(ns), 1, 1
    for a, b in zip(ns, ns[1:]):
        cur = cur + 1 if b == a + 1 else 1
        best = max(best, cur)
    return best


def rare_draw(slug: str, today: date) -> Item | None:
    """The latest draw's sum lands in the outer 1% of the game's history, or
    its longest run of consecutive numbers happens in under 2% of draws."""
    rows = draw_rows(slug)
    if len(rows) < 500:
        return None
    latest = rows[-1]
    if (today - date.fromisoformat(latest["draw_date"])).days > 4:
        return None
    k = len(latest["nums"])
    hist = [r for r in rows[:-1] if len(r["nums"]) == k]
    if len(hist) < 500:
        return None
    meta = GAME_META[slug]
    f = Fmt()
    s = sum(latest["nums"])
    sums = sorted(sum(r["nums"]) for r in hist)
    n_low = sum(1 for x in sums if x <= s)    # past draws with a sum this low or lower
    n_high = sum(1 for x in sums if x >= s)   # … this high or higher
    run = longest_run(latest["nums"])
    n_run = sum(1 for r in hist if longest_run(r["nums"]) >= run)

    sum_rare = min(n_low, n_high) / len(hist) <= 0.01
    run_rare = run >= 3 and n_run / len(hist) < 0.02
    if not (sum_rare or run_rare):
        return None
    it = Item(f"rare-draw:{slug}:{latest['draw_date']}", f"{slug}-draw-{latest['draw_date']}-unusual-result", "rare_draw",
              "draw", meta["name"], latest["draw_date"], f)
    low = n_low <= n_high
    n_side, word = (n_low, "low") if low else (n_high, "high")
    if sum_rare:
        it.headline = (f"{f.raw(meta['name'])} numbers add up to {f.n(s)} on {f.date(latest['draw_date'])}; "
                       f"{'only ' if n_side else ''}{f.n(n_side)} of {f.n(len(hist))} past draws had a sum this {word}")
    else:
        it.headline = (f"{f.raw(meta['name'])} draws {f.n(run)} consecutive numbers on {f.date(latest['draw_date'])}; "
                       f"{f.n(n_run)} of {f.n(len(hist))} past draws had a run that long")
    it.dek = f"The winning numbers were {numbers_text(f, latest)}."
    it.body = [
        f"Lottizen compared the {f.date(latest['draw_date'])} {f.raw(meta['name'])} draw with the game's "
        f"{f.n(len(hist))} earlier draws of the same format, back to {f.date(hist[0]['draw_date'])}.",
        f"The numbers add up to {f.n(s)}. Past sums ranged from {f.n(sums[0])} to {f.n(sums[-1])}; "
        f"{f.n(n_side)} of the {f.n(len(hist))} were {f.n(s)} or {'lower' if low else 'higher'}.",
    ]
    if run >= 3:
        it.body.append(f"Its longest run of consecutive numbers is {f.n(run)}; {f.n(n_run)} of the {f.n(len(hist))} "
                       f"past draws had a run that long or longer.")
    it.body.append("Unusual-looking results are as likely as any other: every combination has the same chance in "
                   "every draw. This describes the result, not anything about future draws.")
    it.fact("Winning numbers", numbers_text(f, latest), "Lottizen draw history")
    it.fact("Sum", f.n(s), "Computed from the winning numbers")
    it.fact("Draws compared", f"{f.n(len(hist))} since {f.date(hist[0]['draw_date'])}", "Lottizen draw history")
    return it


# ---------------------------------------------------------------- scratch

def prior_day(table: str, today: date) -> str | None:
    rows = db.fetch_all(table, "id,captured_date", filters=[("gte", "captured_date", (today - timedelta(days=7)).isoformat())])
    dates = sorted({r["captured_date"] for r in rows})
    t = today.isoformat()
    if t not in dates or dates.index(t) == 0:
        return None
    return dates[dates.index(t) - 1]


def snaps(day: str) -> dict[tuple[str, str], list[dict]]:
    rows = db.fetch_all("scratch_snapshots", "id,game_number,agency,prizes_remaining_json",
                        filters=[("eq", "captured_date", day)])
    out = {}
    for r in rows:
        j = r["prizes_remaining_json"]
        out[(r["agency"], r["game_number"])] = json.loads(j) if isinstance(j, str) else j
    return out


def games_index() -> dict[tuple[str, str], dict]:
    return {(g["agency"], g["game_number"]): g for g in db.fetch_all(
        "games", "game_number,agency,name,slug,province,price,launch_date,on_sale")}


def prize_phrase(f: Fmt, tier: dict) -> str:
    from prize_values import is_annuity
    label = " ".join(str(tier.get("label") or "").split())
    if is_annuity(label):
        return f"“{f.raw(label)}”"
    return f.money(tier["amount"])


def sale_status_text(games: list[dict], agency_name: str) -> str:
    """What we actually know about whether these games can still be bought.
    "Still on the prize list" is never written as "on sale" (0025)."""
    known = [g for g in games if g.get("on_sale") is not None]
    if not known:
        return (f"{agency_name} doesn't publish a product catalog Lottizen can match, so whether "
                + ("this game is" if len(games) == 1 else "these games are") + " still on sale isn't known.")
    on = [g for g in games if g.get("on_sale") is True]
    if len(games) == 1:
        return ("It is still on sale (it's in the agency's current catalog)." if on else
                "It is no longer in the agency's current catalog; it stays on the list because prizes can still be claimed.")
    return ("The table shows which are still in the agency's current catalog (on sale) and which are listed only "
            "because their prizes can still be claimed.")


def scratch_top_gone(today: date) -> list[Item]:
    """Games whose top prize tier went from >=1 left to 0, per agency per day.
    The same tier is compared across the two days by label."""
    y = prior_day("scratch_snapshots", today)
    if not y:
        return []
    t = today.isoformat()
    before, now, games = snaps(y), snaps(t), games_index()
    by_agency: dict[str, list] = defaultdict(list)
    for k, tiers in now.items():
        top = next((x for x in tiers if x.get("isTop")), None)
        prior = next((x for x in before.get(k, []) if top and x.get("label") == top.get("label")), None)
        if top and prior and (prior.get("remaining") or 0) > 0 and (top.get("remaining") or 0) == 0 and k in games:
            by_agency[k[0]].append((games[k], top, prior))
    items = []
    for agency, rows in by_agency.items():
        rows.sort(key=lambda r: -(r[1].get("amount") or 0))
        f = Fmt()
        name = AGENCY[agency]
        it = Item(f"scratch-top-gone:{agency}:{t}", f"{slugify(name)}-scratch-top-prizes-gone-{t}", "scratch_top_gone",
                  "scratch", None, t, f)
        g, top, prior = rows[0]
        if len(rows) == 1:
            it.headline = f"Last {prize_phrase(f, top)} top prize claimed on {name}'s {f.money(g['price'])} {f.raw(g['name'])}"
        else:
            it.headline = (f"Top prizes run out on {f.n(len(rows))} {name} scratch tickets, including the "
                           f"{f.money(g['price'])} {f.raw(g['name'])}")
        it.dek = (f"{name}'s published prize counts on {f.date(t)} show no top prizes left on "
                  + ("this game" if len(rows) == 1 else f"these {f.n(len(rows))} games")
                  + f"; on {f.date(y)}, at least one remained on each.")
        it.body = [
            f"{name} publishes how many prizes in each tier are still unclaimed for every scratch ticket it sells. "
            f"Between {f.date(y)} and {f.date(t)}, the count for the top prize fell to zero on "
            + (f"the {f.money(g['price'])} {f.raw(g['name'])}." if len(rows) == 1 else f"{f.n(len(rows))} games."),
            sale_status_text([r[0] for r in rows], name)
            + " Their lower prizes are still unclaimed. A claimed top prize doesn't change the odds printed for "
            "any individual ticket, and no agency publishes how many tickets remain unsold.",
        ]
        it.table = {"columns": ["Game", "Price", "Top prize", "Printed", "Left before", "Left now", "On sale"],
                    "rows": [[f.raw(r[0]["name"]), f.money(r[0]["price"]), prize_phrase(f, r[1]),
                              f.n(r[1]["total"]) if r[1].get("total") else "not published",
                              f.n(r[2].get("remaining") or 0), f.n(r[1].get("remaining") or 0),
                              {True: "yes", False: "no, prize claims only"}.get(r[0].get("on_sale"), "not published")]
                             for r in rows]}
        it.fact("Agency", name, f"{name} published prize counts")
        it.fact("Games whose last top prize was claimed", f.n(len(rows)), "Lottizen daily snapshots")
        it.fact("Compared", f"{f.date(y)} and {f.date(t)}", "Lottizen daily snapshots")
        items.append(it)
    return items


def scratch_new(today: date) -> list[Item]:
    """New games on an agency's list today (absent from the previous snapshot)."""
    y = prior_day("scratch_snapshots", today)
    if not y:
        return []
    t = today.isoformat()
    before, now, games = snaps(y), snaps(t), games_index()
    agencies_before = {a for a, _ in before}
    by_agency: dict[str, list] = defaultdict(list)
    for k, tiers in now.items():
        if k[0] in agencies_before and k not in before and k in games:
            top = next((x for x in tiers if x.get("isTop")), tiers[0] if tiers else None)
            by_agency[k[0]].append((games[k], top))
    items = []
    for agency, rows in by_agency.items():
        rows.sort(key=lambda r: (-r[0]["price"], r[0]["name"]))
        f = Fmt()
        name = AGENCY[agency]
        it = Item(f"scratch-new:{agency}:{t}", f"{slugify(name)}-new-scratch-tickets-{t}", "scratch_new", "scratch",
                  None, t, f)
        it.headline = f"{f.n(len(rows))} new {name} scratch ticket{'s' if len(rows) != 1 else ''} listed on {f.date(t)}"
        it.dek = (f"{PROVINCE[agency]}: " + ", ".join(f"{f.raw(r[0]['name'])} ({f.money(r[0]['price'])})" for r in rows[:4])
                  + ("…" if len(rows) > 4 else "."))
        it.body = [
            f"These games appeared on {name}'s list of scratch tickets between {f.date(y)} and {f.date(t)}. "
            "A new game has had the least time for its prizes to be claimed, so all or nearly all of them are still "
            "out there. That says nothing about the odds of any single ticket, which are printed on it.",
        ]
        it.table = {"columns": ["Game", "Price", "Top prize", "Top prizes left"],
                    "rows": [[f.raw(r[0]["name"]), f.money(r[0]["price"]), prize_phrase(f, r[1]) if r[1] else "—",
                              f.n(r[1].get("remaining") or 0) if r[1] else "—"] for r in rows]}
        it.fact("Agency", name, f"{name} scratch ticket list")
        it.fact("New games", f.n(len(rows)), "Lottizen daily snapshots")
        it.fact("Compared", f"{f.date(y)} and {f.date(t)}", "Lottizen daily snapshots")
        items.append(it)
    return items


def rank_rows(day: str) -> dict[tuple[str, str], dict]:
    return {(r["agency"], r["game_slug"]): r for r in db.fetch_all(
        "scratch_rank_snapshots", "id,agency,game_slug,rank,value_score,remaining_prize_pool,price",
        filters=[("eq", "captured_date", day)])}


def scratch_top10_out(today: date) -> list[Item]:
    y = prior_day("scratch_rank_snapshots", today)
    if not y:
        return []
    t = today.isoformat()
    a, b = rank_rows(t), rank_rows(y)
    names = {(g["agency"], g["slug"]): g for g in games_index().values()}
    by_agency: dict[str, list] = defaultdict(list)
    for k, prev in b.items():
        cur = a.get(k)
        # Only a ticket whose own score fell: ranks among tied scores (most of
        # ALC's board sits at 100) reshuffle without anything happening.
        if cur and prev["rank"] <= 10 < cur["rank"] and cur["value_score"] < prev["value_score"] and k in names:
            by_agency[k[0]].append((names[k], prev, cur))
    items = []
    for agency, rs in by_agency.items():
        rs.sort(key=lambda r: r[1]["rank"])
        f = Fmt()
        name = AGENCY[agency]
        it = Item(f"scratch-top10-out:{agency}:{t}", f"{slugify(name)}-scratch-top-10-changes-{t}", "scratch_top10_out",
                  "scratch", None, t, f)
        g = rs[0][0]
        it.headline = (f"{f.raw(g['name'])} drops out of Lottizen's top {f.n(10)} {name} scratch tickets" if len(rs) == 1 else
                       f"{f.n(len(rs))} tickets drop out of Lottizen's top {f.n(10)} {name} scratch tickets")
        it.dek = (f"Ranked by Value Score, which compares how much prize money is still unclaimed, "
                  f"{f.date(y)} to {f.date(t)}.")
        it.body = [
            "Lottizen ranks every scratch ticket an agency lists by how much of its prize money is still unclaimed, "
            "using the agency's published prize counts. A ticket falls in the ranking when its prizes, especially "
            "large ones, are claimed faster than other games'.",
            "The ranking describes unclaimed prize money. It doesn't change or predict the odds of any ticket.",
        ]
        it.table = {"columns": ["Game", "Price", "Rank before", "Rank now"],
                    "rows": [[f.raw(r[0]["name"]), f.money(r[0]["price"]), f.n(r[1]["rank"]), f.n(r[2]["rank"])] for r in rs]}
        it.fact("Agency", name, "Lottizen rankings (see /methodology)")
        it.fact("Tickets leaving the top 10", f.n(len(rs)), "Lottizen rankings")
        it.fact("Compared", f"{f.date(y)} and {f.date(t)}", "Lottizen rank snapshots")
        items.append(it)
    return items


def scratch_pool(today: date) -> list[Item]:
    """An agency's total listed prize money still unclaimed crosses below a
    $5 million line (WCLC/ALC: disclosed tiers only)."""
    y = prior_day("scratch_rank_snapshots", today)
    if not y:
        return []
    t = today.isoformat()
    a, b = rank_rows(t), rank_rows(y)
    step = 5_000_000
    items = []
    for agency, name in AGENCY.items():
        now_total = sum(r["remaining_prize_pool"] or 0 for k, r in a.items() if k[0] == agency)
        prev_total = sum(r["remaining_prize_pool"] or 0 for k, r in b.items() if k[0] == agency)
        if not now_total or not prev_total or int(now_total // step) >= int(prev_total // step):
            continue
        line = int(prev_total // step) * step
        f = Fmt()
        partial = agency in ("WCLC", "ALC")
        it = Item(f"scratch-pool:{agency}:{line}", f"{slugify(name)}-scratch-prize-money-below-{line}-{t}",
                  "scratch_pool", "scratch", None, t, f)
        it.headline = f"Unclaimed {name} scratch prize money falls below {f.money(line)}"
        it.dek = (f"{f.money(now_total)} on {f.date(t)}, down from {f.money(prev_total)} on {f.date(y)}, across the "
                  f"tickets {name} lists.")
        it.body = [
            f"Adding up every scratch ticket {name} lists, the prize money still unclaimed "
            + ("in the prize tiers it discloses " if partial else "")
            + f"was {f.money(now_total)} on {f.date(t)}, compared with {f.money(prev_total)} on {f.date(y)}.",
            "The total rises when new games launch and falls as prizes are claimed and games are withdrawn. "
            "It describes prize money, not the odds of any ticket.",
        ]
        it.fact("Unclaimed prize money", f.money(now_total), f"{name} published prize counts, summed by Lottizen")
        it.fact("Day before", f.money(prev_total), "Lottizen rank snapshots")
        it.fact("Coverage", "disclosed tiers only" if partial else "every listed tier", "Lottizen methodology")
        items.append(it)
    return items


def province_compare(today: date) -> list[Item]:
    """Once a month (first week): how the five agencies' ON-SALE scratch
    tickets compare. Media material, not buying advice — nobody can buy in
    another province — so it describes, and recommends nothing. On sale =
    in the agency's catalog (0025)."""
    if today.day > 7:
        return []
    import statistics
    import weekly_picks as wp
    games = wp.load_games()
    rows = []
    for agency, gs in sorted(games.items()):
        on = [g for g in gs if g["on_sale"] is True]
        if not on:
            continue
        gone = [g for g in on if g["top_remaining"] == 0]
        shares = [g["share_left_pct"] for g in on if g["share_left_pct"] is not None]
        rows.append({"agency": agency, "on": len(on), "gone": len(gone), "pct_gone": 100 * len(gone) / len(on),
                     "median_share": statistics.median(shares) if shares else None})
    if len(rows) < 2:
        return []
    f = Fmt()
    month = f"{today:%B} {f.raw(today.year)}"
    t = today.isoformat()
    lo, hi = min(rows, key=lambda r: r["pct_gone"]), max(rows, key=lambda r: r["pct_gone"])
    it = Item(f"province-compare:{today:%Y-%m}", f"canada-scratch-tickets-by-province-{today:%Y-%m}", "province_compare",
              "scratch", None, t, f)
    it.headline = (f"Scratch tickets on sale in Canada, {month}: share with no top prize left ranges from "
                   f"{f.pct(lo['pct_gone'])} ({AGENCY[lo['agency']]}) to {f.pct(hi['pct_gone'])} ({AGENCY[hi['agency']]})")
    it.dek = (f"A monthly comparison of the {f.n(sum(r['on'] for r in rows))} scratch tickets the five agencies "
              f"list as on sale, from their published prize counts.")
    it.body = [
        "Each agency publishes how many prizes in each tier are still unclaimed. Lottizen counts only tickets in "
        "each agency's current product catalog, and compares how many of them still have a top prize left.",
        "OLG, BCLC and Loto-Québec also publish how many prizes were printed, so for them the table shows the "
        "median share of printed prize money still unclaimed. WCLC and Atlantic Lottery don't publish that.",
        "Tickets can only be bought in the province where they're sold, so this compares the provinces' "
        "markets; it isn't advice on where to buy, and none of it changes the odds of any ticket.",
    ]
    it.table = {"columns": ["Agency", "On sale", "No top prize left", "Share", "Median printed prize money unclaimed"],
                "rows": [[AGENCY[r["agency"]], f.n(r["on"]), f.n(r["gone"]), f.pct(r["pct_gone"]),
                          f.pct(r["median_share"]) if r["median_share"] is not None else "not published"]
                         for r in sorted(rows, key=lambda r: r["pct_gone"])]}
    it.fact("Tickets on sale, five agencies", f.n(sum(r["on"] for r in rows)), "Agencies' product catalogs, via Lottizen")
    it.fact("Lowest share with no top prize left", f"{AGENCY[lo['agency']]}, {f.pct(lo['pct_gone'])}", "Agencies' published prize counts")
    it.fact("Highest share with no top prize left", f"{AGENCY[hi['agency']]}, {f.pct(hi['pct_gone'])}", "Agencies' published prize counts")
    return [it]


def price_point_compare(today: date) -> list[Item]:
    """$20 vs $5 scratch tickets on sale, per agency that publishes a payout
    rate per game (OLG). One story per agency per month, updated as the data
    moves. Two published facts side by side — how the games are built (the
    printed payout rate) and how much of their printed prize money is still
    unclaimed — and nothing about the chance of winning. The headline only
    calls the pattern out when the data shows it."""
    import statistics
    import weekly_picks as wp
    games = wp.load_games()
    facts = {(r["agency"], r["game_number"]): float(r["payout_pct"]) for r in db.fetch_all(
        "scratch_game_facts", "agency,game_number,payout_pct") if r["payout_pct"] is not None}
    out = []
    for agency, gs in games.items():
        on = [g for g in gs if g["on_sale"] is True]
        by = {p: [g for g in on if g["price"] == p] for p in (5.0, 20.0)}
        pay = {p: [facts[(agency, g["game_number"])] for g in by[p] if (agency, g["game_number"]) in facts] for p in by}
        share = {p: [g["share_left_pct"] for g in by[p] if g["share_left_pct"] is not None] for p in by}
        if min(len(pay[5.0]), len(pay[20.0]), len(share[5.0]), len(share[20.0])) < 3:
            continue  # too few games at a price point to say anything
        f = Fmt()
        name = AGENCY[agency]
        prov = PROVINCE[agency]
        mp = {p: statistics.median(v) for p, v in pay.items()}
        ms = {p: statistics.median(v) for p, v in share.items()}
        it = Item(f"price-compare:{agency}:{today:%Y-%m}", f"{slugify(prov)}-20-vs-5-scratch-tickets-{today:%Y-%m}",
                  "price_compare", "scratch", None, today.isoformat(), f)
        twenty, five = f.money(20), f.money(5)
        if mp[20.0] > mp[5.0] and ms[20.0] < ms[5.0]:
            it.headline = (f"{prov}'s {twenty} scratch tickets are printed to pay out more than its {five} tickets, "
                           f"but have far less prize money left")
        else:
            it.headline = f"{prov}'s {twenty} and {five} scratch tickets: payout rates and prize money left"
        it.dek = (f"On {f.date(today)}, {name}'s {twenty} tickets on sale have a median printed payout rate of "
                  f"{f.raw(f'{mp[20.0]:.2f}')}% and {f.raw(f'{ms[20.0]:.1f}%')} of their printed prize money still unclaimed; "
                  f"its {five} tickets, {f.raw(f'{mp[5.0]:.2f}')}% and {f.raw(f'{ms[5.0]:.1f}%')}.")
        it.body = [
            f"{name} publishes, on each instant game's product page, the share of the game's sales it is printed to pay "
            f"out as prizes. Across the {f.n(len(pay[20.0]))} {twenty} tickets on sale the median is "
            f"{f.raw(f'{mp[20.0]:.2f}')}%; across the {f.n(len(pay[5.0]))} {five} tickets, {f.raw(f'{mp[5.0]:.2f}')}%. "
            f"That describes how the games are built, across all their tickets.",
            f"{name} also publishes how many prizes in each tier were printed and how many are still unclaimed. The "
            f"median {twenty} ticket on sale has {f.raw(f'{ms[20.0]:.1f}%')} of its printed prize money still unclaimed; the "
            f"median {five} ticket, {f.raw(f'{ms[5.0]:.1f}%')}. Older games have had longer for their prizes to be claimed, so "
            f"this also reflects how long each game has been on sale.",
            "Neither figure is the chance of winning, which this doesn't compare. No agency publishes how many "
            "tickets remain unsold, so nobody can say how much prize money is left per ticket at any price.",
        ]
        it.table = {"columns": ["Price", "Games on sale", "Median printed payout rate", "Median printed prize money unclaimed"],
                    "rows": [[f.money(p), f.n(len(by[p])), f"{f.raw(f'{mp[p]:.2f}')}%", f.raw(f'{ms[p]:.1f}%')] for p in (20.0, 5.0)]}
        it.fact(f"Median payout rate, {twenty} tickets", f"{f.raw(f'{mp[20.0]:.2f}')}%", f"{name} game pages")
        it.fact(f"Median payout rate, {five} tickets", f"{f.raw(f'{mp[5.0]:.2f}')}%", f"{name} game pages")
        it.fact(f"Median printed prize money unclaimed, {twenty} / {five}", f"{f.raw(f'{ms[20.0]:.1f}%')} / {f.raw(f'{ms[5.0]:.1f}%')}",
                f"{name} published prize counts")
        it.fact("Price guide", f"lottizen.com/scratch/{PROVINCE_SLUG[agency]}/prices", "Lottizen",
                f"{SITE}/scratch/{PROVINCE_SLUG[agency]}/prices")
        out.append(it)
    return out


# ---------------------------------------------------------------- unclaimed

def unclaimed_deadlines(today: date) -> list[Item]:
    """$1M+ listed prizes, one story each, written at 60, 30 and 7 days left
    and updated again if the prize leaves its list."""
    rows = db.fetch_all("unclaimed_prizes", "id,prize_key,agency,game,draw_date,amount,location,expires,source_url,"
                                           "list_as_of,detail,removed_on")
    items = []
    t = today.isoformat()
    for r in rows:
        amount = float(r["amount"])
        if amount < 1_000_000:
            continue
        days = (date.fromisoformat(r["expires"]) - today).days
        stage = 7 if days <= 7 else 30 if days <= 30 else 60 if days <= 60 else None
        if r["removed_on"]:
            if r["removed_on"] < (today - timedelta(days=30)).isoformat():
                continue
        elif stage is None or days < 0:
            continue
        f = Fmt()
        name = AGENCY.get(r["agency"], r["agency"])
        slug = slugify(f"unclaimed {r['game']} {r['draw_date']} {int(amount)} {r['agency']}")
        it = Item(f"unclaimed:{r['prize_key']}", slug, "unclaimed_deadline", "unclaimed", r["game"], t, f)
        prize = f"{f.money(amount)} {f.raw(r['game'])}"
        where = f.raw(r["location"]) if r["location"] else "an undisclosed location"
        if r["removed_on"]:
            it.headline = f"{prize} prize from {f.date(r['draw_date'])} no longer on {name}'s unclaimed list"
            it.dek = (f"It was listed as unclaimed until {f.date(r['removed_on'])}; its claim deadline "
                      f"{'was' if r['expires'] < t else 'is'} {f.date(r['expires'])}.")
            status = (f"Lottizen's daily check found it missing from {name}'s list on {f.date(r['removed_on'])}. "
                      f"{name} doesn't say why a prize leaves its list.")
        else:
            it.headline = f"{prize} prize expires in {f.n(days)} day{'s' if days != 1 else ''}"
            it.dek = (f"The prize from the {f.date(r['draw_date'])} draw, sold in {where}, must be claimed by "
                      f"{f.date(r['expires'])}, according to {name}'s unclaimed-prize list.")
            status = (f"{name}'s list is dated {f.raw(r['list_as_of'] or 'without a date')}; a prize can be claimed "
                      f"after a list is updated.")
        it.body = [
            f"{name} lists a {prize} prize from the {f.date(r['draw_date'])} draw as unclaimed"
            + (f" ({f.raw(r['detail'])})" if r["detail"] else "") + f", sold in {where}. "
            f"Its claim deadline is {f.date(r['expires'])}.",
            status,
            "Anyone who bought a ticket for that draw there can check it at a retailer or with the agency before the "
            "deadline. Every claim is decided by the agency's own records.",
        ]
        it.fact("Prize", f.money(amount), f"{name} unclaimed-prize list", r["source_url"])
        it.fact("Draw date", f.date(r["draw_date"]), f"{name} unclaimed-prize list", r["source_url"])
        it.fact("Claim deadline", f.date(r["expires"]), f"{name} claim period", r["source_url"])
        it.fact("All listed unclaimed prizes", "lottizen.com/unclaimed", "Lottizen", f"{SITE}/unclaimed")
        items.append(it)
    return items


# ------------------------------------------------------------------- run

def detect(today: date) -> list[Item]:
    items: list[Item] = []

    def safe(fn, *args):
        try:
            r = fn(*args)
            return [r] if isinstance(r, Item) else (r or [])
        except Exception as e:  # noqa: BLE001 — one detector failing mustn't stop the rest
            print(f"::warning::news {fn.__name__}{args[:1]} failed: {type(e).__name__}: {e}", file=sys.stderr)
            return []
    for slug in BREAKDOWN_GAMES:
        items += safe(jackpot_run, slug, today) + safe(jackpot_won, slug, today)
    for slug in ("lotto-max", "lotto-6-49", "daily-grand", "ontario-49", "lottario", "bc-49", "western-max", "western-6-49"):
        items += safe(rare_draw, slug, today)
    for fn in (scratch_top_gone, scratch_new, scratch_top10_out, scratch_pool, province_compare, price_point_compare,
               unclaimed_deadlines):
        items += safe(fn, today)
    return items


def upsert(items: list[Item]) -> tuple[int, int]:
    client = db.get_client()
    existing = {r["event_key"]: r for r in db.fetch_all("news_items", "id,event_key,headline,dek,body,data_table")}
    new = updated = 0
    now = datetime.now(timezone.utc).isoformat()
    for it in items:
        row = {"event_key": it.event_key, "slug": it.slug, "kind": it.kind, "category": it.category, "game": it.game,
               "headline": it.headline, "dek": it.dek, "body": it.body, "data_table": it.table, "facts": it.facts,
               "data_date": it.data_date}
        old = existing.get(it.event_key)
        if old is None:
            client.table("news_items").insert(row).execute()
            new += 1
        elif (old["headline"], old["dek"], old["body"], old["data_table"]) != (it.headline, it.dek, it.body, it.table):
            row.pop("slug")  # the URL never changes once published
            client.table("news_items").update(row | {"updated_at": now}).eq("id", old["id"]).execute()
            updated += 1
    return new, updated


def write_index() -> int:
    rows = db.fetch_all("news_items", "id,slug,kind,category,game,headline,dek,body,data_table,facts,data_date,"
                                      "published_at,updated_at")
    rows.sort(key=lambda r: r["published_at"], reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"generatedAt": datetime.now(TZ).isoformat(timespec="seconds"),
                               "items": [{k: v for k, v in r.items() if k != "id"} for r in rows[:500]]}, indent=1))
    return len(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--date", help="Toronto date to evaluate (default today)")
    a = ap.parse_args()
    today = date.fromisoformat(a.date) if a.date else datetime.now(TZ).date()
    ok: list[Item] = []
    rejected = 0
    for it in detect(today):
        problems = verify(it)
        if problems:
            rejected += 1
            print(f"::warning::news item {it.event_key} rejected: {problems[0]}", file=sys.stderr)
            for p in problems:
                print(f"  ✗ {it.event_key}: {p}")
            continue
        ok.append(it)
        print(f"  ✓ [{it.kind}] {it.headline}")
    print(f"{len(ok)} item(s) passed, {rejected} rejected")
    if a.dry_run:
        for it in ok:
            print(json.dumps({"headline": it.headline, "dek": it.dek, "body": it.body, "table": it.table},
                             ensure_ascii=False, indent=1)[:1500])
        return 0
    new, updated = upsert(ok)
    total = write_index()
    print(f"✓ news_items: {new} new, {updated} updated; {total} total → {OUT.relative_to(ROOT)}")
    import os
    if os.environ.get("GITHUB_OUTPUT"):  # lets news-daily.yml skip publish + deploy when nothing changed
        with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
            fh.write(f"changed={'true' if new or updated else 'false'}\n")
    return 1 if rejected and not ok else 0


if __name__ == "__main__":
    raise SystemExit(main())
