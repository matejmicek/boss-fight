export type LevelType = "chat" | "voice" | "negotiation";

export interface Level {
  id: number;
  name: string;
  description: string | null;
  type: LevelType;
  config: {
    color?: string;
    system_prompt?: string;
    elevenlabs_agent_id?: string;
    [key: string]: unknown;
  };
  unlocked: boolean;
}

export interface Score {
  id: string;
  player_id: string;
  level_id: number;
  score: number;
  justification: string | null;
  created_at: string;
}

export interface LeaderboardEntry {
  player_id: string;
  name: string;
  total: number;
  level_scores: { level_id: number; score: number }[];
}
