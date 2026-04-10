export type Position = "GKP" | "DEF" | "MID" | "FWD";

export const POS_MAP: Record<number, Position> = {
  1: "GKP",
  2: "DEF",
  3: "MID",
  4: "FWD",
};

export interface Player {
  player_id: number;
  web_name: string;
  team_id: number;
  team_name: string;
  team_code: number;
  element_type: number;
  position: Position;
  now_cost: number;
  predicted_pts_1gw: number;
  predicted_pts_5gw: number;
  form: number;
  xgi_per90: number;
  is_penalty_taker: boolean;
  is_set_piece_taker: boolean;
  rolling_3_points: number;
  rolling_5_minutes: number;
  avg_minutes_5: number;
  start_rate_5: number;
  opponent_difficulty: number;
  is_home: boolean;
  has_fixture: boolean;
  chance_of_playing: number;
  selected_by_percent: number;
  kit_url: string;
}

export interface SquadPlayer extends Player {
  selling_price: number;
  is_captain: boolean;
  multiplier: number;
}

export interface LineupResult {
  starters: SquadPlayer[];
  bench: SquadPlayer[];
  captain: SquadPlayer;
  vice_captain: SquadPlayer;
}

export interface TransferRec {
  n_transfers: number;
  hits: number;
  hit_cost: number;
  points_gain: number;
  bank_after: number;
  raw_gain: number;
  worth_it: boolean;
  out: TransferPlayer[];
  in: TransferPlayer[];
  reasons: string[];
}

export interface TransferPlayer {
  player_id: number;
  name: string;
  team: string;
  position: Position;
  cost: number;
  xpts: number;
}

export interface ReplacementSlot {
  selling: TransferPlayer;
  selected: TransferPlayer | null;
  options: ReplacementOption[];
}

export interface ReplacementOption {
  player_id: number;
  name: string;
  team: string;
  position: Position;
  cost: number;
  xpts: number;
  form: number;
  xgi90: number;
  penalty: boolean;
}

export interface ChipStatus {
  name: string;
  available: boolean;
  used_gw: number | null;
}

export interface ChipRec {
  best_gw: number | null;
  score: number;
  reasoning: string[];
}

export interface GWScheduleItem {
  gw: number;
  type: string;
  double_teams: number;
  blank_teams: number;
}

export interface TeamData {
  team_name: string;
  overall_rank: number;
  total_points: number;
  bank: number;
  free_transfers: number;
  next_gw: number;
  starters: SquadPlayer[];
  bench: SquadPlayer[];
  captain_id: number;
  vice_captain_id: number;
  transfers_1gw: TransferRec[];
  transfers_5gw: TransferRec[];
  top_players: Record<Position, ReplacementOption[]>;
  chips_available: Record<string, ChipStatus>;
  chip_recommendations: Record<string, ChipRec>;
  chip_this_week: { play_chip: string | null; reasoning: string };
  gw_schedule: GWScheduleItem[];
  updated_at: string;
}

export type Horizon = 1 | 5;
