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
SITE_TAGLINE = "Smarter Scratch. Better Odds."
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


def shell(preview_text: str, body_html: str, preferences_url: str, unsubscribe_url: str, show_plus_upsell: bool = False) -> str:
    upsell = (
        f'<div style="margin:0 0 18px;padding:14px 16px;background:#f6e7d6;border-radius:10px;font-size:13px;color:#1a1815;">'
        f'Get alerts like this the moment they happen, all 5 provinces, with '
        f'<a href="{SITE_URL}/plus" style="color:#c2652a;font-weight:600;">Lottizen Plus</a> &mdash; $3/month, 7-day free trial.</div>'
        if show_plus_upsell
        else ""
    )
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
{upsell}
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
    is_plus: bool,
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

    # Personalized per-combination match results are a Lottizen Plus email
    # feature (see the product brief's Free vs Plus split) — free tier gets
    # the same draw facts + insight, just not the "your numbers" section.
    # The combination is still checked and saved to the dashboard either
    # way (see scripts/send_draw_emails.py); this only gates the EMAIL copy.
    if is_plus and saved_combinations:
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
    elif not is_plus and saved_combinations:
        parts.append(
            f'<p style="margin:0 0 18px;font-size:13.5px;color:#6d685f;">Personalized match-checking for your saved numbers is a Lottizen Plus feature — see your result any time on your <a href="{dashboard_url}" style="color:#c2652a;">dashboard</a>.</p>'
        )

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
        show_plus_upsell=not is_plus,
    )
    return subject, html


# ---------------------------------------------------------------------------
# Weekly digest
# ---------------------------------------------------------------------------
def weekly_digest_email(
    *,
    game_sections: list[dict],  # [{name, url, draws: [{date, numbers, bonus, bonus2}]}]
    highlights: list[str],
    guide: dict | None,  # {title, url}
    preferences_url: str,
    unsubscribe_url: str,
) -> tuple[str, str]:
    subject = "Your Lottizen weekly digest"
    parts = [
        '<h1 style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;font-weight:700;color:#1a1815;margin:0 0 16px;">This week, by the numbers</h1>'
    ]

    if not game_sections:
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
# Scratch alerts (Lottizen Plus) — sent immediately, not batched, by
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
