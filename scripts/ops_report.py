#!/usr/bin/env python3
"""ops_report.py — the owner's daily and weekly operating emails.

    python scripts/ops_report.py daily            # admin-daily.yml, every morning
    python scripts/ops_report.py weekly           # seo-health.yml, Mondays
    python scripts/ops_report.py daily --out x.html --no-send   # render only

The point is that the owner never has to open a dashboard: every number a
day-to-day decision needs lands in the inbox, compared against the period
before, with anything abnormal pulled out on top.

Days are Toronto calendar days, the same boundary email_log.sent_date uses.

Honesty rules this file follows (CLAUDE.md):
  * A number we couldn't read is shown as "未读取", never as 0.
  * Email volume is counted from Resend's own list of sent messages (what
    the provider accepted, with its latest delivery event), restricted to
    subscriber addresses. If Resend can't be read, email_log is shown
    instead and labelled as intent, not delivery, because that's what it is.
  * Plus and MRR at a past moment are reconstructed from Stripe's own
    timestamps (created / trial_end / ended_at) rather than from a stored
    snapshot, so comparisons work from the first run. MRR uses each
    subscription's current price and ignores coupons, like
    business_metrics.py.
  * RapidAPI has no provider API for subscribers or revenue on the public
    hub (its GraphQL Platform API is Enterprise Hub only), so that line is
    always "needs a manual look" with the dashboard link.

Internal test accounts (any @lottizen.com address) are excluded throughout.
Each daily run also upserts a row into ops_snapshots: an append-only daily
record of the totals, kept for the metrics history a buyer would ask for.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, time as dtime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
TZ = ZoneInfo("America/Toronto")
INTERNAL_DOMAIN = "@lottizen.com"
SITE = "https://lottizen.com"
FROM = "Lottizen Ops <ops@mail.lottizen.com>"
RAPIDAPI_STUDIO = "https://rapidapi.com/studio"
RAPIDAPI_LISTING = "https://rapidapi.com/l3rundong/api/lottizen-data-api"
# "cancelled" includes a job that never got a runner (see ci-failure-alert.yml).
FAILED = {"failure", "timed_out", "startup_failure", "cancelled"}


# --------------------------------------------------------------- time windows

def day_window(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, dtime.min, TZ)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


def span(first: date, days: int) -> tuple[datetime, datetime]:
    return day_window(first)[0], day_window(first + timedelta(days=days - 1))[1]


def ts(v) -> datetime | None:
    """Parse Supabase / Resend timestamps ("2026-10-04 15:22:50.1+00") and
    Stripe epoch seconds into aware UTC datetimes."""
    if v in (None, ""):
        return None
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(v, timezone.utc)
    s = str(v).replace(" ", "T").replace("Z", "+00:00")
    s = re.sub(r"([+-]\d\d)$", r"\1:00", s)
    s = re.sub(r"\.(\d+)", lambda m: "." + m.group(1)[:6].ljust(6, "0"), s)
    d = datetime.fromisoformat(s)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def within(v, w: tuple[datetime, datetime]) -> bool:
    t = ts(v)
    return t is not None and w[0] <= t < w[1]


# ------------------------------------------------------------------- sources

class Unavailable(Exception):
    pass


def subscribers() -> list[dict]:
    import db
    rows: list[dict] = []
    start = 0
    while True:
        page = (db.get_client().table("subscribers")
                .select("id,email,tier,created_at,confirmed_at,unsubscribed_at")
                .order("id").range(start, start + 999).execute().data)
        rows.extend(page)
        if len(page) < 1000:
            return rows
        start += 1000


def is_internal(email: str | None) -> bool:
    return (email or "").lower().endswith(INTERNAL_DOMAIN)


def subscriber_flows(rows: list[dict], w) -> dict:
    return {
        "new": sum(1 for r in rows if within(r["confirmed_at"], w)),
        "signups_unconfirmed": sum(1 for r in rows if within(r["created_at"], w) and not r["confirmed_at"]),
        "unsubs": sum(1 for r in rows if within(r["unsubscribed_at"], w)),
    }


def subscribers_at(rows: list[dict], t: datetime) -> int:
    """Confirmed and not unsubscribed at moment t. An unsubscribe that was
    later cleared (it has happened once) is invisible to this, which is why
    ops_snapshots also keeps each day's count as measured."""
    n = 0
    for r in rows:
        c, u = ts(r["confirmed_at"]), ts(r["unsubscribed_at"])
        if c and c <= t and not (u and u <= t):
            n += 1
    return n


def tickets(internal_ids: set[str], w) -> int:
    import db
    rows = db.fetch_all("user_tickets", "id,subscriber_id",
                        filters=[("gte", "created_at", w[0].isoformat()), ("lt", "created_at", w[1].isoformat())])
    return sum(1 for r in rows if r["subscriber_id"] not in internal_ids)


def email_intent(internal_ids: set[str], first: date, last: date) -> dict[str, dict[str, int]]:
    """email_log outcomes by Toronto date: {"sent": n, "skipped:free_weekly_cap": n,
    "failed": n, "queued": n}. 'sent' means Resend accepted it — delivery is
    Resend's to say, not this table's."""
    import db
    rows = db.fetch_all("email_log", "id,subscriber_id,status,skip_reason,sent_date",
                        filters=[("gte", "sent_date", first.isoformat()), ("lte", "sent_date", last.isoformat())])
    out: dict[str, dict[str, int]] = {}
    for r in rows:
        if r["subscriber_id"] in internal_ids:
            continue
        k = f"skipped:{r['skip_reason'] or '?'}" if r["status"] == "skipped" else r["status"]
        day = out.setdefault(r["sent_date"], {})
        day[k] = day.get(k, 0) + 1
    return out


