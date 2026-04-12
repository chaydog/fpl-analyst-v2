"""Experiment: Hybrid approach - ML model + predicted scoreline features.

Adds:
  predicted_team_xg: our team's expected goals this match
  predicted_opp_xg: opponent's expected goals this match
  predicted_cs_prob: our team's clean sheet probability
  predicted_win_prob: chance of our team winning (from scoreline model)

These give the ML model an explicit signal about match outcomes.

Usage:
  python experiment_hybrid.py --start 15
"""

import argparse
import os
import sys
from pathlib import Path

os.chdir(Path(__file__).parent)
sys.path.insert(0, str(Path(__file__).parent))

import math
import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from sklearn.ensemble import RandomForestRegressor

from fpl.features import FeatureBuilder
from fpl.model import POSITIONS


def build_match_data(history: pd.DataFrame) -> pd.DataFrame:
    return history.groupby(["team", "round", "opponent_team", "was_home"]).agg({
        "goals_scored": "sum",
        "goals_conceded": "first",
        "expected_goals": lambda x: pd.to_numeric(x, errors="coerce").sum(),
        "expected_goals_conceded": lambda x: pd.to_numeric(x, errors="coerce").mean(),
    }).reset_index()


def build_team_rolling(match: pd.DataFrame, upto_gw: int) -> dict:
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


def predict_scoreline(team: int, opp: int, is_home: bool, team_stats: dict) -> dict:
    """Predict match outcome from team_stats perspective."""
    h = team_stats.get(team if is_home else opp, {})
    a = team_stats.get(opp if is_home else team, {})

    h_attack = 0.5 * h.get("home_scored", 1.0) + 0.3 * h.get("home_xg", 1.0) + 0.2 * h.get("season_scored", 1.0)
    a_defence = 0.5 * a.get("away_conceded", 1.0) + 0.3 * a.get("away_xgc", 1.0) + 0.2 * a.get("season_conceded", 1.0)
    home_xg = (h_attack + a_defence) / 2

    a_attack = 0.5 * a.get("away_scored", 1.0) + 0.3 * a.get("away_xg", 1.0) + 0.2 * a.get("season_scored", 1.0)
    h_defence = 0.5 * h.get("home_conceded", 1.0) + 0.3 * h.get("home_xgc", 1.0) + 0.2 * h.get("season_conceded", 1.0)
    away_xg = (a_attack + h_defence) / 2

    # From team's perspective
    if is_home:
        team_xg = home_xg
        opp_xg = away_xg
    else:
        team_xg = away_xg
        opp_xg = home_xg

    team_cs_prob = max(0.03, min(0.90, np.exp(-opp_xg)))

    # Win probability (Poisson): P(team_goals > opp_goals)
    win_prob = 0.0
    for i in range(6):
        for j in range(6):
            if i > j:
                p_i = (team_xg ** i) * np.exp(-team_xg) / math.factorial(i)
                p_j = (opp_xg ** j) * np.exp(-opp_xg) / math.factorial(j)
                win_prob += p_i * p_j
    win_prob = min(0.95, max(0.05, win_prob))

    return {
        "pred_team_xg": round(team_xg, 2),
        "pred_opp_xg": round(opp_xg, 2),
        "pred_cs_prob": round(team_cs_prob, 3),
        "pred_win_prob": round(win_prob, 3),
    }


def add_scoreline_features(features_df: pd.DataFrame, history: pd.DataFrame, match_df: pd.DataFrame) -> pd.DataFrame:
    """For each row in features_df, add predicted scoreline from rolling team stats."""
    features_df = features_df.copy()
    features_df["pred_team_xg"] = 1.0
    features_df["pred_opp_xg"] = 1.0
    features_df["pred_cs_prob"] = 0.3
    features_df["pred_win_prob"] = 0.4

    # Precompute team stats per GW (expensive, but one-time)
    gws = sorted(features_df["round"].unique())

    for gw in gws:
        stats = build_team_rolling(match_df, gw)
        mask = features_df["round"] == gw

        for idx in features_df[mask].index:
            row = features_df.loc[idx]
            team = int(row.get("team", 0))
            opp = int(row.get("opponent_team", 0))
            is_home = bool(row.get("was_home", False))

            if team == 0 or opp == 0:
                continue

            pred = predict_scoreline(team, opp, is_home, stats)
            features_df.at[idx, "pred_team_xg"] = pred["pred_team_xg"]
            features_df.at[idx, "pred_opp_xg"] = pred["pred_opp_xg"]
            features_df.at[idx, "pred_cs_prob"] = pred["pred_cs_prob"]
            features_df.at[idx, "pred_win_prob"] = pred["pred_win_prob"]

    return features_df


