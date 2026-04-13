# Level System Refactor

## Goal

Replace the fixed 3-VC structure with a generic, admin-controlled level system. Each level has a type (chat, voice, negotiation), uniform 1-10 scoring, and can be unlocked/locked by the admin in real time. The game is always running - no start/end states.

## Database Schema

### Remove

- `game_state` table (no more lobby/teams/start/end)
- `negotiations` table (replaced by `scores`)
- `leaderboard` view (replaced by new view)

### Keep

- `players` table (id, name, created_at) - remove `team_number` column

### Create

**`levels` table:**

| Column | Type | Description |
|--------|------|-------------|
| id | serial primary key | Level ID, also determines display order |
| name | text not null | Display name (e.g. "The Analyst") |
| description | text | Short tagline |
| type | text not null | Level type: "chat", "voice", "negotiation" |
| config | jsonb not null default '{}' | Type-specific config (system prompt, personality, color, etc.) |
| unlocked | boolean not null default false | Admin-controlled, global |
| created_at | timestamptz default now() | |

**`scores` table:**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid primary key default gen_random_uuid() | |
| player_id | uuid references players(id) | |
| level_id | integer references levels(id) | |
| score | integer not null check (score >= 0 and score <= 10) | 0 = failed, 1-10 = success rating |
| justification | text | AI's reasoning for the score (admin-visible only) |
| created_at | timestamptz default now() | |

**`leaderboard` view:**

```sql
SELECT
  p.id as player_id,
  p.name,
  COALESCE(SUM(best.best_score), 0) as total,
  json_agg(json_build_object('level_id', best.level_id, 'score', best.best_score)) as level_scores
FROM players p
LEFT JOIN LATERAL (
  SELECT s.level_id, MAX(s.score) as best_score
  FROM scores s
  WHERE s.player_id = p.id
  GROUP BY s.level_id
) best ON true
GROUP BY p.id, p.name
ORDER BY total DESC;
```

### Seed data (Level 1)

```sql
INSERT INTO levels (name, description, type, config, unlocked) VALUES (
  'The Analyst',
  'Get past the gatekeeper',
  'chat',
  '{
    "color": "#6fdb6f",
    "system_prompt": "..."
  }'::jsonb,
  false
);
```

The analyst system prompt will instruct the AI to act as a junior VC analyst screening inbound founders. It should evaluate the founder's pitch and decide whether to forward them to a partner. When it makes its decision, it calls the `end_level` tool.

## Level Completion via Tool Call

Chat-type levels give the AI an `end_level` tool:

```ts
tools: {
  end_level: {
    description: "Call this when the conversation is over. Score 0 if the founder failed to convince you. Score 1-10 based on how excited you are to forward them to a partner.",
    parameters: z.object({
      score: z.number().int().min(0).max(10),
      justification: z.string().describe("Brief explanation of your score"),
    }),
  },
}
```

When the AI calls this tool:
1. Server writes `{ player_id, level_id, score, justification }` to `scores` table
2. Server returns a tool result confirming completion
3. The response stream includes the tool call, which the frontend detects
4. Frontend shows the completion screen with the score

The tool call is server-side only (not a frontend tool). The AI SDK `streamText` handles it via `onToolCall` or by including it in the stream and processing on the frontend.

## API Routes

### `POST /api/chat` (update existing)

Receives `{ messages, system, levelId, playerId }` from the frontend. Configures `streamText` with the system prompt and the `end_level` tool. When the tool is called, writes the score to the DB and returns the tool result in the stream.

### `GET /api/levels` (new)

Returns all levels with their unlocked status. No auth needed.

### `POST /api/admin/levels` (new)

Toggle a level's unlocked status. Body: `{ levelId, unlocked }`.

### `DELETE /api/admin/scores` (replaces reset)

Wipes all scores. The new reset.

### `GET /api/admin/scores` (new)

Returns all scores with justifications, grouped by level. For the admin oversight view.

### Remove

- `POST /api/admin/start`
- `POST /api/admin/end`
- `POST /api/admin/teams`
- `POST /api/deal`
- `POST /api/join` - simplify to just create a player, no game state check

## Frontend Components

### Level Select (replaces VC Select)

Shows all levels in order. Each level card shows:
- Level number, name, tagline
- Locked/unlocked state (locked levels are grayed out, not clickable)
- Player's best score for that level (if any)
- Level type indicator (chat/voice/etc.)

### Negotiation/Chat (update existing)

- Receives `levelId` instead of `vcType`
- Loads level config (system prompt, color, name) from the levels data
- Passes `levelId` and `playerId` to the API route
- Detects `end_level` tool call in the response stream
- When detected, shows completion screen with score (no "Accept deal" button needed - the AI decides when it's over)
- Remove the manual "DEAL!" and "QUIT" buttons. The conversation ends when the AI calls the tool. Keep a "QUIT" button that exits without scoring.

### Admin Panel (simplify)

- List of all levels with toggle switches (unlocked/locked)
- Scores table: all players, all levels, scores + justifications
- Reset button (wipe all scores)
- Remove start/end/teams controls

### Leaderboard (update)

- Shows best score per level instead of per VC
- Total = sum of best scores
- Level columns are dynamic based on how many levels exist

### Lobby (simplify)

- Just name input + join. No game state check needed.
- The join API just creates a player record, no team assignment.

## Types

```ts
export type LevelType = "chat" | "voice" | "negotiation";

export interface Level {
  id: number;
  name: string;
  description: string;
  type: LevelType;
  config: Record<string, unknown>;
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
```

## What stays the same

- assistant-ui chat infrastructure (Thread, Composer, etc.)
- Retro pixel styling
- Supabase for all data
- AI SDK + Anthropic for chat
- Player join flow (simplified)

## Out of scope

- Level 2 (ElevenLabs voice) implementation - placeholder level entry only
- Level 3+ implementations
- Per-player level gating (all unlocked levels are available to everyone)
