# Level System Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 3-VC structure with a generic, admin-controlled level system supporting text chat (with AI tool-call scoring) and ElevenLabs voice levels (with webhook scoring).

**Architecture:** Supabase stores levels (config, unlock state) and scores (1-10, justification). Chat levels use an `end_level` AI SDK tool call to score in real-time. Voice levels use ElevenLabs React SDK with dynamic variables for player tracking, and a post-call webhook to receive scores. Admin toggles level locks and views all scores with justifications.

**Tech Stack:** Next.js 16, Supabase, AI SDK v6, assistant-ui, @elevenlabs/react, Tailwind CSS v4

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migration.sql` | Create | SQL migration for levels, scores tables, leaderboard view |
| `src/lib/types.ts` | Rewrite | New types: Level, Score, LeaderboardEntry, LevelType |
| `src/lib/levels.ts` | Create | Analyst system prompt and level config constants |
| `src/app/api/levels/route.ts` | Create | GET all levels with unlock status |
| `src/app/api/admin/levels/route.ts` | Create | POST toggle level unlock |
| `src/app/api/admin/scores/route.ts` | Create | GET all scores (with justifications), DELETE to reset |
| `src/app/api/chat/route.ts` | Rewrite | Accept levelId/playerId, add end_level tool, write score to DB |
| `src/app/api/webhook/elevenlabs/route.ts` | Create | POST webhook for ElevenLabs post-call data |
| `src/app/api/join/route.ts` | Keep | Already clean, no changes needed |
| `src/components/level-select.tsx` | Create | Replaces vc-select, shows levels with lock state + scores |
| `src/components/chat-level.tsx` | Create | Replaces negotiation, handles end_level tool call completion |
| `src/components/voice-level.tsx` | Create | ElevenLabs voice conversation UI |
| `src/components/admin-panel.tsx` | Create | Level toggles + scores oversight table |
| `src/components/leaderboard.tsx` | Rewrite | Dynamic columns based on levels |
| `src/app/page.tsx` | Rewrite | Route between lobby, level-select, chat-level, voice-level, leaderboard |
| `src/app/admin/page.tsx` | Rewrite | Use new admin-panel component |
| `src/lib/vc-prompts.ts` | Delete | Replaced by levels.ts + DB config |
| `src/components/vc-select.tsx` | Delete | Replaced by level-select |
| `src/components/negotiation.tsx` | Delete | Replaced by chat-level |
| `src/app/api/deal/route.ts` | Delete | Scoring now via tool call |
| `src/app/api/admin/start/route.ts` | Delete | No game states |
| `src/app/api/admin/end/route.ts` | Delete | No game states |
| `src/app/api/admin/teams/route.ts` | Delete | No teams |
| `src/app/api/admin/reset/route.ts` | Delete | Replaced by admin/scores DELETE |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migration.sql`

This SQL runs against Supabase. It drops old tables/views and creates the new schema.

- [ ] **Step 1: Create the migration file**

```sql
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

-- Enable realtime on scores
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE levels;
```

- [ ] **Step 2: Run the migration**

```bash
# Run via Supabase dashboard SQL editor, or:
# supabase db push (if using Supabase CLI)
```

The implementer should use the Supabase dashboard SQL editor at the project URL. The connection details are in `.env.local`.

- [ ] **Step 3: Verify tables exist**

In the Supabase dashboard, check that `levels`, `scores`, and `leaderboard` view exist. Confirm the two seed levels are in the `levels` table.

- [ ] **Step 4: Commit**

```bash
git add supabase/migration.sql
git commit -m "feat: add levels and scores schema migration"
```

---

### Task 2: Update types and create level config

**Files:**
- Rewrite: `src/lib/types.ts`
- Create: `src/lib/levels.ts`

- [ ] **Step 1: Rewrite types.ts**

Replace the entire contents of `src/lib/types.ts` with:

```ts
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
```

- [ ] **Step 2: Create levels.ts**

Create `src/lib/levels.ts`:

```ts
// Default colors per level type (fallback if not in DB config)
export const LEVEL_TYPE_COLORS: Record<string, string> = {
  chat: "#6fdb6f",
  voice: "#db6fdb",
  negotiation: "#db6f6f",
};

export function getLevelColor(level: { type: string; config: { color?: string } }): string {
  return level.config.color || LEVEL_TYPE_COLORS[level.type] || "#888";
}

export const LEVEL_TYPE_LABELS: Record<string, string> = {
  chat: "TEXT",
  voice: "VOICE",
  negotiation: "DEAL",
};
```

