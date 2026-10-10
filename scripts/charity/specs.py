"""Per-lottery extraction patterns for rules pages, each written against
that lottery's own rules page and checked by hand on 2026-10-10.

Why per lottery: these pages describe the main lottery and its add-ons (50/50,
calendars, cash add-ons) in one long text with different wording on every
site. A generic parser mixed add-on numbers into the main lottery; a wrong
number on Lottizen is worse than a missing one (CLAUDE.md). So every field
has an explicit pattern here. When a page changes and a pattern stops
matching, the field is left empty and scripts/scrape_charity.py reports
the miss (an [auto] issue), so it's fixed by hand rather than guessed.

Pattern placeholders: {D} = a date "Month D, YYYY" (3 groups), {W} = an
optional weekday. Deadline patterns have one {D} (the cutoff) or two (the
cutoff, then that draw's date). A (?P<name>…) group names the deadline.
Odds statements and draw-eligibility sentences are taken verbatim
(common.verbatim_*), never computed.
"""
from __future__ import annotations

import re

from .common import MON_RE, end_of_day, num, parse_date

D = MON_RE + r"\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})"
W = r"(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\s+)?"


def _p(pat: str) -> re.Pattern:
    return re.compile(pat.replace("{D}", D).replace("{W}", W))


# Shared shapes ------------------------------------------------------------------

AB_ELMS_DEADLINES = [
    r"Tickets sold by the (?P<name>VIP|Bonus|Early Bird)(?: Prize)? sales deadline: [Aa]ll tickets sold by midnight, {D}\s*,? will be eligible for the [^|]{0,40}?draw on {D}",
    r"(?P<name>Early Bird) deadline of midnight, {D} then all remaining draws",
    r"before the (?P<name>Final) deadline of midnight, {D}\s*,? will be eligible for all remaining draws on {D}",
]
MB_DEADLINES = [
    r"The (?P<name>[A-Z][\w ]{2,30}?) cutoff date for main ticket sales will be {W}{D},? at [Mm]idnight\. The (?:[A-Z][\w ]{2,30}?) draws? will be held on {W}{D}",
    r"The (?P<name>Final) main ticket sales cutoff for all remaining prizes(?:, including the Grand Prize,)? will be {W}{D},? at [Mm]idnight",
]
MB_GRAND = r"The Grand Prize draw will be held on {W}{D}"
MB_TIERS = r"main ticket prices are: (Single ticket is \$\d+[^.|]*)"

