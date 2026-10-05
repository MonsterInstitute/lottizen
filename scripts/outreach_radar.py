#!/usr/bin/env python3
"""outreach_radar.py — find conversations where Lottizen's data genuinely
answers someone's question, and prepare a reply for a human to post.

Nothing here posts, comments or emails anyone but the owner. Two modes:

  collect  scan Google News, Hacker News and (with a paid key) X; store
           each new match in outreach_opportunities with a value score, the
           figures that answer it, and a reply draft. Journalists' bylines on
           news hits accumulate in outreach_contacts.
  digest   email the owner the un-notified matches at or above the score
           threshold. No qualifying matches, no email. At most one digest per
           Toronto calendar day, however often it's invoked.

    python scripts/outreach_radar.py collect [--dry-run]
    python scripts/outreach_radar.py digest  [--dry-run] [--preview out.html]

--dry-run writes nothing to Supabase and sends nothing; with --preview the
digest HTML is saved to a file instead.

Coverage limits, stated rather than papered over:
  * No Reddit. Evaluated and dropped 2026-10-04: since Reddit's Responsible
    Builder Policy (2025-11-11) new API apps need manual approval, and the
    unauthenticated RSS fallback was rate-limited within one request and its
    search returned nothing. Other sources tried and why they're out:
    docs/OPERATIONS.md § 7, "Outreach sources".
  * X: needs a paid API tier (X_BEARER_TOKEN); skipped otherwise.
  * Google News: article links are decoded to the publisher URL and the page
    fetched for its byline. Paywalled or bot-blocked pages yield no name.
"""
from __future__ import annotations

import argparse
import html
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import outreach_common as oc  # noqa: E402

# ================================================================= sources

