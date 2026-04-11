"""Walk-forward backtesting: train, predict, check, advance, repeat.

Usage:
  python backtest.py              # backtest GW10 to latest
  python backtest.py --start 15   # backtest GW15 to latest
  python backtest.py --start 10 --end 25  # backtest GW10 to GW25
"""

import argparse
import os
import sys
from pathlib import Path

os.chdir(Path(__file__).parent)
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import pandas as pd

from fpl.features import FeatureBuilder
from fpl.model import PointsPredictor, POSITIONS


def run_backtest(start_gw: int = 10, end_gw: int | None = None):
    print("=== Loading data ===")

    # Make sure data exists
    if not Path("data/processed/history.parquet").exists():
        print("No data found. Run: python run.py (with FORCE_RUN=true)")
        return

    fb = FeatureBuilder()
    fb.load_data()

    history = fb.history.copy()
    max_gw = int(history["round"].max())
    if end_gw is None:
        end_gw = max_gw

    print(f"Data: GW1 to GW{max_gw}")
    print(f"Backtesting: GW{start_gw} to GW{end_gw}")
    print()

    # Build ALL features once (we'll slice by GW later)
    print("Building features...")
    all_features = fb.build_training_features()
    feature_cols = fb.get_feature_columns()
    available_cols = [c for c in feature_cols if c in all_features.columns]

    # Results tracking
    all_predictions = []
    gw_results = []

    for target_gw in range(start_gw, end_gw + 1):
        # Training data: everything before target GW
        train_data = all_features[all_features["round"] < target_gw]
        # Actuals for target GW
        actual_data = all_features[all_features["round"] == target_gw]

        if len(train_data) < 100 or len(actual_data) < 20:
            continue

        # Train per-position models
        predictor = PointsPredictor(model_dir=Path("models/backtest"))
        predictor.feature_cols = available_cols

        for pos_id, pos_name in POSITIONS.items():
            pos_train = train_data[train_data["element_type"] == pos_id]
            if len(pos_train) < 30:
                continue

            X = pos_train[available_cols].fillna(0)
            y = pos_train["target"]

            # Recency weighting
            rounds = pos_train["round"]
            max_round = rounds.max()
            weights = 0.97 ** (max_round - rounds)
            weights = weights / weights.mean()

            from xgboost import XGBRegressor
            from sklearn.ensemble import RandomForestRegressor

            xgb = XGBRegressor(
                n_estimators=200, max_depth=5, learning_rate=0.05,
                subsample=0.8, colsample_bytree=0.8,
                reg_alpha=0.1, reg_lambda=1.0, random_state=42,
            )
            xgb.fit(X, y, sample_weight=weights.values, verbose=False)

            rf = RandomForestRegressor(
                n_estimators=150, max_depth=10, min_samples_leaf=10,
                random_state=42, n_jobs=-1,
            )
            rf.fit(X, y, sample_weight=weights.values)

            predictor.models[pos_id] = {"xgb": xgb, "rf": rf}

        # Predict target GW
        predictions = predictor.predict(actual_data)

        # Compare
        actuals = actual_data["target"].values
        preds = predictions.values

        mae = np.mean(np.abs(actuals - preds))
        rmse = np.sqrt(np.mean((actuals - preds) ** 2))
        corr = np.corrcoef(actuals, preds)[0, 1] if len(actuals) > 1 else 0

        # Top player accuracy: did we correctly identify high scorers?
        actual_df = actual_data[["player_id", "target"]].copy()
        actual_df["predicted"] = preds
        actual_df = actual_df.sort_values("predicted", ascending=False)

        top10_pred = set(actual_df.head(10)["player_id"].values)
        top10_actual = set(actual_df.sort_values("target", ascending=False).head(10)["player_id"].values)
        top10_overlap = len(top10_pred & top10_actual)

        # Track per-player results
        for _, row in actual_df.iterrows():
            all_predictions.append({
                "gw": target_gw,
                "player_id": int(row["player_id"]),
                "predicted": round(float(row["predicted"]), 2),
                "actual": int(row["target"]),
                "error": round(float(row["target"] - row["predicted"]), 2),
            })

        gw_results.append({
            "gw": target_gw,
            "mae": round(mae, 3),
            "rmse": round(rmse, 3),
            "corr": round(corr, 3),
            "n_players": len(actuals),
            "top10_overlap": top10_overlap,
        })

        bar = "+" * int(corr * 20) if corr > 0 else ""
        print(f"  GW{target_gw:>2}: MAE={mae:.2f}  RMSE={rmse:.2f}  r={corr:.3f}  top10={top10_overlap}/10  {bar}")

    # Summary
    print()
    print("=" * 60)
    print("BACKTEST SUMMARY")
    print("=" * 60)

    results_df = pd.DataFrame(gw_results)
    preds_df = pd.DataFrame(all_predictions)

    overall_mae = results_df["mae"].mean()
    overall_corr = results_df["corr"].mean()
    overall_top10 = results_df["top10_overlap"].mean()

    print(f"GWs tested:     {len(results_df)}")
    print(f"Avg MAE:        {overall_mae:.3f}")
    print(f"Avg correlation:{overall_corr:.3f}")
    print(f"Avg top10 hit:  {overall_top10:.1f}/10")
    print()

    # Show improvement over time (first half vs second half)
    mid = len(results_df) // 2
    if mid > 0:
        first_half = results_df.iloc[:mid]
        second_half = results_df.iloc[mid:]
        print(f"First half  (GW{first_half['gw'].min()}-{first_half['gw'].max()}): "
              f"MAE={first_half['mae'].mean():.3f}, r={first_half['corr'].mean():.3f}, top10={first_half['top10_overlap'].mean():.1f}")
        print(f"Second half (GW{second_half['gw'].min()}-{second_half['gw'].max()}): "
              f"MAE={second_half['mae'].mean():.3f}, r={second_half['corr'].mean():.3f}, top10={second_half['top10_overlap'].mean():.1f}")

        mae_improvement = first_half["mae"].mean() - second_half["mae"].mean()
        corr_improvement = second_half["corr"].mean() - first_half["corr"].mean()
        print()
        if mae_improvement > 0:
            print(f"  MAE improved by {mae_improvement:.3f} (lower is better)")
        else:
            print(f"  MAE worsened by {-mae_improvement:.3f}")
        if corr_improvement > 0:
            print(f"  Correlation improved by {corr_improvement:.3f}")
        else:
            print(f"  Correlation dropped by {-corr_improvement:.3f}")

    # Per-position breakdown
    print()
    print("Per-position accuracy:")
    pos_map = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
    for pos_id, pos_name in pos_map.items():
        pos_preds = preds_df.merge(
            all_features[["player_id", "round", "element_type"]].rename(columns={"round": "gw"}),
            on=["player_id", "gw"],
            how="left",
        )
        pos_data = pos_preds[pos_preds["element_type"] == pos_id]
        if len(pos_data) > 0:
            pos_mae = np.mean(np.abs(pos_data["actual"] - pos_data["predicted"]))
            pos_corr = np.corrcoef(pos_data["actual"], pos_data["predicted"])[0, 1] if len(pos_data) > 1 else 0
            print(f"  {pos_name}: MAE={pos_mae:.3f}, r={pos_corr:.3f}, n={len(pos_data)}")

    # Biggest misses
    print()
    print("Biggest overestimates (predicted high, got low):")
    preds_df_sorted = preds_df.sort_values("error")
    for _, row in preds_df_sorted.head(5).iterrows():
        player = all_features[all_features["player_id"] == row["player_id"]].iloc[0]
        print(f"  GW{row['gw']}: {player['web_name'] if 'web_name' in all_features.columns else row['player_id']} "
              f"- predicted {row['predicted']}, got {row['actual']} (error {row['error']})")

    print()
    print("Biggest underestimates (predicted low, scored big):")
    for _, row in preds_df_sorted.tail(5).iterrows():
        player = all_features[
            (all_features["player_id"] == row["player_id"]) &
            (all_features["round"] == row["gw"])
        ]
        name = player.iloc[0]["web_name"] if len(player) > 0 and "web_name" in player.columns else row["player_id"]
        print(f"  GW{row['gw']}: {name} "
              f"- predicted {row['predicted']}, got {row['actual']} (error {row['error']})")

    # Save results
    results_df.to_csv("backtest_results.csv", index=False)
    preds_df.to_csv("backtest_predictions.csv", index=False)
    print(f"\nResults saved to backtest_results.csv and backtest_predictions.csv")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Walk-forward backtest")
    parser.add_argument("--start", type=int, default=10, help="First GW to predict")
    parser.add_argument("--end", type=int, default=None, help="Last GW to predict")
    args = parser.parse_args()
    run_backtest(args.start, args.end)
