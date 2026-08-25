#!/usr/bin/env python3
"""seo_health.py — weekly automated indexing-health check against the real
production site, from a Googlebot User-Agent, no cookies. Built after GSC
showed only 50/2019 pages indexed and the root cause turned out to be a
geo-redirect on `/` that Googlebot never saw past (fixed 2026-08-25). This
script exists so that exact failure mode — and its neighbors — self-detect
going forward instead of being noticed months later in Search Console.

Six checks, each appending to `problems` (consumed by scripts/health_issues.sh
to open/close GitHub issues) and to `results` (consumed by
scripts/build_health_report.py for the weekly digest):

  1. Crawler-view sampling: for a sample of every page-type category (drawn
     straight from the live sitemap, not a hardcoded URL list), assert 200
     not 3xx (the homepage is checked on its own as the single highest-
     priority case), no noindex, self-referencing canonical, real body
     content above a length floor, and a present/reasonable/non-duplicate
     title + meta description.
  2. Sitemap integrity: parses, URL count in a sane range, zero unencoded
     non-ASCII, sampled URLs all live, lastmod values aren't one timestamp.
  3. Structured data: every JSON-LD block on the sampled pages parses and
     has its type's required fields.
  4. Internal link graph: BFS over the local production build's HTML output
     (a build step runs before this script in CI) for broken internal links
     and orphaned pages among indexable categories.
  5. GSC indexing/impression trend: skipped gracefully unless
     GSC_SERVICE_ACCOUNT_JSON is configured — see the weekly report for the
     documented "distinct pages with impressions" indexing proxy this uses
     (the classic per-type indexed-count isn't exposed by the public API).
"""
from __future__ import annotations

import base64
import json
import os
import random
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict, deque
from pathlib import Path

SITE = os.environ.get("SITE_URL", "https://lottizen.com").rstrip("/")
UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
BUILD_DIR = Path(".next/server/app")
SAMPLE_PER_CATEGORY = 3
MIN_BODY_CHARS = 200

# force-dynamic routes (no static .html snapshot to find in BUILD_DIR — see
# app/dashboard/page.tsx and app/scratch/[province]/page.tsx) and binary/
# non-html static assets. Real, working, intentionally absent from the
# .html-file scan the link-graph check does — not broken links.
KNOWN_NON_HTML_PATHS = {
    "/dashboard", "/scratch/ontario", "/scratch/british-columbia", "/scratch/quebec",
    "/scratch/western", "/scratch/atlantic",
    "/favicon.ico", "/icon.svg", "/apple-icon.png", "/opengraph-image.png",
    "/twitter-image.png", "/robots.txt", "/sitemap.xml",
}

problems: list[dict] = []
results: dict = {"checkedAt": None, "categories": {}, "sitemap": {}, "structuredData": {}, "linkGraph": {}, "gsc": {"skipped": True}}


def log(*a) -> None:
    print(*a, flush=True)


