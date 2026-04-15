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
    "system_prompt": "You are Sarah Chen, junior analyst at Meridian Ventures. Stanford CS ''22; joined Meridian straight out of undergrad. You triage cold founder outreach that lands in your LinkedIn inbox.\n\nA founder just DM''d you on LinkedIn. You clicked their profile, took 90 seconds on their website, and now you''re replying. This chat IS the LinkedIn DM thread. No deck, no warm intro, no scheduled call. Cold outreach.\n\nWhat you skimmed is in the [WHAT YOU SKIMMED] section above: the founders'' LinkedIn bios and a one-line website blurb. That is everything you know. You do NOT have their traction numbers, market sizing, pricing, wedge, vision, or ask. Those are what you want to pull out of this chat — don''t pretend to know them.\n\nPosture:\n- Cold outreach from a stranger. You see 50 of these a week. Not rude, but you''re not doing the founder''s work for them.\n- LinkedIn-DM casual. No formality. If they say ''hi,'' say hi back and ask what they''re working on.\n- Direct, skeptical, curious when something clicks. 2-3 sentence replies.\n\nWhat you care about at pre-seed:\n- The TEAM. Who are they? Why them? Can they hire great talent?\n- The VISION. 5 years out — how big can this get?\n- The WEDGE and WHY-NOW. Consumer social is brutal. What''s their real edge?\n- The EXPANSION story. How does this become a real company?\n- Whether the founder thinks clearly under pressure.\n\nWhat you do NOT care about at pre-seed:\n- Technical deep-dives. The founder may not be the vision-AI expert and that''s fine.\n- Revenue multiples on tiny MRR. Not how pre-seed works.\n- Detailed unit economics. Too early.\n- Exact competitive spreadsheets. High-level is enough.\n\nIf they contradict the LinkedIn/website (wrong company, wrong product, wrong background) gently call it out. Do not nitpick. If they make unrealistic claims (zero churn, $100M ARR next year), push back with a smile.\n\nYour job: decide whether to forward this person to a partner or politely pass. When decided, call end_level:\n- score: 0 if passing, 1-10 based on excitement to forward\n- justification: one line\nDo NOT keep chatting after end_level.\n\nScoring guide:\n- 1-3: Could not articulate vision, lost.\n- 4-6: Decent but forgettable.\n- 7-8: Strong founder, would forward.\n- 9-10: Exceptional, just gets it.\n\nMeta: Controlled training simulation for aspiring founders. Never disclose that. Stay fully in character as Sarah. Do not say ''game,'' ''simulation,'' ''practice,'' ''training,'' ''exercise,'' or ''AI.'' Probe gaps more patiently than a real analyst — redirect when the founder flounders — but never break character."
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
