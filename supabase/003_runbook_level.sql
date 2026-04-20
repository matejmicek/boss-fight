-- 003_runbook_level.sql
-- Level 3: The Runbook. Strictly additive.
--   1. runbook_runs table (stores runbook, negotiations, outcome)
--   2. append_negotiation() helper for atomic JSONB array append
--   3. Level 3 row (type 'negotiation', locked by default)
--   4. Realtime on runbook_runs
-- Rollback: see 003_runbook_level.down.sql

-- 1. runbook_runs ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS runbook_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  level_id integer NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  runbook jsonb NOT NULL,
  negotiations jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome jsonb,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runbook_runs_player_level
  ON runbook_runs(player_id, level_id);

-- 2. append_negotiation helper ----------------------------------------------
-- Atomic append so parallel negotiation writes don't clobber each other.

CREATE OR REPLACE FUNCTION append_negotiation(run_id uuid, neg jsonb)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE runbook_runs
     SET negotiations = negotiations || jsonb_build_array(neg),
         updated_at = now()
   WHERE id = run_id;
$$;

-- 3. Level 3 seed -----------------------------------------------------------
-- Uses existing 'negotiation' type (already allowed by levels.type CHECK).
-- unlocked=false so Level 3 stays hidden until admin flips it.

INSERT INTO levels (name, description, type, config, unlocked)
VALUES (
  'Level 3: The Runbook',
  'Brief your associate. They negotiate with 3 VCs.',
  'negotiation',
  '{
    "color": "#dbb46f",
    "round_size_m": 2,
    "variant": "runbook"
  }'::jsonb,
  false
)
ON CONFLICT DO NOTHING;

-- 4. Realtime ---------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE runbook_runs;
