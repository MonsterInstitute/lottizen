"""outreach_common.py — shared plumbing for outreach_radar.py and press_radar.py.

Both scripts find things and prepare material; a human does the engaging.
Everything here is about getting the facts right before anything reaches
that human's inbox:

  * Figures come from data/*.json — the same site JSON the Vercel build reads
    (the workflows prefetch it from Supabase's site_json first). A number in
    an outreach email therefore matches the page it links to.
  * Every draft passes the CLAUDE.md honesty rules: no strategy improves the
    odds; scratch figures describe unclaimed prize money, not odds; number
    frequencies are history. check_honesty() is a last-line regex guard, not
    the main control — the main control is that drafts are built only from
    the facts handed to them.
  * Unclaimed-prize lists are scraped from the two agencies that publish one
    as an HTML table (OLG, WCLC). Each list carries the agency's own "as of"
    date, and every pitch repeats it: a prize on a two-month-old list may
    already have been claimed.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import tomllib
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
from game_meta import CURRENCY_SYMBOL, GAME_META  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CONFIG_PATH = ROOT / "config" / "outreach.toml"
SITE_URL = "https://lottizen.com"
TORONTO = ZoneInfo("America/Toronto")

# A browser UA for news sites and agency pages (several 403 anything else);
# an honest bot UA for APIs that ask for one (Reddit, HN, X).
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BOT_UA = "lottizen-outreach-radar/1.0 (+https://lottizen.com/press)"


def load_config() -> dict:
    with open(CONFIG_PATH, "rb") as f:
        return tomllib.load(f)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_toronto() -> date:
    return datetime.now(TORONTO).date()


# ------------------------------------------------------------------ HTTP

def http_get(url: str, *, headers: dict | None = None, timeout: int = 20, browser: bool = False) -> str:
    h = {"User-Agent": BROWSER_UA if browser else BOT_UA, "Accept-Language": "en-CA,en;q=0.8"}
    h.update(headers or {})
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
        return r.read(2_000_000).decode(r.headers.get_content_charset() or "utf-8", errors="replace")


def http_json(url: str, **kw) -> dict:
    return json.loads(http_get(url, **kw))


def strip_tags(s: str) -> str:
    s = re.sub(r"<(script|style)\b.*?</\1>", " ", s or "", flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def clip(s: str, n: int) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


# ------------------------------------------------------------------ site data

def _json(rel: str) -> dict | None:
    p = DATA / rel
    return json.loads(p.read_text()) if p.exists() else None


def latest_draws() -> list[dict]:
    return (_json("draws/_latest.json") or {}).get("games", [])


def money(amount: float, currency: str = "CAD", compact: bool = False) -> str:
    sym = CURRENCY_SYMBOL.get(currency, "$")
    if compact and amount >= 1_000_000:
        v = amount / 1_000_000
        return f"{sym}{v:.0f}M" if v == int(v) or v >= 10 else f"{sym}{v:.1f}M"
    return f"{sym}{amount:,.0f}"


def url(path: str) -> str:
    return SITE_URL + path


COUNTRY_SLUG = {"CA": "canada", "US": "usa", "EU": "europe"}

PROVINCE_LABEL = {
    "ontario": "Ontario (OLG)", "british-columbia": "British Columbia (BCLC)", "quebec": "Quebec (Loto-Québec)",
    "western": "Alberta, Saskatchewan and Manitoba (WCLC)", "atlantic": "Atlantic Canada (ALC)",
}
# Subreddit and text cues for which province a scratch question is about.
PROVINCE_CUES = [
    ("british-columbia", ["vancouver", "bclc", "british columbia", " b.c.", " bc "]),
    ("western", ["alberta", "saskatchewan", "manitoba", "calgary", "edmonton", "regina", "saskatoon", "winnipeg", "wclc"]),
    ("atlantic", ["newbrunswick", "new brunswick", "nova scotia", "halifax", "pei", "newfoundland", "atlantic lottery", "alc"]),
    ("quebec", ["quebec", "québec", "montreal", "montréal", "loto-qu"]),
    ("ontario", ["ontario", "toronto", "ottawa", "olg"]),
]


def detect_province(text: str) -> str | None:
    t = f" {text.lower()} "
    for slug, cues in PROVINCE_CUES:
        if any(c in t for c in cues):
            return slug
    return None


def scratch_top(province: str, n: int = 3) -> list[dict]:
    r = _json(f"rankings/{province}.json")
    if not r:
        return []
    out = []
    for g in r["games"][:n]:
        label = re.sub(r"\.00\b", "", g["topPrizeLabel"])
        if g["scoringMethod"] == "remaining_value_index":  # WCLC: no printed counts exist
            left = f"{g['topPrizesRemaining']:,} top prizes ({label}) left"
        else:
            left = f"{g['topPrizesRemaining']} of {g['topPrizesTotal']} top prizes ({label}) left"
        out.append({"name": g["name"], "price": g["price"], "left": left,
                    "url": url(f"/scratch/{province}/{g['slug']}"), "asOf": r["generatedAt"][:10]})
    return out


def number_extremes(slug: str) -> dict | None:
    """Most/least drawn numbers in the game's current-rules era, excluding
    numbers that joined the pool partway (Lotto Max 51/52) — same rule as
    lib/almanac.ts's drawGameFacts()."""
    s = _json(f"stats/{slug}.json")
    if not s or not s.get("aggregate"):
        return None
    added = set((s.get("poolAdded") or {}).get("numbers", []))
    chart = [x for x in s["aggregate"]["frequencyChart"] if x["n"] not in added]
    if not chart:
        return None
    hi, lo = max(x["count"] for x in chart), min(x["count"] for x in chart)
    return {
        "draws": s["drawCount"], "since": s.get("statsFrom") or s.get("dataSince"),
        "most": sorted(x["n"] for x in chart if x["count"] == hi), "most_count": hi,
        "least": sorted(x["n"] for x in chart if x["count"] == lo), "least_count": lo,
    }


