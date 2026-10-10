"""Shared fetch + text helpers and the rules-page fact parser.

Honesty (CLAUDE.md): every figure a parser returns is one the lottery printed
on its own page. Each comes with the sentence it was read from (`quotes`),
stored in charity_editions.raw so any number on the site can be traced back.
A figure that isn't matched is left None — never estimated.
"""
from __future__ import annotations

import html as htmlmod
import json
import re
import ssl
import time
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36")

PROVINCE_TZ = {
    "ON": "America/Toronto", "QC": "America/Toronto", "BC": "America/Vancouver", "AB": "America/Edmonton",
    "SK": "America/Regina", "MB": "America/Winnipeg", "NS": "America/Halifax", "NB": "America/Moncton",
    "PE": "America/Halifax", "NL": "America/St_Johns", "YT": "America/Whitehorse", "NT": "America/Yellowknife",
    "NU": "America/Iqaluit",
}


def _ctx() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        return ssl.create_default_context()


def fetch(url: str, headers: dict | None = None, timeout: int = 30, retries: int = 2) -> str:
    last: Exception | None = None
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-CA,en;q=0.9",
                                                       **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout, context=_ctx()) as r:
                raw = r.read()
                enc = r.headers.get_content_charset() or "utf-8"
                return raw.decode(enc, errors="replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"fetch {url}: {last}")


def fetch_json(url: str, headers: dict | None = None, timeout: int = 30):
    return json.loads(fetch(url, {"Accept": "application/json", **(headers or {})}, timeout))


def text_of(page_html: str) -> str:
    """Visible text, one space between tokens, block breaks kept as ' | '."""
    t = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", page_html)
    t = re.sub(r"(?i)<br\s*/?>|</(p|li|h\d|div|tr|td|th|section)>", " | ", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = htmlmod.unescape(t).replace("\xa0", " ")
    t = re.sub(r"[ \t\r\n]+", " ", t)
    return re.sub(r"(\s*\|\s*)+", " | ", t).strip()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def num(s: str | None) -> float | None:
    if s is None:
        return None
    s = s.replace(",", "").replace("$", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
     "november", "december"], 1)}
MON_RE = r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?"
DATE_RE = MON_RE + r"\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})"


def parse_date(mon: str, day: str, year: str) -> str | None:
    m = mon.lower().rstrip(".")
    for name, i in MONTHS.items():
        if name.startswith(m[:3]):
            return f"{int(year):04d}-{i:02d}-{int(day):02d}"
    return None


def end_of_day(date: str, province: str, time_: str = "23:59") -> str:
    """A published 'Midnight, <date>' deadline as an ISO instant in the
    lottery's own province time."""
    tz = ZoneInfo(PROVINCE_TZ.get(province, "America/Toronto"))
    d = datetime.fromisoformat(f"{date}T{time_}:00").replace(tzinfo=tz)
    return d.isoformat()


# --------------------------------------------------------------- rules facts

_WORDNUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
            "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "twenty-five": 25, "thirty": 30,
            "fifty": 50, "hundred": 100}


def _qty(s: str) -> int | None:
    s = s.lower().strip()
    if s.isdigit():
        return int(s)
    return _WORDNUM.get(s)


def sentence(t: str, start: int, end: int) -> str:
    a = max(t.rfind(". ", 0, start), t.rfind(" | ", 0, start))
    b_candidates = [x for x in (t.find(". ", end), t.find(" | ", end)) if x != -1]
    b = min(b_candidates) if b_candidates else len(t)
    return t[a + 2 if a != -1 else 0:b + 1].strip(" |")


ADDON_HEAD = re.compile(r"50/50|Add-On|Add On|Daily Cash|Cash Calendar|Calendar|Weekday Winnings|Wanderlust|Lucky|"
                        r"Bonus Pack|Pick to Win|Progressive|Moitié|Catch the Ace|Chase the Ace", re.I)
MAIN_HEAD = re.compile(r"Home Lottery|Main (?:Lottery|Ticket)|Dream (?:Home|Lottery)|Millionaire Lottery|Classic Lottery|"
                       r"Grand Prize|Prize Home|Show Home|Showhome", re.I)


def main_text(t: str) -> str:
    """The rules text minus add-on sections (50/50, calendars, ...): a short
    heading-like segment naming an add-on starts an add-on section, one
    naming the main lottery ends it."""
    out, addon = [], False
    for seg in t.split(" | "):
        head = len(seg) < 90 and not re.search(r"\.\s", seg)
        if head and ADDON_HEAD.search(seg) and not MAIN_HEAD.search(seg):
            addon = True
        elif head and MAIN_HEAD.search(seg) and not ADDON_HEAD.search(seg):
            addon = False
        if not addon:
            out.append(seg)
    return " | ".join(out)


