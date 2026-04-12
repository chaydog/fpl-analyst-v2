"""The Odds API integration.

Fetches match winner, totals, and BTTS odds for upcoming Premier League
fixtures, converts them to probabilities, and returns team-level signals.

Credit usage per weekly run:
- h2h: 1 credit
- totals: 1 credit
- btts: 1 credit
Total: ~3 credits/week, 12/month (free tier is 500).
"""

import os
from typing import Optional
import requests
import numpy as np


API_KEY = os.environ.get("ODDS_API_KEY", "")
BASE = "https://api.the-odds-api.com/v4"


def _fetch(market: str, regions: str = "uk") -> list:
    """Fetch raw odds for a given market."""
    if not API_KEY:
        return []

    url = f"{BASE}/sports/soccer_epl/odds/"
    params = {
        "apiKey": API_KEY,
        "regions": regions,
        "markets": market,
        "oddsFormat": "decimal",
    }
    resp = requests.get(url, params=params, timeout=15)
    if resp.status_code != 200:
        print(f"Odds API error ({market}): {resp.status_code} {resp.text[:200]}")
        return []
    return resp.json()


def _decimal_to_prob(odds: float) -> float:
    """Convert decimal odds to probability. Includes overround."""
    return 1.0 / odds if odds > 1.0 else 0.5


def _remove_overround(probs: list[float]) -> list[float]:
    """Normalise probabilities so they sum to 1 (removes bookmaker margin)."""
    total = sum(probs)
    if total == 0:
        return probs
    return [p / total for p in probs]


def _avg_across_books(books: list, market_key: str) -> dict:
    """Average a market across multiple bookmakers."""
    all_outcomes = {}  # name -> list of prices

    for book in books:
        for mkt in book.get("markets", []):
            if mkt["key"] != market_key:
                continue
            for outcome in mkt.get("outcomes", []):
                name = outcome.get("name") or outcome.get("description", "")
                point = outcome.get("point")
                key = (name, point) if point is not None else name
                all_outcomes.setdefault(key, []).append(float(outcome["price"]))

    return {k: np.mean(v) for k, v in all_outcomes.items()}