def detect_game(text: str) -> str:
    t = text.lower()
    for slug, cues in [("lotto-6-49", ["6/49", "649", "6-49"]), ("daily-grand", ["daily grand"]),
                       ("powerball", ["powerball"]), ("mega-millions", ["mega millions"]),
                       ("euromillions", ["euromillions"]), ("lotto-max", ["lotto max", "max millions"])]:
        if any(c in t for c in cues):
            return slug
    return "lotto-max"


def game_url(slug: str, sub: str = "") -> str:
    meta = GAME_META.get(slug, {})
    return url(f"/{COUNTRY_SLUG.get(meta.get('country', 'CA'), 'canada')}/{slug}{sub}")


def facts_for(keys: list[str], text: str, community: str = "") -> list[dict]:
    """Concrete, current figures that answer a topic, each with the page that
    shows it. Empty list when we have nothing honest to add."""
    out: list[dict] = []
    for key in keys:
        if key == "claim_deadlines":
            out.append({"label": "Claim window, Canadian draw games",
                        "value": "One year from the draw date at OLG, WCLC, ALC and Loto-Québec; 52 weeks at BCLC. "
                                 "Scratch tickets: the expiry printed on the ticket.",
                        "url": url("/data/canada-lottery-almanac")})
        elif key == "unclaimed_list":
            today = today_toronto().isoformat()
            prizes = [p for p in unclaimed_prizes() if p["amount"] >= 1_000_000 and p["expires"] >= today]
            for p in sorted(prizes, key=lambda p: p["expires"])[:3]:
                out.append({"label": f"Unclaimed: {p['game']} {p['draw_date']} ({p['location']}, {p['agency']})",
                            "value": f"{money(p['amount'])}, claim window ends about {p['expires']} "
                                     f"(agency list as of {p['list_as_of']})",
                            "url": p["source_url"]})
        elif key == "scratch_top":
            prov = detect_province(f"{community} {text}") or "ontario"
            top = scratch_top(prov)
            if top:
                lines = "; ".join(f"{g['name']} (${g['price']:.0f}): {g['left']}" for g in top)
                out.append({"label": f"{PROVINCE_LABEL[prov]} scratch tickets, top 3 of our remaining-prize ranking, {top[0]['asOf']}",
                            "value": lines + ". Describes unclaimed prizes, not the odds of a ticket winning.",
                            "url": url(f"/scratch/{prov}")})
        elif key == "number_frequency":
            slug = detect_game(text)
            x = number_extremes(slug)
            if x:
                name = GAME_META[slug]["name"]
                out.append({"label": f"{name} number history since {x['since']}",
                            "value": f"Across {x['draws']:,} draws, most drawn: {', '.join(map(str, x['most']))} "
                                     f"({x['most_count']} times); least drawn: {', '.join(map(str, x['least']))} "
                                     f"({x['least_count']} times). Past counts; every number has the same chance next draw.",
                            "url": game_url(slug, "/statistics")})
        elif key == "jackpot":
            slug = detect_game(text)
            l = next((g for g in latest_draws() if g["slug"] == slug), None)
            # A stored estimate for a draw that already happened is stale, not news.
            if l and l.get("nextJackpot") and (l.get("nextDraw") or "") >= today_toronto().isoformat():
                cur = GAME_META[slug]["currency"]
                out.append({"label": f"{GAME_META[slug]['name']} next draw",
                            "value": f"{l['nextDraw']}: estimated jackpot {money(l['nextJackpot'], cur, compact=True)}",
                            "url": game_url(slug)})
        elif key == "api":
            out.append({"label": "Lottizen data access",
                        "value": "REST API (OpenAPI spec at /openapi.yaml) for draw history, number stats and Canadian "
                                 "scratch-ticket remaining prizes; free iframe widgets at /embed.",
                        "url": url("/api")})
    return out