def _gnews_decode(article_id: str) -> str | None:
    """news.google.com/rss/articles/<id> resolves by JavaScript, not a
    redirect; this is the same two-step exchange the page itself performs."""
    page = oc.http_get(f"https://news.google.com/rss/articles/{article_id}", browser=True)
    sg = re.search(r'data-n-a-sg="([^"]+)"', page)
    ts = re.search(r'data-n-a-ts="([^"]+)"', page)
    if not sg or not ts:
        return None
    inner = (f'["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],'
             f'"X","X",1,[1,1,1],1,1,null,0,0,null,0],"{article_id}",{ts.group(1)},"{sg.group(1)}"]')
    body = urllib.parse.urlencode({"f.req": json.dumps([[["Fbv4je", inner, None, "generic"]]])}).encode()
    req = urllib.request.Request(
        "https://news.google.com/_/DotsSplashUi/data/batchexecute", data=body,
        headers={"User-Agent": oc.BROWSER_UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"})
    with urllib.request.urlopen(req, timeout=20) as r:
        text = r.read().decode()
    m = re.search(r'\[\\"garturlres\\",\\"(.*?)\\"', text)
    return m.group(1).encode().decode("unicode_escape") if m else None


NOT_A_PERSON = re.compile(r"staff|press|news|editor|team|wire|desk|agency|reporter$|media|admin|contributor", re.I)


def _bylines(page: str, outlet: str) -> list[str]:
    names: list[str] = []

    def take(v):
        if isinstance(v, str):
            names.append(v)
        elif isinstance(v, dict):
            take(v.get("name"))
        elif isinstance(v, list):
            for x in v:
                take(x)

    def walk(o):
        if isinstance(o, dict):
            if "author" in o:
                take(o["author"])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    for blob in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', page, flags=re.S | re.I):
        try:
            walk(json.loads(blob))
        except ValueError:
            continue
    for key in ("author", "parsely-author", "sailthru.author", "article:author", "byl"):
        for m in re.finditer(rf'<meta[^>]+(?:name|property)="{re.escape(key)}"[^>]+content="([^"]+)"', page, flags=re.I):
            names.append(re.sub(r"^by\s+", "", html.unescape(m.group(1)), flags=re.I))
    clean = []
    for n in names:
        n = re.sub(r"\s+", " ", (n or "").strip())
        # A person: 2-4 words, not a URL, not the outlet, not "Staff"/"The Canadian Press".
        if (not n or "/" in n or "@" in n or not (2 <= len(n.split()) <= 4) or NOT_A_PERSON.search(n)
                or n.lower() == outlet.lower()):
            continue
        if n.lower() not in {c.lower() for c in clean}:
            clean.append(n)
    return clean[:3]


def _meta(page: str, *keys: str) -> str:
    for key in keys:
        m = re.search(rf'<meta[^>]+(?:name|property)="{re.escape(key)}"[^>]+content="([^"]*)"', page, flags=re.I)
        if m:
            return html.unescape(m.group(1))
    return ""


def news_items(cfg: dict, known: set[str]) -> list[dict]:
    nc = cfg["news"]
    must = [w.lower() for w in nc["must_mention_any"]]
    must_not = [w.lower() for w in nc.get("must_not_mention", [])]
    out, seen = [], set()
    for q in nc["queries"]:
        feed_url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
            {"q": q, "hl": "en-CA", "gl": "CA", "ceid": "CA:en"})
        try:
            root = ET.fromstring(oc.http_get(feed_url, browser=True))
        except Exception as e:  # noqa: BLE001
            print(f"  [warn] news query failed ({q}): {e}")
            continue
        for it in root.iter("item"):
            link = it.findtext("link") or ""
            aid = link.split("/articles/")[-1].split("?")[0]
            if not aid or aid in seen or f"news:{aid}" in known:
                continue
            seen.add(aid)
            src = it.find("source")
            outlet = (src.text if src is not None else "") or ""
            title = re.sub(rf"\s+-\s+{re.escape(outlet)}$", "", it.findtext("title") or "") if outlet else it.findtext("title") or ""
            try:
                published = parsedate_to_datetime(it.findtext("pubDate"))
            except (TypeError, ValueError):
                published = oc.now_utc()
            out.append({"source": "news", "external_id": aid, "kind": "article", "url": link, "title": title,
                        "body": "", "author": None, "community": outlet,
                        "outlet_domain": urllib.parse.urlparse(src.get("url", "") if src is not None else "").netloc,
                        "published_at": published, "engagement": {}, "_must": must, "_must_not": must_not})
    return out


def enrich_news(item: dict, fetch_bylines: bool) -> bool:
    """Resolve the publisher URL and byline. False when the article isn't
    about Canadian lotteries after all (checked against the page text)."""
    real, page = None, ""
    try:
        real = _gnews_decode(item["external_id"])
        if real:
            item["url"] = real
            if fetch_bylines:
                page = oc.http_get(real, browser=True, timeout=15)
    except Exception as e:  # noqa: BLE001
        print(f"    [info] couldn't open {real or item['url']}: {type(e).__name__}")
    desc = _meta(page, "og:description", "description") if page else ""
    item["body"] = desc
    haystack = f"{item['title']} {desc} {oc.strip_tags(page)[:20000] if page else ''} {item.get('outlet_domain', '')}".lower()
    if any(w in haystack for w in item["_must_not"]):
        return False
    if not (any(w in haystack for w in item["_must"]) or item.get("outlet_domain", "").endswith(".ca")):
        return False
    names = _bylines(page, item["community"]) if page else []
    item["author"] = ", ".join(names) or None
    item["_bylines"] = names
    return True


def hn_items(cfg: dict, since: datetime) -> list[dict]:
    hc = cfg["hn"]
    must = [w.lower() for w in hc["must_mention_any"]]
    out, seen = [], set()
    for q in hc["queries"]:
        try:
            data = oc.http_json("https://hn.algolia.com/api/v1/search_by_date?" + urllib.parse.urlencode({
                "query": q, "tags": "(story,comment)", "hitsPerPage": 50,
                "numericFilters": f"created_at_i>{int(since.timestamp())}"}))
        except Exception as e:  # noqa: BLE001
            print(f"  [warn] hn query failed ({q}): {e}")
            continue
        for h in data.get("hits", []):
            if h["objectID"] in seen:
                continue
            seen.add(h["objectID"])
            is_comment = "comment" in h.get("_tags", [])
            body = oc.strip_tags(h.get("comment_text") or h.get("story_text") or "")
            title = h.get("title") or h.get("story_title") or ""
            if not any(w in f"{title} {body}".lower() for w in must):
                continue
            out.append({"source": "hn", "external_id": h["objectID"], "kind": "comment" if is_comment else "post",
                        "url": f"https://news.ycombinator.com/item?id={h['objectID']}", "title": title, "body": body,
                        "author": h.get("author"), "community": "Hacker News",
                        "published_at": datetime.fromtimestamp(h["created_at_i"], timezone.utc),
                        "engagement": {"comments": h.get("num_comments"), "score": h.get("points")}})
    return out


def x_items(cfg: dict) -> list[dict]:
    token = os.environ.get("X_BEARER_TOKEN")
    if not token:
        print("  x: skipped (X_BEARER_TOKEN not set; X search needs a paid API tier)")
        return []
    try:
        data = oc.http_json("https://api.x.com/2/tweets/search/recent?" + urllib.parse.urlencode({
            "query": cfg["x"]["query"], "max_results": 50, "tweet.fields": "created_at,public_metrics,author_id",
            "expansions": "author_id", "user.fields": "username"}), headers={"Authorization": f"Bearer {token}"})
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] x search failed: {e}")
        return []
    users = {u["id"]: u["username"] for u in data.get("includes", {}).get("users", [])}
    out = []
    for t in data.get("data", []):
        user = users.get(t["author_id"], "i")
        m = t.get("public_metrics", {})
        out.append({"source": "x", "external_id": t["id"], "kind": "post", "url": f"https://x.com/{user}/status/{t['id']}",
                    "title": oc.clip(t["text"], 120), "body": t["text"], "author": user, "community": "X",
                    "published_at": datetime.fromisoformat(t["created_at"].replace("Z", "+00:00")),
                    "engagement": {"comments": m.get("reply_count"), "score": m.get("like_count")}})
    return out


