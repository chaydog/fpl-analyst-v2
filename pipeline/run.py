"""FPL ML Pipeline: pull data, train models, predict, upload to Supabase."""

import os
import sys
from pathlib import Path

# Run from pipeline directory
os.chdir(Path(__file__).parent)
sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
from supabase import create_client

from fpl.api import FPLClient
from fpl.ingest import DataIngestor
from fpl.features import FeatureBuilder
from fpl.model import PointsPredictor

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]


def main():
    print("=== FPL Pipeline Starting ===")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. Pull data from FPL API
    print("\n--- Pulling FPL data ---")
    ingestor = DataIngestor()
    ingestor.pull_all(verbose=True)

    # 2. Build features and train model
    print("\n--- Training model ---")
    fb = FeatureBuilder()
    fb.load_data()
    training_features = fb.build_training_features()
    feature_cols = fb.get_feature_columns()

    predictor = PointsPredictor()
    metrics = predictor.train(training_features, feature_cols)
    print("Model metrics:", metrics)

    # 3. Generate predictions
    print("\n--- Generating predictions ---")
    pred_1gw = fb.build_prediction_features()
    pred_1gw["predicted_points"] = predictor.predict(pred_1gw)

    # Multi-GW predictions
    multi_gw = fb.build_prediction_features_multi_gw(n_gws=5)
    gw_predictions = {}
    for gw, gw_df in multi_gw.items():
        gw_df["predicted_points"] = predictor.predict(gw_df)
        gw_predictions[gw] = gw_df[["player_id", "predicted_points"]].copy()

    all_gw_preds = pd.concat(gw_predictions.values())
    multi_gw_totals = all_gw_preds.groupby("player_id")["predicted_points"].sum()
    pred_1gw["predicted_pts_5gw"] = pred_1gw["player_id"].map(multi_gw_totals).fillna(0)

    next_gw = fb._get_next_gw()

    # 4. Get team codes for kit URLs
    client = FPLClient()
    bootstrap = client.get_bootstrap()
    team_code_map = {t["id"]: t["code"] for t in bootstrap["teams"]}

    # 5. Upload predictions to Supabase
    print(f"\n--- Uploading {len(pred_1gw)} predictions to Supabase ---")

    predictions_rows = []
    for _, row in pred_1gw.iterrows():
        team_id = int(row.get("team", 0))
        predictions_rows.append({
            "player_id": int(row["player_id"]),
            "web_name": row["web_name"],
            "team_id": team_id,
            "team_name": row.get("team_name", ""),
            "team_code": team_code_map.get(team_id, 0),
            "element_type": int(row["element_type"]),
            "now_cost": int(row["now_cost"]),
            "predicted_pts_1gw": round(float(row["predicted_points"]), 3),
            "predicted_pts_5gw": round(float(row["predicted_pts_5gw"]), 3),
            "form": round(float(row.get("form", 0) or 0), 2),
            "xgi_per90": round(float(row.get("xgi_per90", 0) or 0), 3),
            "is_penalty_taker": bool(row.get("is_penalty_taker", False)),
            "is_set_piece_taker": bool(row.get("is_set_piece_taker", False)),
            "rolling_3_points": round(float(row.get("rolling_3_points", 0) or 0), 2),
            "rolling_5_minutes": round(float(row.get("rolling_5_minutes", 0) or 0), 1),
            "avg_minutes_5": round(float(row.get("avg_minutes_5", 0) or 0), 1),
            "start_rate_5": round(float(row.get("start_rate_5", 0) or 0), 3),
            "opponent_difficulty": int(row.get("opponent_difficulty", 3) or 3),
            "is_home": bool(row.get("is_home", False)),
            "has_fixture": bool(row.get("has_fixture", True)),
            "chance_of_playing": round(float(row.get("chance_of_playing", 1.0) or 1.0), 2),
            "selected_by_percent": round(float(row.get("selected_by_percent", 0) or 0), 1),
            "status": str(row.get("status", "a") or "a"),
        })

    # Upsert in batches
    batch_size = 100
    for i in range(0, len(predictions_rows), batch_size):
        batch = predictions_rows[i:i + batch_size]
        sb.table("predictions").upsert(batch).execute()
        print(f"  Uploaded {min(i + batch_size, len(predictions_rows))}/{len(predictions_rows)}")

    # 6. Upload per-GW predictions
    print("\n--- Uploading per-GW predictions ---")
    gw_rows = []

    # Get team name lookup for opponents
    teams = {t["id"]: t for t in bootstrap["teams"]}
    fixtures = client.get_fixtures()

    for gw, gw_df in gw_predictions.items():
        for _, row in gw_df.iterrows():
            gw_rows.append({
                "player_id": int(row["player_id"]),
                "gameweek": int(gw),
                "predicted_pts": round(float(row["predicted_points"]), 3),
            })

    # Clear and reinsert
    sb.table("gw_predictions").delete().neq("player_id", -1).execute()
    for i in range(0, len(gw_rows), batch_size):
        batch = gw_rows[i:i + batch_size]
        sb.table("gw_predictions").upsert(batch).execute()
    print(f"  Uploaded {len(gw_rows)} GW predictions")

    # 7. Upload fixtures
    print("\n--- Uploading fixtures ---")
    fixture_rows = []
    for f in fixtures:
        if f.get("event") is None:
            continue
        fixture_rows.append({
            "id": int(f["id"]),
            "gameweek": int(f["event"]),
            "team_h": int(f["team_h"]),
            "team_a": int(f["team_a"]),
            "team_h_name": teams.get(f["team_h"], {}).get("short_name", ""),
            "team_a_name": teams.get(f["team_a"], {}).get("short_name", ""),
            "team_h_difficulty": int(f.get("team_h_difficulty", 3)),
            "team_a_difficulty": int(f.get("team_a_difficulty", 3)),
            "finished": bool(f.get("finished", False)),
        })

    sb.table("fixtures").delete().neq("id", -1).execute()
    for i in range(0, len(fixture_rows), batch_size):
        batch = fixture_rows[i:i + batch_size]
        sb.table("fixtures").upsert(batch).execute()
    print(f"  Uploaded {len(fixture_rows)} fixtures")

    # 8. Upload teams
    print("\n--- Uploading teams ---")
    team_rows = []
    for t in bootstrap["teams"]:
        team_rows.append({
            "id": int(t["id"]),
            "name": t["name"],
            "short_name": t["short_name"],
            "code": int(t["code"]),
            "strength_attack_home": int(t.get("strength_attack_home", 1000)),
            "strength_attack_away": int(t.get("strength_attack_away", 1000)),
            "strength_defence_home": int(t.get("strength_defence_home", 1000)),
            "strength_defence_away": int(t.get("strength_defence_away", 1000)),
        })

    sb.table("teams").upsert(team_rows).execute()
    print(f"  Uploaded {len(team_rows)} teams")

    # 9. Log pipeline run
    sb.table("pipeline_runs").insert({
        "next_gw": next_gw,
        "players_count": len(predictions_rows),
        "model_metrics": metrics,
    }).execute()

    print(f"\n=== Pipeline complete. Next GW: {next_gw}, {len(predictions_rows)} players predicted ===")


if __name__ == "__main__":
    main()