SPECS: dict[str, dict] = {
    "princess-margaret-home-lottery": {
        "cap": r"There are ([\d,]+) tickets to be sold",
        "prizes": r"([\d,]+) prizes will be awarded, valued at \$([\d,]+\.\d{2})",
        "tiers": r"Tickets are (\$\d+ each[^.|]*)",
        "deadlines": [
            r"(?P<name>Loyalty) Prize Sales Deadline: Midnight, {D}",
            r"(?P<name>VIP) Prize Sales Deadline: Midnight, {D}",
            r"(?P<name>Bonus) Prize Sales Deadline: Midnight, {D}",
            r"(?P<name>Early Bird) Prize Sales Deadline: Midnight, {D}",
            r"(?P<name>Final) Sales Deadline: Midnight, {D}",
        ],
        "draws": {"Bonus": r"Bonus Prize Draw: To qualify[^|]*?The draw will take place on {D}",
                  "Early Bird": r"Early Bird Prize Draw: To qualify[^|]*?The draw will take place on {D}",
                  "Final": r"remaining draws will take place on {D}"},
        "licence": r"Home Lottery Licence #:?\s*(RAF\d+)",
    },
    "calgary-hospital-home-lottery": {
        "cap": r"([\d,]+) Hospital Home Lottery tickets are available",
        "prizes": r"([\d,]+) prizes will be awarded",
        "value": r"Approximate total retail value of prizes is \$([\d,]+\.\d{2})",
        "tiers": r"(Single tickets are available for \$110[^.|]*)",
        "deadlines": AB_ELMS_DEADLINES,
        "licence": r"Home Lottery Licence #(\d+)",
    },
    "mighty-millions-lottery": {
        "cap": r"([\d,]+) Hospital Home Lottery tickets are available",
        "prizes": r"([\d,]+) prizes will be awarded",
        "tiers": r"(Single tickets are available for \$110[^.|]*)",
        "deadlines": AB_ELMS_DEADLINES,
        "licence": r"Stollery Children’s Hospital Foundation Lottery Licence #(\d+)",
    },
    "saskatoon-hospital-home-lottery": {
        "cap": r"HOME LOTTERY TICKETS: ([\d,]+) total tickets available",
        "prizes": r"([\d,]+) home lottery prizes will be awarded",
        "value": r"total retail value of all Hospital Home Lottery prizes is approximately \$([\d,]+\.\d{2})",
        "tiers": r"total tickets available\. (\$\d+ each[^|]*)",
        "deadlines": [
            r"(?P<name>VIP) Prize Deadline: Midnight, {D}",
            r"(?P<name>Bonus) Prize Deadline: Midnight, {D}",
            r"(?P<name>Early Bird) Prize Deadline: Midnight, {D}",
            r"(?P<name>Final) Deadline: Midnight, {D}",
        ],
        "draws": {"VIP": r"The VIP Prize draw will be conducted on {D}",
                  "Bonus": r"The Bonus Prize draw will be conducted on {D}",
                  "Early Bird": r"only the Early Bird Prize will be drawn for on {D}"},
        "grand": r"Final Draw: {D}",
        "licence": r"Lottery Licence #(LR[\d-]+)",
    },
    "hospitals-of-regina-home-lottery": {
        "cap": r"A maximum of ([\d,]+) Home Lottery tickets will be available for sale",
        "prizes": r"Only [\d,]+ tickets will be available, ([\d,]+) prizes in all",
        "value": r"Approximate total retail value of all home lottery prizes is \$([\d,]+(?:\.\d{2})?)",
        "deadlines": [
            r"(?P<name>VIP) ticket sales deadline: Midnight,? {D}",
            r"(?P<name>Bonus) ticket sales deadline: Midnight,? {D}",
            r"(?P<name>Early Bird) ticket sales deadline: Midnight,? {D}",
            r"(?P<name>Final) ticket sales deadline: Midnight,? {D}",
        ],
        "licence": r"[Ll]icen[cs]e #\s*(LR[\d-]+)",
    },
    "nb-hospital-home-lottery": {
        "cap": r"A maximum of ([\d,]+) Home Lottery tickets will be available for sale",
        "deadlines": [
            r"before the (?P<name>Bonus) Prize Deadline of Midnight, {D}",
            r"before the (?P<name>Early Bird) Prize Deadline of Midnight, {D}",
            r"(?P<name>Final) ticket sales deadline is Midnight, {D}",
        ],
        "draws": {"Bonus": r"BONUS PRIZE DRAW DATE: {D}", "Early Bird": r"EARLY BIRD PRIZE DRAW DATE: {D}",
                  "Final": r"FINAL DRAW DATE \(IF NEEDED\): {D}"},
        "licence": r"Lottery Licence # ?(\d{7} \d{3} \d{3})",
    },
    "qeii-home-lottery": {
        "cap": r"A maximum of ([\d,]+) Home Lottery tickets will be available for sale",
        "prizes": r"\| ([\d,]+) prizes with an approximate retail value of \$([\d,]+\.\d{2}) will be awarded",
        "deadlines": [
            r"(?P<name>Bonus) Prize Deadline\*?: Midnight, {D}\s*\|\s*Bonus Prize Draw Date: {D}",
            r"(?P<name>Early Bird) Prize Deadline\**: Midnight, {D}\s*\|\s*Early Bird Prize Draw Date: {D}",
            r"(?P<name>Final) Deadline: Midnight, {D}\s*\|\s*Final Draw Date \(if needed\): {D}",
        ],
        "licence": r"Lottery Licence # ?(AGD-[\d, -]+\d)",
    },
    "health-care-foundation-home-lottery": {
        "cap": r"\| Only ([\d,]+) tickets will be sold",
        "prizes": r"([\d,]+) prizes will be awarded",
        "tiers": r"\| Tickets are (\$\d+ each[^|]*)",
        "deadlines": [
            r"The (?P<name>Bonus) Prize ticket sales deadline is midnight, {W}{D}\.[\s*|]*The Bonus Prize draw date is {D}",
            r"The (?P<name>Early Bird) Prize ticket sales deadline is midnight, {W}{D}\.[\s*|]*The Early Bird Prize draw date is {D}",
            r"the (?P<name>Final) ticket sales deadline is midnight, {W}{D}\.[\s*|]*The Final draw date is {D}",
        ],
        "licence": r"Lottery Licence #(\S+LT)",
    },
    "fill-your-boots-5050": {
        "deadlines": [r"DEADLINE {D} \| DRAW DATE {D}"],
        "licence": r"Lottery Licence #(\S+LT)",
    },
    "london-dream-lottery": {
        "cap": r"maximum of ([\d,]+) tickets available for sale",
        "prizes": r"([\d,]+) prizes will be awarded in the Dream Lottery",
        "value": r"The total value of all prizes drawn is \$([\d,]+)",
        "tiers": r"Tickets are (\d+-Pack for \$\d+[^.|]*)",
        "deadlines": [
            r"(?P<name>Loyalty|Anniversary #\d|VIP|Bonus|Early Bird) Deadline: Midnight, {W}{D}\s*\|\s*(?:Loyalty|Anniversary #\d|VIP|Bonus|Early Bird) Draws?: {W}{D}",
            r"(?P<name>Final) Ticket Deadline: Midnight, {W}{D}",
        ],
        "draws": {"Final": r"Final Draws will be drawn on {W}{D}"},
    },
    "bluewater-health-dream-home": {
        "cap": r"maximum of ([\d,]+) tickets available for sale",
        "prizes": r"([\d,]+) prizes will be awarded in the Dream Home Lottery",
        "value": r"The total value of all prizes drawn in the Dream Home portion of the Dream Home Lottery is \$([\d,]+)",
        "tiers": r"Dream Home ticket prices are (\d+-Pack for \$\d+[^.|]*)",
        "deadlines": [r"The deadline to purchase tickets for inclusion in the draws is (?P<name>){D}"],
        "final_name": "Final",
        "licence": r"DHL License (RAF\d+)",
    },
    "bc-childrens-hospital-dream-lottery": {
        "cap": r"For the Dream Lottery a total of ([\d,]+) tickets are available",
        "prizes": r"There are ([\d,]+) prizes available to be won",
        "tiers": r"2026 Dream Lottery Tickets \| ([^|]+)",
        "deadlines": [r"(?P<name>Appreciation Reward Bonus|End Of Summer Bonus|Fall Bonus|Early Bird|Final) Sales Cutoff is Midnight, {W}{D}"],
        "grand": r"Grand Prize Draw: \| {W}{D}",
        "licence": r"BC Gaming Event Licence # ?(\d+)",
    },
    "vgh-millionaire-lottery": {
        "cap": r"For the Millionaire Lottery a total of ([\d,]+) tickets are available",
        "prizes": r"A total of ([\d,]+) prizes are available to be won in the Millionaire Lottery",
        "tiers": r"2026 Millionaire Lottery Tickets \| ([^|]+)",
        "deadlines": [r"(?P<name>Loyalty Bonus|Fall Bonus|Christmas Bonus|Early Bird|Final Sales) Cutoff is Midnight, {W}{D}"],
        "licence": r"BC Gaming Event Licence #(\d+)",
    },
    "pne-prize-home-lottery": {
        "cap": r"Only ([\d,]+) tickets will be printed during the Lottery period",
        "value": r"The total fair market value of all the prizes is \$([\d,]+)",
        "deadlines": [r"(?P<name>Final) sales will be cutoff at midnight on {D}"],
        "grand": r"final Grand Prize Draw held between [^|]{0,30}? on {D}",
        "licence": r"BC Gaming Event Licence # ?(\d+)",
    },
    "spruce-kings-show-home-lottery": {
        "cap": r"Odds of winning the Show Home Lottery House are 1 in ([\d,]+) \(total tickets available for sale\)",
        "tiers": r"(\d[\d,]* tickets are available at a price of \$125 per ticket\.\s*\|\s*[\d,]+ tickets are available at a price of \d+ for \$\d+)",
        "deadlines": [r"(?P<name>Early Bird Prize #\d|Grand Prize|Final Draw|[A-Z][A-Za-z ]{2,30}) \| Ticket sales close {W}{D}[^|]{0,30}?Draw {W}{D}"],
        "licence": r"BC Gaming Event Licence #(\d+)",
    },
    "hsc-millionaire-lottery": {
        "cap": r"Only ([\d,]+) tickets will be sold",
        "value": r"The total retail value of prizes is \$([\d,]+\.\d{2})",
        "tiers": MB_TIERS,
        "deadlines": MB_DEADLINES,
        "grand": MB_GRAND,
        "licence": r"License Numbers: LGCA ([\d-]+RF-\d+)",
    },
    "st-boniface-mega-million-choices": {
        "cap": r"Only ([\d,]+) tickets will be sold",
        "value": r"Total retail value of prizes is \$([\d,]+\.\d{2})",
        "deadlines": MB_DEADLINES,
        "grand": MB_GRAND,
        "licence": r"License Numbers: LGCA ([\d-]+RF-\d+)",
    },
    "tri-hospital-dream-lottery": {
        "cap": r"Only ([\d,]+) tickets will be sold",
        "value": r"Total retail value of prizes is \$([\d,]+\.\d{2})",
        "deadlines": MB_DEADLINES,
        "grand": MB_GRAND,
        "licence": r"License Numbers: #LGCA ([\d-]+RF-\d+)",
    },
    "cheo-dream-of-a-lifetime": {
        "cap": r"\(a\) ([\d,]+) Lottery Tickets available for purchase",
        "deadlines": [r"The purchase deadline for the (?P<name>first|second|third|fourth|fifth) lottery Draw \(the “ \w+ Draw ”\) is {W}{D}"],
        "draws": {"first": r"The First Draw will be held on {W}{D}", "second": r"The Second Draw will be held on {W}{D}",
                  "third": r"The Third Draw will be held on {W}{D}", "fourth": r"The Fourth Draw will be held on {W}{D}",
                  "fifth": r"The Fifth Draw will be held on {W}{D}"},
        "grand": r"The Final Draw will be held on {W}{D}",
        "licence": r"Lottery License No\.: (RAF\d+)",
        "close_is_last": True,
    },
    "grande-prairie-rotary-dream-home": {
        "prizes": r"There are (\d+) prizes in total",
        "grand": r"The final draw will be held on {W}{D}",
    },
    "heart-and-stroke-lottery": {
        "cap": r"There are ([\d,]+) tickets printed \(",
        "tiers": r"Tickets are (\$100 individually[^)]*)",
        "prizes": r"There are ([\d,]+) prizes to be won, for a total value of \$([\d,]+\.\d{2})",
        "deadlines": [r"(?P<name>Loyalty|VIP|Holiday Bonus|Super Bonus|Early Bird|Final) Ticket Sales Deadline: \| Midnight, {D}"],
        "grand": r"qualify for the Final Prize Draw \([\d,]+ prizes\)\. The draws will take place on {D}",
        "licence": r"Classic Lottery Licence #: (RAF\d+)",
    },
    "sickkids-lottery": {
        "cap": r"Only ([\d,]+) tickets will be available\.",
        "prizes": r"There are ([\d,]+) prizes, with a total value of \$([\d,]+\.\d{2})",
        "tiers": r"(Ticket prices are \$100 each with ticket bundles as follows:[^|]*)",
        "deadlines": [
            r"DRAWFIRST:The (?P<name>VIP|Super Early Bonus|Early Bonus|Early Bird) Prize draws? will be conducted at 10:00 a\.m\. on {D}[^|]{0,200}?To be eligible, tickets must be (?:ordered|purchased) by midnight, {D}",
            r"To be eligible for the (?P<name>Final) and Grand Prize draws, tickets must be purchased by midnight, {D}",
        ],
        "grand": r"The Final and Grand Prize draws will be conducted at 10:00 a\.m\. on {D}",
        "licence": r"(RAF\d{7})",
    },
    "riders-childrens-hospital-lottery": {
        "cap": r"Only ([\d,]+) Main Lottery tickets will be sold",
        "prizes": r"([\d,]+) prizes will be awarded",
        "value": r"Total value of all prizes is \$([\d,]+\.\d{2})",
        "tiers": r"Main Lottery are (\$\d+ each[^.|]*)",
        "deadlines": [r"(?P<name>VIP|Bonus|Early Bird|Final) Ticket Sales Deadline: Midnight, {D}"],
        "licence": r"Lottery Licence #(LR[\d-]+)",
    },
}