# ================================================================= scoring

def match_topic(cfg: dict, text: str) -> dict | None:
    t = text.lower()
    for topic in cfg["topics"]:
        if any(k.lower() in t for k in topic["keywords"]):
            return topic
    return None


def is_question(cfg: dict, item: dict) -> bool:
    t = (item["body"] if item["kind"] == "comment" else f"{item['title']} {item['body'][:300]}").lower()
    return any(m in t for m in cfg["scoring"]["question_markers"])


def value_score(cfg: dict, item: dict, question: bool, topic_key: str | None = None) -> int:
    s = cfg["scoring"]
    if item["source"] == "news":
        nc = cfg["news"]
        title = f" {item['title'].lower()} "
        routine = (any(pat in title for pat in nc.get("routine_patterns", []))
                   and topic_key not in nc.get("routine_exempt_topics", []))
        return s["base_news_routine"] if routine else s["base_news"]
    if item["kind"] == "comment":
        base = s["base_comment"]
    else:
        base = s["base_question"] if question else s["base_discussion"]
    e = item.get("engagement") or {}
    bonus = 4 * math.log2(1 + (e.get("comments") or 0)) + 2 * math.log2(1 + max(e.get("score") or 0, 0))
    return int(base + min(s["engagement_cap"], round(bonus)))


# ================================================================= drafting

