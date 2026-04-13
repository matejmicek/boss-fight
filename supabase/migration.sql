-- Drop old structures
DROP VIEW IF EXISTS leaderboard;
DROP TABLE IF EXISTS negotiations;
DROP TABLE IF EXISTS game_state;

-- Remove team_number from players if it exists
ALTER TABLE players DROP COLUMN IF EXISTS team_number;

-- Create levels table
CREATE TABLE levels (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('chat', 'voice', 'negotiation')),
  config jsonb NOT NULL DEFAULT '{}',
  unlocked boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create scores table
CREATE TABLE scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  level_id integer REFERENCES levels(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0 AND score <= 10),
  justification text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_scores_player ON scores(player_id);
CREATE INDEX idx_scores_level ON scores(level_id);

-- Create leaderboard view
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  p.id AS player_id,
  p.name,
  COALESCE(SUM(best.best_score), 0)::integer AS total,
  COALESCE(
    json_agg(
      json_build_object('level_id', best.level_id, 'score', best.best_score)
    ) FILTER (WHERE best.level_id IS NOT NULL),
    '[]'::json
  ) AS level_scores
FROM players p
LEFT JOIN LATERAL (
  SELECT s.level_id, MAX(s.score) AS best_score
  FROM scores s
  WHERE s.player_id = p.id
  GROUP BY s.level_id
) best ON true
GROUP BY p.id, p.name;

-- Seed Level 1: The Analyst
INSERT INTO levels (name, description, type, config) VALUES (
  'The Analyst',
  'Get past the gatekeeper',
  'chat',
  '{
    "color": "#6fdb6f",
    "system_prompt": "You are Sarah Chen, a junior VC analyst at Meridian Ventures. You screen inbound founders before they get time with the partners.\n\nYour job:\n- Evaluate whether this founder is worth a partner call\n- Ask about their startup, traction, market, and why now\n- Be professional but skeptical. You see 50 pitches a week.\n- If convinced, say you will forward them. If not, politely pass.\n\nWhen you have made your decision (either to forward or pass), you MUST call the end_level tool with:\n- score: 0 if passing, 1-10 based on how excited you are to forward them\n- justification: brief explanation of your decision\n\nDo NOT continue chatting after calling end_level.\n\nKeep responses to 2-3 sentences. Be direct."
  }'::jsonb
);

-- Seed Level 2: The Partner Call (voice)
INSERT INTO levels (name, description, type, config) VALUES (
  'The Partner',
  'Impress the decision maker',
  'voice',
  '{
    "color": "#db6fdb",
    "elevenlabs_agent_id": "agent_2901kp2zwemne9qrpp4q6acpb1rt"
  }'::jsonb
);

-- Enable realtime on scores and levels
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE levels;
