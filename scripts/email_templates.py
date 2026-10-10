"""email_templates.py — HTML for the two automated content emails
(draw-result, weekly digest). Visual language mirrors lib/email.ts's
emailShell (same palette, same table-based layout for Outlook
compatibility) — duplicated rather than shared because the sender is Python
(the daily/weekly workflows) while the live confirmation/manage-link mail is
sent from Next.js. Keep the two in visual sync by eye if either changes.
"""
from __future__ import annotations

from game_meta import CURRENCY_SYMBOL

SITE_NAME = "Lottizen"
# Kept in sync with lib/site.ts's SITE.tagline by hand (Python can't import
# it). The old "Smarter Scratch. Better Odds." was corrected there but not
# here, so it was still riding in the header of every automated email —
# "Better Odds" states exactly the thing CLAUDE.md forbids stating, and no
# selection strategy or value ranking changes anyone's odds of winning.
SITE_TAGLINE = "Smarter Numbers. Real Value."
SITE_URL = "https://lottizen.com"


def money(amount, currency: str = "CAD") -> str:
    sym = CURRENCY_SYMBOL.get(currency, "$")
    return f"{sym}{amount:,.0f}"


def ball(n, kind: str = "") -> str:
    bg = {"bonus": "#dd8232", "star": "#c2652a"}.get(kind, "#ffffff")
    color = "#ffffff" if kind else "#1a1815"
    border = bg if kind else "#ded7c9"
    return (
        f'<span style="display:inline-flex;align-items:center;justify-content:center;'
        f"width:38px;height:38px;border-radius:50%;background:{bg};border:1px solid {border};"
        f"font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:15px;font-weight:600;"
        f'color:{color};margin:0 4px 4px 0;">{n}</span>'
    )


def balls_row(numbers, bonus=None, bonus2=None) -> str:
    cells = "".join(ball(n) for n in numbers)
    if bonus is not None:
        cells += ball(bonus, "bonus")
    if bonus2 is not None:
        cells += ball(bonus2, "star")
    return f'<div style="margin:14px 0;">{cells}</div>'


def btn(href: str, label: str) -> str:
    return (
        f'<a href="{href}" style="display:inline-block;background:#dd8232;color:#ffffff;'
        f"font-weight:600;font-size:14px;text-decoration:none;padding:12px 22px;"
        f'border-radius:8px;margin-top:8px;">{label}</a>'
    )