OUTCOME_CN = {"failed": "发送失败", "queued": "卡在发送中", "skipped:free_weekly_cap": "免费每周上限拦下",
              "skipped:no_resend_key": "缺 Resend key", "skipped:legacy_not_in_resend": "旧记录·未进入 Resend"}


def not_sent_text(outcomes: dict[str, int] | None) -> str:
    parts = [f"{OUTCOME_CN.get(k, k)} {v}" for k, v in sorted((outcomes or {}).items()) if k != "sent" and v]
    return " · 未发出：" + "，".join(parts) if parts else ""


def resend_sent(addresses: set[str], since: datetime) -> list[dict]:
    """Messages Resend accepted since `since` to one of `addresses`, newest
    first, excluding the owner-only notifications. Raises Unavailable if the
    key can't list."""
    import mailer
    try:
        msgs = mailer.list_sent(since)
    except RuntimeError as e:
        raise Unavailable(str(e)) from e
    return [m for m in msgs
            if "ops@" not in (m.get("from") or "")
            and not (m.get("subject") or "").startswith(mailer.OWNER_ONLY_SUBJECTS)
            and any((a or "").lower() in addresses for a in (m.get("to") or []))]


def resend_counts(msgs: list[dict], w) -> dict:
    sel = [m for m in msgs if within(m["created_at"], w)]
    by_subject: dict[str, int] = {}
    for m in sel:  # to the job log only — subjects carry no addresses
        by_subject[m.get("subject") or ""] = by_subject.get(m.get("subject") or "", 0) + 1
    print(f"Resend {w[0]:%Y-%m-%d %H:%M}Z..{w[1]:%H:%M}Z: " + "; ".join(f"{v}× {k}" for k, v in by_subject.items()))
    events: dict[str, int] = {}
    for m in sel:
        e = m.get("last_event") or "unknown"
        events[e] = events.get(e, 0) + 1
    return {"sent": len(sel), "events": events}


class Stripe:
    """Live Plus subscriptions, read once and reconstructed at any moment."""

    def __init__(self) -> None:
        key = os.environ.get("STRIPE_SECRET_KEY", "")
        if not key.startswith(("sk_live_", "rk_live_")):
            raise Unavailable("STRIPE_SECRET_KEY 不是 live key")
        import stripe
        stripe.api_key = key
        self.subs = []
        for s in stripe.Subscription.list(status="all", limit=100, expand=["data.customer"]).auto_paging_iter():
            cust = s.get("customer")
            email = cust.get("email") if hasattr(cust, "get") else None
            if is_internal(email) or s.get("status") in ("incomplete", "incomplete_expired"):
                continue
            self.subs.append(s)

    @staticmethod
    def _trial(s) -> bool:
        return bool(s.get("trial_end")) and s["trial_end"] > s["created"]

    def flows(self, w) -> dict:
        new = [s for s in self.subs if within(s["created"], w)]
        return {
            "new_trial": sum(1 for s in new if self._trial(s)),
            "new_paid": sum(1 for s in new if not self._trial(s)),
            # canceled_at is when the cancellation was requested — including
            # cancel-at-period-end, where access continues until ended_at.
            "cancels": sum(1 for s in self.subs if within(s.get("canceled_at"), w)),
        }

    def state_at(self, t: datetime) -> dict:
        trialing = active = 0
        mrr = 0.0
        cur: set[str] = set()
        for s in self.subs:
            start, end = ts(s.get("start_date") or s["created"]), ts(s.get("ended_at"))
            if not start or start > t or (end and end <= t):
                continue
            if s.get("trial_end") and ts(s["trial_end"]) > t:
                trialing += 1
                continue
            active += 1
            for item in s["items"]["data"]:
                price = item["price"]
                rec = price.get("recurring") or {}
                per = {"day": 365 / 12, "week": 52 / 12, "month": 1, "year": 1 / 12}.get(rec.get("interval"), 0)
                per /= rec.get("interval_count") or 1
                mrr += (price.get("unit_amount") or 0) * (item.get("quantity") or 1) * per / 100
                cur.add((price.get("currency") or "").upper())
        if len(cur) > 1:  # summing CAD and USD would be a made-up number
            return {"trialing": trialing, "active": active, "mrr": None, "currency": "/".join(sorted(cur))}
        return {"trialing": trialing, "active": active, "mrr": round(mrr, 2), "currency": cur.pop() if cur else "CAD"}


def gh_json(args: list[str]):
    out = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=90, check=True).stdout
    return json.loads(out) if out.strip() else None


def repo() -> str:
    return os.environ.get("GITHUB_REPOSITORY") or gh_json(["repo", "view", "--json", "nameWithOwner"])["nameWithOwner"]


def workflow_runs(w) -> list[dict]:
    created = f"{w[0].strftime('%Y-%m-%dT%H:%M:%SZ')}..{w[1].strftime('%Y-%m-%dT%H:%M:%SZ')}"
    runs: list[dict] = []
    for page in range(1, 11):
        res = gh_json(["api", f"repos/{repo()}/actions/runs?created={urllib.parse.quote(created)}&per_page=100&page={page}"])
        batch = res.get("workflow_runs") or []
        runs.extend(batch)
        if len(batch) < 100:
            break
    return runs


