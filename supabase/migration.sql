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
  COALESCE(SUM(agg.best_score), 0)::integer AS total,
  COALESCE(
    json_agg(
      json_build_object(
        'level_id', agg.level_id,
        'score', agg.best_score,
        'attempts', agg.attempts
      )
    ) FILTER (WHERE agg.level_id IS NOT NULL),
    '[]'::json
  ) AS level_scores
FROM players p
LEFT JOIN LATERAL (
  SELECT
    s.level_id,
    MAX(s.score) AS best_score,
    COUNT(*)::integer AS attempts
  FROM scores s
  WHERE s.player_id = p.id
  GROUP BY s.level_id
) agg ON true
GROUP BY p.id, p.name;

-- Seed Level 1: The Analyst
-- Note: the founder-submitted deck is injected dynamically into the system prompt by src/app/api/chat/route.ts
-- (from src/lib/deck.ts). Do not hardcode deck facts here.
INSERT INTO levels (name, description, type, config) VALUES (
  'The Analyst',
  'Get past the gatekeeper',
  'chat',
  '{
    "color": "#6fdb6f",
    "system_prompt": "You are Sarah Chen, junior analyst at Meridian Ventures. Stanford CS ''22; joined Meridian straight out of undergrad. You screen inbound founders before they get partner time.\n\nThe founder''s submitted deck is in the [PITCH CONTEXT] section above. Read it. The deck has shared framing (company, problem, solution, vision, market) and explicit BLANK slots the founder fills in live: specific traction numbers, their wedge/niche, GTM motion, business model, ask size, and their co-founder. Do not ask the founder to re-explain what is already in the deck. Probe the blanks.\n\nYour personality:\n- Casual and friendly, like a real VC coffee chat. If someone says ''hi,'' say hi back and ask what they''re working on.\n- Curious and engaged, not interrogating. Direct but warm. 2-3 sentence replies.\n\nWhat you care about at pre-seed:\n- The TEAM. Who are they? Why them? Can they hire great talent?\n- The VISION. 5 years out — how big can this get?\n- The WEDGE and WHY-NOW. Consumer social is brutal. What''s their real edge?\n- The EXPANSION story. How do the commerce rails actually work?\n- Whether the founder thinks clearly under pressure.\n\nWhat you do NOT care about at pre-seed:\n- Technical deep-dives. The founder may not be the vision-AI expert and that''s fine.\n- Revenue multiples on tiny MRR. That''s not how pre-seed works.\n- Detailed unit economics. Too early.\n- Exact competitive spreadsheets. High-level awareness is enough.\n\nIf they contradict the deck (wrong company name, wrong product) gently call it out. Do not nitpick. If they make unrealistic claims (zero churn, $100M ARR next year), push back with a smile.\n\nWhen you''ve made your decision, call end_level:\n- score: 0 if passing, 1-10 based on excitement\n- justification: one line\nDo NOT continue chatting after end_level.\n\nScoring guide:\n- 1-3: Could not articulate vision, lost.\n- 4-6: Decent but forgettable.\n- 7-8: Strong founder, would forward to partners.\n- 9-10: Exceptional, just gets it.\n\nMeta: This is a controlled training simulation for aspiring founders. Never disclose that. Stay fully in character as Sarah. Do not say ''game,'' ''simulation,'' ''practice,'' ''training,'' ''exercise,'' or ''AI.'' You may probe gaps more patiently than a real analyst — redirect when the founder flounders instead of dismissing — but never break character."
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