def shell(preview_text: str, body_html: str, preferences_url: str, unsubscribe_url: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>{SITE_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f7f4ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preview_text}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e6e0d4;border-radius:14px;overflow:hidden;">
<tr><td style="padding:28px 36px;border-bottom:1px solid #e6e0d4;">
<span style="font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:20px;color:#1a1815;letter-spacing:-0.01em;">{SITE_NAME}</span>
<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#9c968a;margin-left:10px;">{SITE_TAGLINE}</span>
</td></tr>
<tr><td style="padding:32px 36px;color:#1a1815;font-size:15px;line-height:1.6;">
{body_html}
</td></tr>
<tr><td style="padding:20px 36px 28px;border-top:1px solid #e6e0d4;font-size:12px;color:#9c968a;line-height:1.7;">
<a href="{preferences_url}" style="color:#c2652a;text-decoration:underline;">Manage your subscription</a>
&nbsp;&middot;&nbsp;
<a href="{unsubscribe_url}" style="color:#c2652a;text-decoration:underline;">Unsubscribe</a>
<br />
Lottizen is an independent information site &mdash; not a lottery operator. You're receiving this because you subscribed at lottizen.com.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Data insight — one real, computed fact about tonight's draw. Every rule
# only touches scalar fields already documented in StatsFile/NumberStat
# (lib/draws.ts), so there's nothing here that can silently mis-parse.
# ---------------------------------------------------------------------------
def pick_insight(stats: dict, drawn: list[int]) -> str | None:
    numbers_stat = {n["n"]: n for n in stats.get("numbers", [])}

    # 1. A drawn number just set a new record gap.
    for n in drawn:
        ns = numbers_stat.get(n)
        if ns and ns.get("maxGap") == ns.get("currentGap") and (ns.get("currentGap") or 0) >= 15:
            return (
                f"Number {n} just set a new record: it hadn't appeared in "
                f"{ns['currentGap']} draws before tonight &mdash; its longest gap on record."
            )

    # 2. Two consecutive numbers in tonight's draw.
    s = sorted(drawn)
    if any(s[i + 1] - s[i] == 1 for i in range(len(s) - 1)):
        cpct = stats.get("aggregate", {}).get("consecutive", {}).get("pct")
        if cpct is not None:
            return f"Tonight's draw included two consecutive numbers &mdash; only about {cpct}% of draws do."

    # 3. Sum notably above/below the historical average.
    total = sum(drawn)
    avg = stats.get("aggregate", {}).get("sum", {}).get("avg")
    if avg:
        diff_pct = round(100 * (total - avg) / avg)
        if abs(diff_pct) >= 25:
            direction = "above" if diff_pct > 0 else "below"
            return (
                f"Tonight's sum of {total} is {abs(diff_pct)}% {direction} the historical "
                f"average of {avg:.0f}."
            )

    # 4. Fallback: the coldest of tonight's drawn numbers.
    candidates = [numbers_stat[n] for n in drawn if n in numbers_stat]
    if candidates:
        coldest = max(candidates, key=lambda x: x.get("currentGap") or 0)
        if (coldest.get("currentGap") or 0) >= 5:
            return f"Number {coldest['n']} had gone {coldest['currentGap']} draws without appearing before tonight."

    return None


def check_saved_numbers(saved: list[int], drawn: list[int], pick: int) -> tuple[int, bool, bool]:
    """Returns (matched_count, near_miss, full_match)."""
    matched = len(set(saved) & set(drawn))
    return matched, matched == pick - 1, matched == pick


# ---------------------------------------------------------------------------
# Draw-result (instant) email
# ---------------------------------------------------------------------------
def draw_result_email(
    *,
    game_name: str,
    game_url: str,
    draw_date: str,
    numbers: list[int],
    bonus: int | None,
    bonus2: int | None,
    jackpot_won: bool | None,
    next_draw: str | None,
    next_jackpot,
    currency: str,
    insight: str | None,
    saved_combinations: list[dict] | None,  # [{"numbers": [...], "label": str|None, "match": (matched, near_miss, full_match)}]
    scratch_top3: list[dict] | None,
    dashboard_url: str,
    preferences_url: str,
    unsubscribe_url: str,
) -> tuple[str, str]:
    subject = f"{game_name}: {', '.join(str(n) for n in numbers)}" + (f" + {bonus}" if bonus is not None else "")

    parts = [
        f'<h1 style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;font-weight:700;color:#1a1815;margin:0 0 6px;">{game_name}</h1>',
        f'<p style="margin:0 0 4px;color:#6d685f;font-size:13px;">{draw_date}</p>',
        balls_row(numbers, bonus, bonus2),
    ]

    if jackpot_won is True:
        parts.append('<p style="margin:0 0 10px;font-weight:600;color:#c2652a;">🎉 The jackpot was won on this draw.</p>')
    elif next_jackpot:
        parts.append(f'<p style="margin:0 0 10px;">Next jackpot: <strong>{money(next_jackpot, currency)}</strong></p>')
    if next_draw:
        parts.append(f'<p style="margin:0 0 18px;color:#6d685f;font-size:14px;">Next draw: {next_draw}</p>')

    # Every saved combination's match result, for everyone (Plus retired
    # 2026-10-09; this used to be Plus-only).
    if saved_combinations:
        for combo in saved_combinations:
            matched, near_miss, full_match = combo["match"]
            nums_str = ", ".join(str(n) for n in combo["numbers"])
            label = f" ({combo['label']})" if combo.get("label") else ""
            if full_match:
                line = f"🎉 <strong>All numbers matched{label}: {nums_str}.</strong> Check your ticket against the official results immediately."
            elif near_miss:
                line = f"Your saved numbers{label} ({nums_str}) matched <strong>{matched}</strong> &mdash; one number away from the top prize."
            else:
                line = f"Your saved numbers{label} ({nums_str}) matched <strong>{matched}</strong> this draw."
            parts.append(f'<div style="background:#f6e7d6;border-radius:10px;padding:14px 16px;margin:0 0 10px;font-size:14.5px;">{line}</div>')

    if insight:
        parts.append(
            f'<div style="border-left:3px solid #dd8232;padding:4px 0 4px 14px;margin:0 0 18px;font-size:14.5px;color:#1a1815;">{insight}</div>'
        )

    if scratch_top3:
        rows = "".join(
            f'<li style="margin-bottom:4px;">{g["name"]} (${round(g["price"])}) &mdash; value score {g["valueScore"]:.1f}</li>'
            for g in scratch_top3
        )
        parts.append(
            f'<div style="margin:0 0 18px;"><p style="margin:0 0 6px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#9c968a;">Today\'s top 3 Ontario scratch tickets</p><ul style="margin:0;padding-left:18px;font-size:14px;">{rows}</ul></div>'
        )

    parts.append(btn(game_url, "See full stats & results"))

    html = shell(
        preview_text=f"{game_name} numbers: {', '.join(str(n) for n in numbers)}",
        body_html="".join(parts),
        preferences_url=preferences_url,
        unsubscribe_url=unsubscribe_url,
    )
    return subject, html


# ---------------------------------------------------------------------------
# Weekly digest
# ---------------------------------------------------------------------------
PICK_NOTE = "This is about prize money left, not your odds."
BAND_LABEL = {"1-5": "$1–5", "10": "$6–10", "20+": "Over $10"}


def _top_prize(g: dict) -> str:
    from prize_values import is_annuity
    label = " ".join(str(g.get("top_label") or "").split())
    if label and is_annuity(label):
        return label
    return money(g["top_amount"]) if g.get("top_amount") is not None else (label or "top prize")


def pick_sentences(p: dict, g: dict) -> tuple[str, str]:
    """(why it ranks first, what it still has) — the same wording rules as
    the homepage (components/home/ProvinceBlock.tsx): the reason is stated in
    the terms of the agency's scoring method, never as odds."""
    among = f"the {p['onSaleCount']} {p['agencyName']} scratch tickets on sale"
    if p["agency"] == "WCLC":
        why = f"It has the most disclosed prize money still unclaimed per $1 of ticket price among {among}."
    elif p["agency"] == "ALC":
        why = (f"It has the highest share of its top prizes still unclaimed among {among} "
               f"(ties go to the one with the most top prizes left).")
    else:
        why = f"It has the highest Value Score among {among}: its big prizes are being claimed more slowly than its small ones."
    left = g.get("top_remaining") or 0
    if g.get("top_total") is not None:
        tops = (f"all {g['top_total']} of its top prizes ({_top_prize(g)})" if left == g["top_total"]
                else f"{left} of its {g['top_total']} top prizes ({_top_prize(g)})")
    else:
        tops = f"{left} top prize{'' if left == 1 else 's'} ({_top_prize(g)}) unclaimed"
    share = f" and {g['share_left_pct']}% of its printed prize money unclaimed" if g.get("share_left_pct") is not None else ""
    return why, f"It still has {tops}{share}."


def picks_section(p: dict) -> str:
    """This week's pick + skip list for the subscriber's province (from
    data/picks/canada.json, scripts/weekly_picks.py)."""
    url = lambda g: f"{SITE_URL}/scratch/{g['province']}/{g['slug']}"  # noqa: E731
    head = ('<p style="margin:0 0 6px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;'
            f'color:#9c968a;">This week&rsquo;s pick &middot; {p["label"]}</p>')
    out = [head]
    g = (p.get("picks") or {}).get("overall")
    if g:
        why, has = pick_sentences(p, g)
        out.append(f'<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:20px;font-weight:700;">'
                   f'<a href="{url(g)}" style="color:#1a1815;text-decoration:none;">{g["name"]}</a> '
                   f'<span style="font-size:14px;color:#6d685f;">{money(g["price"])}</span></p>')
        out.append(f'<p style="margin:0 0 6px;font-size:14.5px;">{why} {has}</p>')
        out.append(f'<p style="margin:0 0 10px;font-size:12.5px;color:#9c968a;">{PICK_NOTE}</p>')
        bands = []
        for b in ("1-5", "10", "20+"):
            bg = p["picks"].get(b)
            if bg:
                bands.append(f'{BAND_LABEL[b]}: <a href="{url(bg)}" style="color:#c2652a;">{bg["name"]}</a> ({money(bg["price"])})')
        if bands:
            out.append(f'<p style="margin:0 0 14px;font-size:13.5px;">{" &middot; ".join(bands)}</p>')
    skip = p.get("skip") or []
    if skip:
        names = ", ".join(f'{x["name"]} ({money(x["price"])})' for x in skip[:5]) + (", …" if len(skip) > 5 else "")
        out.append(f'<p style="margin:0 0 4px;font-size:14.5px;"><strong>Skip:</strong> {len(skip)} '
                   f'{"ticket" if len(skip) == 1 else "tickets"} still on sale in {p["label"]} '
                   f'{"has" if len(skip) == 1 else "have"} no top prize left: {names}</p>')
    new = p.get("newTickets") or []
    if new:
        names = ", ".join(f'{x["name"]} ({money(x["price"])}, {x["launch_date"]})' for x in new[:4])
        out.append(f'<p style="margin:10px 0 4px;font-size:14.5px;"><strong>New tickets:</strong> {names}. '
                   f'A new ticket has had the least time for its prizes to be claimed.</p>')
    out.append(f'<p style="margin:0 0 20px;font-size:13px;"><a href="{SITE_URL}/" style="color:#c2652a;">'
               f'See this week&rsquo;s pick and skip list for {p["label"]} &rarr;</a></p>')
    return ('<div style="margin:0 0 24px;padding:16px 18px;border:1px solid #e6e0d4;border-radius:10px;">'
            + "".join(out) + "</div>")


def charity_section(c: dict) -> str:
    """This week's charity lottery deadlines and the biggest 50/50 pot in the
    subscriber's province (data/charity/index.json — the lotteries' own figures)."""
    items = "".join(
        f'<li style="margin-bottom:6px;"><a href="{d["url"]}" style="color:#c2652a;font-weight:600;">{d["name"]}</a>'
        f' &mdash; {d["deadline"]} deadline, {d["when"]}</li>'
        for d in c.get("deadlines", [])
    )
    pot = c.get("pot")
    if pot:
        items += (f'<li style="margin-bottom:6px;">Biggest 50/50 pot now: <a href="{pot["url"]}" style="color:#c2652a;font-weight:600;">'
                  f'{pot["name"]}</a>, {pot["amount"]}</li>')
    return (
        f'<h2 style="font-family:Georgia,\'Times New Roman\',serif;font-size:17px;font-weight:700;color:#1a1815;margin:22px 0 8px;">'
        f'Charity lotteries in {c["label"]} this week</h2>'
        f'<ul style="margin:0 0 6px;padding-left:18px;font-size:14px;">{items}</ul>'
        '<p style="margin:0 0 14px;font-size:12px;color:#9c968a;">Only people in the licensing province can buy; '
        'tickets are sold on each lottery\'s own site.</p>'
    )


def weekly_digest_email(
    *,
    game_sections: list[dict],  # [{name, url, draws: [{date, numbers, bonus, bonus2}]}]
    highlights: list[str],
    guide: dict | None,  # {title, url}
    preferences_url: str,
    unsubscribe_url: str,
    province_picks: dict | None = None,  # data/picks/canada.json provinces[<subscriber.province>]
    charity: dict | None = None,  # {"label", "deadlines": [{name, url, deadline, when}], "pot": {name, url, amount}}
) -> tuple[str, str]:
    subject = "Your Lottizen weekly digest"
    pick = (province_picks or {}).get("picks", {}).get("overall") if province_picks else None
    if pick:
        subject = f"This week in {province_picks['label']}: {pick['name']}, and what to skip"
    parts = [
        '<h1 style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;font-weight:700;color:#1a1815;margin:0 0 16px;">This week, by the numbers</h1>'
    ]
    if charity and (charity.get("deadlines") or charity.get("pot")):
        parts.append(charity_section(charity))
        if not pick:
            subject = f"This week in {charity['label']}: charity lottery deadlines and 50/50s"
    if province_picks and province_picks.get("onSaleKnown"):
        parts.append(picks_section(province_picks))

    if not game_sections and not province_picks and not charity:
        parts.append(
            '<p style="margin:0 0 18px;color:#6d685f;">No results this week for the games you follow &mdash; '
            '<a href="https://lottizen.com/subscribe/preferences" style="color:#c2652a;">follow more games</a>.</p>'
        )
    for sec in game_sections:
        parts.append(
            f'<h2 style="font-family:Georgia,\'Times New Roman\',serif;font-size:17px;font-weight:700;color:#1a1815;margin:22px 0 8px;">{sec["name"]}</h2>'
        )
        for d in sec["draws"]:
            parts.append(f'<p style="margin:0 0 2px;color:#6d685f;font-size:13px;">{d["date"]}</p>')
            parts.append(balls_row(d["numbers"], d.get("bonus"), d.get("bonus2")))

    if highlights:
        items = "".join(f'<li style="margin-bottom:6px;">{h}</li>' for h in highlights)
        parts.append(
            f'<div style="margin:24px 0;background:#f1ece1;border-radius:10px;padding:16px 18px;">'
            f'<p style="margin:0 0 8px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#9c968a;">This week\'s data highlights</p>'
            f'<ul style="margin:0;padding-left:18px;font-size:14px;">{items}</ul></div>'
        )

    if guide:
        parts.append(
            f'<p style="margin:20px 0 0;font-size:14.5px;">Worth a read: '
            f'<a href="{guide["url"]}" style="color:#c2652a;font-weight:600;">{guide["title"]}</a></p>'
        )

    html = shell(
        preview_text="This week's results, jackpot trends, and data highlights.",
        body_html="".join(parts),
        preferences_url=preferences_url,
        unsubscribe_url=unsubscribe_url,
    )
    return subject, html


# ---------------------------------------------------------------------------
# Scratch alerts — sent immediately, not batched, by
# scripts/scratch_alerts.py. One template covers all 3 event kinds; the
# subject/lede differ by `kind`.
# ---------------------------------------------------------------------------
def scratch_alert_email(
    *,
    kind: str,  # "claimed" | "new_game" | "rank_drop"
    game_name: str,
    game_url: str,
    province_label: str,
    detail: str,  # kind-specific one-liner, e.g. "The $250,000 top prize was just claimed."
    preferences_url: str,
    unsubscribe_url: str,
) -> tuple[str, str]:
    subjects = {
        "claimed": f"Top prize claimed: {game_name}",
        "new_game": f"New ticket just launched: {game_name}",
        "rank_drop": f"{game_name} dropped in the rankings",
    }
    subject = subjects.get(kind, game_name)

    parts = [
        f'<p style="margin:0 0 6px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#9c968a;">{province_label} scratch alert</p>',
        f'<h1 style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;font-weight:700;color:#1a1815;margin:0 0 10px;">{game_name}</h1>',
        f'<p style="margin:0 0 18px;font-size:15px;color:#1a1815;">{detail}</p>',
        btn(game_url, "See the current prize breakdown"),
    ]

    html = shell(
        preview_text=detail,
        body_html="".join(parts),
        preferences_url=preferences_url,
        unsubscribe_url=unsubscribe_url,
    )
    return subject, html


# ---------------------------------------------------------------------------
# Claim reminder — the one email in this file that is about a deadline rather
# than a result. It goes out at 30, 7 and 3 days before a prize's claim
# deadline (config/claim-deadlines.ts REMINDER_DAYS).
#
# Deliberately plain: its entire job is "go and collect your money before the
# operator keeps it".
#
# `amount` is None whenever the prize figure isn't a published fact: an OLG
# game with no breakdown feed, a draw whose breakdown hasn't been fetched yet,
# or a tier that depends on a ball we don't hold (Daily Grand's Grand Number).
# The email then says what it knows — the tier and the deadline — and does not
# name a number. See CLAUDE.md.
# ---------------------------------------------------------------------------
def claim_reminder_email(
    *,
    days_left: int,
    deadline: str,
    game_name: str | None,
    prize_tier: str | None,
    amount: str | None,          # pre-formatted, e.g. "$89.30", or None
    draw_date: str | None,
    dashboard_url: str,
    preferences_url: str,
    unsubscribe_url: str,
) -> tuple[str, str]:
    when = "today" if days_left == 0 else ("tomorrow" if days_left == 1 else f"in {days_left} days")
    subject = (
        f"Your {game_name} prize expires {when}" if game_name
        else f"A prize in your Lottizen wallet expires {when}"
    )

    what = prize_tier or "A prize"
    if game_name:
        what += f" on {game_name}"
    if draw_date:
        what += f" ({draw_date})"

    value_line = (
        f'<p style="margin:0 0 18px;font-size:15px;">That tier paid <strong>{amount}</strong> '
        f'per winning ticket.</p>'
        if amount
        else '<p style="margin:0 0 18px;font-size:15px;color:#5c564b;">We don\'t have a published '
             'amount for this one, so we won\'t guess at what it\'s worth &mdash; the retailer '
             'or the operator can tell you when you claim it.</p>'
    )

    parts = [
        '<p style="margin:0 0 6px;font-weight:600;font-size:13px;text-transform:uppercase;'
        'letter-spacing:0.04em;color:#9c968a;">Claim deadline</p>',
        f'<h1 style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;font-weight:700;'
        f'color:#1a1815;margin:0 0 10px;">{days_left} day{"" if days_left == 1 else "s"} left to claim</h1>',
        f'<p style="margin:0 0 14px;font-size:15px;">{what} has to be claimed by '
        f'<strong>{deadline}</strong>. After that date the operator is no longer required to pay it.</p>',
        value_line,
        btn(dashboard_url, "Open your ticket wallet"),
    ]

    html = shell(
        preview_text=f"{days_left} days left to claim &mdash; deadline {deadline}.",
        body_html="".join(parts),
        preferences_url=preferences_url,
        unsubscribe_url=unsubscribe_url,
    )
    return subject, html


# ---------------------------------------------------------------------------
# Win notice — sent once, as soon as the claim engine finds that a logged
# ticket or a saved combination won a cash prize (prize_claims). Before this
# (2026-10-10) a win surfaced only in the dashboard and in the 30/7/3-day
# deadline reminders. Same honesty rule as the reminder: the amount is shown
# only when it's the operator's published figure.
# ---------------------------------------------------------------------------
def win_notice_email(
    *,
    game_name: str | None,
    prize_tier: str | None,
    amount: str | None,
    draw_date: str | None,
    deadline: str | None,
    from_saved_numbers: bool,
    dashboard_url: str,
    preferences_url: str,
    unsubscribe_url: str,
) -> tuple[str, str]:
    subject = f"Your {game_name} ticket won" if game_name else "A ticket in your Lottizen wallet won"
    if from_saved_numbers:
        subject = f"Your saved {game_name} numbers matched a prize" if game_name else "Your saved numbers matched a prize"
    what = prize_tier or "A prize tier"
    if game_name:
        what += f" on {game_name}"
    if draw_date:
        what += f" ({draw_date})"
    value_line = (
        f'<p style="margin:0 0 14px;font-size:15px;">That tier paid <strong>{amount}</strong> per winning ticket, '
        f'according to the operator&rsquo;s published prize breakdown.</p>'
        if amount
        else '<p style="margin:0 0 14px;font-size:15px;color:#5c564b;">The operator hasn&rsquo;t published an '
             'amount for this tier yet, so we won&rsquo;t guess what it&rsquo;s worth.</p>'
    )
    check = (
        "These are numbers you saved, not necessarily a ticket you bought — check whether you played them for "
        "this draw."
        if from_saved_numbers
        else "Check the ticket itself at a retailer or with the operator; their records decide every claim."
    )
    parts = [
        '<p style="margin:0 0 6px;font-weight:600;font-size:13px;text-transform:uppercase;'
        'letter-spacing:0.04em;color:#9c968a;">Prize found</p>',
        f'<h1 style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;font-weight:700;'
        f'color:#1a1815;margin:0 0 10px;">{what}</h1>',
        value_line,
        f'<p style="margin:0 0 14px;font-size:15px;">{check}</p>',
        (f'<p style="margin:0 0 18px;font-size:15px;">Claim it by <strong>{deadline}</strong>. We&rsquo;ll remind '
         f'you 30, 7 and 3 days before.</p>' if deadline else ""),
        btn(dashboard_url, "Open your ticket wallet"),
    ]
    html = shell(
        preview_text=f"{what}." + (f" Claim by {deadline}." if deadline else ""),
        body_html="".join(parts),
        preferences_url=preferences_url,
        unsubscribe_url=unsubscribe_url,
    )
    return subject, html


# ---------------------------------------------------------------------------
# Charity lottery alerts (scripts/send_charity_alerts.py): a deadline 3 days
# out, a lottery about to sell out or sold out, and published winning
# numbers. Every figure comes from the lottery's own page; winners' names are
# never stored, so never shown.
# ---------------------------------------------------------------------------
def charity_alert_email(
    *,
    subject: str,
    eyebrow: str,
    title: str,
    lines: list[str],
    url: str,
    button: str,
    preferences_url: str,
    unsubscribe_url: str,
) -> tuple[str, str]:
    parts = [
        f'<p style="margin:0 0 6px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#9c968a;">{eyebrow}</p>',
        f'<h1 style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;font-weight:700;color:#1a1815;margin:0 0 10px;">{title}</h1>',
        *[f'<p style="margin:0 0 12px;font-size:15px;color:#1a1815;">{line}</p>' for line in lines],
        btn(url, button),
        '<p style="margin:14px 0 0;font-size:12px;color:#9c968a;">Only people in the province that licenses this lottery can buy tickets, '
        'from the lottery\'s own site. Lottizen isn\'t paid for ticket sales.</p>',
    ]
    return subject, shell(preview_text=lines[0] if lines else title, body_html="".join(parts),
                          preferences_url=preferences_url, unsubscribe_url=unsubscribe_url)