- [ ] **Step 3: Verify build**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && pnpm build
```

Build will have errors because other files still import old types. That's expected at this stage.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/levels.ts
git commit -m "feat: add level system types and config helpers"
```

---

### Task 3: API routes - levels and admin

**Files:**
- Create: `src/app/api/levels/route.ts`
- Create: `src/app/api/admin/levels/route.ts`
- Create: `src/app/api/admin/scores/route.ts`

- [ ] **Step 1: Create GET /api/levels**

Create `src/app/api/levels/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .order("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create POST /api/admin/levels**

Create `src/app/api/admin/levels/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const { levelId, unlocked } = await req.json();

  if (typeof levelId !== "number" || typeof unlocked !== "boolean") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("levels")
    .update({ unlocked })
    .eq("id", levelId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create GET + DELETE /api/admin/scores**

Create `src/app/api/admin/scores/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scores")
    .select("*, players(name), levels(name)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE() {
  const supabase = await createClient();

  await supabase.from("scores").delete().not("id", "is", null);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/levels/route.ts src/app/api/admin/levels/route.ts src/app/api/admin/scores/route.ts
git commit -m "feat: add levels and admin scores API routes"
```

---

### Task 4: Update chat API route with end_level tool

**Files:**
- Rewrite: `src/app/api/chat/route.ts`

- [ ] **Step 1: Rewrite the chat route**

Replace the entire contents of `src/app/api/chat/route.ts` with:

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText } from "ai";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const { messages, system, levelId, playerId } = await req.json();

  if (!system || !levelId || !playerId) {
    return new Response("Missing required fields", { status: 400 });
  }

  const supabase = await createClient();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 300,
    maxRetries: 3,
    tools: {
      end_level: {
        description:
          "Call this when the conversation is over. Score 0 if the founder failed. Score 1-10 based on how excited you are.",
        parameters: z.object({
          score: z
            .number()
            .int()
            .min(0)
            .max(10)
            .describe("0 = failed, 1-10 = excitement level"),
          justification: z
            .string()
            .describe("Brief explanation of your score"),
        }),
        execute: async ({ score, justification }) => {
          await supabase.from("scores").insert({
            player_id: playerId,
            level_id: levelId,
            score,
            justification,
          });

          return { completed: true, score };
        },
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
```

Key changes from previous version:
- Accepts `levelId` and `playerId` from the request body
- Defines `end_level` tool with `execute` that writes to DB
- Tool call is server-side (execute runs on server, result streams back to client)
- assistant-ui will display the tool call; frontend detects it for the completion screen

- [ ] **Step 2: Verify build**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: add end_level tool to chat route for AI-driven scoring"
```

---

### Task 5: ElevenLabs webhook endpoint

**Files:**
- Create: `src/app/api/webhook/elevenlabs/route.ts`

- [ ] **Step 1: Install ElevenLabs packages**

```bash
pnpm add @elevenlabs/react
```

- [ ] **Step 2: Create the webhook route**

Create `src/app/api/webhook/elevenlabs/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const body = await req.json();

  // Only process post_call_transcription events
  if (body.type !== "post_call_transcription") {
    return NextResponse.json({ ok: true });
  }

  const data = body.data;
  const dynamicVars = data?.conversation_initiation_client_data?.dynamic_variables;

  if (!dynamicVars?.player_id || !dynamicVars?.level_id) {
    console.error("Missing player_id or level_id in webhook dynamic variables");
    return NextResponse.json({ error: "Missing identifiers" }, { status: 400 });
  }

  const playerId = dynamicVars.player_id;
  const levelId = parseInt(dynamicVars.level_id, 10);

  // Extract score from data collection results
  const dataResults = data?.analysis?.data_collection_results;
  const score = dataResults?.score?.value ?? 0;
  const justification =
    dataResults?.justification?.value ??
    data?.analysis?.transcript_summary ??
    null;

  const supabase = await createClient();

  const { error } = await supabase.from("scores").insert({
    player_id: playerId,
    level_id: levelId,
    score: Math.min(10, Math.max(0, Math.round(Number(score)))),
    justification: typeof justification === "string" ? justification : null,
  });

  if (error) {
    console.error("Failed to save ElevenLabs score:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

Note: The ElevenLabs agent must be configured in the ElevenLabs dashboard with:
- Data collection item: `score` (Integer) - "Rate the founder 1-10 on how compelling their pitch was"
- Data collection item: `justification` (String) - "Brief explanation of the score"
- Post-call webhook URL: `https://<your-domain>/api/webhook/elevenlabs`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhook/elevenlabs/route.ts
git commit -m "feat: add ElevenLabs post-call webhook endpoint"
```

---

### Task 6: Level select component

**Files:**
- Create: `src/components/level-select.tsx`

- [ ] **Step 1: Create level-select.tsx**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Level } from "@/lib/types";
import { getLevelColor, LEVEL_TYPE_LABELS } from "@/lib/levels";

interface MyScores {
  [levelId: number]: number;
}

export function LevelSelect({
  playerId,
  onSelect,
  onLeaderboard,
}: {
  playerId: string;
  onSelect: (level: Level) => void;
  onLeaderboard: () => void;
}) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [scores, setScores] = useState<MyScores>({});

  async function fetchLevels() {
    const res = await fetch("/api/levels");
    if (res.ok) {
      const data = await res.json();
      setLevels(data);
    }
  }

  async function fetchScores() {
    const supabase = createClient();
    const { data } = await supabase
      .from("scores")
      .select("level_id, score")
      .eq("player_id", playerId);

    if (!data) return;

    const best: MyScores = {};
    for (const row of data) {
      const lid = row.level_id as number;
      const s = row.score as number;
      if (best[lid] === undefined || s > best[lid]) {
        best[lid] = s;
      }
    }
    setScores(best);
  }

  useEffect(() => {
    fetchLevels();
    fetchScores();

    const supabase = createClient();

    const levelsChannel = supabase
      .channel("levels-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "levels" },
        () => fetchLevels()
      )
      .subscribe();

    const scoresChannel = supabase
      .channel("my-level-scores")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scores" },
        () => fetchScores()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(levelsChannel);
      supabase.removeChannel(scoresChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  return (
    <div className="flex flex-col min-h-screen p-4 scanlines">
      <div className="flex justify-end items-center mb-6">
        <button
          onClick={onLeaderboard}
          className="font-pixel text-[10px] text-zinc-500 hover:text-white transition-colors"
        >
          [ LEADERBOARD ]
        </button>
      </div>

      <h2 className="font-pixel text-lg mb-1 text-center">SELECT LEVEL</h2>
      <p className="text-zinc-500 text-xs mb-8 text-center">
        Convince the VCs to invest
      </p>

      <div className="space-y-3 max-w-md mx-auto w-full">
        {levels.map((level) => {
          const color = getLevelColor(level);
          const score = scores[level.id];
          const locked = !level.unlocked;
          const typeLabel = LEVEL_TYPE_LABELS[level.type] || level.type.toUpperCase();

          return (
            <button
              key={level.id}
              onClick={() => !locked && onSelect(level)}
              disabled={locked}
              className={`w-full p-4 border-2 text-left transition-all bg-zinc-950 ${
                locked ? "opacity-40 cursor-not-allowed" : "pixel-btn"
              }`}
              style={{ borderColor: locked ? "#333" : color + "60" }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-zinc-600">
                      LVL {level.id}
                    </span>
                    <span
                      className="text-[8px] px-1.5 py-0.5 border"
                      style={{
                        color: locked ? "#666" : color,
                        borderColor: locked ? "#444" : color + "40",
                      }}
                    >
                      {typeLabel}
                    </span>
                  </div>
                  <div
                    className="font-pixel text-xs"
                    style={{ color: locked ? "#666" : color }}
                  >
                    {locked ? "LOCKED" : level.name.toUpperCase()}
                  </div>
                  {!locked && level.description && (
                    <div className="text-zinc-500 text-xs italic mt-1">
                      &quot;{level.description}&quot;
                    </div>
                  )}
                </div>
                <div className="text-right text-xs">
                  {!locked && score !== undefined ? (
                    <div style={{ color: "#ffd700" }}>
                      BEST: {score}/10
                    </div>
                  ) : !locked ? (
                    <div className="text-zinc-600">---</div>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/level-select.tsx
git commit -m "feat: add level select component"
```

---

### Task 7: Chat level component

**Files:**
- Create: `src/components/chat-level.tsx`

- [ ] **Step 1: Create chat-level.tsx**

```tsx
"use client";

import { useState, useEffect } from "react";
import {
  AssistantRuntimeProvider,
  useAssistantRuntime,
} from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";
import { createClient } from "@/utils/supabase/client";

export function ChatLevel({
  playerId,
  level,
  onBack,
  onComplete,
}: {
  playerId: string;
  level: Level;
  onBack: () => void;
  onComplete: (score: number) => void;
}) {
  const color = getLevelColor(level);
  const systemPrompt = level.config.system_prompt || "";

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: {
        system: systemPrompt,
        levelId: level.id,
        playerId,
      },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-screen">
        <div
          className="flex justify-between items-center px-4 py-3 border-b-2"
          style={{ borderColor: color + "60" }}
        >
          <div className="font-pixel text-xs" style={{ color }}>
            {level.name.toUpperCase()}
          </div>
          <a
            href="/deck.pdf"
            target="_blank"
            className="text-zinc-500 hover:text-white transition-colors text-xs"
          >
            [ DECK ]
          </a>
        </div>

        <div className="flex-1 overflow-hidden">
          <Thread />
        </div>

        <ChatLevelFooter
          playerId={playerId}
          levelId={level.id}
          color={color}
          onBack={onBack}
          onComplete={onComplete}
        />
      </div>
    </AssistantRuntimeProvider>
  );
}

function ChatLevelFooter({
  playerId,
  levelId,
  color,
  onBack,
  onComplete,
}: {
  playerId: string;
  levelId: number;
  color: string;
  onBack: () => void;
  onComplete: (score: number) => void;
}) {
  const runtime = useAssistantRuntime();
  const [completed, setCompleted] = useState<{ score: number; justification?: string } | null>(null);

  // Listen for new scores via Supabase realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`score-${playerId}-${levelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scores",
          filter: `player_id=eq.${playerId}`,
        },
        (payload) => {
          const row = payload.new as { level_id: number; score: number };
          if (row.level_id === levelId) {
            setCompleted({ score: row.score });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId, levelId]);

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border-t border-zinc-800">
        <div className="font-pixel text-xl mb-2" style={{ color: "#ffd700" }}>
          LEVEL COMPLETE
        </div>
        <div className="text-4xl font-bold" style={{ color: "#ffd700" }}>
          {completed.score}/10
        </div>
        <button
          onClick={() => {
            onComplete(completed.score);
            onBack();
          }}
          className="mt-6 px-6 py-3 border-2 border-zinc-700 hover:border-zinc-500 transition-colors text-xs pixel-btn"
        >
          CONTINUE
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-between px-4 py-2 border-t border-zinc-800">
      <button
        onClick={onBack}
        className="font-pixel text-sm transition-colors"
        style={{ color: "#db6f6f" }}
      >
        QUIT
      </button>
      <div className="font-pixel text-[10px] text-zinc-600" style={{ color: color + "80" }}>
        CONVINCE THEM
      </div>
    </div>
  );
}
```

Key differences from old negotiation.tsx:
- No "DEAL!" button. The AI decides when the level ends via tool call.
- Listens for score insertion via Supabase realtime (catches the tool call result).
- Takes a `Level` object instead of `VcType`.

- [ ] **Step 2: Commit**

```bash
git add src/components/chat-level.tsx
git commit -m "feat: add chat level component with tool-call completion"
```

---

### Task 8: Voice level component (ElevenLabs)

**Files:**
- Create: `src/components/voice-level.tsx`

- [ ] **Step 1: Create voice-level.tsx**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useConversation } from "@elevenlabs/react";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";
import { createClient } from "@/utils/supabase/client";

export function VoiceLevel({
  playerId,
  level,
  onBack,
  onComplete,
}: {
  playerId: string;
  level: Level;
  onBack: () => void;
  onComplete: (score: number) => void;
}) {
  const color = getLevelColor(level);
  const agentId = level.config.elevenlabs_agent_id as string;
  const [completed, setCompleted] = useState<{ score: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const conversation = useConversation({
    onError: (err) => setError(err.message || "Voice connection failed"),
  });

  // Listen for score via Supabase realtime (webhook writes it)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`voice-score-${playerId}-${level.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scores",
          filter: `player_id=eq.${playerId}`,
        },
        (payload) => {
          const row = payload.new as { level_id: number; score: number };
          if (row.level_id === level.id) {
            setCompleted({ score: row.score });
            conversation.endSession();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId, level.id, conversation]);

  const startCall = useCallback(async () => {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({
        agentId,
        dynamicVariables: {
          player_id: playerId,
          level_id: String(level.id),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start call");
    }
  }, [agentId, conversation, playerId, level.id]);

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 scanlines">
        <div className="font-pixel text-xl mb-2" style={{ color: "#ffd700" }}>
          LEVEL COMPLETE
        </div>
        <div className="text-4xl font-bold" style={{ color: "#ffd700" }}>
          {completed.score}/10
        </div>
        <button
          onClick={() => {
            onComplete(completed.score);
            onBack();
          }}
          className="mt-6 px-6 py-3 border-2 border-zinc-700 hover:border-zinc-500 transition-colors text-xs pixel-btn"
        >
          CONTINUE
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 scanlines">
      <div className="font-pixel text-xs mb-2" style={{ color }}>
        {level.name.toUpperCase()}
      </div>
      <p className="text-zinc-500 text-xs mb-8 text-center">
        {level.description}
      </p>

      {conversation.status === "connected" ? (
        <div className="flex flex-col items-center gap-6">
          <div
            className="w-24 h-24 border-2 flex items-center justify-center"
            style={{ borderColor: color }}
          >
            <div
              className={`w-4 h-4 rounded-full ${
                conversation.isSpeaking ? "animate-pulse" : ""
              }`}
              style={{ backgroundColor: color }}
            />
          </div>
          <p className="font-pixel text-[10px] text-zinc-400">
            {conversation.isSpeaking ? "PARTNER SPEAKING" : "LISTENING..."}
          </p>
          <button
            onClick={() => conversation.endSession()}
            className="px-6 py-3 border-2 border-red-800 text-red-400 hover:border-red-600 transition-colors text-xs pixel-btn font-pixel"
          >
            END CALL
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={startCall}
            className="px-8 py-4 border-2 transition-colors text-sm pixel-btn font-pixel"
            style={{ borderColor: color + "60", color }}
          >
            START CALL
          </button>
          {error && (
            <p className="text-red-500 text-xs text-center max-w-xs">{error}</p>
          )}
        </div>
      )}

      <button
        onClick={onBack}
        className="mt-8 font-pixel text-[10px] text-zinc-600 hover:text-white transition-colors"
      >
        [ BACK ]
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/voice-level.tsx
git commit -m "feat: add ElevenLabs voice level component"
```

---

### Task 9: Admin panel component

**Files:**
- Create: `src/components/admin-panel.tsx`
- Rewrite: `src/app/admin/page.tsx`

- [ ] **Step 1: Create admin-panel.tsx**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";

interface ScoreRow {
  id: string;
  score: number;
  justification: string | null;
  created_at: string;
  players: { name: string };
  levels: { name: string };
}

export function AdminPanel() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState("");

  async function fetchLevels() {
    const res = await fetch("/api/levels");
    if (res.ok) setLevels(await res.json());
  }

  async function fetchScores() {
    const res = await fetch("/api/admin/scores");
    if (res.ok) setScores(await res.json());
  }

  useEffect(() => {
    fetchLevels();
    fetchScores();

    const supabase = createClient();

    const ch1 = supabase
      .channel("admin-levels")
      .on("postgres_changes", { event: "*", schema: "public", table: "levels" }, () => fetchLevels())
      .subscribe();

    const ch2 = supabase
      .channel("admin-scores")
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, () => fetchScores())
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, []);

  async function toggleLevel(levelId: number, unlocked: boolean) {
    setLoading(`level-${levelId}`);
    await fetch("/api/admin/levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ levelId, unlocked }),
    });
    setLoading("");
  }

  async function resetScores() {
    if (!confirm("Wipe ALL scores? This cannot be undone.")) return;
    setLoading("reset");
    await fetch("/api/admin/scores", { method: "DELETE" });
    setLoading("");
  }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <h1 className="font-pixel text-xl mb-6">ADMIN</h1>

      <section className="mb-8">
        <h2 className="font-pixel text-sm mb-3 text-zinc-400">LEVELS</h2>
        <div className="space-y-2">
          {levels.map((level) => {
            const color = getLevelColor(level);
            return (
              <div
                key={level.id}
                className="flex items-center justify-between p-3 border-2 border-zinc-800 bg-zinc-950"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600">#{level.id}</span>
                  <span className="font-pixel text-xs" style={{ color }}>
                    {level.name.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    ({level.type})
                  </span>
                </div>
                <button
                  onClick={() => toggleLevel(level.id, !level.unlocked)}
                  disabled={loading === `level-${level.id}`}
                  className={`font-pixel text-[10px] px-3 py-1 border-2 transition-colors ${
                    level.unlocked
                      ? "border-green-800 text-green-400"
                      : "border-zinc-700 text-zinc-500"
                  }`}
                >
                  {level.unlocked ? "UNLOCKED" : "LOCKED"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-pixel text-sm text-zinc-400">SCORES</h2>
          <button
            onClick={resetScores}
            disabled={loading === "reset"}
            className="font-pixel text-[10px] px-3 py-1 border-2 border-red-900 text-red-400 hover:border-red-700 transition-colors"
          >
            {loading === "reset" ? "RESETTING..." : "RESET ALL"}
          </button>
        </div>

        {scores.length === 0 ? (
          <p className="text-zinc-600 text-sm">No scores yet.</p>
        ) : (
          <div className="space-y-1">
            {scores.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between p-2 border border-zinc-800 text-xs"
              >
                <div className="flex-1">
                  <span className="text-white">{s.players?.name}</span>
                  <span className="text-zinc-600 mx-2">on</span>
                  <span className="text-zinc-400">{s.levels?.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="font-pixel text-xs"
                    style={{ color: s.score >= 7 ? "#ffd700" : s.score >= 4 ? "#c0c0c0" : "#db6f6f" }}
                  >
                    {s.score}/10
                  </span>
                </div>
                {s.justification && (
                  <div className="text-zinc-500 text-[11px] mt-1 w-full">
                    {s.justification}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite admin page.tsx**

Replace the entire contents of `src/app/admin/page.tsx` with:

```tsx
import { AdminPanel } from "@/components/admin-panel";

export default function AdminPage() {
  return <AdminPanel />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin-panel.tsx src/app/admin/page.tsx
git commit -m "feat: add admin panel with level toggles and scores oversight"
```

---

### Task 10: Leaderboard update

**Files:**
- Rewrite: `src/components/leaderboard.tsx`

- [ ] **Step 1: Rewrite leaderboard.tsx**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Level, LeaderboardEntry } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";

export function Leaderboard({
  currentPlayerId,
  onBack,
}: {
  currentPlayerId: string | null;
  onBack?: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);

  async function fetchLeaderboard() {
    const supabase = createClient();
    const { data } = await supabase.from("leaderboard").select("*").order("total", { ascending: false });
    if (data) setEntries(data as LeaderboardEntry[]);
  }

  async function fetchLevels() {
    const res = await fetch("/api/levels");
    if (res.ok) setLevels(await res.json());
  }

  useEffect(() => {
    fetchLeaderboard();
    fetchLevels();

    const supabase = createClient();
    const channel = supabase
      .channel("leaderboard-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scores" }, () => fetchLeaderboard())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const medalColor = (rank: number) => {
    if (rank === 0) return "#ffd700";
    if (rank === 1) return "#c0c0c0";
    if (rank === 2) return "#cd7f32";
    return "#666";
  };

  function getScoreForLevel(entry: LeaderboardEntry, levelId: number): number | null {
    const found = entry.level_scores.find((ls) => ls.level_id === levelId);
    return found ? found.score : null;
  }

  return (
    <div className="flex flex-col min-h-screen p-4 scanlines">
      {onBack && (
        <button
          onClick={onBack}
          className="self-start text-xs text-zinc-500 hover:text-white transition-colors mb-4"
        >
          [ BACK ]
        </button>
      )}

      <h2 className="font-pixel text-lg text-center mb-1">HIGH SCORES</h2>
      <p className="text-zinc-500 text-xs text-center mb-6">
        Best score per level
      </p>

      <div className="max-w-2xl mx-auto w-full space-y-2">
        {entries.length === 0 && (
          <p className="text-zinc-600 text-center mt-8 text-sm">No scores yet...</p>
        )}

        {entries.map((entry, i) => {
          const isMe = entry.player_id === currentPlayerId;

          return (
            <div
              key={entry.player_id}
              className={`flex items-center justify-between p-3 border-2 ${
                isMe ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 bg-zinc-950"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-pixel text-xs w-8" style={{ color: medalColor(i) }}>
                  {i + 1}.
                </span>
                <span className={`text-sm ${isMe ? "font-bold" : ""}`}>
                  {entry.name}
                  {isMe && <span className="text-zinc-500 text-xs ml-2">(you)</span>}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                {levels.map((level) => {
                  const score = getScoreForLevel(entry, level.id);
                  const color = getLevelColor(level);
                  return (
                    <span key={level.id} style={{ color: score ? color : "#444" }}>
                      {score !== null ? `${score}/10` : "---"}
                    </span>
                  );
                })}
                <span className="font-pixel text-xs ml-1" style={{ color: medalColor(i) }}>
                  {entry.total}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/leaderboard.tsx
git commit -m "feat: update leaderboard for dynamic level columns"
```

---

### Task 11: Main page routing

**Files:**
- Rewrite: `src/app/page.tsx`

- [ ] **Step 1: Rewrite page.tsx**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Level } from "@/lib/types";
import { Lobby } from "@/components/lobby";
import { LevelSelect } from "@/components/level-select";
import { ChatLevel } from "@/components/chat-level";
import { VoiceLevel } from "@/components/voice-level";
import { Leaderboard } from "@/components/leaderboard";

type Screen = "level-select" | "playing" | "leaderboard";

export default function Home() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("level-select");
  const [activeLevel, setActiveLevel] = useState<Level | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("boss-fight-player");
    if (stored) {
      const parsed = JSON.parse(stored);
      setPlayerId(parsed.id);
      setPlayerName(parsed.name);
    }
  }, []);

  function handleJoin(id: string, name: string) {
    setPlayerId(id);
    setPlayerName(name);
    localStorage.setItem("boss-fight-player", JSON.stringify({ id, name }));
  }

  if (!playerId) {
    return <Lobby onJoin={handleJoin} />;
  }

  if (screen === "leaderboard") {
    return (
      <Leaderboard
        currentPlayerId={playerId}
        onBack={() => setScreen("level-select")}
      />
    );
  }

  if (screen === "playing" && activeLevel) {
    if (activeLevel.type === "chat") {
      return (
        <ChatLevel
          playerId={playerId}
          level={activeLevel}
          onBack={() => {
            setScreen("level-select");
            setActiveLevel(null);
          }}
          onComplete={() => {}}
        />
      );
    }

    if (activeLevel.type === "voice") {
      return (
        <VoiceLevel
          playerId={playerId}
          level={activeLevel}
          onBack={() => {
            setScreen("level-select");
            setActiveLevel(null);
          }}
          onComplete={() => {}}
        />
      );
    }
  }

  return (
    <LevelSelect
      playerId={playerId}
      onSelect={(level) => {
        setActiveLevel(level);
        setScreen("playing");
      }}
      onLeaderboard={() => setScreen("leaderboard")}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: update main page routing for level system"
```

---

### Task 12: Delete old files and cleanup

**Files:**
- Delete: `src/lib/vc-prompts.ts`
- Delete: `src/components/vc-select.tsx`
- Delete: `src/components/negotiation.tsx`
- Delete: `src/app/api/deal/route.ts`
- Delete: `src/app/api/admin/start/route.ts`
- Delete: `src/app/api/admin/end/route.ts`
- Delete: `src/app/api/admin/teams/route.ts`
- Delete: `src/app/api/admin/reset/route.ts`

- [ ] **Step 1: Delete old files**

```bash
rm src/lib/vc-prompts.ts
rm src/components/vc-select.tsx
rm src/components/negotiation.tsx
rm src/app/api/deal/route.ts
rm src/app/api/admin/start/route.ts
rm src/app/api/admin/end/route.ts
rm src/app/api/admin/teams/route.ts
rm src/app/api/admin/reset/route.ts
```

- [ ] **Step 2: Verify build**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && pnpm build
```

Expected: Clean build with no import errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old VC system files"
```

---

### Task 13: End-to-end verification

- [ ] **Step 1: Start dev server and test full flow**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && pnpm dev
```

Test:
1. Open http://localhost:3000 - lobby loads with retro styling
2. Join as a new player
3. Level select shows levels (all locked initially)
4. Open /admin - toggle Level 1 unlocked
5. Back to main - Level 1 now clickable
6. Enter Level 1 chat - send messages to the analyst
7. Convince the analyst - they call end_level tool - completion screen shows score
8. Check leaderboard shows the score
9. Admin page shows score with justification
10. Reset scores from admin - leaderboard clears

- [ ] **Step 2: Final build**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && pnpm build
```

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore: final cleanup and fixes"
```
