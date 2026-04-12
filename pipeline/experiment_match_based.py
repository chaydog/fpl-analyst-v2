"""Experiment: Two-stage prediction.

Stage 1: Predict the scoreline for each fixture (goals for/against)
Stage 2: Derive player points from scoreline + lineup

Compare accuracy vs the current direct player-point prediction.

Usage:
  python experiment_match_based.py --start 15
"""

import argparse
import os
import sys
from pathlib import Path

os.chdir(Path(__file__).parent)
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from sklearn.ensemble import RandomForestRegressor

from fpl.features import FeatureBuilder


POS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}


def build_match_data(history: pd.DataFrame, teams: pd.DataFrame) -> pd.DataFrame:
    """One row per team-match, aggregated from player history."""
    match = history.groupby(["team", "round", "opponent_team", "was_home"]).agg({
        "goals_scored": "sum",
        "goals_conceded": "first",
        "expected_goals": lambda x: pd.to_numeric(x, errors="coerce").sum(),
        "expected_goals_conceded": lambda x: pd.to_numeric(x, errors="coerce").mean(),
        "clean_sheets": "first",
    }).reset_index()
    return match


def build_team_rolling(match: pd.DataFrame, upto_gw: int) -> dict:
    """Build rolling team stats up to (not including) upto_gw."""
    past = match[match["round"] < upto_gw].copy()
    past = past.sort_values(["team", "round"])

    stats = {}
    for team_id in past["team"].unique():
        t = past[past["team"] == team_id]
        home = t[t["was_home"] == True]
        away = t[t["was_home"] == False]

        stats[int(team_id)] = {
            "home_scored": float(home["goals_scored"].tail(6).mean()) if len(home) > 0 else 1.0,
            "home_conceded": float(home["goals_conceded"].tail(6).mean()) if len(home) > 0 else 1.0,
            "home_xg": float(home["expected_goals"].tail(6).mean()) if len(home) > 0 else 1.0,
            "home_xgc": float(home["expected_goals_conceded"].tail(6).mean()) if len(home) > 0 else 1.0,
            "away_scored": float(away["goals_scored"].tail(6).mean()) if len(away) > 0 else 1.0,
            "away_conceded": float(away["goals_conceded"].tail(6).mean()) if len(away) > 0 else 1.0,
            "away_xg": float(away["expected_goals"].tail(6).mean()) if len(away) > 0 else 1.0,
            "away_xgc": float(away["expected_goals_conceded"].tail(6).mean()) if len(away) > 0 else 1.0,
            "season_scored": float(t["goals_scored"].mean()) if len(t) > 0 else 1.0,
            "season_conceded": float(t["goals_conceded"].mean()) if len(t) > 0 else 1.0,
        }
    return stats


def predict_scoreline(home_team: int, away_team: int, team_stats: dict) -> tuple[float, float, float, float]:
    """Predict home goals, away goals, home CS probability, away CS probability.

    Uses a simple Poisson-like model: expected goals = blend of team's attack at venue,
    opponent's defence at venue, and season averages for stability.
    """
    h = team_stats.get(home_team, {})
    a = team_stats.get(away_team, {})

    # Home team expected goals: blend of home attack, away defence (opp), and home xG
    # Recent (60%) + season (40%) for stability
    h_attack = 0.5 * h.get("home_scored", 1.0) + 0.3 * h.get("home_xg", 1.0) + 0.2 * h.get("season_scored", 1.0)
    a_defence = 0.5 * a.get("away_conceded", 1.0) + 0.3 * a.get("away_xgc", 1.0) + 0.2 * a.get("season_conceded", 1.0)

    # Expected home goals = average of team attack and opp defence
    home_xg = (h_attack + a_defence) / 2

    # Same for away
    a_attack = 0.5 * a.get("away_scored", 1.0) + 0.3 * a.get("away_xg", 1.0) + 0.2 * a.get("season_scored", 1.0)
    h_defence = 0.5 * h.get("home_conceded", 1.0) + 0.3 * h.get("home_xgc", 1.0) + 0.2 * h.get("season_conceded", 1.0)
    away_xg = (a_attack + h_defence) / 2

    # Clean sheet probability: P(opp scores 0) ≈ e^(-opp_xg) (Poisson)
    # Cap to avoid extremes
    home_cs_prob = max(0.05, min(0.85, np.exp(-away_xg)))
    away_cs_prob = max(0.05, min(0.85, np.exp(-home_xg)))

    return home_xg, away_xg, home_cs_prob, away_cs_prob