# ------------------------------------------------------------------ unclaimed prizes

OLG_UNCLAIMED_URL = "https://about.olg.ca/winners-and-players/ticket-information/unclaimed-tickets/"
WCLC_UNCLAIMED_URL = "https://www.wclc.com/for-players/unclaimed-prizes-1.htm"


def _one_year_after(d: date) -> date:
    try:
        return d.replace(year=d.year + 1)
    except ValueError:  # Feb 29
        return d.replace(year=d.year + 1, day=28)


def _amount(s: str) -> float:
    return float(re.sub(r"[^\d.]", "", s) or 0)


def _cells(row_html: str) -> list[str]:
    return [strip_tags(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, flags=re.S)]


def scrape_olg_unclaimed() -> list[dict]:
    page = http_get(OLG_UNCLAIMED_URL, browser=True)
    m = re.search(r"Last Update:\s*([A-Za-z]+ \d{1,2}, \d{4})\.\s*Unclaimed tickets as of ([A-Za-z]+ \d{1,2}, \d{4})", strip_tags(page))
    as_of = (f"{m.group(2)} (page updated {m.group(1)})" if m else "date not stated")
    out = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.S):
        c = _cells(row)
        if len(c) < 4 or c[0] == "Location":
            continue
        try:
            drawn = datetime.strptime(c[2], "%d-%b-%y").date()
        except ValueError:
            continue
        out.append({"agency": "OLG", "location": c[0].title().replace("Norhtern", "Northern"),
                    "game": c[1].title(), "draw_date": drawn.isoformat(),
                    "amount": _amount(c[3]), "expires": _one_year_after(drawn).isoformat(),
                    "list_as_of": as_of, "source_url": OLG_UNCLAIMED_URL})
    return out