def daily_workflows() -> dict[str, str]:
    """path -> name of every workflow whose schedule fires every day."""
    out = {}
    for p in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
        text = p.read_text()
        crons = re.findall(r'cron:\s*"([^"]+)"', text)
        if any(c.split()[2:] == ["*", "*", "*"] for c in crons):
            m = re.search(r"^name:\s*(.+)$", text, re.M)
            out[f".github/workflows/{p.name}"] = (m.group(1).strip().strip('"') if m else p.name)
    return out


def workflow_health(w, check_missing: bool) -> dict:
    """Failed runs in the window (noting which a later run already fixed) and,
    for a single day, daily-scheduled workflows that never ran at all."""
    runs = workflow_runs(w)
    by_wf: dict[str, list[dict]] = {}
    for r in runs:
        by_wf.setdefault(r["path"], []).append(r)
    failures = []
    for path, rs in by_wf.items():
        rs.sort(key=lambda r: r["created_at"])
        bad = [r for r in rs if r.get("conclusion") in FAILED]
        if not bad:
            continue
        latest = gh_json(["api", f"repos/{repo()}/actions/workflows/{path.rsplit('/', 1)[-1]}/runs?per_page=1&status=completed"])
        last = (latest.get("workflow_runs") or [{}])[0]
        failures.append({
            "name": bad[-1]["name"], "count": len(bad), "url": bad[-1]["html_url"],
            "recovered": last.get("conclusion") == "success" and last.get("created_at", "") > bad[-1]["created_at"],
        })
    missing = []
    if check_missing:
        ran = {r["path"] for r in runs}
        # A workflow added after the window opened couldn't have run in it.
        created = {wf["path"]: wf["created_at"] for wf in
                   (gh_json(["api", f"repos/{repo()}/actions/workflows?per_page=100"]) or {}).get("workflows", [])}
        missing = [name for path, name in daily_workflows().items()
                   if path not in ran and path in created and ts(created[path]) < w[0]]
    return {"failures": failures, "missing": missing, "total": len(runs)}


def try_(fn, *a, **k):
    """(value, None) or (None, short error) — one dead source never sinks the email."""
    try:
        return fn(*a, **k), None
    except Unavailable as e:
        return None, str(e)
    except Exception as e:  # noqa: BLE001
        print(f"warning: {fn.__name__}: {type(e).__name__}: {e}", file=sys.stderr)
        return None, f"{type(e).__name__}: {str(e)[:140]}"


# --------------------------------------------------------------------- render
# Same palette and type as the site (app/globals.css) and the subscriber
# emails (email_templates.py): cream page, white card, orange eyebrow,
# Georgia standing in for Playfair, monospace tabular numbers.

INK, INK2, INK3, BRAND, DEEP, LINE = "#1a1815", "#6d685f", "#9c968a", "#dd8232", "#c2652a", "#e6e0d4"
GREEN, RED = "#4c7a46", "#b3422e"
SERIF = "Georgia,'Times New Roman',serif"
SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif"
MONO = "'SFMono-Regular',Consolas,Menlo,monospace"
E = html.escape


def fmt(v, money: bool = False, cur: str = "") -> str:
    if v is None:
        return "未读取"
    if money:
        return f"${v:,.2f}" + (f" {cur}" if cur else "")
    return f"{v:,}"


def delta(now, before, money: bool = False, good_up: bool = True) -> str:
    if now is None or before is None:
        return f'<span style="color:{INK3}">—</span>'
    d = now - before
    if abs(d) < 1e-9:
        return f'<span style="color:{INK3}">±0</span>'
    color = GREEN if (d > 0) == good_up else RED
    txt = (f"{d:+,.2f}" if money else f"{d:+,}")
    return f'<span style="color:{color};font-weight:600">{txt}</span>'


def row(label: str, value: str, d: str = "", sub: str = "") -> str:
    sub_html = f'<div style="font-size:12px;color:{INK3};margin-top:2px">{sub}</div>' if sub else ""
    return (f'<tr><td style="padding:9px 0;border-bottom:1px solid {LINE};font-size:14px;color:{INK}">{label}{sub_html}</td>'
            f'<td align="right" style="padding:9px 0;border-bottom:1px solid {LINE};font-family:{MONO};font-size:15px;'
            f'font-weight:600;color:{INK};white-space:nowrap">{value}</td>'
            f'<td align="right" width="76" style="padding:9px 0 9px 12px;border-bottom:1px solid {LINE};font-family:{MONO};'
            f'font-size:13px;white-space:nowrap">{d}</td></tr>')


def table(rows_html: str, col: str = "") -> str:
    head = ""
    if col:
        head = (f'<tr><td></td><td></td><td align="right" style="padding:0 0 4px 12px;font-size:11px;color:{INK3};'
                f'white-space:nowrap">{col}</td></tr>')
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">{head}{rows_html}</table>'


def h2(text: str) -> str:
    return (f'<div style="font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:{BRAND};'
            f'margin:26px 0 6px">{text}</div>')


def alerts_box(items: list[str]) -> str:
    if not items:
        return ""
    lis = "".join(f'<li style="margin:0 0 6px">{i}</li>' for i in items)
    return (f'<div style="background:#fbeee8;border-left:3px solid {RED};border-radius:6px;padding:12px 16px;margin:18px 0 4px">'
            f'<div style="font-size:12px;font-weight:700;color:{RED};letter-spacing:.06em;margin-bottom:6px">需要注意 · {len(items)}</div>'
            f'<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.5;color:{INK}">{lis}</ul></div>')


