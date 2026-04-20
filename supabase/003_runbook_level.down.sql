-- 003_runbook_level.down.sql
-- Reverse of 003_runbook_level.sql. Order matters: publication → level row → function → table.

ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS runbook_runs;

DELETE FROM levels WHERE name = 'Level 3: The Runbook';

DROP FUNCTION IF EXISTS append_negotiation(uuid, jsonb);

DROP TABLE IF EXISTS runbook_runs;
