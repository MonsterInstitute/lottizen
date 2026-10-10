"""Find the vendor API behind a charity raffle's own site (BUMP tenant or
Ascend base URL), its licence number and licensing province, so it can be
added to registry.py. Reads only the charity's own page plus BUMP's public
tenant resolver; never a vendor directory (Rafflebox and Raffle Nexus terms
forbid automated access, so their raffles aren't tracked).

    python scripts/charity/discover.py https://www.goodbear5050.ca/ ...
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from charity.common import fetch, fetch_json, text_of  # noqa: E402

LICENCE_PROVINCE = [
    # Quebec first: RACJ licences are "L-0NNNN", and some Quebec Ascend sites
    # carry a template "RAF1214331" that would otherwise read as Ontario.
    (r"RACJ|\bL-0\d{4}\b", "QC"), (r"\bRAF\s?\d{6,8}", "ON"), (r"AGD-\d+", "NS"), (r"LGCA|LCGA", "MB"), (r"BC Gaming|Gaming Event Licen", "BC"),
    (r"\bLR\d{2}-\d+", "SK"), (r"AGLC", "AB"), (r"Service NL|\d{2}-\d{8}LT", "NL"),
    (r"PEI|Prince Edward Island", "PE"), (r"New Brunswick|Nouveau-Brunswick", "NB"),
]


ASC_HOSTS = ["https://public-raffles.ca-4.ascendfs.net/rest/v1/",
             "https://prd-guillotine-api-cacentral1-post8000.5050central.com/rest/v1/"]


def ascend_base(html: str) -> tuple[str | None, str | None]:
    """(REST base, legacy currentpot URL). Three page generations: Hydrogen
    (a literal …/rest/v1/<fragment> URL), Liquid (domainFragment and
    guillotineEnv variables) and the old WordPress theme (only a
    <fragment>.5050central.com checkout link and an AWS currentpot URL)."""
    pot = re.search(r"https://[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com/v1/[a-z0-9]+/currentpot", html)
    m = re.search(r"(https://public-raffles[^\"'`\s]+/rest/v1/[a-z0-9.-]+)", html)
    if m:
        return m.group(1).rstrip("/"), None
    frag = re.search(r"domainFragment\s*=\s*['\"`]([^'\"`]+)", html) or re.search(r"https://([a-z0-9-]+\.5050central\.com)/", html)
    if frag:
        f = frag.group(1)
        for h in ASC_HOSTS:
            try:
                fetch(h + f + "/getactiveevents", retries=0)
                return h + f, None
            except Exception:  # noqa: BLE001
                continue
    return None, pot.group(0) if pot else None


def bump_tenant(site: str, html: str) -> str | None:
    origin = re.match(r"https?://[^/]+", site).group(0)
    for shard in ("ca", "ca2"):
        try:
            j = fetch_json(f"https://bcbn-prod.{shard}-central.bumpcbnraffle.net/e-retrieve", {"Origin": origin})
            d = j.get("domain") if isinstance(j, dict) else None
            if d:
                return d.replace(".bumpcbnraffle.net", "")
        except Exception:  # noqa: BLE001
            pass
    m = re.search(r"([a-z0-9]+)\.(ca2?)-api\.bumpcbnraffle\.net", html)
    return f"{m.group(1)}.{m.group(2)}-api" if m else None


def discover(site: str) -> dict:
    html = fetch(site)
    t = text_of(html)
    out: dict = {"url": site, "title": (re.search(r"<title>([^<]+)", html) or [None, ""])[1].strip()}
    base, pot = ascend_base(html)
    if pot and not base:
        out.update(platform="ascend-pot", ref=pot)
        try:
            out["pot"] = fetch_json(pot)
        except Exception as e:  # noqa: BLE001
            out["pot_error"] = str(e)[:80]
    if base:
        out.update(platform="ascend", ref=base)
        try:
            out["events"] = [e.get("title") for e in fetch_json(base + "/getactiveevents")][:3]
        except Exception as e:  # noqa: BLE001
            out["events_error"] = str(e)[:80]
    elif "bumpcbn" in html or "bump" in html.lower():
        ten = bump_tenant(site, html)
        if ten:
            out.update(platform="bump", ref=ten)
            try:
                ev = fetch_json(f"https://{ten}.bumpcbnraffle.net/api/web/event")
                ev = ev if isinstance(ev, list) else ev.get("data", [])
                out["events"] = [e.get("title") for e in ev][:3]
                out["cards"] = any(e.get("cards") for e in ev)
            except Exception as e:  # noqa: BLE001
                out["events_error"] = str(e)[:80]
    lic = re.search(r"(?:Licen[cs]e|Licence|License)\s*(?:No\.?|Number|#)?\s*:?\s*#?\s*([A-Z]{0,4}[- ]?[\d][\dA-Z -]{3,20}\d)", t)
    if lic:
        out["licence"] = lic.group(1).strip()
    for pat, prov in LICENCE_PROVINCE:
        if re.search(pat, t):
            out["province"] = prov
            break
    out["catch_the_ace"] = bool(re.search(r"catch the ace|chase the ace", t, re.I))
    return out


if __name__ == "__main__":
    for u in sys.argv[1:]:
        try:
            print(json.dumps(discover(u)))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"url": u, "error": str(e)[:120]}))