def rules_facts(t: str, province: str, main_label: str = "") -> dict:
    t = main_text(t)
    """Facts from a home lottery's rules text (the main lottery only — the
    first match, which on these pages is the main lottery's section, unless
    an add-on is named in the same sentence)."""
    out: dict = {"quotes": {}}
    addon = re.compile(r"50/50|Add-On|Calendar|Weekday|Daily Cash|Wanderlust|Cash Calendar|Lucky|Bonus Pack", re.I)

    # Ticket cap.
    cap_pats = [
        r"(?:There are|Only|A maximum of|a total of|maximum of)\s+([\d,]{4,})\s+(?:total\s+)?(?:[A-Z][\w'’ -]{0,40}?\s)?tickets?",
        r"([\d,]{4,})\s+(?:total\s+)?(?:[A-Z][\w'’ -]{0,40}?\s)?tickets?\s+(?:are|will be)\s+(?:available|sold|printed|to be sold)",
        r"tickets printed[^.|]{0,40}?([\d,]{4,})",
    ]
    for p in cap_pats:
        for m in re.finditer(p, t):
            s = sentence(t, m.start(), m.end())
            if addon.search(s):
                continue
            out["ticket_cap"] = int(m.group(1).replace(",", ""))
            out["quotes"]["ticket_cap"] = s
            break
        if "ticket_cap" in out:
            break

    # Prize count and total value.
    for m in re.finditer(r"(\d[\d,]*)\s+(?:total\s+)?(?:[\w-]+\s+){0,3}prizes?\b", t):
        s = sentence(t, m.start(), m.end())
        if addon.search(s) or int(m.group(1).replace(",", "")) < 2:
            continue
        if not re.search(r"award|in all|available|to be won|total|win", s, re.I):
            continue
        out["prize_count"] = int(m.group(1).replace(",", ""))
        out["quotes"]["prize_count"] = s
        v = re.search(r"\$\s?(\d[\d,]*(?:\.\d{2})?)(?![\d.,]*\s*(?:[Mm]illion|M\b))", s[s.find(m.group(0)):])
        if v and num(v.group(1)) and num(v.group(1)) >= 10000:
            out["prize_value"] = num(v.group(1))
            out["quotes"]["prize_value"] = s
        break
    if "prize_value" not in out:
        m = re.search(r"(?:total|retail|combined)\s+(?:retail\s+)?value of (?:all )?(?:the )?prizes[^$|]{0,60}\$\s?(\d[\d,]*(?:\.\d{2})?)(?![\d.,]*\s*[Mm]illion)", t, re.I)
        if m and (num(m.group(1)) or 0) >= 10000:
            s = sentence(t, m.start(), m.end())
            if not addon.search(s):
                out["prize_value"] = num(m.group(1))
                out["quotes"]["prize_value"] = s

    # Price tiers.
    tiers: dict[int, float] = {}
    tier_quotes = []
    for m in re.finditer(r"(?:[Ss]ingle tickets?|1 ticket)\s+(?:are available\s+)?(?:for|at|:)?\s*\$\s?(\d+(?:\.\d{2})?)", t):
        s = sentence(t, m.start(), m.end())
        if addon.search(s):
            continue
        tiers.setdefault(1, float(m.group(1)))
        tier_quotes.append(s)
        for p in re.finditer(r"(?:packages?|packs?) of (\w+(?:-\w+)?) tickets?\s+(?:are\s+)?(?:available\s+)?(?:for|at)\s+\$\s?(\d+(?:\.\d{2})?)", s):
            q = _qty(p.group(1))
            if q:
                tiers.setdefault(q, float(p.group(2)))
        break
    for m in re.finditer(r"\b(\d{1,3})\s*(?:tickets\s*)?(?:for|/)\s*\$\s?(\d{2,4})(?:\.00)?\b", t):
        s = sentence(t, m.start(), m.end())
        if addon.search(s):
            continue
        q, price = int(m.group(1)), float(m.group(2))
        if 1 <= q <= 200 and price >= 5:
            tiers.setdefault(q, price)
            tier_quotes.append(s)
    if tiers:
        out["price_tiers"] = [{"tickets": q, "price": p} for q, p in sorted(tiers.items())]
        out["quotes"]["price_tiers"] = " … ".join(dict.fromkeys(tier_quotes))[:600]

    # Deadlines and draws. Three phrasings seen on these sites:
    #   "Early Bird Prize Deadline: Midnight, October 16, 2026" (+ "Early Bird Prize Draw Date: October 27, 2026")
    #   "Tickets sold by the VIP Prize sales deadline: All tickets sold by midnight, September 18, 2026, will be eligible for the VIP draw on September 29, 2026"
    #   "The Fall Bonus cutoff date for main ticket sales will be Friday, October 2, 2026 at Midnight. The Fall Bonus draw will be held on Wednesday, October 14, 2026"
    D = MON_RE + r"\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})"
    NAME = r"((?:#?\d+|[A-Z][A-Za-z'’]*)(?:\s+(?:#?\d+|[A-Z][A-Za-z'’]*|&)){0,4})"
    WD = r"(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\s+)?"
    found: dict[str, dict] = {}

    def clean(n: str) -> str:
        toks = n.split()
        while toks and toks[0] in ("The", "All", "Tickets", "Ticket", "By", "And", "Main"):
            toks.pop(0)
        while toks and toks[-1] in ("Prize", "Prizes", "Ticket", "Sales", "Main", "Lottery"):
            toks.pop()
        return " ".join(toks)

    def add(name: str, cut: str | None, draw: str | None, q: str):
        name = clean(name)
        if not name or addon.search(name) or len(name) > 40:
            return
        k = name.lower()
        cur = found.setdefault(k, {"name": name, "date": None, "draw_date": None, "quote": q})
        cur["date"] = cur["date"] or cut
        cur["draw_date"] = cur["draw_date"] or draw

    for m in re.finditer(NAME + r"\s+(?:[Pp]rize\s+)?(?:[Tt]icket\s+)?(?:[Ss]ales\s+)?[Dd]eadline\W{0,4}(?:\|\s*)?(?:[Mm]idnight\s*,?\s*)?(?:\|\s*)?" + WD + D, t):
        add(m.group(1), parse_date(m.group(2), m.group(3), m.group(4)), None, sentence(t, m.start(), m.end()))
    for m in re.finditer(r"by the " + NAME + r"\s+(?:[Pp]rize\s+)?sales deadline: All tickets sold by midnight,?\s*" + D + r"\s*,?\s*will be eligible for the [^|]{0,60}?draw on\s+" + D, t):
        add(m.group(1), parse_date(m.group(2), m.group(3), m.group(4)), parse_date(m.group(5), m.group(6), m.group(7)),
            sentence(t, m.start(), m.end()))
    for m in re.finditer(r"The " + NAME + r" cutoff date for (?:main )?ticket sales will be\s+" + WD + D, t):
        name = m.group(1)
        dm = re.search(r"The " + re.escape(name) + r" draws? will be held on\s+" + WD + D, t[m.end():m.end() + 400])
        add(name, parse_date(m.group(2), m.group(3), m.group(4)),
            parse_date(dm.group(1), dm.group(2), dm.group(3)) if dm else None, sentence(t, m.start(), m.end()))
    for m in re.finditer(NAME + r"\s+(?:[Pp]rize\s+)?Draws?(?:\s+Date)?(?:\s*\([^)]{0,20}\))?\s*:?\s*(?:\|\s*)?" + WD + D, t):
        k = clean(m.group(1)).lower()
        d = parse_date(m.group(2), m.group(3), m.group(4))
        if k in found and not found[k]["draw_date"]:
            found[k]["draw_date"] = d
        elif k == "final" and "final ticket" in found and not found["final ticket"]["draw_date"]:
            found["final ticket"]["draw_date"] = d
    deadlines = [
        {"name": v["name"], "cutoff": end_of_day(v["date"], province), "date": v["date"], "draw_date": v["draw_date"],
         "quote": v["quote"]}
        for v in found.values() if v["date"]
    ]
    if deadlines:
        deadlines.sort(key=lambda x: x["cutoff"])
        out["deadlines"] = deadlines

    # Published draw eligibility per deadline ("eligible for all 512 draws" ...).
    elig = []
    for m in re.finditer(r"([^.|]{0,160}?)eligible for (?:all |the remaining |all of the )?([\d,]+) (?:draws|prizes)", t):
        elig.append({"text": sentence(t, m.start(), m.end()), "draws": int(m.group(2).replace(",", ""))})
    if elig:
        out["eligibility"] = elig

    # Published odds statements, verbatim.
    odds = []
    for m in re.finditer(r"(?:[Oo]dds|[Cc]hances?)\s+(?:of winning\s+)?[^.|]{0,200}?\b1\s+(?:in|to|:)\s+[\d,]+[^.|]{0,160}", t):
        s = sentence(t, m.start(), m.end())
        if s not in odds:
            odds.append(s)
    if odds:
        out["odds"] = [{"label": "Published odds", "text": s[:400]} for s in odds[:6]]

    # Licence.
    m = re.search(r"(?:[Ll]icen[cs]e|LGCA|AGCO|Lottery Licence)\s*(?:[Nn]umber|No\.?|#)?\s*:?\s*#?\s*((?:RAF|LR|AGD-|LGCA\s|LCGA\s)?[\dA-Z][\dA-Z -]{3,24}\d)", t)
    if m:
        out["licence_no"] = m.group(1).strip()
    return out
