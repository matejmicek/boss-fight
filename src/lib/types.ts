export type GameStatus = "lobby" | "teams" | "playing" | "finished";

export type VcType = "visionary" | "empath" | "shark";

export interface GameState {
  id: number;
  status: GameStatus;
  num_teams: number | null;
  deck_url: string | null;
}

export interface Player {
  id: string;
  name: string;
  team_number: number | null;
  created_at: string;
}

export interface Negotiation {
  id: string;
  player_id: string;
  vc_type: VcType;
  final_valuation: number;
  created_at: string;
}

export interface LeaderboardEntry {
  team_number: number;
  best_visionary: number;
  best_empath: number;
  best_shark: number;
  total: number;
}