def ok_box(text: str) -> str:
    return (f'<div style="background:#e7efe4;border-radius:6px;padding:10px 16px;margin:18px 0 4px;font-size:13.5px;'
            f'color:{GREEN}">{text}</div>')


def note(text: str) -> str:
    return f'<p style="font-size:12px;color:{INK3};line-height:1.6;margin:8px 0 0">{text}</p>'


def link(href: str, label: str) -> str:
    return f'<a href="{E(href)}" style="color:{DEEP}">{E(label)}</a>'


def shell(eyebrow: str, title_html: str, dek: str, body: str, preview: str) -> str:
    return f"""<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Lottizen</title></head>
<body style="margin:0;padding:0;background:#f7f4ed;font-family:{SANS};color:{INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{E(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#fff;border:1px solid {LINE};border-radius:14px">
<tr><td style="padding:22px 32px;border-bottom:1px solid {LINE}">
<span style="font-family:{SERIF};font-weight:700;font-size:19px;color:{INK}">Lottizen</span>
<span style="font-size:12px;color:{INK3};margin-left:8px">{E(eyebrow)}</span></td></tr>
<tr><td style="padding:26px 32px 30px">
<h1 style="font-family:{SERIF};font-weight:800;font-size:26px;line-height:1.25;margin:0 0 6px;color:{INK}">{title_html}</h1>
<p style="font-size:14px;color:{INK2};margin:0">{dek}</p>
{body}
</td></tr>
<tr><td style="padding:16px 32px 22px;border-top:1px solid {LINE};font-size:11.5px;color:{INK3};line-height:1.7">
只发给站长本人的内部运营邮件 · 生成于 {datetime.now(TZ).strftime('%Y-%m-%d %H:%M')} 多伦多时间 · scripts/ops_report.py</td></tr>
</table></td></tr></table></body></html>"""


def em(text: str) -> str:
    return f'<em style="font-style:italic;color:{DEEP}">{text}</em>'


def cn_date(d: date) -> str:
    return f"{d.month}月{d.day}日"


def email_volume_rows(cur, prev, intent_cur, intent_prev, resend_err) -> tuple[str, list[str], int | None]:
    """Rows for email volume. Returns (rows_html, alerts, sent_count)."""
    alerts = []
    if cur is not None:
        ev = cur["events"]
        bad = sum(ev.get(k, 0) for k in ("bounced", "complained", "failed"))
        parts = ", ".join(f"{k} {v}" for k, v in sorted(ev.items(), key=lambda kv: -kv[1])) or "无"
        r = row("邮件发送量", fmt(cur["sent"]), delta(cur["sent"], prev["sent"] if prev else None),
                f"Resend 实际发给订阅者 · 最新状态：{E(parts)}{E(not_sent_text(intent_cur))}")
        if bad:
            alerts.append(f"{bad} 封邮件退信 / 被投诉 / 发送失败（Resend 状态）")
        if intent_cur and (intent_cur.get("failed") or intent_cur.get("queued")):
            alerts.append(f"email_log：{intent_cur.get('failed', 0)} 封发送失败，{intent_cur.get('queued', 0)} 封卡在发送中")
        return r, alerts, cur["sent"]
    n_cur = intent_cur.get("sent", 0) if intent_cur is not None else None
    n_prev = intent_prev.get("sent", 0) if intent_prev is not None else None
    r = row("邮件发送量", fmt(n_cur), delta(n_cur, n_prev),
            f"email_log 记录为已发出（Resend 未读取，送达未确认：{E(resend_err or '')}）{E(not_sent_text(intent_cur))}")
    return r, alerts, n_cur


# ---------------------------------------------------------------------- daily