def template_draft(item: dict, topic_key: str | None, facts: list[dict]) -> str:
    """Used when Gemini isn't configured or fails. Built only from `facts`."""
    link = facts[0]["url"] if facts else ""
    if item["source"] == "news":
        first = (item.get("_bylines") or ["there"])[0].split()[0]
        angles = " ".join(f"{f['label']}: {f['value'].rstrip('.')}." for f in facts[:2])
        return (f"Hi {first},\n\nI read your piece \"{item['title']}\". In case it's useful for a follow-up: "
                f"Lottizen (lottizen.com) compiles Canadian lottery data daily. {angles}\n\n"
                f"It's free to use with a credit, and I'm happy to pull a custom cut of the data.")
    fact_line = facts[0]["value"] if facts else ""
    if topic_key == "unclaimed":
        return ("In Canada you generally have one year from the draw date to claim a draw-game prize (BCLC says 52 weeks), "
                "and scratch tickets expire on the date printed on the back. If you're anywhere near that date, call the "
                "lottery corporation directly rather than mailing the ticket.\n\n"
                f"I keep a table of the deadlines by province, with sources, here: {link} (my site).")
    if topic_key == "scratch":
        return ("Every ticket's chance of winning is fixed when the game is printed, and nobody publishes how many tickets "
                "are left unsold. What you can check is how many of the big prizes are still unclaimed, since some games keep selling "
                f"after their top prizes are gone. As of the latest update: {fact_line}\n\n"
                f"I run a site that tracks this for every Canadian province: {link}")
    if topic_key == "numbers":
        return ("Every draw is independent, so how often a number came up before doesn't change what comes next. "
                f"For the record: {fact_line}\n\nThe one thing that does matter is that lots of people play birthdays "
                "(1-31), so numbers above 31 mean you'd split a jackpot with fewer people if you won. Same odds, "
                f"bigger share.\n\nThe full history is here (my site): {link}")
    if topic_key == "data":
        return ("I'm not aware of an official open API from the Canadian lottery corporations; they publish results on "
                f"their own sites. I built one that compiles them: {link}, with an OpenAPI spec at "
                f"{oc.SITE_URL}/openapi.yaml. Happy to answer questions about the sources.")
    return f"{fact_line}\n\nSource (my site): {link}" if facts else ""


def draft(item: dict, topic_key: str | None, facts: list[dict]) -> str:
    if item["source"] == "news":
        system = oc.NEWS_SYSTEM
        user = (f"TODAY: {oc.today_toronto():%B %-d, %Y}\n"
                f"ARTICLE: {item['title']} ({item['community']}, {item['published_at']:%Y-%m-%d})\n"
                f"JOURNALIST: {item.get('author') or 'unknown'}\nSUMMARY: {oc.clip(item['body'], 800)}\n\n"
                f"FACTS:\n{oc.facts_block(facts)}")
    else:
        system = oc.DRAFT_SYSTEM
        where = item["community"] + (" (a comment on a post)" if item["kind"] == "comment" else "")
        user = (f"TODAY: {oc.today_toronto():%B %-d, %Y}\nWHERE: {where}\nPOST TITLE: {item['title']}\n"
                f"{'COMMENT' if item['kind'] == 'comment' else 'POST TEXT'}: {oc.clip(item['body'], 2500)}\n\n"
                f"FACTS:\n{oc.facts_block(facts)}")
    text = oc.draft_with_llm(system, user)
    if text and text.strip().upper().startswith("SKIP"):
        return SKIP
    return text or template_draft(item, topic_key, facts)


# The model found nothing genuinely useful to say; collect() keeps the row
# (so it isn't re-fetched) but scores it below the email threshold.
SKIP = "(No draft: the model judged there was nothing useful to add. Skip this one.)"


# ================================================================= storage

def known_ids(source: str, ids: list[str]) -> set[str]:
    import db
    found: set[str] = set()
    for i in range(0, len(ids), 100):
        res = (db.get_client().table("outreach_opportunities").select("external_id")
               .eq("source", source).in_("external_id", ids[i:i + 100]).execute())
        found |= {f"{source}:{r['external_id']}" for r in res.data}
    return found


def save_contacts(item: dict, topic_key: str | None) -> None:
    import db
    client = db.get_client()
    for name in item.get("_bylines") or []:
        key = re.sub(r"\s+", " ", name.lower()).strip()
        res = client.table("outreach_contacts").select("*").eq("name_key", key).eq("outlet", item["community"]).execute()
        topics = {topic_key} if topic_key else set()
        if res.data:
            row = res.data[0]
            client.table("outreach_contacts").update({
                "last_seen": oc.now_utc().isoformat(), "article_count": row["article_count"] + 1,
                "last_article_title": item["title"], "last_article_url": item["url"],
                "topics": sorted(set(row["topics"]) | topics),
            }).eq("id", row["id"]).execute()
        else:
            client.table("outreach_contacts").insert({
                "name": name, "name_key": key, "outlet": item["community"],
                "outlet_domain": item.get("outlet_domain"), "last_article_title": item["title"],
                "last_article_url": item["url"], "topics": sorted(topics),
            }).execute()