def derive_player_points(player_history: pd.DataFrame, target_gw: int,
                         team_stats: dict, match_preds: dict) -> pd.DataFrame:
    """Derive player points from match predictions + player history.

    For each player playing in target_gw, estimate:
    - Attacking points from predicted team goals * their xG share
    - Clean sheet points from CS probability (DEF/GK: 4pts, MID: 1pt)
    - Appearance points (2pts for 60+ mins)
    - Bonus/BPS from historical average
    """
    past = player_history[player_history["round"] < target_gw].copy()
    target = player_history[player_history["round"] == target_gw].copy()

    if len(target) == 0:
        return pd.DataFrame()

    # Build per-player attacking share (rolling 10 games)
    player_stats = past.groupby("player_id").agg({
        "expected_goals": lambda x: pd.to_numeric(x, errors="coerce").tail(10).sum(),
        "expected_assists": lambda x: pd.to_numeric(x, errors="coerce").tail(10).sum(),
        "goals_scored": lambda x: x.tail(10).sum(),
        "assists": lambda x: x.tail(10).sum(),
        "bps": lambda x: x.tail(10).mean() if len(x) > 0 else 0,
        "minutes": lambda x: x.tail(5).mean() if len(x) > 0 else 0,
        "bonus": lambda x: x.tail(10).mean() if len(x) > 0 else 0,
        "team": "first",
        "element_type": "first",
    }).reset_index()

    # Team-level totals for share calculation
    team_totals = player_stats.groupby("team").agg({
        "expected_goals": "sum",
        "expected_assists": "sum",
    }).reset_index().rename(columns={"expected_goals": "team_xg", "expected_assists": "team_xa"})
    player_stats = player_stats.merge(team_totals, on="team", how="left")

    # Per-player share of team's goals/assists
    player_stats["xg_share"] = player_stats["expected_goals"] / player_stats["team_xg"].clip(lower=0.1)
    player_stats["xa_share"] = player_stats["expected_assists"] / player_stats["team_xa"].clip(lower=0.1)

    # Predict for target GW
    predictions = []
    for _, p in target.iterrows():
        pid = int(p["player_id"])
        team_id = int(p["team"])
        opp_id = int(p["opponent_team"])
        is_home = bool(p["was_home"])
        pos = int(p["element_type"])

        # Match prediction for this fixture
        key = (team_id, opp_id, is_home)
        if key not in match_preds:
            continue
        team_xg, opp_xg, team_cs_prob, _ = match_preds[key]

        # Get player's historical shares
        pstat = player_stats[player_stats["player_id"] == pid]
        if len(pstat) == 0:
            continue
        pstat = pstat.iloc[0]

        minutes_est = float(pstat["minutes"])
        if minutes_est < 30:
            predictions.append({
                "player_id": pid,
                "round": target_gw,
                "predicted": 0.5,
                "actual": int(p["total_points"]),
            })
            continue

        # Attacking points from team goals distributed by share
        goal_pts_per_goal = {1: 6, 2: 6, 3: 5, 4: 4}[pos]
        expected_goals_player = team_xg * float(pstat["xg_share"])
        expected_assists_player = team_xg * float(pstat["xa_share"])  # assists ~ goals scored by team

        goal_contrib = expected_goals_player * goal_pts_per_goal
        assist_contrib = expected_assists_player * 3

        # Clean sheet points
        cs_pts = {1: 4, 2: 4, 3: 1, 4: 0}[pos]
        cs_contrib = team_cs_prob * cs_pts

        # Goals conceded penalty (GK/DEF: -1 per 2 goals conceded)
        conceded_penalty = 0
        if pos in [1, 2]:
            conceded_penalty = -0.5 * opp_xg  # approximation

        # Appearance (assume starter if recent minutes > 60)
        appearance = 2 if minutes_est >= 60 else 1

        # Bonus / BPS contribution (historical average)
        bonus_contrib = float(pstat["bonus"])

        # Saves bonus for GK (1 pt per 3 saves, approximate from xGC)
        save_contrib = 0
        if pos == 1:
            save_contrib = opp_xg * 1.5 / 3  # ~1.5 saves per expected goal

        total = appearance + goal_contrib + assist_contrib + cs_contrib + conceded_penalty + bonus_contrib + save_contrib
        total = max(0, total)

        predictions.append({
            "player_id": pid,
            "round": target_gw,
            "predicted": round(total, 2),
            "actual": int(p["total_points"]),
        })

    return pd.DataFrame(predictions)