def build_daily(today: date) -> tuple[str, str, dict]:
    y, yy = today - timedelta(days=1), today - timedelta(days=2)
    wy, wyy = day_window(y), day_window(yy)
    now = datetime.now(timezone.utc)
    errors: list[str] = []

    subs, err = try_(subscribers)
    if err:
        errors.append(f"Supabase 订阅者：{err}")
    real = [r for r in subs or [] if not is_internal(r["email"])]
    internal_ids = {r["id"] for r in subs or [] if is_internal(r["email"])}
    addresses = {r["email"].lower() for r in real}

    sf = subscriber_flows(real, wy) if subs else None
    sf_prev = subscriber_flows(real, wyy) if subs else None
    total_now = subscribers_at(real, now) if subs else None
    total_prev = subscribers_at(real, now - timedelta(days=1)) if subs else None

    st, serr = try_(Stripe)
    if serr:
        errors.append(f"Stripe：{serr}")
    pf, pf_prev = (st.flows(wy), st.flows(wyy)) if st else (None, None)
    ps_now = st.state_at(now) if st else None
    ps_prev = st.state_at(now - timedelta(days=1)) if st else None

    tk, terr = try_(tickets, internal_ids, wy)
    tk_prev, _ = try_(tickets, internal_ids, wyy)
    if terr:
        errors.append(f"票据：{terr}")

    msgs, rerr = try_(resend_sent, addresses, wyy[0])
    rc, rc_prev = (resend_counts(msgs, wy), resend_counts(msgs, wyy)) if msgs is not None else (None, None)
    intent, _ = try_(email_intent, internal_ids, yy, y)

    wf, werr = try_(workflow_health, wy, True)
    if werr:
        errors.append(f"GitHub Actions：{werr}")

    # ---- anomalies
    alerts: list[str] = []
    if sf and sf["unsubs"]:
        alerts.append(f"{sf['unsubs']} 人退订邮件")
    if pf and pf["cancels"]:
        alerts.append(f"{pf['cancels']} 个 Plus 订阅取消（含到期取消）")
    vol_html, vol_alerts, sent = email_volume_rows(
        rc, rc_prev, None if intent is None else intent.get(y.isoformat(), {}),
        None if intent is None else intent.get(yy.isoformat(), {}), rerr)
    alerts += vol_alerts
    if sent == 0:
        alerts.append(f"零发送：{cn_date(y)}没有任何邮件发给订阅者")
    for f in (wf or {}).get("failures", []):
        state = "后续运行已恢复" if f["recovered"] else "仍未恢复"
        alerts.append(f'Workflow 失败：{link(f["url"], f["name"])}（{f["count"]} 次，{state}）')
    for name in (wf or {}).get("missing", []):
        alerts.append(f"Workflow 未运行：{E(name)}（每日定时任务，{cn_date(y)}没有任何运行记录）")
    for e in errors:
        alerts.append(f"数据源读取失败 — {E(e)}")

    activity = [sf and sf["new"], sf and sf["unsubs"], sf and sf["signups_unconfirmed"], pf and pf["new_trial"],
                pf and pf["new_paid"], pf and pf["cancels"], tk]
    quiet = not alerts and not any(activity)

    cur = ps_now["currency"] if ps_now else ""
    plus_total = (ps_now["active"] + ps_now["trialing"]) if ps_now else None
    plus_total_prev = (ps_prev["active"] + ps_prev["trialing"]) if ps_prev else None

    totals = table(
        row("当前邮件订阅（已确认）", fmt(total_now), delta(total_now, total_prev))
        + row("当前 Plus 总数", fmt(plus_total), delta(plus_total, plus_total_prev),
              f"付费 {fmt(ps_now and ps_now['active'])} · 试用中 {fmt(ps_now and ps_now['trialing'])}" if ps_now else "")
        + row("MRR", fmt(ps_now and ps_now["mrr"], money=True, cur=cur),
              delta(ps_now and ps_now["mrr"], ps_prev and ps_prev["mrr"], money=True)),
        "较 24 小时前")
    api_row = row("API 订阅者 / 收入", "需手动查看", "",
                  f'RapidAPI 公开市场没有提供者数据接口 · {link(RAPIDAPI_STUDIO, "打开 RapidAPI Studio")}')

    headline_bits = []
    if sf:
        headline_bits.append(f"订阅 +{sf['new']}")
    if pf:
        headline_bits.append(f"Plus +{pf['new_trial'] + pf['new_paid']}")
    if ps_now and ps_now["mrr"] is not None:
        headline_bits.append(f"MRR ${ps_now['mrr']:,.0f}")
    subject = f"Lottizen 日报 · {cn_date(y)} · " + " · ".join(headline_bits)
    if alerts:
        subject = f"⚠ {len(alerts)} 项需注意 · " + subject

    if quiet:
        title = f"{cn_date(y)}，{em('平静的一天')}"
        dek = "没有新增订阅、Plus 变动、票据录入，也没有任何异常。"
        body = (ok_box(f"✓ 一切正常 · 发送 {fmt(sent)} 封邮件 · {wf['total'] if wf else '?'} 次 workflow 运行全部成功")
                + h2("现状") + totals + table(api_row))
    else:
        title = f"{cn_date(y)}：订阅 {em('+' + str(sf['new']) if sf else '?')}，Plus {em('+' + str(pf['new_trial'] + pf['new_paid']) if pf else '?')}"
        dek = f"{y.isoformat()}（多伦多时间整天），与前一日 {yy.isoformat()} 对比。"
        flows = table(
            row("新增邮件订阅", fmt(sf and sf["new"]), delta(sf and sf["new"], sf_prev and sf_prev["new"]),
                f"另有 {sf['signups_unconfirmed']} 人注册但未确认" if sf and sf["signups_unconfirmed"] else "")
            + row("退订", fmt(sf and sf["unsubs"]), delta(sf and sf["unsubs"], sf_prev and sf_prev["unsubs"], good_up=False))
            + row("新增 Plus · 试用中", fmt(pf and pf["new_trial"]), delta(pf and pf["new_trial"], pf_prev and pf_prev["new_trial"]))
            + row("新增 Plus · 付费", fmt(pf and pf["new_paid"]), delta(pf and pf["new_paid"], pf_prev and pf_prev["new_paid"]))
            + row("Plus 取消", fmt(pf and pf["cancels"]), delta(pf and pf["cancels"], pf_prev and pf_prev["cancels"], good_up=False))
            + vol_html
            + row("新增票据录入", fmt(tk), delta(tk, tk_prev)),
            "较前一日")
        body = (alerts_box(alerts) or ok_box(f"✓ 没有异常 · {wf['total'] if wf else '?'} 次 workflow 运行全部成功"))
        body += h2(f"昨日 · {cn_date(y)}") + flows + h2("现状") + totals + table(api_row)
        body += note("Plus 与 MRR 由 Stripe 订阅时间戳推算（按当前价格，不含优惠券）；内部测试账号 @lottizen.com 已排除。")
    html_out = shell("运营日报", title, dek, body, subject)

    snapshot = {
        "subscribers_confirmed": total_now, "plus_active": ps_now and ps_now["active"],
        "plus_trialing": ps_now and ps_now["trialing"], "mrr": ps_now and ps_now["mrr"], "mrr_currency": cur or None,
        "yesterday": {"new_subscribers": sf and sf["new"], "unsubscribes": sf and sf["unsubs"],
                      "new_plus_trial": pf and pf["new_trial"], "new_plus_paid": pf and pf["new_paid"],
                      "plus_cancels": pf and pf["cancels"], "emails_sent": sent, "tickets": tk},
        "alerts": len(alerts),
    }
    return subject, html_out, snapshot


