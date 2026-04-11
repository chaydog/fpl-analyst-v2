"""Feature engineering pipeline for FPL prediction."""

import pandas as pd
import numpy as np
from pathlib import Path


class FeatureBuilder:
    def __init__(self):
        self.processed_dir = Path("data/processed")

    def load_data(self):
        self.history = pd.read_parquet(self.processed_dir / "history.parquet")
        self.players = pd.read_parquet(self.processed_dir / "players.parquet")
        self.fixtures = pd.read_parquet(self.processed_dir / "fixtures.parquet")
        self.teams = pd.read_parquet(self.processed_dir / "teams.parquet")
        self.gameweeks = pd.read_parquet(self.processed_dir / "gameweeks.parquet")

    def build_training_features(self) -> pd.DataFrame:
        """Build features for every (player, GW) in history. No leakage."""
        df = self.history.copy()
        df = df.sort_values(["player_id", "round"]).reset_index(drop=True)

        # Rolling features (shifted to avoid leakage)
        df = self._add_rolling_features(df)

        # Per-90 stats from rolling windows
        df = self._add_per90_features(df)

        # Form / trend
        df = self._add_trend_features(df)

        # Fixture context
        df = self._add_fixture_features(df)

        # Set piece duties from current player data
        df = self._add_set_piece_features(df)

        # Minutes availability
        df = self._add_availability_features(df)

        # Injury return detection
        df = self._add_injury_return_features(df)

        # Yellow card suspension risk
        df = self._add_card_features(df)

        # Consistency (blank/return rate)
        df = self._add_consistency_features(df, shift=True)

        # Per-player home/away splits
        df = self._add_home_away_splits(df, shift=True)

        # Venue-specific matchup features
        df = self._add_matchup_features(df)

        # Opponent defensive weakness
        df = self._add_opponent_defensive_features(df)

        # DGW multiplier (for training data)
        df = self._add_dgw_features(df)

        # Target
        df["target"] = df["total_points"]

        # Drop rows where we don't have enough history for features
        df = df.dropna(subset=["rolling_3_xgi"]).reset_index(drop=True)

        return df

    def build_prediction_features(self, next_gw: int | None = None) -> pd.DataFrame:
        """Build features for predicting the next gameweek."""
        if next_gw is None:
            next_gw = self._get_next_gw()

        # Get latest rolling stats per player from history
        # Exclude current (incomplete) GW to prevent bias towards teams that
        # have already played while others haven't
        df = self.history.copy()
        current_gw = self._get_current_gw()
        if current_gw and not self._is_gw_finished(current_gw):
            df = df[df["round"] != current_gw]
        df = df.sort_values(["player_id", "round"]).reset_index(drop=True)
        df = self._add_rolling_features(df, shift=False)
        df = self._add_per90_features(df)
        df = self._add_trend_features(df, shift=False)

        # Take last row per player (most recent stats)
        latest = df.groupby("player_id").tail(1).copy()

        # Merge player info
        player_cols = [
            "id", "web_name", "element_type", "team", "team_name",
            "now_cost", "chance_of_playing_next_round",
            "penalties_order", "direct_freekicks_order",
            "corners_and_indirect_freekicks_order",
            "status", "selected_by_percent", "form",
        ]
        available_cols = [c for c in player_cols if c in self.players.columns]
        player_info = self.players[available_cols].copy()
        latest = latest.merge(
            player_info, left_on="player_id", right_on="id", how="left",
            suffixes=("", "_current"),
        )

        # Add fixture features for next GW
        latest["next_gw"] = next_gw
        latest = self._add_prediction_fixture_features(latest, next_gw)

        # Set piece features
        latest = self._add_set_piece_features(latest)

        # Availability features
        latest = self._add_availability_features(latest)

        # Consistency
        latest = self._add_consistency_features(latest, shift=False)

        # Per-player home/away splits
        latest = self._add_home_away_splits(latest, shift=False)

        # Venue-specific matchup
        latest = self._add_prediction_matchup_features(latest)

        # Injury return detection
        latest = self._add_injury_return_features(latest)

        # Yellow card / suspension risk
        latest = self._add_prediction_card_features(latest)

        # Opponent defensive weakness
        latest = self._add_prediction_opponent_defensive(latest)

        if "chance_of_playing_next_round" in latest.columns:
            latest["chance_of_playing"] = pd.to_numeric(
                latest["chance_of_playing_next_round"], errors="coerce"
            ).fillna(100) / 100
        else:
            latest["chance_of_playing"] = 1.0

        return latest

    def build_prediction_features_multi_gw(self, n_gws: int = 5) -> dict:
        """Build prediction features for the next N gameweeks.

        Returns dict: {gw_number: features_df, ...}
        Player stats (rolling, form, per90) are shared. Only fixture
        context (opponent, home/away, difficulty, strength) changes per GW.
        """
        start_gw = self._get_next_gw()
        gw_ids = list(range(start_gw, start_gw + n_gws))

        # Build base stats once (expensive part)
        # Exclude incomplete current GW
        df = self.history.copy()
        current_gw = self._get_current_gw()
        if current_gw and not self._is_gw_finished(current_gw):
            df = df[df["round"] != current_gw]
        df = df.sort_values(["player_id", "round"]).reset_index(drop=True)
        df = self._add_rolling_features(df, shift=False)
        df = self._add_per90_features(df)
        df = self._add_trend_features(df, shift=False)

        latest = df.groupby("player_id").tail(1).copy()

        player_cols = [
            "id", "web_name", "element_type", "team", "team_name",
            "now_cost", "chance_of_playing_next_round",
            "penalties_order", "direct_freekicks_order",
            "corners_and_indirect_freekicks_order",
            "status", "selected_by_percent", "form",
        ]
        available_cols = [c for c in player_cols if c in self.players.columns]
        player_info = self.players[available_cols].copy()
        base = latest.merge(
            player_info, left_on="player_id", right_on="id", how="left",
            suffixes=("", "_current"),
        )
        base = self._add_set_piece_features(base)
        base = self._add_availability_features(base)
        base = self._add_consistency_features(base, shift=False)
        base = self._add_home_away_splits(base, shift=False)
        base = self._add_injury_return_features(base)
        base = self._add_prediction_card_features(base)
        base = self._add_prediction_opponent_defensive(base)

        if "chance_of_playing_next_round" in base.columns:
            base["chance_of_playing"] = pd.to_numeric(
                base["chance_of_playing_next_round"], errors="coerce"
            ).fillna(100) / 100
        else:
            base["chance_of_playing"] = 1.0

        # Drop fixture columns that will be re-added per GW
        fixture_cols_to_drop = [
            "is_home", "opponent_difficulty", "team_attack_strength",
            "opponent_defence_strength", "relative_strength",
            "has_fixture", "opponent_team_next", "next_gw",
            "opp_goals_conceded_4", "opp_xgc_4",
            "team_goals_scored_venue_4", "team_goals_conceded_venue_4",
            "opp_goals_scored_venue_4", "opp_goals_conceded_venue_4",
            "attacking_matchup", "defensive_matchup",
        ]
        base_clean = base.drop(
            columns=[c for c in fixture_cols_to_drop if c in base.columns],
            errors="ignore",
        )

        result = {}
        for gw in gw_ids:
            gw_features = base_clean.copy()
            gw_features["next_gw"] = gw
            gw_features = self._add_prediction_fixture_features(gw_features, gw)
            gw_features = self._add_prediction_matchup_features(gw_features)
            gw_features = self._add_prediction_opponent_defensive(gw_features)
            result[gw] = gw_features

        return result

    def get_feature_columns(self) -> list[str]:
        return [
            # Rolling means
            "rolling_3_points", "rolling_5_points", "rolling_10_points",
            "rolling_3_xg", "rolling_5_xg",
            "rolling_3_xa", "rolling_5_xa",
            "rolling_3_xgi", "rolling_5_xgi", "rolling_10_xgi",
            "rolling_3_bps", "rolling_5_bps",
            "rolling_3_ict", "rolling_5_ict",
            "rolling_3_influence", "rolling_5_influence",
            "rolling_3_threat", "rolling_5_threat",
            "rolling_3_creativity", "rolling_5_creativity",
            "rolling_3_minutes", "rolling_5_minutes",
            "rolling_3_bonus", "rolling_5_bonus",
            "rolling_3_cs", "rolling_5_cs",
            # Per 90
            "xg_per90", "xa_per90", "xgi_per90", "bps_per90",
            # Trends
            "points_trend", "xgi_trend",
            # Fixture
            "is_home", "opponent_difficulty",
            "team_attack_strength", "opponent_defence_strength",
            "relative_strength",
            # Set pieces
            "is_penalty_taker", "is_set_piece_taker",
            # Availability
            "avg_minutes_5", "start_rate_5",
            # Injury return
            "returning_from_injury", "gws_since_return",
            # Cards / suspension
            "yellow_card_total", "suspension_risk",
            # DGW
            "n_fixtures_in_gw",
            # Opponent defensive weakness (rolling 4 GWs)
            "opp_goals_conceded_4", "opp_xgc_4",
            # Creativity / threat per 90
            "creativity_per90", "threat_per90",
            # Per-player home/away splits
            "home_pts_avg", "away_pts_avg", "home_away_diff",
            "home_xgi_avg", "away_xgi_avg",
            # Matchup features: venue-specific team attack vs opponent defence
            "team_goals_scored_venue_4",
            "team_goals_conceded_venue_4",
            "opp_goals_scored_venue_4",
            "opp_goals_conceded_venue_4",
            "attacking_matchup",
            "defensive_matchup",
            # Wider window matchup (season-weighted: blend of 4-game and full season)
            "opp_goals_conceded_venue_season",
            "opp_goals_scored_venue_season",
            "attacking_matchup_blended",
            "defensive_matchup_blended",
            # Consistency: how often does this player return points
            "blank_rate_5", "blank_rate_10",
            "return_rate_5", "return_rate_10",
        ]

    def _add_rolling_features(self, df: pd.DataFrame, shift: bool = True) -> pd.DataFrame:
        grouped = df.groupby("player_id")

        stat_map = {
            "points": "total_points",
            "xg": "expected_goals",
            "xa": "expected_assists",
            "xgi": "expected_goal_involvements",
            "bps": "bps",
            "ict": "ict_index",
            "influence": "influence",
            "threat": "threat",
            "creativity": "creativity",
            "minutes": "minutes",
            "bonus": "bonus",
            "cs": "clean_sheets",
        }

        for label, col in stat_map.items():
            if col not in df.columns:
                continue
            series = pd.to_numeric(df[col], errors="coerce")
            if shift:
                series = grouped[col].transform(lambda x: pd.to_numeric(x, errors="coerce").shift(1))

            for window in [3, 5, 10]:
                col_name = f"rolling_{window}_{label}"
                df[col_name] = series.groupby(df["player_id"]).transform(
                    lambda x: x.rolling(window, min_periods=1).mean()
                )

        return df

    def _add_consistency_features(self, df: pd.DataFrame, shift: bool = True) -> pd.DataFrame:
        """Track how consistently a player returns points.

        A player averaging 5 pts from consistent 4-6 pt returns is more
        valuable than one averaging 5 from alternating 0 and 10.
        Blank = 2 pts or less. Return = 3 pts or more.
        """
        if "total_points" not in df.columns:
            for col in ["blank_rate_5", "blank_rate_10", "return_rate_5", "return_rate_10"]:
                df[col] = 0.5
            return df

        grouped = df.groupby("player_id")
        pts = pd.to_numeric(df["total_points"], errors="coerce")
        is_blank = (pts <= 2).astype(float)
        is_return = (pts >= 3).astype(float)

        if shift:
            is_blank_shifted = grouped["total_points"].transform(
                lambda x: (pd.to_numeric(x, errors="coerce") <= 2).astype(float).shift(1)
            )
            is_return_shifted = grouped["total_points"].transform(
                lambda x: (pd.to_numeric(x, errors="coerce") >= 3).astype(float).shift(1)
            )
        else:
            is_blank_shifted = is_blank
            is_return_shifted = is_return

        for window in [5, 10]:
            df[f"blank_rate_{window}"] = is_blank_shifted.groupby(df["player_id"]).transform(
                lambda x: x.rolling(window, min_periods=2).mean()
            ).fillna(0.5)
            df[f"return_rate_{window}"] = is_return_shifted.groupby(df["player_id"]).transform(
                lambda x: x.rolling(window, min_periods=2).mean()
            ).fillna(0.5)

        return df

    def _add_per90_features(self, df: pd.DataFrame) -> pd.DataFrame:
        mins = df.get("rolling_5_minutes", pd.Series(dtype=float))
        safe_mins = mins.clip(lower=30)  # avoid div by zero for low-minute players

        for stat, col in [("xg", "rolling_5_xg"), ("xa", "rolling_5_xa"),
                          ("xgi", "rolling_5_xgi"), ("bps", "rolling_5_bps"),
                          ("creativity", "rolling_5_creativity"), ("threat", "rolling_5_threat")]:
            if col in df.columns:
                df[f"{stat}_per90"] = df[col] / safe_mins * 90
            else:
                df[f"{stat}_per90"] = 0.0

        return df

    def _add_trend_features(self, df: pd.DataFrame, shift: bool = True) -> pd.DataFrame:
        for label, col in [("points_trend", "total_points"), ("xgi_trend", "expected_goal_involvements")]:
            if col not in df.columns:
                df[label] = 0.0
                continue
            series = pd.to_numeric(df[col], errors="coerce")
            if shift:
                series = df.groupby("player_id")[col].transform(
                    lambda x: pd.to_numeric(x, errors="coerce").shift(1)
                )

            def slope(x):
                x = x.dropna()
                if len(x) < 3:
                    return 0.0
                return np.polyfit(range(len(x)), x.values, 1)[0]

            df[label] = series.groupby(df["player_id"]).transform(
                lambda x: x.rolling(5, min_periods=3).apply(slope, raw=False)
            )

        return df

    def _add_fixture_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df["is_home"] = df["was_home"].astype(int) if "was_home" in df.columns else 0

        # Build team strength lookup
        team_strength = {}
        for _, t in self.teams.iterrows():
            team_strength[t["id"]] = {
                "attack_home": t.get("strength_attack_home", 1000),
                "attack_away": t.get("strength_attack_away", 1000),
                "defence_home": t.get("strength_defence_home", 1000),
                "defence_away": t.get("strength_defence_away", 1000),
            }

        # Opponent difficulty from fixture data
        if "opponent_team" in df.columns:
            # Map opponent difficulty
            fixture_diff = {}
            for _, f in self.fixtures.iterrows():
                gw = f.get("event")
                if pd.isna(gw):
                    continue
                fixture_diff[(int(f["team_h"]), int(gw))] = int(f.get("team_h_difficulty", 3))
                fixture_diff[(int(f["team_a"]), int(gw))] = int(f.get("team_a_difficulty", 3))

            df["opponent_difficulty"] = df.apply(
                lambda r: fixture_diff.get((int(r.get("opponent_team", 0)), int(r.get("round", 0))), 3),
                axis=1,
            )

            # Team attack vs opponent defence strength
            def get_strength(row):
                tid = int(row.get("team", 0))
                oid = int(row.get("opponent_team", 0))
                home = bool(row.get("was_home", False))

                ts = team_strength.get(tid, {})
                os_ = team_strength.get(oid, {})

                if home:
                    ta = ts.get("attack_home", 1000)
                    od = os_.get("defence_away", 1000)
                else:
                    ta = ts.get("attack_away", 1000)
                    od = os_.get("defence_home", 1000)

                return pd.Series({"team_attack_strength": ta, "opponent_defence_strength": od})

            strength = df.apply(get_strength, axis=1)
            df["team_attack_strength"] = strength["team_attack_strength"]
            df["opponent_defence_strength"] = strength["opponent_defence_strength"]
            df["relative_strength"] = df["team_attack_strength"] - df["opponent_defence_strength"]
        else:
            df["opponent_difficulty"] = 3
            df["team_attack_strength"] = 1000
            df["opponent_defence_strength"] = 1000
            df["relative_strength"] = 0

        return df

    def _add_prediction_fixture_features(self, df: pd.DataFrame, next_gw: int) -> pd.DataFrame:
        # Find fixtures for next GW
        gw_fixtures = self.fixtures[self.fixtures["event"] == next_gw]

        team_fixture = {}
        for _, f in gw_fixtures.iterrows():
            th = int(f["team_h"])
            ta = int(f["team_a"])
            team_fixture[th] = {"opponent": ta, "is_home": 1, "difficulty": int(f.get("team_h_difficulty", 3))}
            team_fixture[ta] = {"opponent": th, "is_home": 0, "difficulty": int(f.get("team_a_difficulty", 3))}

        df["is_home"] = df["team"].map(lambda t: team_fixture.get(int(t), {}).get("is_home", 0))
        df["opponent_difficulty"] = df["team"].map(lambda t: team_fixture.get(int(t), {}).get("difficulty", 3))
        df["opponent_team_next"] = df["team"].map(lambda t: team_fixture.get(int(t), {}).get("opponent", 0))

        # Team strength
        team_strength = {}
        for _, t in self.teams.iterrows():
            team_strength[t["id"]] = {
                "attack_home": t.get("strength_attack_home", 1000),
                "attack_away": t.get("strength_attack_away", 1000),
                "defence_home": t.get("strength_defence_home", 1000),
                "defence_away": t.get("strength_defence_away", 1000),
            }

        def compute_strength(row):
            tid = int(row.get("team", 0))
            oid = int(row.get("opponent_team_next", 0))
            home = bool(row.get("is_home", 0))
            ts = team_strength.get(tid, {})
            os_ = team_strength.get(oid, {})
            if home:
                return ts.get("attack_home", 1000), os_.get("defence_away", 1000)
            return ts.get("attack_away", 1000), os_.get("defence_home", 1000)

        strengths = df.apply(compute_strength, axis=1, result_type="expand")
        df["team_attack_strength"] = strengths[0]
        df["opponent_defence_strength"] = strengths[1]
        df["relative_strength"] = df["team_attack_strength"] - df["opponent_defence_strength"]

        # Has fixture flag (blank GW check)
        df["has_fixture"] = df["team"].map(lambda t: int(t) in team_fixture).astype(int)

        # DGW: count fixtures per team in this GW
        fixture_counts = {}
        for _, f in gw_fixtures.iterrows():
            for tid in [int(f["team_h"]), int(f["team_a"])]:
                fixture_counts[tid] = fixture_counts.get(tid, 0) + 1

        df["n_fixtures_in_gw"] = df["team"].map(lambda t: fixture_counts.get(int(t), 0))

        return df

    def _add_set_piece_features(self, df: pd.DataFrame) -> pd.DataFrame:
        if "player_id" in df.columns:
            pid_col = "player_id"
        else:
            pid_col = "id"

        sp_data = self.players[["id", "penalties_order", "direct_freekicks_order",
                                 "corners_and_indirect_freekicks_order"]].copy()
        for col in ["penalties_order", "direct_freekicks_order", "corners_and_indirect_freekicks_order"]:
            sp_data[col] = pd.to_numeric(sp_data[col], errors="coerce")

        if "is_penalty_taker" not in df.columns:
            sp_map = sp_data.set_index("id")
            df["is_penalty_taker"] = df[pid_col].map(
                lambda x: int(sp_map.loc[x, "penalties_order"] == 1) if x in sp_map.index and pd.notna(sp_map.loc[x, "penalties_order"]) else 0
            )
            df["is_set_piece_taker"] = df[pid_col].map(
                lambda x: int(
                    (sp_map.loc[x, "direct_freekicks_order"] == 1 if pd.notna(sp_map.loc[x, "direct_freekicks_order"]) else False)
                    or (sp_map.loc[x, "corners_and_indirect_freekicks_order"] == 1 if pd.notna(sp_map.loc[x, "corners_and_indirect_freekicks_order"]) else False)
                ) if x in sp_map.index else 0
            )

        return df

    def _add_availability_features(self, df: pd.DataFrame) -> pd.DataFrame:
        grouped = df.groupby("player_id")
        df["avg_minutes_5"] = grouped["minutes"].transform(
            lambda x: x.shift(1).rolling(5, min_periods=1).mean()
        )
        df["start_rate_5"] = grouped["minutes"].transform(
            lambda x: (x.shift(1) > 0).rolling(5, min_periods=1).mean()
        )
        return df

    def _build_team_defensive_rolling(self) -> dict:
        """Build rolling defensive stats per team from fixture results.

        Returns dict: {(team_id, gw): {"goals_conceded_4": X, "xgc_4": X}}
        """
        # Aggregate goals conceded and xGC per team per GW from player history
        if not hasattr(self, 'history') or self.history.empty:
            return {}

        # Group by team and round, sum goals_conceded and expected_goals_conceded
        # Use one player per team per GW (goals_conceded is same for all players on same team)
        h = self.history.copy()
        team_gw = h.groupby(["team", "round"]).agg({
            "goals_conceded": "first",
        }).reset_index()

        if "expected_goals_conceded" in h.columns:
            xgc = h.groupby(["team", "round"])["expected_goals_conceded"].first().reset_index()
            team_gw = team_gw.merge(xgc, on=["team", "round"], how="left")
        else:
            team_gw["expected_goals_conceded"] = team_gw["goals_conceded"]

        team_gw = team_gw.sort_values(["team", "round"])

        result = {}
        for team_id in team_gw["team"].unique():
            t = team_gw[team_gw["team"] == team_id].copy()
            t["gc_rolling_4"] = t["goals_conceded"].rolling(4, min_periods=1).mean()
            t["xgc_rolling_4"] = t["expected_goals_conceded"].rolling(4, min_periods=1).mean()

            for _, row in t.iterrows():
                result[(int(team_id), int(row["round"]))] = {
                    "goals_conceded_4": round(float(row["gc_rolling_4"]), 2),
                    "xgc_4": round(float(row["xgc_rolling_4"]), 2),
                }

        return result

    def _add_opponent_defensive_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add rolling opponent defensive weakness to training data."""
        team_def = self._build_team_defensive_rolling()

        if "opponent_team" in df.columns and "round" in df.columns:
            df["opp_goals_conceded_4"] = df.apply(
                lambda r: team_def.get(
                    (int(r.get("opponent_team", 0)), int(r.get("round", 0)) - 1), {}
                ).get("goals_conceded_4", 1.0),
                axis=1,
            )
            df["opp_xgc_4"] = df.apply(
                lambda r: team_def.get(
                    (int(r.get("opponent_team", 0)), int(r.get("round", 0)) - 1), {}
                ).get("xgc_4", 1.0),
                axis=1,
            )
        else:
            df["opp_goals_conceded_4"] = 1.0
            df["opp_xgc_4"] = 1.0

        return df

    def _add_prediction_opponent_defensive(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add opponent defensive weakness for prediction (uses latest data)."""
        team_def = self._build_team_defensive_rolling()

        # Get latest GW per team
        latest = {}
        for (team_id, gw), stats in team_def.items():
            if team_id not in latest or gw > latest[team_id][0]:
                latest[team_id] = (gw, stats)

        if "opponent_team_next" in df.columns:
            opp_col = "opponent_team_next"
        elif "opponent_team" in df.columns:
            opp_col = "opponent_team"
        else:
            df["opp_goals_conceded_4"] = 1.0
            df["opp_xgc_4"] = 1.0
            return df

        df["opp_goals_conceded_4"] = df[opp_col].map(
            lambda t: latest.get(int(t), (0, {}))[1].get("goals_conceded_4", 1.0) if pd.notna(t) and int(t) > 0 else 1.0
        )
        df["opp_xgc_4"] = df[opp_col].map(
            lambda t: latest.get(int(t), (0, {}))[1].get("xgc_4", 1.0) if pd.notna(t) and int(t) > 0 else 1.0
        )

        return df

    def _build_team_venue_stats(self) -> dict:
        """Build rolling 4-GW stats per team split by home/away.

        Returns: {(team_id, 'home'|'away'): {'scored': X, 'conceded': X}}
        using latest available data.
        """
        if not hasattr(self, 'history') or self.history.empty:
            return {}

        h = self.history.copy()
        # One row per team per GW
        team_gw = h.groupby(["team", "round"]).agg({
            "goals_scored": "sum",
            "goals_conceded": "first",
            "was_home": "first",
        }).reset_index()
        team_gw = team_gw.sort_values(["team", "round"])

        result = {}
        for team_id in team_gw["team"].unique():
            t = team_gw[team_gw["team"] == team_id]
            for venue, is_home in [("home", True), ("away", False)]:
                venue_data = t[t["was_home"] == is_home]
                recent = venue_data.tail(4)
                season = venue_data

                if len(recent) >= 2:
                    r4_scored = float(recent["goals_scored"].mean())
                    r4_conceded = float(recent["goals_conceded"].mean())
                else:
                    r4_scored = 1.0
                    r4_conceded = 1.0

                if len(season) >= 4:
                    s_scored = float(season["goals_scored"].mean())
                    s_conceded = float(season["goals_conceded"].mean())
                else:
                    s_scored = r4_scored
                    s_conceded = r4_conceded

                # Blended: 60% recent, 40% season (stabilises short-term noise)
                bl_scored = 0.6 * r4_scored + 0.4 * s_scored
                bl_conceded = 0.6 * r4_conceded + 0.4 * s_conceded

                result[(int(team_id), venue)] = {
                    "scored": round(r4_scored, 2),
                    "conceded": round(r4_conceded, 2),
                    "scored_season": round(s_scored, 2),
                    "conceded_season": round(s_conceded, 2),
                    "scored_blended": round(bl_scored, 2),
                    "conceded_blended": round(bl_conceded, 2),
                }

        return result

    def _add_matchup_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add venue-specific matchup features for training data."""
        venue_stats = self._build_team_venue_stats()

        def get_matchup(row):
            team = int(row.get("team", 0))
            opp = int(row.get("opponent_team", 0))
            is_home = bool(row.get("was_home", False))

            team_venue = "home" if is_home else "away"
            opp_venue = "away" if is_home else "home"

            ts = venue_stats.get((team, team_venue), {"scored": 1.0, "conceded": 1.0})
            os = venue_stats.get((opp, opp_venue), {"scored": 1.0, "conceded": 1.0})

            return pd.Series({
                "team_goals_scored_venue_4": ts["scored"],
                "team_goals_conceded_venue_4": ts["conceded"],
                "opp_goals_scored_venue_4": os["scored"],
                "opp_goals_conceded_venue_4": os["conceded"],
                "attacking_matchup": ts["scored"] + os["conceded"],
                "defensive_matchup": ts["conceded"] + os["scored"],
                "opp_goals_conceded_venue_season": os.get("conceded_season", os["conceded"]),
                "opp_goals_scored_venue_season": os.get("scored_season", os["scored"]),
                "attacking_matchup_blended": ts.get("scored_blended", ts["scored"]) + os.get("conceded_blended", os["conceded"]),
                "defensive_matchup_blended": ts.get("conceded_blended", ts["conceded"]) + os.get("scored_blended", os["scored"]),
            })

        all_cols = ["team_goals_scored_venue_4", "team_goals_conceded_venue_4",
                    "opp_goals_scored_venue_4", "opp_goals_conceded_venue_4",
                    "attacking_matchup", "defensive_matchup",
                    "opp_goals_conceded_venue_season", "opp_goals_scored_venue_season",
                    "attacking_matchup_blended", "defensive_matchup_blended"]

        if "opponent_team" in df.columns:
            matchup = df.apply(get_matchup, axis=1)
            for col in matchup.columns:
                df[col] = matchup[col].values
        else:
            for col in all_cols:
                df[col] = 1.0

        return df

    def _add_prediction_matchup_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add venue-specific matchup features for predictions."""
        venue_stats = self._build_team_venue_stats()
        defaults = {"scored": 1.0, "conceded": 1.0, "scored_season": 1.0,
                     "conceded_season": 1.0, "scored_blended": 1.0, "conceded_blended": 1.0}

        all_cols = ["team_goals_scored_venue_4", "team_goals_conceded_venue_4",
                    "opp_goals_scored_venue_4", "opp_goals_conceded_venue_4",
                    "attacking_matchup", "defensive_matchup",
                    "opp_goals_conceded_venue_season", "opp_goals_scored_venue_season",
                    "attacking_matchup_blended", "defensive_matchup_blended"]

        opp_col = "opponent_team_next" if "opponent_team_next" in df.columns else "opponent_team"
        if opp_col not in df.columns:
            for col in all_cols:
                df[col] = 1.0
            return df

        def get_matchup(row):
            team = int(row.get("team", 0))
            opp = int(row.get(opp_col, 0))
            is_home = bool(row.get("is_home", False))

            team_venue = "home" if is_home else "away"
            opp_venue = "away" if is_home else "home"

            ts = venue_stats.get((team, team_venue), defaults)
            os = venue_stats.get((opp, opp_venue), defaults)

            return pd.Series({
                "team_goals_scored_venue_4": ts["scored"],
                "team_goals_conceded_venue_4": ts["conceded"],
                "opp_goals_scored_venue_4": os["scored"],
                "opp_goals_conceded_venue_4": os["conceded"],
                "attacking_matchup": ts["scored"] + os["conceded"],
                "defensive_matchup": ts["conceded"] + os["scored"],
                "opp_goals_conceded_venue_season": os.get("conceded_season", os["conceded"]),
                "opp_goals_scored_venue_season": os.get("scored_season", os["scored"]),
                "attacking_matchup_blended": ts.get("scored_blended", ts["scored"]) + os.get("conceded_blended", os["conceded"]),
                "defensive_matchup_blended": ts.get("conceded_blended", ts["conceded"]) + os.get("scored_blended", os["scored"]),
            })

        matchup = df.apply(get_matchup, axis=1)
        for col in matchup.columns:
            df[col] = matchup[col].values

        return df

    def _add_home_away_splits(self, df: pd.DataFrame, shift: bool = True) -> pd.DataFrame:
        """Per-player home vs away performance splits.

        Some players are dramatically better at home (e.g. Fernandes
        10+ hauls in every home game under Carrick). This captures that
        individual tendency rather than a generic home advantage.
        """
        if "was_home" not in df.columns or "total_points" not in df.columns:
            df["home_pts_avg"] = 2.0
            df["away_pts_avg"] = 2.0
            df["home_away_diff"] = 0.0
            df["home_xgi_avg"] = 0.0
            df["away_xgi_avg"] = 0.0
            return df

        has_xgi = "expected_goal_involvements" in df.columns

        def calc_splits(group):
            pts = group["total_points"].astype(float)
            home = group["was_home"].astype(bool)
            xgi = pd.to_numeric(group["expected_goal_involvements"], errors="coerce").fillna(0) if has_xgi else pd.Series(0.0, index=group.index)

            n = len(group)
            home_pts = np.full(n, 2.0)
            away_pts = np.full(n, 2.0)
            home_xgi = np.full(n, 0.0)
            away_xgi = np.full(n, 0.0)

            for i in range(1 if shift else 0, n):
                # Use all data before this row (or including for prediction)
                end = i if shift else i + 1
                if end == 0:
                    continue

                past = group.iloc[:end]
                past_home = past[past["was_home"] == True]
                past_away = past[past["was_home"] == False]

                if len(past_home) >= 2:
                    home_pts[i] = past_home["total_points"].astype(float).mean()
                    if has_xgi:
                        home_xgi[i] = pd.to_numeric(past_home["expected_goal_involvements"], errors="coerce").fillna(0).mean()

                if len(past_away) >= 2:
                    away_pts[i] = past_away["total_points"].astype(float).mean()
                    if has_xgi:
                        away_xgi[i] = pd.to_numeric(past_away["expected_goal_involvements"], errors="coerce").fillna(0).mean()

            return pd.DataFrame({
                "home_pts_avg": home_pts,
                "away_pts_avg": away_pts,
                "home_away_diff": home_pts - away_pts,
                "home_xgi_avg": home_xgi,
                "away_xgi_avg": away_xgi,
            }, index=group.index)

        result = df.groupby("player_id", group_keys=False).apply(calc_splits)
        for col in ["home_pts_avg", "away_pts_avg", "home_away_diff", "home_xgi_avg", "away_xgi_avg"]:
            df[col] = result[col].values

        return df

    def _add_injury_return_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Detect players returning from injury/absence.

        Players typically underperform for 2-3 GWs after returning.
        We detect this by looking for gaps in minutes played.
        """
        if "minutes" not in df.columns:
            df["returning_from_injury"] = 0
            df["gws_since_return"] = 99
            return df

        grouped = df.groupby("player_id")

        # Was the player absent (0 mins) in any of the last 3 GWs?
        def calc_return_status(group):
            mins = group["minutes"].values
            n = len(mins)
            results = np.zeros(n)
            gws_since = np.full(n, 99.0)

            for i in range(1, n):
                # Check if player missed any of last 3 GWs
                lookback = mins[max(0, i - 3):i]
                if len(lookback) > 0 and any(m == 0 for m in lookback) and mins[i] > 0:
                    results[i] = 1
                    # How many GWs since the absence ended
                    zeros = [j for j in range(max(0, i - 5), i) if mins[j] == 0]
                    if zeros:
                        gws_since[i] = i - max(zeros)

            return pd.DataFrame({
                "returning_from_injury": results,
                "gws_since_return": gws_since,
            }, index=group.index)

        result = grouped.apply(calc_return_status).reset_index(level=0, drop=True)
        df["returning_from_injury"] = result["returning_from_injury"]
        df["gws_since_return"] = result["gws_since_return"]

        return df

    def _add_card_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Track yellow card accumulation for suspension risk.

        FPL rules: 5 yellows before GW19 = 1 match ban.
        10 yellows in a season = 2 match ban.
        """
        if "yellow_cards" not in df.columns:
            df["yellow_card_total"] = 0
            df["suspension_risk"] = 0
            return df

        grouped = df.groupby("player_id")

        # Cumulative yellows up to (but not including) current GW
        df["yellow_card_total"] = grouped["yellow_cards"].transform(
            lambda x: x.shift(1).cumsum().fillna(0)
        )

        # Suspension risk: 1 if on 4 yellows (one away from ban before GW19)
        # or 9 yellows (one away from 2-match ban)
        df["suspension_risk"] = (
            ((df["yellow_card_total"] == 4) & (df.get("round", pd.Series(dtype=int)) < 19)) |
            (df["yellow_card_total"] == 9)
        ).astype(int)

        return df

    def _add_prediction_card_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add card features for prediction using season aggregate data."""
        # Use season total from players DataFrame
        yc_map = self.players.set_index("id")["yellow_cards"].to_dict() if "yellow_cards" in self.players.columns else {}
        pid_col = "player_id" if "player_id" in df.columns else "id"

        df["yellow_card_total"] = df[pid_col].map(lambda x: yc_map.get(x, 0)).fillna(0)

        next_gw = self._get_next_gw()
        df["suspension_risk"] = (
            ((df["yellow_card_total"] == 4) & (next_gw < 19)) |
            (df["yellow_card_total"] == 9)
        ).astype(int)

        return df

    def _add_dgw_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Count fixtures per team per GW for DGW detection."""
        # Build fixture count per (team, gw)
        fixture_counts = {}
        for _, f in self.fixtures.iterrows():
            gw = f.get("event")
            if pd.isna(gw):
                continue
            gw = int(gw)
            for team_id in [int(f["team_h"]), int(f["team_a"])]:
                key = (team_id, gw)
                fixture_counts[key] = fixture_counts.get(key, 0) + 1

        if "round" in df.columns and "team" in df.columns:
            df["n_fixtures_in_gw"] = df.apply(
                lambda r: fixture_counts.get((int(r["team"]), int(r["round"])), 1),
                axis=1,
            )
        else:
            df["n_fixtures_in_gw"] = 1

        return df

    def _get_current_gw(self) -> int | None:
        """Get the current active GW (may be in progress)."""
        gws = self.gameweeks
        current = gws[gws["is_current"] == True] if "is_current" in gws.columns else pd.DataFrame()
        if len(current) > 0:
            return int(current.iloc[0]["id"])
        return None

    def _is_gw_finished(self, gw: int) -> bool:
        """Check if a specific GW is finished."""
        gws = self.gameweeks
        row = gws[gws["id"] == gw]
        if len(row) > 0 and "finished" in row.columns:
            return bool(row.iloc[0]["finished"])
        return False

    def _get_next_gw(self) -> int:
        gws = self.gameweeks
        upcoming = gws[gws["finished"] == False]
        if len(upcoming) > 0:
            return int(upcoming.iloc[0]["id"])
        return int(gws.iloc[-1]["id"])