def add_problem(title: str, body: str) -> None:
    problems.append({"title": f"SEO health: {title}", "body": body})
    log(f"❌ {title}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # noqa: D102
        return None  # don't follow — we need to see the 3xx itself


def fetch(url: str) -> tuple[int | None, str, dict, str | None]:
    """Returns (status, body, headers, redirect_location). Never follows redirects."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    ctx = ssl.create_default_context()
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=20) as r:
            return r.status, r.read().decode("utf-8", "replace"), dict(r.headers), None
    except urllib.error.HTTPError as e:
        if 300 <= e.code < 400:
            return e.code, "", dict(e.headers), e.headers.get("Location")
        return e.code, e.read().decode("utf-8", "replace"), dict(e.headers), None
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}: {e}", {}, None


# ============================================================================
# Sitemap fetch + categorization
# ============================================================================
def fetch_sitemap() -> list[tuple[str, str | None]]:
    status, body, _, _ = fetch(f"{SITE}/sitemap.xml")
    if status != 200:
        add_problem("sitemap.xml unreachable", f"GET /sitemap.xml -> status={status}")
        return []
    try:
        root = ET.fromstring(body)
    except ET.ParseError as e:
        add_problem("sitemap.xml does not parse as XML", str(e))
        return []
    ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    out = []
    for url_el in root.findall(f"{ns}url"):
        loc = url_el.findtext(f"{ns}loc")
        lastmod = url_el.findtext(f"{ns}lastmod")
        if loc:
            out.append((loc, lastmod))
    return out


def categorize(path: str) -> str:
    parts = path.strip("/").split("/") if path != "/" else []
    if not parts:
        return "home"
    if parts[0] == "scratch":
        if len(parts) == 2:
            return "scratch/province"
        if len(parts) == 4 and parts[2] == "price":
            return "scratch/price"
        if len(parts) == 3:
            return "scratch/ticket-detail"
        return "scratch/other"
    if parts[0] == "guides":
        return "guides"
    if parts[0] == "plus":
        return "plus"
    if len(parts) == 1:
        return "country-hub" if parts[0] in ("canada", "usa", "europe") else "static"
    if len(parts) == 2:
        return "game/overview"
    if len(parts) == 3 and parts[2] == "number":
        return "game/number-idx"
    if len(parts) == 4 and parts[2] == "number":
        return "game/number-detail"
    if len(parts) == 3 and parts[2] == "results":
        return "game/results-idx"
    if len(parts) == 4 and parts[2] == "results":
        return "game/results-year"
    if len(parts) == 3 and parts[2] in ("statistics", "generator", "faq"):
        return f"game/{parts[2]}"
    return "other"


# ============================================================================
# 1. Crawler-view page sampling
# ============================================================================
def extract_body_text(html: str) -> str:
    m = re.search(r"<main[^>]*>(.*?)</main>", html, re.S)
    body = m.group(1) if m else html
    body = re.sub(r"<script.*?</script>", " ", body, flags=re.S)
    body = re.sub(r"<style.*?</style>", " ", body, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", body)
    return re.sub(r"\s+", " ", text).strip()


def check_page(url: str, path: str, critical: bool = False) -> dict:
    status, body, headers, redirect = fetch(url)
    info = {"url": url, "status": status, "redirect": redirect}

    if status is None:
        add_problem(f"unreachable — {path}", f"GET {url} failed: {body}")
        return info
    if 300 <= status < 400:
        sev = "CRITICAL — " if critical else ""
        add_problem(
            f"{sev}redirect instead of 200 — {path}",
            f"GET {url} (Googlebot UA, no cookies) -> {status} redirect to {redirect}. "
            f"A crawler hitting this URL never sees real content on it.",
        )
        return info
    if status != 200:
        add_problem(f"non-200 — {path}", f"GET {url} (Googlebot UA) -> {status}")
        return info

    if re.search(r'<meta[^>]+name=["\']robots["\'][^>]+content=["\'][^"\']*noindex', body, re.I):
        add_problem(f"noindex found — {path}", f"GET {url} has a noindex robots meta tag.")
    if "x-robots-tag" in {k.lower() for k in headers}:
        val = next(v for k, v in headers.items() if k.lower() == "x-robots-tag")
        if "noindex" in val.lower():
            add_problem(f"X-Robots-Tag noindex — {path}", f"GET {url} has response header X-Robots-Tag: {val}")

    canon_m = re.search(r'rel=["\']canonical["\']\s+href=["\']([^"\']+)["\']', body)
    canon = canon_m.group(1) if canon_m else None
    expect = url.rstrip("/") if url != f"{SITE}/" else SITE
    if not canon:
        add_problem(f"missing canonical — {path}", f"GET {url} has no <link rel=canonical>.")
    elif canon.rstrip("/") != expect:
        add_problem(f"canonical mismatch — {path}", f"GET {url}: canonical is '{canon}', expected '{expect}'.")

    text = extract_body_text(body)
    info["bodyChars"] = len(text)
    if len(text) < MIN_BODY_CHARS:
        add_problem(
            f"thin/empty body — {path}",
            f"GET {url}: extracted body text is only {len(text)} chars (floor {MIN_BODY_CHARS}). "
            "Possible empty shell / loading state served to crawlers.",
        )

    title_m = re.search(r"<title>([^<]*)</title>", body)
    title = title_m.group(1).strip() if title_m else ""
    info["title"] = title
    if not title:
        add_problem(f"missing title — {path}", f"GET {url} has no <title>.")
    elif not (10 <= len(title) <= 70):
        log(f"  note: title length {len(title)} outside 10-70 for {path}: {title!r}")

    desc_m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']', body, re.I)
    desc = desc_m.group(1).strip() if desc_m else ""
    info["description"] = desc
    if not desc:
        add_problem(f"missing meta description — {path}", f"GET {url} has no meta description.")
    elif not (50 <= len(desc) <= 300):
        log(f"  note: description length {len(desc)} outside 50-300 for {path}")

    info["jsonld"] = re.findall(r'<script type="application/ld\+json">(.*?)</script>', body, re.S)
    return info


def check_crawler_view(sitemap_urls: list[tuple[str, str | None]]) -> list[dict]:
    by_cat: dict[str, list[str]] = defaultdict(list)
    for loc, _ in sitemap_urls:
        path = loc.replace(SITE, "") or "/"
        by_cat[categorize(path)].append(loc)

    sampled_infos: list[dict] = []
    all_titles: list[tuple[str, str]] = []  # (title, path) for dup-detection within a category

    home_info = check_page(f"{SITE}/", "/", critical=True)
    sampled_infos.append(home_info)
    if home_info.get("status") == 200:
        log("OK: homepage is directly reachable by a Googlebot UA (no redirect)")

    for cat, urls in sorted(by_cat.items()):
        sample = random.sample(urls, min(SAMPLE_PER_CATEGORY, len(urls)))
        cat_titles = []
        for u in sample:
            path = u.replace(SITE, "")
            info = check_page(u, f"{cat} ({path})")
            info["category"] = cat
            sampled_infos.append(info)
            if info.get("title"):
                cat_titles.append((info["title"], path))
        titles_seen = Counter(t for t, _ in cat_titles)
        for t, n in titles_seen.items():
            if n > 1:
                dupes = [p for tt, p in cat_titles if tt == t]
                add_problem(
                    f"duplicate titles within {cat}",
                    f"{n} sampled pages in category '{cat}' share the exact title {t!r}: {dupes}",
                )
        results["categories"][cat] = {"sampleSize": len(sample), "totalInSitemap": len(urls)}

    log(f"Sampled {len(sampled_infos)} pages across {len(by_cat)} categories (+ homepage).")
    return sampled_infos


# ============================================================================
# 2. Sitemap integrity
# ============================================================================
def check_sitemap_integrity(sitemap_urls: list[tuple[str, str | None]]) -> None:
    n = len(sitemap_urls)
    results["sitemap"]["totalUrls"] = n
    if n < 1500:
        add_problem("sitemap URL count dropped sharply", f"sitemap.xml now has {n} URLs — expected roughly 2000+.")

    non_ascii = [loc for loc, _ in sitemap_urls if any(ord(c) > 127 for c in loc)]
    if non_ascii:
        add_problem(
            "unencoded non-ASCII URLs in sitemap",
            f"{len(non_ascii)} <loc> entries contain raw non-ASCII characters, e.g. {non_ascii[:3]}. "
            "Should be percent-encoded by absUrl().",
        )

    lastmods = {lm for _, lm in sitemap_urls if lm}
    results["sitemap"]["distinctLastmods"] = len(lastmods)
    if len(lastmods) < 5 and n > 100:
        add_problem(
            "lastmod values collapsed to a handful of timestamps",
            f"Only {len(lastmods)} distinct lastmod values across {n} URLs — looks like a build-timestamp "
            "regression rather than real per-page content dates.",
        )

    sample = random.sample(sitemap_urls, min(20, n))
    dead = []
    for loc, _ in sample:
        status, _, _, redirect = fetch(loc)
        if status != 200:
            dead.append((loc, status, redirect))
    results["sitemap"]["sampledLive"] = len(sample) - len(dead)
    results["sitemap"]["sampledTotal"] = len(sample)
    if dead:
        add_problem(
            "sitemap URLs not returning 200",
            "Sampled 20 random sitemap URLs; these did not return 200: "
            + "; ".join(f"{loc} -> {status} (redirect {r})" for loc, status, r in dead),
        )


# ============================================================================
# 3. Structured data
# ============================================================================
REQUIRED_FIELDS = {
    "Organization": ["name", "url", "description"],
    "WebSite": ["name", "url"],
    "CollectionPage": ["description"],
    "ItemList": ["itemListElement"],
    "Product": ["name", "offers"],
    "FAQPage": ["mainEntity"],
    "BreadcrumbList": ["itemListElement"],
}


def check_structured_data(sampled_infos: list[dict]) -> None:
    total_blocks = 0
    total_errors = 0
    for info in sampled_infos:
        for raw in info.get("jsonld", []):
            total_blocks += 1
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as e:
                total_errors += 1
                add_problem(f"invalid JSON-LD — {info.get('url')}", f"JSON-LD block failed to parse: {e}")
                continue
            items = data if isinstance(data, list) else [data]
            for item in items:
                t = item.get("@type")
                required = REQUIRED_FIELDS.get(t)
                if not required:
                    continue
                missing = [f for f in required if not item.get(f)]
                if missing:
                    total_errors += 1
                    add_problem(
                        f"JSON-LD {t} missing fields — {info.get('url')}",
                        f"{t} block is missing required field(s) {missing}.",
                    )
    results["structuredData"] = {"blocksChecked": total_blocks, "errors": total_errors}
    if total_blocks and not total_errors:
        log(f"OK: {total_blocks} JSON-LD blocks across the sample, all parse with required fields present")


# ============================================================================
# 4. Internal link graph (needs a local build — see workflow)
# ============================================================================
def check_link_graph() -> None:
    if not BUILD_DIR.exists():
        log("skip: link graph (no local build at .next/server/app — run `next build` first)")
        results["linkGraph"] = {"skipped": True}
        return

    files = list(BUILD_DIR.rglob("*.html"))

    def path_for(fp: Path) -> str:
        rel = fp.relative_to(BUILD_DIR).with_suffix("")
        s = str(rel)
        if s == "index":
            return "/"
        if s.endswith("/index"):
            s = s[: -len("/index")]
        return "/" + s

    all_paths = {path_for(f) for f in files}
    href_re = re.compile(r'href="(/[^"#?]*)')
    graph: dict[str, set[str]] = defaultdict(set)
    broken: Counter = Counter()
    for f in files:
        src = path_for(f)
        try:
            content = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for m in href_re.finditer(content):
            href = m.group(1).rstrip("/") or "/"
            graph[src].add(href)
            if (
                href not in all_paths
                and href not in KNOWN_NON_HTML_PATHS
                and not href.startswith(("/api/", "/_next/"))
            ):
                broken[href] += 1

    dist = {"/": 0}
    q = deque(["/"])
    while q:
        u = q.popleft()
        for v in graph.get(u, ()):
            if v in all_paths and v not in dist:
                dist[v] = dist[u] + 1
                q.append(v)

    orphans = all_paths - set(dist.keys())
    # /_not-found, auth-flow pages, and similar aren't meant to be internally
    # linked — only flag orphans that look like real content.
    orphans = {
        p for p in orphans
        if not p.startswith(("/_not-found", "/subscribe", "/dashboard", "/api"))
    }
    results["linkGraph"] = {
        "totalPages": len(all_paths),
        "reached": len(dist),
        "orphans": len(orphans),
        "brokenInternalLinks": len(broken),
        "deepestReached": max(dist.values()) if dist else 0,
    }
    if orphans:
        sample = sorted(orphans)[:10]
        add_problem("orphaned indexable pages found", f"{len(orphans)} pages have no internal inlink: {sample}")
    if broken:
        top = broken.most_common(10)
        add_problem(
            "broken internal links found",
            f"{len(broken)} distinct hrefs point at a path with no corresponding page: {top}",
        )
    if not orphans and not broken:
        log(f"OK: link graph clean — {len(all_paths)} pages, {len(dist)} reached, 0 orphans, 0 broken links")


# ============================================================================
# 5. GSC indexing/impression trend
# ============================================================================
def check_gsc() -> None:
    creds_raw = os.environ.get("GSC_SERVICE_ACCOUNT_JSON")
    if not creds_raw:
        log("skip: GSC trend (GSC_SERVICE_ACCOUNT_JSON not set)")
        return
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        add_problem("GSC libraries not installed", "google-api-python-client/google-auth missing from the environment.")
        return

    try:
        raw = creds_raw.strip()
        info = json.loads(base64.b64decode(raw)) if not raw.startswith("{") else json.loads(raw)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/webmasters.readonly"]
        )
        service = build("searchconsole", "v1", credentials=creds)

        import datetime
        end = datetime.date.today() - datetime.timedelta(days=2)  # GSC data lags ~2 days
        start = end - datetime.timedelta(days=27)

        totals = service.searchanalytics().query(
            siteUrl=SITE + "/",
            body={"startDate": str(start), "endDate": str(end), "dimensions": []},
        ).execute()
        by_page = service.searchanalytics().query(
            siteUrl=SITE + "/",
            body={"startDate": str(start), "endDate": str(end), "dimensions": ["page"], "rowLimit": 25000},
        ).execute()
        pages_with_impressions = len(by_page.get("rows", []))

        row = (totals.get("rows") or [{}])[0]
        results["gsc"] = {
            "skipped": False,
            "windowStart": str(start),
            "windowEnd": str(end),
            "clicks": row.get("clicks", 0),
            "impressions": row.get("impressions", 0),
            "ctr": row.get("ctr", 0),
            "position": row.get("position", 0),
            # Public API has no direct "indexed page count" (Coverage report
            # isn't exposed); distinct pages with >=1 impression over a
            # trailing 28d window is the best available automatable proxy.
            "pagesWithImpressions28d": pages_with_impressions,
        }
        log(f"OK: GSC — {pages_with_impressions} distinct pages with impressions in the last 28d")
    except Exception as e:  # noqa: BLE001
        add_problem("GSC query failed", f"{type(e).__name__}: {e}")


# ============================================================================
def main() -> int:
    import datetime
    results["checkedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    log(f"=== seo_health.py — {results['checkedAt']} ===")

    sitemap_urls = fetch_sitemap()
    sampled = check_crawler_view(sitemap_urls) if sitemap_urls else []
    if sitemap_urls:
        check_sitemap_integrity(sitemap_urls)
    check_structured_data(sampled)
    check_link_graph()
    check_gsc()

    with open("seo_health_problems.json", "w") as f:
        json.dump(problems, f, indent=2)
    with open("seo_health_result.json", "w") as f:
        json.dump(results, f, indent=2)

    if problems:
        log(f"\n{len(problems)} problem(s) found — see seo_health_problems.json")
        return 1
    log("\nAll SEO health checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