def save_snapshot(today: date, metrics: dict) -> None:
    try:
        import db
        db.get_client().table("ops_snapshots").upsert(
            {"snapshot_date": today.isoformat(), "metrics": metrics}, on_conflict="snapshot_date").execute()
    except Exception as e:  # noqa: BLE001
        print(f"warning: ops_snapshots not written: {e}", file=sys.stderr)


# --------------------------------------------------------------------- weekly

def load_json(name: str):
    p = ROOT / name
    try:
        return json.loads(p.read_text()) if p.exists() else None
    except ValueError:
        return None


def metrics_rows() -> list[dict]:
    p = ROOT / "reports" / "metrics-history.csv"
    if not p.exists():
        return []
    with p.open(newline="") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return int(float(v)) if v not in (None, "") else None
    except ValueError:
        return None


def build_weekly(today: date) -> tuple[str, str]:
    # The last 7 complete Toronto days (Mon–Sun when run on a Monday) vs the 7 before.
    first = today - timedelta(days=7)
    w, wp = span(first, 7), span(first - timedelta(days=7), 7)
    errors: list[str] = []
    actions: list[str] = []

    subs, err = try_(subscribers)
    if err:
        errors.append(f"Supabase 订阅者：{err}")
    real = [r for r in subs or [] if not is_internal(r["email"])]
    internal_ids = {r["id"] for r in subs or [] if is_internal(r["email"])}
    sf, sfp = (subscriber_flows(real, w), subscriber_flows(real, wp)) if subs else (None, None)
    s_end, s_start = (subscribers_at(real, w[1]), subscribers_at(real, w[0])) if subs else (None, None)

    st, serr = try_(Stripe)
    if serr:
        errors.append(f"Stripe：{serr}")
    pf, pfp = (st.flows(w), st.flows(wp)) if st else (None, None)
    pe, ps = (st.state_at(w[1]), st.state_at(w[0])) if st else (None, None)

    tk, _ = try_(tickets, internal_ids, w)
    tkp, _ = try_(tickets, internal_ids, wp)
    msgs, rerr = try_(resend_sent, {r["email"].lower() for r in real}, wp[0])
    rc, rcp = (resend_counts(msgs, w), resend_counts(msgs, wp)) if msgs is not None else (None, None)
    intent, _ = try_(email_intent, internal_ids, first - timedelta(days=7), today - timedelta(days=1))
    week_days = {(first + timedelta(days=i)).isoformat() for i in range(7)}
    sum_intent = lambda days: {k: sum((intent or {}).get(d, {}).get(k, 0) for d in days)  # noqa: E731
                               for k in {t for v in (intent or {}).values() for t in v}}
    vol_html, vol_alerts, sent = email_volume_rows(
        rc, rcp, None if intent is None else sum_intent(week_days),
        None if intent is None else sum_intent({(first - timedelta(days=7 - i)).isoformat() for i in range(7)}), rerr)

    cur = pe["currency"] if pe else ""
    plus_e = (pe["active"] + pe["trialing"]) if pe else None
    plus_s = (ps["active"] + ps["trialing"]) if ps else None
    business = table(
        row("邮件订阅（已确认）", fmt(s_end), delta(s_end, s_start),
            f"本周新增 {fmt(sf and sf['new'])}（上周 {fmt(sfp and sfp['new'])}）· 退订 {fmt(sf and sf['unsubs'])}" if sf else "")
        + row("Plus 总数", fmt(plus_e), delta(plus_e, plus_s),
              (f"付费 {pe['active']} · 试用中 {pe['trialing']} · 本周新增 试用 {pf['new_trial']} / 付费 {pf['new_paid']} · 取消 {pf['cancels']}") if pe else "")
        + row("MRR", fmt(pe and pe["mrr"], money=True, cur=cur), delta(pe and pe["mrr"], ps and ps["mrr"], money=True))
        + vol_html
        + row("票据录入", fmt(tk), delta(tk, tkp), "本周新增，较上周")
        + row("API 订阅者 / 收入", "需手动查看", "",
              f'{link(RAPIDAPI_STUDIO, "RapidAPI Studio")} · {link(RAPIDAPI_LISTING, "公开页面")} · 看完请填进 metrics-history.csv 的 api_subscribers_manual'),
        "周环比")
    if sf and sf["unsubs"]:
        actions.append(f"本周 {sf['unsubs']} 人退订")
    if pf and pf["cancels"]:
        actions.append(f"本周 {pf['cancels']} 个 Plus 取消")
    actions += vol_alerts

    # ---- indexing, from reports/metrics-history.csv (written minutes earlier by business_metrics.py)
    mrows = metrics_rows()
    last = mrows[-1] if mrows else {}
    prev = mrows[-2] if len(mrows) > 1 else {}
    since = f"较 {prev.get('date', '—')}" if prev else "首次记录"

    def irow(label, col, sub=""):
        a, b = num(last.get(col)), num(prev.get(col))
        return row(label, fmt(a) if a is not None else "—", delta(a, b), sub)
    gsc_api = num(last.get("gsc_pages_with_impr_28d"))
    gsc_manual_dated = next((r for r in reversed(mrows) if num(r.get("gsc_indexed_manual")) is not None), None)
    index_rows = (
        irow("Bing 已收录页面", "bing_in_index", "Bing Webmaster API · InIndex")
        + row("Google 已收录页面", fmt(num(gsc_manual_dated["gsc_indexed_manual"])) if gsc_manual_dated else "—", "",
              (f"手动值，最近一次 {gsc_manual_dated['date']} · " if gsc_manual_dated else "")
              + "Search Console API 不提供此数字 · " + link("https://search.google.com/search-console/index", "GSC → 网页索引"))
        + (irow("Google 有展示的页面（28 天）", "gsc_pages_with_impr_28d", "Search Console API") if gsc_api is not None else "")
        + irow("Sitemap URL 数", "sitemap_urls")
        + irow("IndexNow 本周推送 URL", "indexnow_urls_7d", "我们发出的，不代表已收录")
    )
    if gsc_api is None:
        actions.append("GSC 未接入 API：设置 GitHub secret GSC_SERVICE_ACCOUNT_JSON 后每周自动读取展示与点击")
    if not gsc_manual_dated or gsc_manual_dated.get("date") != last.get("date"):
        actions.append(f"填写本周 Google 收录数：{link('https://search.google.com/search-console/index', 'GSC 网页索引')} → metrics-history.csv 的 gsc_indexed_manual（{last.get('date', '今天')} 行）")
    if not num(last.get("api_subscribers_manual")):
        actions.append(f"填写本周 API 订阅者数：{link(RAPIDAPI_STUDIO, 'RapidAPI Studio')} → api_subscribers_manual")

    # ---- health: SEO, freshness, billing, email delivery
    health = ""
    seo, seo_p = load_json("seo_health_result.json"), load_json("seo_health_problems.json") or []
    if seo is None:
        health += row("SEO 健康", "未运行", "", "本次没有 seo_health_result.json")
        actions.append("SEO 健康检查本次没有结果")
    else:
        sm, lg, sd = seo.get("sitemap", {}), seo.get("linkGraph", {}), seo.get("structuredData", {})
        health += row("SEO 健康", "✓ 正常" if not seo_p else f"✗ {len(seo_p)} 个问题", "",
                      f"抽样 {sm.get('sampledLive', '?')}/{sm.get('sampledTotal', '?')} 可访问 · 孤立页 {lg.get('orphans', '?')} · "
                      f"断链 {lg.get('brokenInternalLinks', '?')} · 结构化数据错误 {sd.get('errors', '?')}")
        actions += [f"SEO：{E(p['title'].replace('SEO health: ', ''))}" for p in seo_p[:8]]

    fresh = None
    try:
        out = subprocess.run([sys.executable, "scripts/audit_site.py", "--freshness", "--json"],
                             capture_output=True, text=True, timeout=120, check=True, cwd=ROOT).stdout
        fresh = json.loads(out)
    except Exception as e:  # noqa: BLE001
        errors.append(f"数据新鲜度：{type(e).__name__}")
    if fresh is not None:
        stale = fresh.get("stale", []) + fresh.get("staleScratch", [])
        names = ", ".join(s.get("name") or s.get("agency", "?") for s in stale)
        health += row("数据新鲜度", "✓ 全部最新" if not stale else f"✗ {len(stale)} 项滞后", "",
                      E(names) if stale else "所有开奖游戏与 5 家刮刮乐机构")
        for s in fresh.get("stale", []):
            missing = "、".join(cn_date(date.fromisoformat(d)) for d in s.get("missing") or [s["due"]])
            actions.append(f"数据滞后：{E(s['name'])} 缺 {missing} 的开奖（库里最新 {s['latest']}）")
        for s in fresh.get("staleScratch", []):
            actions.append(f"刮刮乐数据滞后：{E(s['agency'])} — {E(str(s.get('reason') or s.get('latest')))}")

    bill, bill_p = load_json("billing_health_result.json"), load_json("billing_health_problems.json") or []
    if bill is None:
        health += row("支付链路", "未读取", "", "没有找到 billing-health 的最近结果")
        actions.append("支付链路：本周没有 billing-health 结果")
    else:
        tf, lh, pg = bill.get("testFlow") or {}, bill.get("liveHealth") or {}, bill.get("plusGating") or {}
        ok = not bill_p
        health += row("支付链路", "✓ 正常" if ok else f"✗ {len(bill_p)} 个问题", "",
                      f"{bill.get('checkedAt', '?')[:10]} · 测试订阅→升级 {'✓' if tf.get('upgraded') else '✗'} 取消→降级 {'✓' if tf.get('downgraded') else '✗'}"
                      f" · 线上价格/Webhook {'✓' if lh.get('ok') else ('跳过' if lh.get('skipped') else '✗')}"
                      f" · Plus 功能门控 {'✓' if pg.get('ok') else '✗'}")
        actions += [f"支付：{E(p['title'].replace('Billing health: ', ''))}" for p in bill_p[:8]]

    mail, mail_p = load_json("email_delivery_result.json"), load_json("email_delivery_problems.json") or []
    if mail is not None:
        health += row("邮件投递监控", "✓ 正常" if not mail_p else f"✗ {len(mail_p)} 个问题", "",
                      f"{mail.get('checkedAt', '?')[:10]} · email-delivery-watchdog")
        actions += [f"邮件：{E(p['title'].replace('Email delivery: ', ''))}" for p in mail_p[:8]]

    wf, werr = try_(workflow_health, w, False)
    if werr:
        errors.append(f"GitHub Actions：{werr}")
    if wf:
        unrec = [f for f in wf["failures"] if not f["recovered"]]
        health += row("Workflow 运行", f"{wf['total']} 次", "",
                      f"{sum(f['count'] for f in wf['failures'])} 次失败，{len(unrec)} 个仍未恢复" if wf["failures"] else "本周全部成功")
        actions += [f'Workflow 仍失败：{link(f["url"], f["name"])}' for f in unrec]

    issues, _ = try_(gh_json, ["issue", "list", "--repo", repo(), "--label", "auto-monitor", "--state", "open",
                               "--json", "title,url", "--limit", "30"])
    for i in issues or []:
        actions.append(f'未关闭的监控 issue：{link(i["url"], i["title"])}')
    actions += [f"数据源读取失败 — {E(e)}" for e in errors]

    week_label = f"{cn_date(first)}–{cn_date(today - timedelta(days=1))}"
    subject = (f"Lottizen 周报 · {week_label} · 订阅 {fmt(s_end)} · Plus {fmt(plus_e)}"
               + (f" · MRR ${pe['mrr']:,.0f}" if pe and pe["mrr"] is not None else "")
               + (f" · {len(actions)} 件待办" if actions else ""))
    title = f"本周{em('订阅 ' + (f'{s_end - s_start:+d}' if s_end is not None else '?'))}，Plus {em(f'{plus_e - plus_s:+d}' if pe else '?')}"
    dek = f"{week_label}（多伦多时间），与前 7 天对比。"
    todo = ""
    if actions:
        lis = "".join(f'<li style="margin:0 0 7px">{a}</li>' for a in actions)
        todo = (f'<div style="background:#f6e7d6;border-radius:8px;padding:14px 18px;margin:18px 0 4px">'
                f'<div style="font-size:12px;font-weight:700;color:{DEEP};letter-spacing:.06em;margin-bottom:8px">需要你处理 · {len(actions)}</div>'
                f'<ol style="margin:0;padding-left:20px;font-size:13.5px;line-height:1.5;color:{INK}">{lis}</ol></div>')
    else:
        todo = ok_box("✓ 本周没有需要你处理的事")
    body = (todo + h2("经营") + business + h2(f"收录 · {since}") + table(index_rows)
            + h2("健康") + table(health)
            + note("Plus 与 MRR 由 Stripe 订阅时间戳推算（按当前价格，不含优惠券）；收录数来自 reports/metrics-history.csv；"
                   "内部测试账号 @lottizen.com 已排除。"))
    return subject, shell("运营周报", title, dek, body, subject)