def scrape_wclc_unclaimed() -> list[dict]:
    page = http_get(WCLC_UNCLAIMED_URL, browser=True)
    m = re.search(r"Last updated on ([A-Za-z]+ \d{1,2}, \d{4})", strip_tags(page))
    as_of = m.group(1) if m else "date not stated"
    out = []
    for region, body in re.findall(r'<table summary="([^"]+) Unclaimed Prizes".*?>(.*?)</table>', page, flags=re.S):
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", body, flags=re.S):
            c = _cells(row)
            if len(c) < 4 or c[0] == "Location":
                continue
            try:
                drawn = datetime.strptime(c[2], "%B %d, %Y").date()
            except ValueError:
                continue
            out.append({"agency": "WCLC", "location": f"{c[0]}, {region}" if c[0] != region else region,
                        "game": c[1].title(), "draw_date": drawn.isoformat(), "amount": _amount(c[3]),
                        "expires": _one_year_after(drawn).isoformat(), "list_as_of": as_of,
                        "source_url": WCLC_UNCLAIMED_URL})
    return out


_UNCLAIMED_CACHE: list[dict] | None = None


def unclaimed_prizes(sources=("OLG", "WCLC", "manual")) -> list[dict]:
    """Every listed unclaimed prize we can see. A scraper that fails logs and
    contributes nothing; it never invents rows."""
    global _UNCLAIMED_CACHE
    if _UNCLAIMED_CACHE is None:
        rows: list[dict] = []
        for name, fn in (("OLG", scrape_olg_unclaimed), ("WCLC", scrape_wclc_unclaimed)):
            try:
                got = fn()
                print(f"  unclaimed: {name} {len(got)} rows")
                rows += got
            except Exception as e:  # noqa: BLE001
                print(f"  [warn] unclaimed: {name} scrape failed: {type(e).__name__}: {e}")
        for m in load_config().get("press", {}).get("manual_unclaimed", []):
            rows.append({"agency": m["agency"], "location": m.get("location", ""), "game": m["game"],
                         "draw_date": m["draw_date"], "amount": float(m["amount"]), "expires": m["expires"],
                         "list_as_of": "added by hand from " + m.get("source_url", "a news report"),
                         "source_url": m.get("source_url", ""), "manual": True})
        _UNCLAIMED_CACHE = rows
    return [r for r in _UNCLAIMED_CACHE if (r.get("manual") and "manual" in sources) or r["agency"] in sources]


# ------------------------------------------------------------------ honesty guard

BANNED = [
    r"better odds", r"improv\w* (your|the)? ?(odds|chances?)", r"increas\w* (your|the)? ?(odds|chances?)",
    r"win more often", r"smarter picks", r"boost (your|the)? ?(odds|chances?)", r"more likely to (win|hit|be drawn|come up)",
    r"(due|overdue) to (hit|come up|be drawn)", r"tickets? (remain|left) to (buy|be sold)", r"\d[\d,]* tickets (remain|left)",
]


def check_honesty(text: str) -> list[str]:
    return [p for p in BANNED if re.search(p, text or "", flags=re.I)]


# ------------------------------------------------------------------ Claude drafting

DRAFT_SYSTEM = """You draft replies that the founder of Lottizen (lottizen.com, a free site that compiles Canadian, US and European lottery results, number history and Canadian scratch-ticket remaining-prize data) will read, edit and post by hand.

Rules, in priority order:
1. Answer the person's actual question or add something useful to the discussion first, in plain words, as a knowledgeable person would. If the right answer is "check with the lottery corporation" or "set a budget", say that.
2. Use only the figures given in FACTS. Never invent a number, date or statistic. If no fact helps, write a genuinely helpful reply with no link.
3. Honesty constraints (non-negotiable): lottery draws are independent, so no number-picking strategy, hot/cold number, frequency count or "overdue" number changes anyone's chance of winning; never say or imply otherwise. Scratch-ticket figures describe how much prize money is still unclaimed, not the odds of any ticket winning. Nobody publishes how many tickets remain unsold. The only real benefit of avoiding popular numbers (birthdays 1-31) is sharing a jackpot with fewer people if you win.
4. At most one link, only if it directly supports the answer, presented as a source ("the remaining-prize table is here: URL"). When you link to Lottizen, disclose it briefly ("I run a site that tracks this").
5. Tone: conversational, specific, no marketing language, no exclamation marks, no emojis, no headers. Keep it under 130 words.

Output only the reply text."""