_WORD = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
         "twelve": 12, "fifteen": 15, "twenty": 20, "fifty": 50}


def parse_tiers(s: str) -> list[dict]:
    """Ticket packages from a tier sentence: '$100 each', 'Single ticket is $110',
    '3-Pack for $250', '3 for $110', 'packages of three tickets available for $275',
    '3-Pack price is $220'. Named packs without a count ('Mega Pack') are skipped."""
    tiers: dict[int, float] = {}
    m = (re.search(r"(?:^|\W)\$(\d+(?:\.\d{2})?) (?:each|individually|per ticket)", s)
         or re.search(r"[Ss]ingle tickets? (?:is|are available for) \$(\d+)", s))
    if m:
        tiers[1] = float(m.group(1))
    for m in re.finditer(r"\b(\d{1,3})\s*-?\s*[Pp]ack\W*(?:for|price is)\s*\$(\d+(?:\.\d{2})?)", s):
        tiers.setdefault(int(m.group(1)), float(m.group(2)))
    for m in re.finditer(r"\$(\d+(?:\.\d{2})?) for a (\d{1,3})-[Pp]ack", s):
        tiers.setdefault(int(m.group(2)), float(m.group(1)))
    for m in re.finditer(r"\w+ \((\d{1,3})\) for \$(\d+(?:\.\d{2})?)", s):
        tiers.setdefault(int(m.group(1)), float(m.group(2)))
    for m in re.finditer(r"\b(\d{1,3}) for \$(\d+(?:\.\d{2})?)", s):
        tiers.setdefault(int(m.group(1)), float(m.group(2)))
    for m in re.finditer(r"packages of (\w+) tickets (?:are )?available for \$(\d+)", s):
        q = _WORD.get(m.group(1).lower()) or (int(m.group(1)) if m.group(1).isdigit() else None)
        if q:
            tiers.setdefault(q, float(m.group(2)))
    return [{"tickets": q, "price": p} for q, p in sorted(tiers.items())]