# ----------------------------------------------------------------------- main

def confirm_delivery(msg_id: str) -> None:
    """Print Resend's latest event for the message we just sent — the
    evidence for 'it arrived', which the send call alone isn't."""
    key = os.environ.get("RESEND_API_KEY")
    for _ in range(8):
        time.sleep(8)
        req = urllib.request.Request(f"https://api.resend.com/emails/{msg_id}",
                                     headers={"Authorization": f"Bearer {key}", "User-Agent": "lottizen-ops/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                ev = json.loads(r.read().decode()).get("last_event")
        except Exception as e:  # noqa: BLE001
            print(f"  delivery lookup failed: {e}")
            return
        print(f"  Resend last_event: {ev}")
        if ev not in (None, "queued", "sent", "scheduled"):
            return


def already_sent_today(marker: str) -> bool:
    """True if Resend already accepted a report containing `marker` from the
    ops address today (Toronto). GitHub often starts a scheduled run hours
    late, so a manual run and the scheduled one can land on the same day."""
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        return False
    start = day_window(datetime.now(TZ).date())[0]
    req = urllib.request.Request("https://api.resend.com/emails?limit=100",
                                 headers={"Authorization": f"Bearer {key}", "User-Agent": "lottizen-ops/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode()).get("data") or []
    except Exception as e:  # noqa: BLE001 — can't tell, so send rather than go silent
        print(f"warning: duplicate check failed ({e}); sending anyway", file=sys.stderr)
        return False
    return any("ops@" in (m.get("from") or "") and marker in (m.get("subject") or "")
               and ts(m["created_at"]) >= start for m in data)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["daily", "weekly"])
    ap.add_argument("--out", help="also write the HTML here")
    ap.add_argument("--no-send", action="store_true")
    ap.add_argument("--date", help="Toronto date the report runs on (default: today)")
    ap.add_argument("--force", action="store_true", help="send even if one already went out today")
    a = ap.parse_args()

    today = date.fromisoformat(a.date) if a.date else datetime.now(TZ).date()
    if a.kind == "daily":
        subject, body, snap = build_daily(today)
        if not a.no_send:
            save_snapshot(today, snap)
    else:
        subject, body = build_weekly(today)
    print(subject)
    if a.out:
        Path(a.out).write_text(body)
        print(f"wrote {a.out}")
    if a.no_send:
        return 0
    to = os.environ.get("OPS_REPORT_EMAIL")
    if not to:
        print("error: OPS_REPORT_EMAIL not set", file=sys.stderr)
        return 1
    marker = "Lottizen 日报" if a.kind == "daily" else "Lottizen 周报"
    if not a.force and already_sent_today(marker):
        print(f"skip: a {a.kind} report already went out today")
        return 0
    import mailer
    # One recipient, the owner: an internal notification, not a bulk send,
    # so no List-Unsubscribe (same as outreach_common.send_to_owner).
    if not mailer.send_email(to, subject, body, from_email=FROM):
        return 1
    print(f"sent to owner, Resend id {mailer.last_message_id}")
    if mailer.last_message_id:
        confirm_delivery(mailer.last_message_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