def run_experiment(start_gw: int, end_gw: int | None = None):
    print("=== Loading data ===")
    fb = FeatureBuilder()
    fb.load_data()
    history = fb.history.copy()

    if end_gw is None:
        end_gw = int(history["round"].max())

    print("Building match data...")
    match_df = build_match_data(history)

    print("Building features...")
    all_features = fb.build_training_features()
    feature_cols = fb.get_feature_columns()

    print("Adding scoreline features...")
    all_features = add_scoreline_features(all_features, history, match_df)

    new_feature_cols = feature_cols + ["pred_team_xg", "pred_opp_xg", "pred_cs_prob", "pred_win_prob"]
    available = [c for c in new_feature_cols if c in all_features.columns]

    print(f"Testing: GW{start_gw} to GW{end_gw}")
    print(f"Features: {len(available)} (was {len(feature_cols)})")
    print()

    all_maes = []
    all_corrs = []
    all_top10s = []

    for target_gw in range(start_gw, end_gw + 1):
        train = all_features[all_features["round"] < target_gw]
        test = all_features[all_features["round"] == target_gw]

        if len(test) < 20:
            continue

        preds = pd.Series(0.0, index=test.index)
        for pos_id in POSITIONS:
            pt = train[train["element_type"] == pos_id]
            pe = test[test["element_type"] == pos_id]
            if len(pt) < 30 or len(pe) < 5:
                continue

            X_tr = pt[available].fillna(0); y_tr = pt["target"]
            X_te = pe[available].fillna(0)
            w = 0.96 ** (pt["round"].max() - pt["round"]); w = w / w.mean()

            xgb = XGBRegressor(n_estimators=250, max_depth=5, learning_rate=0.04,
                               subsample=0.8, colsample_bytree=0.8,
                               reg_alpha=0.1, reg_lambda=1.0, random_state=42)
            xgb.fit(X_tr, y_tr, sample_weight=w.values, verbose=False)
            rf = RandomForestRegressor(n_estimators=200, max_depth=8, min_samples_leaf=10,
                                       random_state=42, n_jobs=-1)
            rf.fit(X_tr, y_tr, sample_weight=w.values)
            preds.loc[pe.index] = 0.4 * xgb.predict(X_te) + 0.6 * rf.predict(X_te)

        actuals = test["target"].values
        p = preds.loc[test.index].values

        mae = np.mean(np.abs(actuals - p))
        corr = np.corrcoef(actuals, p)[0, 1] if len(actuals) > 1 else 0
        df_tmp = pd.DataFrame({"a": actuals, "p": p})
        top10 = len(set(df_tmp.nlargest(10, "p").index) & set(df_tmp.nlargest(10, "a").index))

        all_maes.append(mae); all_corrs.append(corr); all_top10s.append(top10)
        print(f"  GW{target_gw}: MAE={mae:.2f}  r={corr:.3f}  top10={top10}/10")

    print()
    print("=" * 60)
    print("HYBRID MODEL SUMMARY (ML + scoreline features)")
    print("=" * 60)
    print(f"Avg MAE:         {np.mean(all_maes):.3f}")
    print(f"Avg correlation: {np.mean(all_corrs):.3f}")
    print(f"Avg top10:       {np.mean(all_top10s):.1f}/10")
    print()
    print("For comparison:")
    print("  Direct ML only: MAE=1.388, r=0.505, top10=0.9/10")
    print("  Match-based:    MAE=1.674, r=0.396, top10=0.8/10")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=15)
    parser.add_argument("--end", type=int, default=None)
    args = parser.parse_args()
    run_experiment(args.start, args.end)