# ================================================================= modes

def collect(cfg: dict, dry_run: bool) -> list[dict]:
    max_age = timedelta(hours=cfg["scoring"]["max_age_hours"])
    since = oc.now_utc() - max_age

    def known(source: str, ids: list[str]) -> set[str]:
        try:
            return known_ids(source, ids)
        except Exception as e:  # noqa: BLE001
            if not dry_run:
                raise
            print(f"  [dry-run] dedupe lookup unavailable ({type(e).__name__}); treating everything as new")
            return set()

    raw = hn_items(cfg, since) + x_items(cfg)
    news = news_items(cfg, set())
    news_known = known("news", [n["external_id"] for n in news])
    news = [n for n in news if f"news:{n['external_id']}" not in news_known]
    print(f"  fetched: {len(raw)} posts/comments, {len(news)} new news items")

    candidates = []
    for item in raw:
        if item["published_at"] < since:
            continue
        topic = match_topic(cfg, f"{item['title']} {item['body']}")
        if not topic:
            continue
        q = is_question(cfg, item)
        if item["kind"] == "comment" and not ("?" in item["body"] and q):
            continue  # a comment is only an opening when it asks something
        candidates.append((item, topic, q))
    for item in news:
        if item["published_at"] < since:
            continue
        candidates.append((item, match_topic(cfg, item["title"]), False))

    by_source: dict[str, list[str]] = {}
    for item, _, _ in candidates:
        if item["source"] != "news":
            by_source.setdefault(item["source"], []).append(item["external_id"])
    seen: set[str] = set()
    for source, ids in by_source.items():
        seen |= known(source, ids)

    saved = []
    for item, topic, q in candidates:
        if f"{item['source']}:{item['external_id']}" in seen:
            continue
        if item["source"] == "news":
            if not enrich_news(item, cfg["news"].get("fetch_bylines", True)):
                continue
            topic = topic or match_topic(cfg, item["body"])
        keys = topic["data"] if topic else ["jackpot", "claim_deadlines"]
        facts = oc.facts_for(keys, f"{item['title']} {item['body']}", item["community"])
        row = {
            "source": item["source"], "external_id": item["external_id"], "url": item["url"],
            "title": oc.clip(item["title"], 300) or "(untitled)", "excerpt": oc.clip(item["body"], 600),
            "author": item.get("author"), "community": item["community"],
            "published_at": item["published_at"].isoformat(), "engagement": item.get("engagement") or {},
            "topic": topic["key"] if topic else None, "value_score": value_score(cfg, item, q, topic["key"] if topic else None),
            "data_points": facts,
        }
        row["reply_draft"] = draft(item, row["topic"], facts)
        if row["reply_draft"] == SKIP:
            row["value_score"] = 0
        print(f"  + [{row['value_score']:>3}] {row['source']:<6} {row['community']}: {oc.clip(row['title'], 70)}")
        if not dry_run:
            import db
            db.get_client().table("outreach_opportunities").upsert(
                row, on_conflict="source,external_id", ignore_duplicates=True).execute()
            if item["source"] == "news":
                save_contacts(item, row["topic"])
        saved.append(row)
    print(f"✓ collect: {len(saved)} new opportunities")
    return saved


SOURCE_LABEL = {"news": "News", "hn": "Hacker News", "x": "X"}