def _date(g: tuple) -> str | None:
    return parse_date(*g) if all(g) else None


def extract(lot_id: str, t: str, province: str) -> tuple[dict, list[str]]:
    """Facts for one lottery from its rules text, plus the list of spec
    fields that didn't match (for the drift report)."""
    spec = SPECS.get(lot_id, {})
    out: dict = {"quotes": {}}
    missing: list[str] = []

    def find(key):
        pat = spec.get(key)
        if not pat:
            return None
        m = _p(pat).search(t)
        if not m:
            missing.append(key)
        return m

    if m := find("cap"):
        out["ticket_cap"] = int(m.group(1).replace(",", ""))
        out["quotes"]["ticket_cap"] = m.group(0)
    if m := find("prizes"):
        out["prize_count"] = int(m.group(1).replace(",", ""))
        out["quotes"]["prize_count"] = m.group(0)
        if m.lastindex and m.lastindex >= 2:
            out["prize_value"] = num(m.group(2))
            out["quotes"]["prize_value"] = m.group(0)
    if m := find("value"):
        out["prize_value"] = num(m.group(1))
        out["quotes"]["prize_value"] = m.group(0)
    if m := find("tiers"):
        tiers = parse_tiers(m.group(1))
        if tiers:
            out["price_tiers"] = tiers
            out["quotes"]["price_tiers"] = m.group(0)[:400]
    if m := find("licence"):
        out["licence_no"] = m.group(1).strip()

    deadlines: dict[str, dict] = {}
    for pat in spec.get("deadlines", []):
        draw_first = pat.startswith("DRAWFIRST:")
        pat = pat.removeprefix("DRAWFIRST:")
        for m in _p(pat).finditer(t):
            name = (m.groupdict().get("name") or spec.get("final_name") or "Final").strip()
            name = name[:1].upper() + name[1:]
            # groups after the name come in (mon, day, year) triples
            tri = [tuple(m.groups()[i:i + 3]) for i in range(1 if "name" in m.groupdict() else 0, len(m.groups()), 3)]
            if draw_first and len(tri) > 1:
                tri = [tri[1], tri[0]]
            cut = _date(tri[0]) if tri else None
            drw = _date(tri[1]) if len(tri) > 1 else None
            if cut and name.lower() not in deadlines:
                deadlines[name.lower()] = {"name": name, "date": cut, "draw_date": drw, "quote": m.group(0)[:300]}
    for name, pat in (spec.get("draws") or {}).items():
        m = _p(pat).search(t)
        if m and name.lower() in deadlines and not deadlines[name.lower()]["draw_date"]:
            deadlines[name.lower()]["draw_date"] = _date(m.groups()[-3:])
        elif not m:
            missing.append(f"draw:{name}")
    if spec.get("deadlines") and not deadlines:
        missing.append("deadlines")
    dl = sorted(deadlines.values(), key=lambda x: x["date"])
    for x in dl:
        x["cutoff"] = end_of_day(x["date"], province)
    out["deadlines"] = dl
    if m := find("grand"):
        out["grand_draw"] = _date(m.groups()[-3:])

    # Verbatim: published odds and draw-eligibility sentences.
    out["odds"] = verbatim(t, r"(?:[Oo]dds|[Cc]hances) (?:of winning )?(?:[^.|]{0,80}?)(?:are|is) 1 (?:in|to) [\d,]+[^.|]{0,140}")
    out["eligibility"] = verbatim(t, r"(?<=[.|•] )[^.|•]*?\beligible for (?:all |a total of |the remaining (?:total of )?|each of the remaining )?[\d,]+ (?:prize )?(?:draws|prizes)")
    return out, missing


def verbatim(t: str, pat: str) -> list[str]:
    seen: list[str] = []
    for m in re.finditer(pat, t):
        s = m.group(0).strip(" |•")
        if not re.search(r"50/50|Add-On|Calendar|Weekday|Big Score|Extra Cash", s) and s not in seen:
            seen.append(s)
    return seen[:8]
