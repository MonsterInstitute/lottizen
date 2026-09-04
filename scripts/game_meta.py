"""game_meta.py — display metadata for the 19 live draw games, for the email
sender scripts (send_draw_emails.py, send_weekly_digest.py).

A small hand-maintained registry, same pattern as calculate_stats.py's own
GAMES dict: config/games.ts is the real source of truth (TypeScript, not
importable from Python), so pick/max/bonus-relevant fields already got
duplicated there. This adds the *display* fields calculate_stats.py doesn't
need — name, region bucket, currency — for building human-readable email
copy. Keep in sync with config/games.ts.
"""
from __future__ import annotations

GAME_META = {
    # ---- Canada ----
    "lotto-max": {"name": "Lotto Max", "country": "CA", "currency": "CAD", "progressive": True},
    "lotto-6-49": {"name": "Lotto 6/49", "country": "CA", "currency": "CAD", "progressive": True},
    "daily-grand": {"name": "Daily Grand", "country": "CA", "currency": "CAD", "progressive": False},
    "ontario-49": {"name": "Ontario 49", "country": "CA", "currency": "CAD", "progressive": False},
    "lottario": {"name": "Lottario", "country": "CA", "currency": "CAD", "progressive": True},
    "megadice": {"name": "MegaDice Lotto", "country": "CA", "currency": "CAD", "progressive": False},
    "western-max": {"name": "Western Max", "country": "CA", "currency": "CAD", "progressive": False},
    "western-6-49": {"name": "Western 6/49", "country": "CA", "currency": "CAD", "progressive": False},
    "bc-49": {"name": "BC/49", "country": "CA", "currency": "CAD", "progressive": False},
    # ---- USA ----
    "powerball": {"name": "Powerball", "country": "US", "currency": "USD", "progressive": True},
    "mega-millions": {"name": "Mega Millions", "country": "US", "currency": "USD", "progressive": True},
    "new-york-lotto": {"name": "New York Lotto", "country": "US", "currency": "USD", "progressive": True},
    "take-5": {"name": "Take 5", "country": "US", "currency": "USD", "progressive": False},
    "pick-10": {"name": "Pick 10", "country": "US", "currency": "USD", "progressive": False},
    "numbers": {"name": "Numbers", "country": "US", "currency": "USD", "progressive": False, "format": "digit"},
    "win-4": {"name": "Win 4", "country": "US", "currency": "USD", "progressive": False, "format": "digit"},
    # ---- Europe ----
    "euromillions": {"name": "EuroMillions", "country": "EU", "currency": "EUR", "progressive": True},
    "eurojackpot": {"name": "EuroJackpot", "country": "EU", "currency": "EUR", "progressive": True},
    "uk-lotto": {"name": "UK Lotto", "country": "EU", "currency": "GBP", "progressive": True},
}

CURRENCY_SYMBOL = {"CAD": "$", "USD": "$", "EUR": "€", "GBP": "£"}


def money(amount: float | int | None, currency: str = "CAD") -> str | None:
    if amount is None:
        return None
    sym = CURRENCY_SYMBOL.get(currency, "$")
    return f"{sym}{amount:,.0f}"


# ---------------------------------------------------------------------------
# Ball matrix, for prize-tier resolution (send_claim_reminders.py).
#
# Display metadata above isn't enough to answer "which tier did this ticket
# land in": that needs the pick count and, crucially, where the bonus ball
# comes from.
#
#   bonus_pool 'main'      the bonus is drawn from the same pool as the main
#                          numbers, so a saved 6-number combination alone
#                          settles whether the bonus matched — it did if the
#                          bonus is one of the numbers they picked.
#   bonus_pool 'separate'  an independent ball (Daily Grand's Grand Number,
#                          1–7). A saved main-number set carries no pick for
#                          it, so whether it matched is genuinely unknown and
#                          must never be assumed either way — it is the whole
#                          difference between two prize tiers.
#
# Canadian draw games only. US and European games have no claim-deadline rule
# (see config/claim-deadlines.ts) and no prize-breakdown source, so they take
# no part in claims. Keep in sync with config/games.ts.
# ---------------------------------------------------------------------------
MATRIX = {
    "lotto-max":    {"pick": 7, "max": 52, "bonus_pool": "main"},
    "lotto-6-49":   {"pick": 6, "max": 49, "bonus_pool": "main"},
    "daily-grand":  {"pick": 5, "max": 49, "bonus_pool": "separate"},
    "ontario-49":   {"pick": 6, "max": 49, "bonus_pool": "main"},
    "lottario":     {"pick": 6, "max": 45, "bonus_pool": "main"},
    "megadice":     {"pick": 6, "max": 39, "bonus_pool": "main"},
    "western-max":  {"pick": 7, "max": 50, "bonus_pool": "main"},
    "western-6-49": {"pick": 6, "max": 49, "bonus_pool": "main"},
    "bc-49":        {"pick": 6, "max": 49, "bonus_pool": "main"},
}

# Claim window for Canadian draw tickets: one year from the draw date, the
# same rule at all five agencies. config/claim-deadlines.ts is the source of
# truth and carries each operator's own URL; this is the Python mirror for the
# reminder sweep, and the two must move together.
CANADIAN_DRAW_CLAIM_DAYS = 365

# Days-remaining thresholds that trigger a reminder. Mirrors REMINDER_DAYS in
# config/claim-deadlines.ts.
REMINDER_DAYS = (30, 7, 3)