def digest_html(rows: list[dict]) -> str:
    cards = []
    for r in rows:
        e = r.get("engagement") or {}
        eng = " · ".join(x for x in [f"{e['comments']} comments" if e.get("comments") is not None else "",
                                      f"{e['score']} points" if e.get("score") is not None else ""] if x)
        when = (r.get("published_at") or "")[:16].replace("T", " ")
        who = f"by {r['author']}" if r.get("author") else ""
        action = "Open article" if r["source"] == "news" else "Open thread"
        draft_label = "Note to the journalist" if r["source"] == "news" else "Reply draft (edit before posting)"
        cards.append(oc.card(
            f'<div style="font-size:11.5px;color:#9c968a;text-transform:uppercase;letter-spacing:.08em;font-weight:700">'
            f'{SOURCE_LABEL.get(r["source"], r["source"])} · {html.escape(r.get("community") or "")} · score {r["value_score"]}</div>'
            f'<div style="font-family:Georgia,serif;font-size:18px;font-weight:700;margin:4px 0">'
            f'<a href="{html.escape(r["url"])}" style="color:#1a1815;text-decoration:none">{html.escape(r["title"])}</a></div>'
            f'<div style="font-size:12.5px;color:#6d685f">{html.escape(" · ".join(x for x in [when + " UTC", who, eng] if x.strip()))}</div>'
            + (f'<p style="font-size:13.5px;color:#3a362f;margin:8px 0">{html.escape(oc.clip(r.get("excerpt") or "", 400))}</p>' if r.get("excerpt") else "")
            + (f'<div style="font-size:12px;font-weight:700;margin-top:10px">What we can add</div>{oc.facts_html(r.get("data_points") or [])}' if r.get("data_points") else "")
            + f'<div style="font-size:12px;font-weight:700;margin-top:10px">{draft_label}</div>{oc.draft_box(r.get("reply_draft") or "")}'
            + oc.button(r["url"], action)
        ))
    return oc.email_shell(
        f"{len(rows)} outreach opportunit{'y' if len(rows) == 1 else 'ies'} today",
        "Ranked by value: media coverage first, then active questions, then discussion. Each draft answers the question "
        "first; read it, make it yours, and post it yourself.",
        "".join(cards))


def digest(cfg: dict, dry_run: bool, preview: str | None) -> None:
    import db
    s = cfg["scoring"]
    client = db.get_client()
    day_start = datetime.combine(oc.today_toronto(), datetime.min.time(), tzinfo=oc.TORONTO)
    already = client.table("outreach_opportunities").select("id").gte("notified_at", day_start.isoformat()).limit(1).execute()
    if already.data and not dry_run:
        print("✓ digest: one already went out today; skipping")
        return
    cutoff = (oc.now_utc() - timedelta(hours=s["max_age_hours"])).isoformat()
    rows = (client.table("outreach_opportunities").select("*").is_("notified_at", "null")
            .gte("value_score", s["email_threshold"]).gte("found_at", cutoff)
            .order("value_score", desc=True).order("found_at", desc=True).limit(s["max_per_email"]).execute().data)
    if not rows:
        print("✓ digest: nothing at or above the threshold; no email")
        return
    body = digest_html(rows)
    subject = f"Outreach: {len(rows)} to look at, top: {oc.clip(rows[0]['title'], 60)}"
    if dry_run:
        if preview:
            Path(preview).write_text(body)
            print(f"  [dry-run] digest preview written to {preview}")
        print(f"  [dry-run] would email {len(rows)} opportunities: {subject}")
        return
    if not oc.send_to_owner(subject, body):
        sys.exit("✗ digest: Resend did not accept the email")
    client.table("outreach_opportunities").update({"notified_at": oc.now_utc().isoformat()}).in_(
        "id", [r["id"] for r in rows]).execute()
    print(f"✓ digest: emailed {len(rows)} opportunities")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["collect", "digest"])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--preview", help="with --dry-run: write the digest HTML here")
    ap.add_argument("--threshold", type=int, help="override scoring.email_threshold for this run")
    args = ap.parse_args()
    cfg = oc.load_config()
    if args.threshold is not None:
        cfg["scoring"]["email_threshold"] = args.threshold
    if args.mode == "collect":
        rows = collect(cfg, args.dry_run)
        if args.dry_run and args.preview:
            thr = cfg["scoring"]["email_threshold"]
            top = sorted([r for r in rows if r["value_score"] >= thr], key=lambda r: -r["value_score"])
            Path(args.preview).write_text(digest_html(top[: cfg["scoring"]["max_per_email"]]))
            print(f"  [dry-run] preview of {min(len(top), cfg['scoring']['max_per_email'])} items written to {args.preview}")
    else:
        digest(cfg, args.dry_run, args.preview)


if __name__ == "__main__":
    main()
