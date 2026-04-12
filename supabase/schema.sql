-- FPL Analyst v2 - Supabase Database Schema
-- Player predictions (written by Python pipeline, read by Next.js app)
CREATE TABLE IF NOT EXISTS predictions (
  player_id          INT PRIMARY KEY,
  web_name           TEXT NOT NULL,
  team_id            INT NOT NULL,
  team_name          TEXT,
  team_code          INT,
  element_type       INT NOT NULL,        -- 1=GKP, 2=DEF, 3=MID, 4=FWD
  now_cost           INT NOT NULL,        -- in 0.1m units
  predicted_pts_1gw  REAL NOT NULL,
  predicted_pts_5gw  REAL NOT NULL,
  form               REAL,
  xgi_per90          REAL,
  bps_per90          REAL,
  is_penalty_taker   BOOLEAN DEFAULT FALSE,
  is_set_piece_taker BOOLEAN DEFAULT FALSE,
  rolling_3_points   REAL,
  rolling_5_minutes  REAL,
  avg_minutes_5      REAL,
  start_rate_5       REAL,
  opponent_difficulty INT,
  is_home            BOOLEAN,
  has_fixture        BOOLEAN DEFAULT TRUE,
  chance_of_playing  REAL DEFAULT 1.0,
  selected_by_percent REAL,
  status             TEXT,
  yellow_cards       INT DEFAULT 0,
  suspension_risk    BOOLEAN DEFAULT FALSE,
  returning_from_injury BOOLEAN DEFAULT FALSE,
  n_fixtures_in_gw   INT DEFAULT 1,
  news               TEXT,
  news_added         TEXT,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Per-GW predictions for multi-GW breakdown
CREATE TABLE IF NOT EXISTS gw_predictions (
  player_id     INT NOT NULL,
  gameweek      INT NOT NULL,
  predicted_pts REAL NOT NULL,
  opponent_team TEXT,
  is_home       BOOLEAN,
  difficulty    INT,
  PRIMARY KEY (player_id, gameweek)
);

-- Fixture data
CREATE TABLE IF NOT EXISTS fixtures (
  id            INT PRIMARY KEY,
  gameweek      INT,
  team_h        INT,
  team_a        INT,
  team_h_name   TEXT,
  team_a_name   TEXT,
  team_h_difficulty INT,
  team_a_difficulty INT,
  finished      BOOLEAN DEFAULT FALSE
);

-- Team metadata
CREATE TABLE IF NOT EXISTS teams (
  id            INT PRIMARY KEY,
  name          TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  code          INT NOT NULL,
  strength_attack_home  INT,
  strength_attack_away  INT,
  strength_defence_home INT,
  strength_defence_away INT
);

-- Match odds from The Odds API
CREATE TABLE IF NOT EXISTS match_odds (
  fixture_id    INT,
  gameweek      INT NOT NULL,
  team_h        INT NOT NULL,
  team_a        INT NOT NULL,
  home_win_prob REAL,
  draw_prob     REAL,
  away_win_prob REAL,
  over_2_5_prob REAL,
  home_xg       REAL,
  away_xg       REAL,
  home_cs_prob  REAL,
  away_cs_prob  REAL,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (gameweek, team_h, team_a)
);

ALTER TABLE match_odds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON match_odds FOR SELECT USING (true);

-- Team news scraped from RSS feeds
CREATE TABLE IF NOT EXISTS team_news (
  player_name   TEXT NOT NULL,
  primary_status TEXT,
  all_statuses  TEXT,
  context       TEXT,
  source        TEXT,
  article_url   TEXT,
  scraped_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (player_name)
);

ALTER TABLE team_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON team_news FOR SELECT USING (true);

-- Prediction log: stores what we predicted vs what happened
CREATE TABLE IF NOT EXISTS prediction_log (
  player_id     INT NOT NULL,
  gameweek      INT NOT NULL,
  predicted_pts REAL NOT NULL,
  actual_pts    REAL,              -- filled in after GW completes
  error         REAL,              -- actual - predicted
  logged_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (player_id, gameweek)
);

CREATE INDEX IF NOT EXISTS idx_prediction_log_gw ON prediction_log(gameweek);

CREATE POLICY "Public read access" ON prediction_log FOR SELECT USING (true);

-- Pipeline run metadata
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id            SERIAL PRIMARY KEY,
  run_at        TIMESTAMPTZ DEFAULT NOW(),
  next_gw       INT,
  players_count INT,
  model_metrics JSONB
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_predictions_element_type ON predictions(element_type);
CREATE INDEX IF NOT EXISTS idx_predictions_team_id ON predictions(team_id);
CREATE INDEX IF NOT EXISTS idx_predictions_pts_1gw ON predictions(predicted_pts_1gw DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_pts_5gw ON predictions(predicted_pts_5gw DESC);
CREATE INDEX IF NOT EXISTS idx_gw_predictions_gw ON gw_predictions(gameweek);
CREATE INDEX IF NOT EXISTS idx_fixtures_gw ON fixtures(gameweek);

-- Enable Row Level Security but allow public read
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gw_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON predictions FOR SELECT USING (true);
CREATE POLICY "Public read access" ON gw_predictions FOR SELECT USING (true);
CREATE POLICY "Public read access" ON fixtures FOR SELECT USING (true);
CREATE POLICY "Public read access" ON teams FOR SELECT USING (true);
CREATE POLICY "Public read access" ON pipeline_runs FOR SELECT USING (true);