def fetch_match_odds() -> dict:
    """Fetch and parse all match odds for upcoming EPL fixtures.

    Returns: {
        (home_team_name, away_team_name): {
            "home_win_prob": 0.45,
            "draw_prob": 0.30,
            "away_win_prob": 0.25,
            "over_2_5_prob": 0.55,
            "btts_yes_prob": 0.60,
            "home_cs_prob": 0.30,  # derived
            "away_cs_prob": 0.25,  # derived
            "expected_total_goals": 2.7,  # derived
        }
    }
    """
    if not API_KEY:
        print("ODDS_API_KEY not set - skipping odds fetch")
        return {}

    print("Fetching odds from The Odds API...")
    h2h_data = _fetch("h2h")
    totals_data = _fetch("totals")

    # Merge by event ID
    all_events = {}
    for ev in h2h_data:
        eid = ev["id"]
        all_events[eid] = {
            "home": ev["home_team"],
            "away": ev["away_team"],
            "commence_time": ev["commence_time"],
            "h2h_books": ev.get("bookmakers", []),
            "totals_books": [],
        }

    for ev in totals_data:
        if ev["id"] in all_events:
            all_events[ev["id"]]["totals_books"] = ev.get("bookmakers", [])

    results = {}
    for eid, ev in all_events.items():
        home = ev["home"]
        away = ev["away"]

        result = {
            "commence_time": ev["commence_time"],
        }

        # h2h (match winner)
        h2h = _avg_across_books(ev["h2h_books"], "h2h")
        if h2h:
            home_odd = h2h.get(home, 0)
            away_odd = h2h.get(away, 0)
            draw_odd = h2h.get("Draw", 0)

            if home_odd and away_odd and draw_odd:
                probs = _remove_overround([
                    _decimal_to_prob(home_odd),
                    _decimal_to_prob(draw_odd),
                    _decimal_to_prob(away_odd),
                ])
                result["home_win_prob"] = round(probs[0], 3)
                result["draw_prob"] = round(probs[1], 3)
                result["away_win_prob"] = round(probs[2], 3)

        # Totals (over/under goals)
        totals = _avg_across_books(ev["totals_books"], "totals")
        if totals:
            over_25 = totals.get(("Over", 2.5), 0)
            under_25 = totals.get(("Under", 2.5), 0)
            if over_25 and under_25:
                probs = _remove_overround([
                    _decimal_to_prob(over_25),
                    _decimal_to_prob(under_25),
                ])
                result["over_2_5_prob"] = round(probs[0], 3)
                result["under_2_5_prob"] = round(probs[1], 3)

                # Derive expected total goals from P(over 2.5) via Poisson inversion
                # For Poisson(lambda), P(X > 2.5) = P(X >= 3) maps to lambda:
                # lambda ~ 1.5: P = 0.191, lambda ~ 2.0: P = 0.323
                # lambda ~ 2.5: P = 0.456, lambda ~ 3.0: P = 0.577
                # lambda ~ 3.5: P = 0.679, lambda ~ 4.0: P = 0.762
                p_over_25 = probs[0]
                # Linear interpolation between known points
                if p_over_25 < 0.191: lam = 1.0 + (p_over_25 / 0.191) * 0.5
                elif p_over_25 < 0.323: lam = 1.5 + ((p_over_25 - 0.191) / (0.323 - 0.191)) * 0.5
                elif p_over_25 < 0.456: lam = 2.0 + ((p_over_25 - 0.323) / (0.456 - 0.323)) * 0.5
                elif p_over_25 < 0.577: lam = 2.5 + ((p_over_25 - 0.456) / (0.577 - 0.456)) * 0.5
                elif p_over_25 < 0.679: lam = 3.0 + ((p_over_25 - 0.577) / (0.679 - 0.577)) * 0.5
                else: lam = 3.5 + ((p_over_25 - 0.679) / 0.1) * 0.5
                result["expected_total_goals"] = round(lam, 2)

        # Derive team xGs from h2h + totals, then CS from Poisson
        # P(home CS) = P(away scores 0) = e^(-away_xg) under Poisson
        if "home_win_prob" in result and "expected_total_goals" in result:
            import math as _math
            total = result["expected_total_goals"]
            home_win = result["home_win_prob"]
            away_win = result["away_win_prob"]

            # Split total goals based on win probabilities
            # If home is more likely to win, they'll score more of the goals
            # Skew: favourite scores ~60% of goals in matches they win
            home_strength = home_win + 0.5 * result.get("draw_prob", 0)
            away_strength = away_win + 0.5 * result.get("draw_prob", 0)
            strength_total = home_strength + away_strength
            if strength_total > 0:
                home_share = 0.4 + 0.4 * (home_strength / strength_total)  # 0.4-0.8 range
                away_share = 1.0 - home_share

                home_xg = total * home_share
                away_xg = total * away_share

                result["home_xg"] = round(home_xg, 2)
                result["away_xg"] = round(away_xg, 2)
                result["home_cs_prob"] = round(_math.exp(-away_xg), 3)
                result["away_cs_prob"] = round(_math.exp(-home_xg), 3)

        results[(home, away)] = result

    print(f"  Fetched odds for {len(results)} matches")
    return results


def normalize_team_name(fpl_name: str) -> str:
    """Map FPL team names to Odds API team names."""
    # The Odds API uses full names, FPL uses short names
    mapping = {
        "ARS": "Arsenal", "AVL": "Aston Villa", "BOU": "Bournemouth",
        "BRE": "Brentford", "BHA": "Brighton and Hove Albion",
        "BUR": "Burnley", "CHE": "Chelsea", "CRY": "Crystal Palace",
        "EVE": "Everton", "FUL": "Fulham", "LEE": "Leeds United",
        "LIV": "Liverpool", "MCI": "Manchester City", "MUN": "Manchester United",
        "NEW": "Newcastle United", "NFO": "Nottingham Forest",
        "SUN": "Sunderland", "TOT": "Tottenham Hotspur",
        "WHU": "West Ham United", "WOL": "Wolverhampton Wanderers",
    }
    return mapping.get(fpl_name, fpl_name)