def run_experiment(start_gw: int, end_gw: int | None = None):
    print("=== Loading data ===")
    fb = FeatureBuilder()
    fb.load_data()

    history = fb.history.copy()
    if end_gw is None:
        end_gw = int(history["round"].max())

    print(f"Testing: GW{start_gw} to GW{end_gw}")
    print()

    # Build match-level data
    match = build_match_data(history, fb.teams)

    all_maes = []
    all_corrs = []
    all_top10s = []

    print("=== MATCH-BASED MODEL ===")
    for target_gw in range(start_gw, end_gw + 1):
        # Team stats using only data before target
        team_stats = build_team_rolling(match, target_gw)

        # Predict scorelines for all fixtures in target GW
        target_fixtures = match[match["round"] == target_gw]
        if len(target_fixtures) == 0:
            continue

        match_preds = {}
        for _, f in target_fixtures.iterrows():
            if f["was_home"]:
                home = int(f["team"])
                away = int(f["opponent_team"])
            else:
                continue  # each match appears twice, only process from home perspective

            h_xg, a_xg, h_cs, a_cs = predict_scoreline(home, away, team_stats)
            match_preds[(home, away, True)] = (h_xg, a_xg, h_cs, a_cs)
            match_preds[(away, home, False)] = (a_xg, h_xg, a_cs, h_cs)

        # Derive player points
        preds = derive_player_points(history, target_gw, team_stats, match_preds)
        if len(preds) == 0:
            continue

        mae = np.mean(np.abs(preds["actual"] - preds["predicted"]))
        corr = np.corrcoef(preds["actual"], preds["predicted"])[0, 1] if len(preds) > 1 else 0

        # Top 10
        sorted_preds = preds.sort_values("predicted", ascending=False)
        top10_pred = set(sorted_preds.head(10)["player_id"].values)
        top10_actual = set(preds.sort_values("actual", ascending=False).head(10)["player_id"].values)
        top10 = len(top10_pred & top10_actual)

        all_maes.append(mae)
        all_corrs.append(corr)
        all_top10s.append(top10)

        print(f"  GW{target_gw}: MAE={mae:.2f}  r={corr:.3f}  top10={top10}/10  (n={len(preds)})")

    print()
    print("=" * 60)
    print("MATCH-BASED MODEL SUMMARY")
    print("=" * 60)
    print(f"Avg MAE:         {np.mean(all_maes):.3f}")
    print(f"Avg correlation: {np.mean(all_corrs):.3f}")
    print(f"Avg top10:       {np.mean(all_top10s):.1f}/10")
    print()
    print("For comparison, the direct player-point model (from backtest.py):")
    print(f"  MAE=1.388, correlation=0.505, top10=0.9/10")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=15)
    parser.add_argument("--end", type=int, default=None)
    args = parser.parse_args()
    run_experiment(args.start, args.end)