NEWS_SYSTEM = """You draft a short note the founder of Lottizen (lottizen.com, free Canadian lottery data: draw history, number statistics, scratch-ticket prizes still unclaimed for all 5 Canadian agencies, unclaimed-prize deadlines) will send, after editing, to the journalist who wrote the article below. The goal is to be a useful source for their next story, not to sell anything.

Rules: under 110 words; reference their article specifically; offer one or two concrete data angles drawn only from FACTS (never invent numbers); say the data is free to use with a credit; no flattery, no marketing language. Honesty constraints: no strategy changes the odds of winning; scratch figures describe unclaimed prize money, not odds; number frequencies are history. Output only the note body (no subject line, no signature)."""


def draft_with_claude(system: str, user: str) -> str | None:
    """None when no ANTHROPIC_API_KEY or the call fails — callers fall back
    to a template. A draft that trips the honesty guard is discarded."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    try:
        import anthropic
    except ImportError:
        print("  [warn] anthropic not installed; using template drafts")
        return None
    client = anthropic.Anthropic()
    try:
        resp = client.beta.messages.create(
            model="claude-opus-5-5",
            max_tokens=2000,
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.RateLimitError:
        print("  [warn] Claude rate-limited; using template draft")
        return None
    except anthropic.APIStatusError as e:
        print(f"  [warn] Claude API {e.status_code}; using template draft")
        return None
    except anthropic.APIConnectionError:
        print("  [warn] Claude unreachable; using template draft")
        return None
    if resp.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    bad = check_honesty(text)
    if bad:
        print(f"  [warn] discarded a draft that matched {bad}")
        return None
    return text or None


def facts_block(facts: list[dict]) -> str:
    return "\n".join(f"- {f['label']}: {f['value']} ({f['url']})" for f in facts) or "- (none)"


# ------------------------------------------------------------------ email

def email_shell(title: str, intro: str, body: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f7f4ed;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1815">
<div style="max-width:680px;margin:0 auto;padding:24px 16px">
<div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#dd8232">Lottizen outreach</div>
<h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.2;margin:6px 0 8px">{html.escape(title)}</h1>
<p style="font-size:14px;color:#6d685f;margin:0 0 20px">{intro}</p>
{body}
<p style="font-size:12px;color:#9c968a;margin-top:28px">Sent by the outreach radar to you only. Nothing here was posted or sent to anyone else.
Settings: config/outreach.toml.</p></div></body></html>"""


def card(inner: str) -> str:
    return f'<div style="background:#fff;border:1px solid #e6e0d4;border-radius:12px;padding:16px 18px;margin:0 0 14px">{inner}</div>'


def button(href: str, label: str) -> str:
    return (f'<a href="{html.escape(href)}" style="display:inline-block;background:#1a1815;color:#fff;font-weight:600;'
            f'font-size:13px;text-decoration:none;padding:9px 16px;border-radius:8px">{html.escape(label)}</a>')


def draft_box(text: str) -> str:
    return (f'<div style="white-space:pre-wrap;background:#f7f4ed;border-radius:8px;padding:12px 14px;font-size:13.5px;'
            f'line-height:1.5;margin:10px 0">{html.escape(text)}</div>')


def facts_html(facts: list[dict]) -> str:
    if not facts:
        return ""
    items = "".join(
        f'<li style="margin:0 0 6px"><b>{html.escape(f["label"])}</b>: {html.escape(f["value"])} '
        f'<a href="{html.escape(f["url"])}" style="color:#c2652a">source</a></li>' for f in facts)
    return f'<ul style="font-size:13px;color:#1a1815;padding-left:18px;margin:8px 0">{items}</ul>'


def send_to_owner(subject: str, html_body: str) -> bool:
    """One recipient, the site owner (OUTREACH_EMAIL). This is an internal
    notification, not a bulk send, so it carries no unsubscribe headers."""
    to = os.environ.get("OUTREACH_EMAIL")
    if not to:
        print("  [skip] OUTREACH_EMAIL not set")
        return False
    import mailer
    return mailer.send_email(to, subject, html_body)
