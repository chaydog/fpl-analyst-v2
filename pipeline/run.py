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


def is_between_gameweeks() -> bool:
    """Check if we're between gameweeks (current GW finished, next not started).
    Returns True if safe to run pipeline, False if matches are in progress."""
    import requests
    resp = requests.get("https://fantasy.premierleague.com/api/bootstrap-static/")
    resp.raise_for_status()
    events = resp.json()["events"]

    current = next((e for e in events if e["is_current"]), None)
    if not current:
        return True  # season not started or ended, safe to run

    # If current GW is finished, we're between GWs
    if current["finished"]:
        return True

    # If current GW is not finished, matches may still be in progress
    # Check if data_checked is true (all matches for today are done / no matches today)
    if current.get("data_checked"):
        return True

    return False


def main():
    print("=== FPL Pipeline Starting ===")

    # Skip if matches are in progress (unless forced)
    force = os.environ.get("FORCE_RUN", "").lower() == "true"
    if not force and not is_between_gameweeks():
        print("Gameweek in progress - skipping pipeline. Set FORCE_RUN=true to override.")
        return

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

    def safe_float(val, default=0.0):
        """Convert to float, replacing NaN/Inf with default."""
        import math
        try:
            f = float(val)
            if math.isnan(f) or math.isinf(f):
                return default
            return f
        except (TypeError, ValueError):
            return default

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
            "predicted_pts_1gw": round(safe_float(row["predicted_points"]), 3),
            "predicted_pts_5gw": round(safe_float(row["predicted_pts_5gw"]), 3),
            "form": round(safe_float(row.get("form", 0)), 2),
            "xgi_per90": round(safe_float(row.get("xgi_per90", 0)), 3),
            "is_penalty_taker": bool(row.get("is_penalty_taker", False)),
            "is_set_piece_taker": bool(row.get("is_set_piece_taker", False)),
            "rolling_3_points": round(safe_float(row.get("rolling_3_points", 0)), 2),
            "rolling_5_minutes": round(safe_float(row.get("rolling_5_minutes", 0)), 1),
            "avg_minutes_5": round(safe_float(row.get("avg_minutes_5", 0)), 1),
            "start_rate_5": round(safe_float(row.get("start_rate_5", 0)), 3),
            "opponent_difficulty": int(safe_float(row.get("opponent_difficulty", 3), 3)),
            "is_home": bool(row.get("is_home", False)),
            "has_fixture": bool(row.get("has_fixture", True)),
            "chance_of_playing": round(safe_float(row.get("chance_of_playing", 1.0), 1.0), 2),
            "selected_by_percent": round(safe_float(row.get("selected_by_percent", 0)), 1),
            "yellow_cards": int(safe_float(row.get("yellow_card_total", 0))),
            "suspension_risk": bool(row.get("suspension_risk", False)),
            "returning_from_injury": bool(row.get("returning_from_injury", False)),
            "n_fixtures_in_gw": int(safe_float(row.get("n_fixtures_in_gw", 1), 1)),
            "status": str(row.get("status", "a") or "a"),
            "news": str(row.get("news", "") or "")[:500],  # cap length
            "news_added": str(row.get("news_added", "") or ""),
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
                "predicted_pts": round(safe_float(row["predicted_points"]), 3),
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

    # 7b. Fetch and upload match odds
    print("\n--- Fetching match odds ---")
    odds_by_fixture = {}
    try:
        from fpl.odds import fetch_match_odds, normalize_team_name
        odds = fetch_match_odds()

        # Build team name -> id lookup
        team_name_to_id = {}
        for t in bootstrap["teams"]:
            team_name_to_id[normalize_team_name(t["short_name"])] = int(t["id"])

        odds_rows = []
        for (home_name, away_name), data in odds.items():
            home_id = team_name_to_id.get(home_name)
            away_id = team_name_to_id.get(away_name)
            if not home_id or not away_id:
                continue

            # Find the fixture
            gw = None
            fid = None
            for f in fixtures:
                if f.get("team_h") == home_id and f.get("team_a") == away_id:
                    gw = f.get("event")
                    fid = f.get("id")
                    break

            if gw is None:
                continue

            odds_rows.append({
                "fixture_id": fid,
                "gameweek": int(gw),
                "team_h": home_id,
                "team_a": away_id,
                "home_win_prob": safe_float(data.get("home_win_prob"), None),
                "draw_prob": safe_float(data.get("draw_prob"), None),
                "away_win_prob": safe_float(data.get("away_win_prob"), None),
                "over_2_5_prob": safe_float(data.get("over_2_5_prob"), None),
                "home_xg": safe_float(data.get("home_xg"), None),
                "away_xg": safe_float(data.get("away_xg"), None),
                "home_cs_prob": safe_float(data.get("home_cs_prob"), None),
                "away_cs_prob": safe_float(data.get("away_cs_prob"), None),
            })

        if odds_rows:
            for i in range(0, len(odds_rows), batch_size):
                batch = odds_rows[i:i + batch_size]
                sb.table("match_odds").upsert(batch).execute()
            print(f"  Uploaded odds for {len(odds_rows)} matches")
        else:
            print("  No odds fetched (API key not set or no matches)")
    except Exception as e:
        print(f"  Odds fetch failed: {e}")

    # 7c. Scrape team news
    print("\n--- Scraping team news ---")
    try:
        from fpl.team_news import scrape_team_news, summarise_mentions

        players_df = pd.read_parquet("data/processed/players.parquet")
        player_names = players_df["web_name"].dropna().unique().tolist()

        mentions = scrape_team_news(player_names, hours_back=72)
        summary = summarise_mentions(mentions)

        # Clear old news
        sb.table("team_news").delete().neq("player_name", "").execute()

        news_rows = []
        for name, data in summary.items():
            sources = data.get("sources", [])
            first_source = sources[0] if sources else {}
            news_rows.append({
                "player_name": name,
                "primary_status": data.get("primary_status") or "",
                "all_statuses": ",".join(data.get("all_statuses", [])),
                "context": (first_source.get("context") or "")[:500],
                "source": first_source.get("source") or "",
                "article_url": first_source.get("url") or "",
            })

        if news_rows:
            for i in range(0, len(news_rows), batch_size):
                batch = news_rows[i:i + batch_size]
                sb.table("team_news").upsert(batch).execute()
            print(f"  Uploaded team news for {len(news_rows)} players")
        else:
            print("  No team news extracted")
    except Exception as e:
        print(f"  Team news scrape failed: {e}")

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

    # 9. Log predictions for accuracy tracking
    print("\n--- Logging predictions for accuracy tracking ---")
    pred_log_rows = []
    for row in predictions_rows:
        pred_log_rows.append({
            "player_id": row["player_id"],
            "gameweek": next_gw,
            "predicted_pts": row["predicted_pts_1gw"],
        })

    for i in range(0, len(pred_log_rows), batch_size):
        batch = pred_log_rows[i:i + batch_size]
        sb.table("prediction_log").upsert(batch).execute()
    print(f"  Logged {len(pred_log_rows)} predictions for GW{next_gw}")

    # 10. Backfill actuals for completed GWs
    print("\n--- Backfilling actual results ---")
    # Find prediction_log rows missing actual_pts
    unfilled = sb.table("prediction_log").select("gameweek").is_("actual_pts", "null").execute()
    unfilled_gws = set(r["gameweek"] for r in (unfilled.data or []))

    if unfilled_gws:
        # Get actual points from history
        history = pd.read_parquet("data/processed/history.parquet")
        for gw in unfilled_gws:
            gw_actuals = history[history["round"] == gw][["player_id", "total_points"]].copy()
            if gw_actuals.empty:
                continue

            updates = []
            for _, row in gw_actuals.iterrows():
                actual = safe_float(row["total_points"])
                updates.append({
                    "player_id": int(row["player_id"]),
                    "gameweek": int(gw),
                    "actual_pts": actual,
                })

            for i in range(0, len(updates), batch_size):
                batch = updates[i:i + batch_size]
                for item in batch:
                    sb.table("prediction_log").update({
                        "actual_pts": item["actual_pts"],
                        "error": round(item["actual_pts"] - (
                            sb.table("prediction_log")
                            .select("predicted_pts")
                            .eq("player_id", item["player_id"])
                            .eq("gameweek", item["gameweek"])
                            .execute().data[0]["predicted_pts"]
                            if sb.table("prediction_log").select("predicted_pts").eq("player_id", item["player_id"]).eq("gameweek", item["gameweek"]).execute().data
                            else 0
                        ), 2),
                    }).eq("player_id", item["player_id"]).eq("gameweek", item["gameweek"]).execute()

            print(f"  Backfilled GW{gw}: {len(updates)} actuals")

    # 11. Calculate and log accuracy metrics
    accuracy_data = sb.table("prediction_log").select("*").not_.is_("actual_pts", "null").execute()
    if accuracy_data.data:
        import numpy as np
        preds = [r["predicted_pts"] for r in accuracy_data.data]
        actuals = [r["actual_pts"] for r in accuracy_data.data]
        mae = round(float(np.mean(np.abs(np.array(actuals) - np.array(preds)))), 3)
        corr = round(float(np.corrcoef(actuals, preds)[0, 1]) if len(actuals) > 1 else 0, 3)
        n_gws = len(set(r["gameweek"] for r in accuracy_data.data))
        print(f"  Model accuracy across {n_gws} GWs: MAE={mae}, correlation={corr}")
        accuracy_metrics = {"mae": mae, "correlation": corr, "n_gws": n_gws, "n_predictions": len(preds)}
    else:
        accuracy_metrics = {}

    # 12. Log pipeline run
    sb.table("pipeline_runs").insert({
        "next_gw": next_gw,
        "players_count": len(predictions_rows),
        "model_metrics": {**metrics, "accuracy": accuracy_metrics},
    }).execute()

    print(f"\n=== Pipeline complete. Next GW: {next_gw}, {len(predictions_rows)} players predicted ===")


if __name__ == "__main__":
    main()
