"""Rules for "This week's pick" / "Skip" (scripts/weekly_picks.py).
Run: python -m pytest scripts/tests"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import weekly_picks as wp  # noqa: E402


def g(name, price, score, on_sale=True, top_left=1, top_total=3):
    return {"name": name, "price": price, "value_score": score, "on_sale": on_sale,
            "top_remaining": top_left, "top_total": top_total, "game_number": name, "slug": name.lower()}


def test_pick_ignores_games_not_on_sale_even_with_the_best_score():
    games = [g("Gone", 5, 150, on_sale=False), g("Sold", 5, 120)]
    assert wp.choose(games)["overall"]["name"] == "Sold"


def test_unknown_sale_status_is_never_picked():
    assert wp.choose([g("Unknown", 5, 150, on_sale=None)])["overall"] is None


def test_pick_needs_a_top_prize_left():
    games = [g("Empty", 10, 200, top_left=0), g("Full", 10, 90)]
    assert wp.choose(games)["overall"]["name"] == "Full"


def test_ties_prefer_more_top_prizes_then_lower_price_then_name():
    games = [g("B", 5, 100, top_left=2), g("A", 5, 100, top_left=2), g("C", 3, 100, top_left=2),
             g("D", 20, 100, top_left=7)]
    assert wp.choose(games)["overall"]["name"] == "D"          # most top prizes left
    games = [g("B", 5, 100, top_left=2), g("A", 5, 100, top_left=2), g("C", 3, 100, top_left=2)]
    assert wp.choose(games)["overall"]["name"] == "C"          # then cheapest
    games = [g("B", 5, 100, top_left=2), g("A", 5, 100, top_left=2)]
    assert wp.choose(games)["overall"]["name"] == "A"          # then name


def test_bands_pick_within_their_price_range_and_can_be_empty():
    games = [g("Two", 2, 80), g("Five", 5, 95), g("Ten", 10, 70), g("Seven", 7, 75)]
    p = wp.choose(games)
    assert p["1-5"]["name"] == "Five"
    assert p["10"]["name"] == "Seven"     # $6-10 band
    assert p["20+"] is None
    assert p["overall"]["name"] == "Five"


def test_skip_is_on_sale_with_no_top_prize_left_only():
    games = [g("Sold out top", 10, 50, top_left=0), g("Off sale", 20, 50, on_sale=False, top_left=0),
             g("Unknown", 5, 50, on_sale=None, top_left=0), g("Fine", 5, 50)]
    assert [x["name"] for x in wp.skip_list(games)] == ["Sold out top"]


def test_skip_sorted_most_expensive_first():
    games = [g("Cheap", 2, 1, top_left=0), g("Dear", 30, 1, top_left=0), g("Mid", 10, 1, top_left=0)]
    assert [x["name"] for x in wp.skip_list(games)] == ["Dear", "Mid", "Cheap"]


def test_replacement_reasons():
    assert wp.why_replaced(g("Ok", 5, 90)) is None
    assert wp.why_replaced(None) == "no longer on the agency's prize list"
    assert wp.why_replaced(g("x", 5, 90, on_sale=False)) == "no longer on sale"
    assert wp.why_replaced(g("x", 5, 90, top_left=0)) == "its last top prize was claimed"


def test_week_starts_monday():
    assert wp.week_start(date(2026, 10, 10)) == date(2026, 10, 5)   # Saturday -> Monday
    assert wp.week_start(date(2026, 10, 12)) == date(2026, 10, 12)  # Monday


def test_new_tickets_are_on_sale_recent_and_newest_first():
    today = date(2026, 10, 10)
    games = [dict(g("Old", 5, 1), launch_date="2026-08-01"), dict(g("New", 5, 1), launch_date="2026-10-05"),
             dict(g("Newer", 2, 1), launch_date="2026-10-07"), dict(g("Off", 5, 1, on_sale=False), launch_date="2026-10-08"),
             dict(g("Future", 5, 1), launch_date="2026-10-20"), dict(g("NoDate", 5, 1), launch_date=None)]
    assert [x["name"] for x in wp.new_tickets(games, today)] == ["Newer", "New"]


def test_monthly_needs_enough_days_and_ranks_by_average():
    games = [g("Steady", 5, 90), g("Spiky", 5, 95), g("New", 5, 99), g("Off", 5, 99, on_sale=False)]
    ranks = {"steady": [2, 2, 3, 2], "spiky": [1, 9, 1, 9], "new": [1], "off": [1, 1, 1, 1]}
    out = wp.monthly(games, ranks, days=4)
    assert [x["name"] for x in out] == ["Steady", "Spiky"]   # New: 1 of 4 days; Off: not on sale
    assert out[0]["avg_rank"] == 2.2


def test_single_province_games_only_count_where_sold():
    ab_only = dict(g("Only In Alberta Bingo", 2, 150), sold_in=["AB"])
    everywhere = dict(g("The Western", 2, 90), sold_in=None)
    assert wp.sold_here(ab_only, "AB") and not wp.sold_here(ab_only, "SK")
    assert not wp.sold_here(ab_only, "")           # territories: region-wide games only
    assert wp.sold_here(everywhere, "SK") and wp.sold_here(everywhere, "")
    sk_games = [x for x in (ab_only, everywhere) if wp.sold_here(x, "SK")]
    assert wp.choose(sk_games)["overall"]["name"] == "The Western"
