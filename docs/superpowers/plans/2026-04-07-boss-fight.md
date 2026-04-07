# Boss Fight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a team-based VC negotiation game where founders chat with AI VC personalities to get the best valuation, with a real-time leaderboard.

**Architecture:** Single Next.js app. Supabase for game state + realtime. Claude API (via AI SDK) for VC conversations. Chat messages are client-side only — no DB writes during negotiation. Deals are persisted when a player clicks "Accept deal". Game state transitions (lobby → teams → playing → finished) are driven by admin API routes. All clients subscribe to Supabase Realtime for instant state sync.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS, Supabase (Postgres + Realtime), AI SDK v6 + @ai-sdk/anthropic, Vercel

---

## File Structure

```
src/
  app/
    page.tsx                      -- Main player page (client, state-driven)
    admin/page.tsx                -- Admin control panel
    api/
      join/route.ts               -- POST: create player
      chat/route.ts               -- POST: stream VC response
      deal/route.ts               -- POST: close deal + extract valuation
      admin/
        teams/route.ts            -- POST: assign teams randomly
        start/route.ts            -- POST: start game
        end/route.ts              -- POST: end game
        reset/route.ts            -- POST: reset game to lobby
    layout.tsx                    -- Root layout
    globals.css                   -- Dark game theme
  components/
    lobby.tsx                     -- Name input, join, deck link
    team-assignment.tsx           -- "You are Team X" screen
    vc-select.tsx                 -- 3 VC cards with team best scores
    negotiation.tsx               -- Chat UI with streaming + deal/walk buttons
    leaderboard.tsx               -- Ranked team scores
  lib/
    supabase-server.ts            -- Supabase client with service_role key
    supabase-browser.ts           -- Supabase client with anon key
    types.ts                      -- Shared types
    vc-prompts.ts                 -- System prompts for 3 VC personalities
```

---

## Supabase Project Info

- **Project ID:** `qkhfzxzhqeysvexbfuus`
- **URL:** `https://qkhfzxzhqeysvexbfuus.supabase.co`
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFraGZ6eHpocWV5c3ZleGJmdXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjcxMjksImV4cCI6MjA5MTE0MzEyOX0.taD-98C5gZ8xPvtKP9XOIFZ_M0DbuCV_xGDdiutpO8A`
- **Region:** eu-west-1

The service_role key must be fetched from the Supabase dashboard and added to `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`.

AI calls route through **Vercel AI Gateway** using OIDC auth — no provider API keys needed. Run `vercel env pull .env.local` to provision the OIDC token.

---

### Task 1: Database Schema

**Files:**
- No local files — applied via Supabase MCP

- [ ] **Step 1: Apply migration**

Apply this migration via `mcp__claude_ai_Supabase__apply_migration` with name `initial_schema` and project_id `qkhfzxzhqeysvexbfuus`:

```sql
-- Game state (single row)
CREATE TABLE game_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'teams', 'playing', 'finished')),
  num_teams int,
  deck_url text
);

-- Players
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  team_number int,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Negotiations (only created when a deal closes)
CREATE TABLE negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id),
  vc_type text NOT NULL CHECK (vc_type IN ('visionary', 'empath', 'shark')),
  final_valuation numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Leaderboard view: best score per VC per team
CREATE VIEW leaderboard AS
SELECT
  p.team_number,
  COALESCE(MAX(CASE WHEN n.vc_type = 'visionary' THEN n.final_valuation END), 0) AS best_visionary,
  COALESCE(MAX(CASE WHEN n.vc_type = 'empath' THEN n.final_valuation END), 0) AS best_empath,
  COALESCE(MAX(CASE WHEN n.vc_type = 'shark' THEN n.final_valuation END), 0) AS best_shark,
  COALESCE(MAX(CASE WHEN n.vc_type = 'visionary' THEN n.final_valuation END), 0) +
  COALESCE(MAX(CASE WHEN n.vc_type = 'empath' THEN n.final_valuation END), 0) +
  COALESCE(MAX(CASE WHEN n.vc_type = 'shark' THEN n.final_valuation END), 0) AS total
FROM players p
LEFT JOIN negotiations n ON n.player_id = p.id
WHERE p.team_number IS NOT NULL
GROUP BY p.team_number
ORDER BY total DESC;

-- Enable RLS with permissive read policies (writes go through service_role in API routes)
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON game_state FOR SELECT USING (true);
CREATE POLICY "public_read" ON players FOR SELECT USING (true);
CREATE POLICY "public_read" ON negotiations FOR SELECT USING (true);

-- Enable Realtime on tables
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE negotiations;
```

- [ ] **Step 2: Seed initial game state**

Run via `mcp__claude_ai_Supabase__execute_sql`:

```sql
INSERT INTO game_state (id, status) VALUES (1, 'lobby');
```

- [ ] **Step 3: Verify tables exist**

Run via `mcp__claude_ai_Supabase__list_tables`:

Confirm: `game_state`, `players`, `negotiations` all exist.

---

### Task 2: Project Setup

**Files:**
- Modify: `package.json`
- Create: `.env.local`
- Create: `src/lib/supabase-server.ts`
- Create: `src/lib/supabase-browser.ts`
- Create: `src/lib/types.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/matejmicek/Developer/boss-fight
npm install ai @ai-sdk/anthropic @supabase/supabase-js
```

- [ ] **Step 2: Create .env.local**

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://qkhfzxzhqeysvexbfuus.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFraGZ6eHpocWV5c3ZleGJmdXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjcxMjksImV4cCI6MjA5MTE0MzEyOX0.taD-98C5gZ8xPvtKP9XOIFZ_M0DbuCV_xGDdiutpO8A
SUPABASE_SERVICE_ROLE_KEY=<get from Supabase dashboard: Settings > API > service_role key>
EOF
```

Then pull OIDC token for AI Gateway:

```bash
vercel link
vercel env pull .env.local --yes
```

This provisions `VERCEL_OIDC_TOKEN` automatically. No provider API keys needed — AI calls route through Vercel AI Gateway.

**Important:** The service_role key must be filled in manually. Get it from https://supabase.com/dashboard/project/qkhfzxzhqeysvexbfuus/settings/api

- [ ] **Step 3: Create Supabase server client**

Write `src/lib/supabase-server.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

- [ ] **Step 4: Create Supabase browser client**

Write `src/lib/supabase-browser.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

export function getBrowserClient() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
```

- [ ] **Step 5: Create shared types**

Write `src/lib/types.ts`:

```typescript
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
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ .env.local package.json package-lock.json
# Note: .env.local is in .gitignore by default — that's correct, don't force-add it
git add src/lib/ package.json package-lock.json
git commit -m "feat: add project deps and lib setup (supabase, types)"
```

---

### Task 3: Join + Admin API Routes

**Files:**
- Create: `src/app/api/join/route.ts`
- Create: `src/app/api/admin/teams/route.ts`
- Create: `src/app/api/admin/start/route.ts`
- Create: `src/app/api/admin/end/route.ts`
- Create: `src/app/api/admin/reset/route.ts`

- [ ] **Step 1: Create join route**

Write `src/app/api/join/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const { name } = await req.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: gameState } = await supabase
    .from("game_state")
    .select("status")
    .eq("id", 1)
    .single();

  if (gameState?.status !== "lobby") {
    return NextResponse.json(
      { error: "Game already in progress" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("players")
    .insert({ name: name.trim() })
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create assign teams route**

Write `src/app/api/admin/teams/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const { numTeams } = await req.json();

  if (!numTeams || numTeams < 2) {
    return NextResponse.json(
      { error: "Need at least 2 teams" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Get all players
  const { data: players } = await supabase
    .from("players")
    .select("id")
    .order("created_at");

  if (!players || players.length === 0) {
    return NextResponse.json({ error: "No players" }, { status: 400 });
  }

  // Shuffle players randomly
  const shuffled = [...players].sort(() => Math.random() - 0.5);

  // Assign team numbers round-robin
  const updates = shuffled.map((player, i) => ({
    id: player.id,
    team_number: (i % numTeams) + 1,
  }));

  // Update each player's team
  for (const update of updates) {
    await supabase
      .from("players")
      .update({ team_number: update.team_number })
      .eq("id", update.id);
  }

  // Update game state
  await supabase
    .from("game_state")
    .update({ status: "teams", num_teams: numTeams })
    .eq("id", 1);

  return NextResponse.json({ ok: true, playerCount: players.length, numTeams });
}
```

- [ ] **Step 3: Create start route**

Write `src/app/api/admin/start/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = createServerClient();

  await supabase
    .from("game_state")
    .update({ status: "playing" })
    .eq("id", 1);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Create end route**

Write `src/app/api/admin/end/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = createServerClient();

  await supabase
    .from("game_state")
    .update({ status: "finished" })
    .eq("id", 1);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Create reset route**

Write `src/app/api/admin/reset/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = createServerClient();

  // Delete all negotiations
  await supabase.from("negotiations").delete().not("id", "is", null);
  // Reset all players
  await supabase.from("players").delete().not("id", "is", null);
  // Reset game state
  await supabase
    .from("game_state")
    .update({ status: "lobby", num_teams: null })
    .eq("id", 1);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/
git commit -m "feat: add join + admin API routes"
```

---

### Task 4: VC Prompts + Chat API Route

**Files:**
- Create: `src/lib/vc-prompts.ts`
- Create: `src/app/api/chat/route.ts`

- [ ] **Step 1: Create VC prompts**

Write `src/lib/vc-prompts.ts`:

```typescript
import { VcType } from "./types";

const DECK_PLACEHOLDER = `
STARTUP DECK - PawSpeak
========================
Company: PawSpeak — AI-powered pet-to-human communication device
Stage: Pre-seed
Founded: 6 months ago

Founder: Jamie Chen
- 3 years as ML engineer at Meta (Reality Labs, worked on audio models)
- MS Computer Science, Stanford
- First-time founder
- Has a golden retriever named Biscuit (inspiration for the product)

Product: A collar-mounted device + mobile app that interprets pet vocalizations,
body language, and biometric signals to generate human-readable "translations"
of what your pet is feeling/wanting.

Traction:
- Working prototype tested on 50 dogs (78% interpretation accuracy per owner surveys)
- 3,200 waitlist signups from a viral TikTok (840K views)
- No revenue yet
- App in TestFlight beta with 120 users

Market:
- Global pet tech market: $8B (2025), projected $15B by 2030
- 67% of US households own a pet
- Adjacent markets: pet health monitoring, pet insurance, veterinary diagnostics

Competition:
- No direct competitor doing real-time pet translation
- Whistle/Fi: GPS + activity tracking (different category)
- Academic research exists but no consumer product

Tech:
- Proprietary audio classification model (fine-tuned on 10K labeled pet vocalizations)
- Edge inference on device (custom chip, 2s latency)
- Patent pending on multimodal pet sentiment analysis

Ask: $500K pre-seed round
Use of funds: hire 2 engineers, expand training dataset to cats, begin FDA-adjacent certification for health monitoring features

Team: Solo founder + 2 part-time contractors (hardware, mobile)
`;

function makeSystemPrompt(personality: string, deckContent: string): string {
  return `You are an AI venture capitalist in a negotiation game. You are having a term sheet negotiation with a startup founder.

IMPORTANT RULES:
1. You must stay in character at all times.
2. The founder has a pitch deck with specific facts about their startup. The deck contents are provided below. If the founder claims something NOT in the deck, push back: "I don't see that in your materials..." and become more skeptical.
3. You negotiate pre-money valuation. Start with your anchor and only move up when the founder makes genuinely compelling arguments that match YOUR personality.
4. Never reveal your maximum valuation ceiling. Never say you're an AI or mention this is a game.
5. Keep responses concise (2-4 sentences). This is a fast-paced negotiation.
6. When you state or adjust your offer, always say the specific number clearly, e.g. "I'm at $X million pre-money."
7. If the founder is abusive, rude, or completely unreasonable, you can walk away. Say: "I don't think we're a fit. I'm passing on this deal." and refuse to continue.
8. You can close a deal by saying something like "You've got a deal at $X million pre-money." when you're satisfied.

${personality}

STARTUP DECK:
${deckContent}`;
}

const VISIONARY_PERSONALITY = `YOUR PERSONALITY: THE VISIONARY
You just finished re-reading "Zero to One." You invest in founders who think in decades, not quarters.

What excites you:
- Massive TAM and market creation potential
- Bold, contrarian thinking
- "This could be a $10B company" narratives
- Platform potential, not just a product
- Founders who see what others don't

What bores you:
- Incremental improvements ("we're 10% better than X")
- Small thinking or overly cautious plans
- "We'll figure it out later" on the big vision
- Founders who can't articulate WHY this is massive

Negotiation style:
- You're friendly and enthusiastic — you WANT to invest
- But you're financially disciplined
- You start at $3M pre-money valuation
- A truly exceptional big-vision pitch can move you up to $8M max
- You move in $500K-$1M increments when genuinely impressed
- You ask "what does this look like at scale?" and "what's the 10-year vision?"`;

const EMPATH_PERSONALITY = `YOUR PERSONALITY: THE EMPATH
You cried during the founder's YC application video. You believe the best companies are built by founders who are personally obsessed with the problem.

What moves you:
- Founder-market fit — WHY does this person care?
- Personal stories connecting the founder to the problem
- Authentic passion (not rehearsed pitch-speak)
- Evidence the founder deeply understands their users
- Vulnerability and honesty

What turns you off:
- Generic, rehearsed pitches
- Pure numbers talk without the human element
- "I saw a market opportunity" without personal connection
- Founders who seem detached from their users
- Anything that feels fake or performative

Negotiation style:
- You're warm and genuinely curious about the founder as a person
- You ask personal questions: "What made you start this?"
- But you're shrewd on numbers — warmth doesn't mean pushover
- You start at $2M pre-money valuation
- An authentic, moving founder story can push you to $6M max
- You move in $250K-$500K increments when emotionally convinced
- If someone tries pure business talk, you steer back: "That's great, but tell me about YOU"`;

const SHARK_PERSONALITY = `YOUR PERSONALITY: THE SHARK
You have a spreadsheet open before the founder sits down. You've seen 10,000 pitches and you're not impressed by stories.

What moves you:
- Hard data and unit economics
- Defensible competitive moats
- Capital efficiency
- Clear path to profitability
- Founders who push back with facts, not feelings

What doesn't work:
- Vision talk ("we're changing the world")
- Emotional appeals
- Hand-waving on numbers
- Founders who fold under pressure
- Anything without data to back it up

Negotiation style:
- You're actively hostile. You poke holes. You neg the startup.
- "I see 5 competitors doing this already." (even if not true — test the founder)
- "Your unit economics don't work at scale."
- "Why wouldn't Google just build this?"
- You create urgency: "We're looking at two other companies in this space."
- You RESPECT founders who push back firmly with facts. Doormats get worse deals.
- You start at $1.5M pre-money valuation
- Only ironclad data arguments AND firm negotiation tactics push you to $4M max
- You move in $250K increments, grudgingly
- You occasionally threaten to walk away to test resolve`;

const prompts: Record<VcType, string> = {
  visionary: VISIONARY_PERSONALITY,
  empath: EMPATH_PERSONALITY,
  shark: SHARK_PERSONALITY,
};

export function getVcSystemPrompt(vcType: VcType, deckContent?: string): string {
  return makeSystemPrompt(prompts[vcType], deckContent || DECK_PLACEHOLDER);
}

export const VC_INFO: Record<VcType, { name: string; tagline: string; color: string }> = {
  visionary: {
    name: "The Visionary",
    tagline: "Just finished re-reading Zero to One",
    color: "#6fdb6f",
  },
  empath: {
    name: "The Empath",
    tagline: "Cried during your YC application video",
    color: "#db6fdb",
  },
  shark: {
    name: "The Shark",
    tagline: "Has a spreadsheet open before you sit down",
    color: "#db6f6f",
  },
};
```

- [ ] **Step 2: Create chat API route**

Write `src/app/api/chat/route.ts`:

```typescript
import { streamText } from "ai";
import { getVcSystemPrompt } from "@/lib/vc-prompts";
import { VcType } from "@/lib/types";

export async function POST(req: Request) {
  const { messages, vcType } = await req.json();

  if (!vcType || !["visionary", "empath", "shark"].includes(vcType)) {
    return new Response("Invalid VC type", { status: 400 });
  }

  const systemPrompt = getVcSystemPrompt(vcType as VcType);

  const result = streamText({
    model: "anthropic/claude-sonnet-4.6",
    system: systemPrompt,
    messages,
    maxOutputTokens: 300,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/vc-prompts.ts src/app/api/chat/
git commit -m "feat: add VC personality prompts and chat streaming API"
```

---

### Task 5: Deal API Route

**Files:**
- Create: `src/app/api/deal/route.ts`

- [ ] **Step 1: Create deal route**

Write `src/app/api/deal/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase-server";
import { VcType } from "@/lib/types";

export async function POST(req: Request) {
  const { playerId, vcType, messages } = await req.json();

  if (!playerId || !vcType || !messages || messages.length === 0) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Ask Claude to extract the final valuation from the conversation
  const transcript = messages
    .map((m: { role: string; content: string }) =>
      `${m.role === "user" ? "Founder" : "VC"}: ${m.content}`
    )
    .join("\n");

  const result = await generateText({
    model: "anthropic/claude-sonnet-4.6",
    output: Output.object({
      schema: z.object({
        valuation: z.number().describe("The last pre-money valuation in millions the VC offered or agreed to. 0 if none discussed."),
      }),
    }),
    system: "You extract deal terms from VC negotiation transcripts. Read the conversation and determine the last pre-money valuation number the VC offered or agreed to.",
    prompt: transcript,
    maxOutputTokens: 50,
  });

  const valuation = result.output?.valuation ?? 0;

  if (valuation <= 0) {
    return NextResponse.json(
      { error: "Could not determine valuation from conversation" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("negotiations")
    .insert({
      player_id: playerId,
      vc_type: vcType as VcType,
      final_valuation: valuation,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ valuation, negotiation: data });
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/deal/
git commit -m "feat: add deal closing API with valuation extraction"
```

---

### Task 6: Layout + Global Styles

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update root layout**

Replace `src/app/layout.tsx` with:

```typescript
import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Boss Fight",
  description: "VC Term Sheet Negotiation Game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-black text-white font-[family-name:var(--font-mono)]">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Update global styles**

Replace `src/app/globals.css` with:

```css
@import "tailwindcss";

:root {
  --vc-visionary: #6fdb6f;
  --vc-empath: #db6fdb;
  --vc-shark: #db6f6f;
  --gold: #ffd700;
  --silver: #c0c0c0;
  --bronze: #cd7f32;
}

body {
  background: #000;
  color: #fff;
}

/* Scrollbar styling for chat */
.chat-scroll::-webkit-scrollbar {
  width: 4px;
}
.chat-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.chat-scroll::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 2px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat: update layout and styles for dark game theme"
```

---

### Task 7: Lobby Component + Main Page Shell

**Files:**
- Create: `src/components/lobby.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create Lobby component**

Write `src/components/lobby.tsx`:

```typescript
"use client";

import { useState } from "react";

export function Lobby({
  onJoin,
}: {
  onJoin: (playerId: string, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin() {
    if (!name.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to join");
        return;
      }

      const data = await res.json();
      onJoin(data.id, data.name);
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <div className="text-5xl mb-2">⚔️</div>
      <h1 className="text-4xl font-bold mb-2">Boss Fight</h1>
      <p className="text-zinc-500 mb-8">VC Term Sheet Negotiation Game</p>

      <div className="w-full max-w-xs space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="Your name"
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          disabled={loading}
          autoFocus
        />

        <button
          onClick={handleJoin}
          disabled={loading || !name.trim()}
          className="w-full py-3 bg-white text-black rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-200 transition-colors"
        >
          {loading ? "Joining..." : "Join Game"}
        </button>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <a
          href="/deck.pdf"
          target="_blank"
          className="block text-center text-zinc-500 hover:text-white transition-colors text-sm mt-4"
        >
          📄 View Startup Deck
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create main page shell**

Replace `src/app/page.tsx` with:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { GameState, Player } from "@/lib/types";
import { Lobby } from "@/components/lobby";

export default function Home() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);

  // Restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("boss-fight-player");
    if (stored) {
      const parsed = JSON.parse(stored);
      setPlayerId(parsed.id);
      setPlayerName(parsed.name);
    }
  }, []);

  // Fetch game state + subscribe to changes
  useEffect(() => {
    const supabase = getBrowserClient();

    // Initial fetch
    supabase
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data) setGameState(data as GameState);
      });

    // Subscribe to changes
    const channel = supabase
      .channel("game-state")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state" },
        (payload) => {
          setGameState(payload.new as GameState);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch player data when we have an ID
  const fetchPlayer = useCallback(async () => {
    if (!playerId) return;
    const supabase = getBrowserClient();
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .single();
    if (data) setPlayer(data as Player);
  }, [playerId]);

  useEffect(() => {
    fetchPlayer();
  }, [fetchPlayer]);

  // Subscribe to player updates (team assignment)
  useEffect(() => {
    if (!playerId) return;
    const supabase = getBrowserClient();

    const channel = supabase
      .channel("player-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "players",
          filter: `id=eq.${playerId}`,
        },
        (payload) => {
          setPlayer(payload.new as Player);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId]);

  function handleJoin(id: string, name: string) {
    setPlayerId(id);
    setPlayerName(name);
    localStorage.setItem("boss-fight-player", JSON.stringify({ id, name }));
  }

  // Not joined yet — show lobby
  if (!playerId) {
    return <Lobby onJoin={handleJoin} />;
  }

  // Joined but waiting for game state
  if (!gameState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  // Route based on game state
  if (gameState.status === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="text-5xl mb-4">⚔️</div>
        <h1 className="text-2xl font-bold mb-2">You're in, {playerName}!</h1>
        <p className="text-zinc-500">Waiting for host to assign teams...</p>
        <a
          href="/deck.pdf"
          target="_blank"
          className="mt-6 text-zinc-500 hover:text-white transition-colors text-sm"
        >
          📄 Study the Startup Deck
        </a>
      </div>
    );
  }

  if (gameState.status === "teams") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <p className="text-zinc-500 text-sm mb-2">You are</p>
        <div className="text-7xl font-bold text-green-400 mb-4">
          Team {player?.team_number ?? "..."}
        </div>
        <p className="text-zinc-500">Find your teammates!</p>
        <p className="text-zinc-600 text-sm mt-4">
          Waiting for host to start the game...
        </p>
      </div>
    );
  }

  if (gameState.status === "playing") {
    // Will be replaced with VC Select / Negotiation in Task 8-9
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <h1 className="text-2xl font-bold mb-4">Game On!</h1>
        <p className="text-zinc-500">
          Team {player?.team_number} — {playerName}
        </p>
        <p className="text-zinc-600 text-sm mt-2">VC Select coming next...</p>
      </div>
    );
  }

  if (gameState.status === "finished") {
    // Will be replaced with Leaderboard in Task 10
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <h1 className="text-2xl font-bold mb-4">🏆 Game Over!</h1>
        <p className="text-zinc-500">Leaderboard coming next...</p>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/lobby.tsx src/app/page.tsx
git commit -m "feat: add lobby component and main page with game state routing"
```

---

### Task 8: VC Select Component

**Files:**
- Create: `src/components/vc-select.tsx`

- [ ] **Step 1: Create VC Select component**

Write `src/components/vc-select.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { VcType } from "@/lib/types";
import { VC_INFO } from "@/lib/vc-prompts";

// Need to duplicate VC_INFO here since vc-prompts has server-only imports
const VC_DISPLAY: Record<
  VcType,
  { name: string; tagline: string; color: string }
> = {
  visionary: {
    name: "The Visionary",
    tagline: "Just finished re-reading Zero to One",
    color: "#6fdb6f",
  },
  empath: {
    name: "The Empath",
    tagline: "Cried during your YC application video",
    color: "#db6fdb",
  },
  shark: {
    name: "The Shark",
    tagline: "Has a spreadsheet open before you sit down",
    color: "#db6f6f",
  },
};

interface TeamScores {
  visionary: number | null;
  empath: number | null;
  shark: number | null;
}

export function VcSelect({
  teamNumber,
  onSelect,
  onLeaderboard,
}: {
  teamNumber: number;
  onSelect: (vc: VcType) => void;
  onLeaderboard: () => void;
}) {
  const [scores, setScores] = useState<TeamScores>({
    visionary: null,
    empath: null,
    shark: null,
  });

  async function fetchScores() {
    const supabase = getBrowserClient();

    // Get all players on this team
    const { data: teammates } = await supabase
      .from("players")
      .select("id")
      .eq("team_number", teamNumber);

    if (!teammates || teammates.length === 0) return;

    const teamIds = teammates.map((t) => t.id);

    // Get best score per VC for the team
    const { data: deals } = await supabase
      .from("negotiations")
      .select("vc_type, final_valuation")
      .in("player_id", teamIds);

    if (!deals) return;

    const best: TeamScores = { visionary: null, empath: null, shark: null };
    for (const deal of deals) {
      const vc = deal.vc_type as VcType;
      const val = Number(deal.final_valuation);
      if (best[vc] === null || val > best[vc]!) {
        best[vc] = val;
      }
    }
    setScores(best);
  }

  useEffect(() => {
    fetchScores();

    // Subscribe to new negotiations to refresh scores
    const supabase = getBrowserClient();
    const channel = supabase
      .channel("team-scores")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "negotiations" },
        () => {
          fetchScores();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamNumber]);

  const vcTypes: VcType[] = ["visionary", "empath", "shark"];

  return (
    <div className="flex flex-col min-h-screen p-4">
      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-zinc-500">Team {teamNumber}</div>
        <button
          onClick={onLeaderboard}
          className="text-sm text-zinc-500 hover:text-white transition-colors"
        >
          🏆 Leaderboard
        </button>
      </div>

      <h2 className="text-xl font-bold mb-1 text-center">Pick a VC</h2>
      <p className="text-zinc-500 text-sm mb-6 text-center">
        Negotiate for the best valuation
      </p>

      <div className="space-y-3 max-w-md mx-auto w-full">
        {vcTypes.map((vc) => {
          const info = VC_DISPLAY[vc];
          const score = scores[vc];

          return (
            <button
              key={vc}
              onClick={() => onSelect(vc)}
              className="w-full p-4 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                borderColor: info.color + "40",
                background: info.color + "10",
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold" style={{ color: info.color }}>
                    {info.name}
                  </div>
                  <div className="text-zinc-500 text-sm italic mt-1">
                    "{info.tagline}"
                  </div>
                </div>
                <div className="text-right text-sm">
                  {score !== null ? (
                    <div style={{ color: "#ffd700" }}>
                      Best: ${score.toFixed(1)}M
                    </div>
                  ) : (
                    <div className="text-zinc-600">No attempt yet</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <a
        href="/deck.pdf"
        target="_blank"
        className="block text-center text-zinc-600 hover:text-white transition-colors text-sm mt-6"
      >
        📄 View Deck
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/vc-select.tsx
git commit -m "feat: add VC select component with team best scores"
```

---

### Task 9: Negotiation Chat Component

**Files:**
- Create: `src/components/negotiation.tsx`

- [ ] **Step 1: Create Negotiation component**

Write `src/components/negotiation.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { VcType } from "@/lib/types";

const VC_DISPLAY: Record<VcType, { name: string; color: string }> = {
  visionary: { name: "The Visionary", color: "#6fdb6f" },
  empath: { name: "The Empath", color: "#db6fdb" },
  shark: { name: "The Shark", color: "#db6f6f" },
};

export function Negotiation({
  playerId,
  vcType,
  teamNumber,
  onBack,
  onDealClosed,
}: {
  playerId: string;
  vcType: VcType;
  teamNumber: number;
  onBack: () => void;
  onDealClosed: (valuation: number) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [dealResult, setDealResult] = useState<number | null>(null);

  const vc = VC_DISPLAY[vcType];

  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { vcType },
    }),
  });

  async function handleAcceptDeal() {
    if (messages.length < 2) return;
    setClosing(true);

    try {
      const res = await fetch("/api/deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          vcType,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to close deal");
        setClosing(false);
        return;
      }

      const data = await res.json();
      setDealResult(data.valuation);
      onDealClosed(data.valuation);
    } catch {
      alert("Connection failed");
      setClosing(false);
    }
  }

  // Deal closed — show result
  if (dealResult !== null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="text-5xl mb-4">🤝</div>
        <h2 className="text-2xl font-bold mb-2">Deal Closed!</h2>
        <div className="text-4xl font-bold mt-2" style={{ color: "#ffd700" }}>
          ${dealResult.toFixed(1)}M
        </div>
        <p className="text-zinc-500 mt-1">pre-money valuation</p>
        <button
          onClick={onBack}
          className="mt-8 px-6 py-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          Back to VCs
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div
        className="flex justify-between items-center px-4 py-3 border-b"
        style={{ borderColor: vc.color + "30" }}
      >
        <div className="font-bold" style={{ color: vc.color }}>
          {vc.name}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">Team {teamNumber}</span>
          <a
            href="/deck.pdf"
            target="_blank"
            className="text-zinc-500 hover:text-white transition-colors"
          >
            📄 Deck
          </a>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 chat-scroll">
        {messages.length === 0 && (
          <p className="text-zinc-600 text-sm text-center mt-8">
            Start the negotiation. The VC is waiting...
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] px-4 py-3 rounded-xl text-sm ${
              m.role === "user"
                ? "ml-auto bg-zinc-800 text-white"
                : "bg-zinc-900 border border-zinc-800"
            }`}
          >
            {m.role === "assistant" && (
              <div
                className="text-xs mb-1 font-semibold"
                style={{ color: vc.color }}
              >
                {vc.name}
              </div>
            )}
            {m.content}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-3">
        <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) { sendMessage({ text: input }); setInput(""); } }} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            disabled={isLoading || closing}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || closing}
            className="px-4 py-2.5 bg-white text-black rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            Send
          </button>
        </form>

        <div className="flex justify-between mt-2 px-1">
          <button
            onClick={onBack}
            className="text-sm transition-colors"
            style={{ color: "#db6f6f" }}
          >
            ✕ Walk away
          </button>
          <button
            onClick={handleAcceptDeal}
            disabled={messages.length < 2 || isLoading || closing}
            className="text-sm disabled:opacity-30 transition-colors"
            style={{ color: "#6fdb6f" }}
          >
            {closing ? "Closing..." : "✓ Accept deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/negotiation.tsx
git commit -m "feat: add negotiation chat component with streaming and deal closing"
```

---

### Task 10: Leaderboard Component

**Files:**
- Create: `src/components/leaderboard.tsx`

- [ ] **Step 1: Create Leaderboard component**

Write `src/components/leaderboard.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { LeaderboardEntry } from "@/lib/types";

export function Leaderboard({
  teamNumber,
  onBack,
}: {
  teamNumber: number | null;
  onBack?: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  async function fetchLeaderboard() {
    const supabase = getBrowserClient();
    const { data } = await supabase
      .from("leaderboard")
      .select("*")
      .order("total", { ascending: false });

    if (data) setEntries(data as LeaderboardEntry[]);
  }

  useEffect(() => {
    fetchLeaderboard();

    const supabase = getBrowserClient();
    const channel = supabase
      .channel("leaderboard-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "negotiations" },
        () => {
          fetchLeaderboard();
        }
      )
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

  return (
    <div className="flex flex-col min-h-screen p-4">
      {onBack && (
        <button
          onClick={onBack}
          className="self-start text-sm text-zinc-500 hover:text-white transition-colors mb-4"
        >
          ← Back
        </button>
      )}

      <h2 className="text-2xl font-bold text-center mb-1">🏆 Leaderboard</h2>
      <p className="text-zinc-500 text-sm text-center mb-6">
        Best score per VC per team
      </p>

      <div className="max-w-lg mx-auto w-full space-y-2">
        {entries.length === 0 && (
          <p className="text-zinc-600 text-center mt-8">No deals yet...</p>
        )}

        {entries.map((entry, i) => {
          const isMyTeam = entry.team_number === teamNumber;

          return (
            <div
              key={entry.team_number}
              className={`flex items-center justify-between p-3 rounded-xl ${
                isMyTeam
                  ? "bg-zinc-800 border border-zinc-700"
                  : "bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-lg font-bold w-8"
                  style={{ color: medalColor(i) }}
                >
                  {i + 1}.
                </span>
                <span className={isMyTeam ? "font-bold" : ""}>
                  Team {entry.team_number}
                  {isMyTeam && (
                    <span className="text-zinc-500 text-xs ml-2">(you)</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span style={{ color: "#6fdb6f" }}>
                  {entry.best_visionary > 0
                    ? `$${Number(entry.best_visionary).toFixed(1)}M`
                    : "—"}
                </span>
                <span style={{ color: "#db6fdb" }}>
                  {entry.best_empath > 0
                    ? `$${Number(entry.best_empath).toFixed(1)}M`
                    : "—"}
                </span>
                <span style={{ color: "#db6f6f" }}>
                  {entry.best_shark > 0
                    ? `$${Number(entry.best_shark).toFixed(1)}M`
                    : "—"}
                </span>
                <span
                  className="font-bold text-sm ml-1"
                  style={{ color: medalColor(i) }}
                >
                  ${Number(entry.total).toFixed(1)}M
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
git commit -m "feat: add real-time leaderboard component"
```

---

### Task 11: Wire Up Main Page (Playing + Finished States)

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update main page to include all game screens**

Replace the `playing` and `finished` cases in `src/app/page.tsx`. The full updated file:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { GameState, Player, VcType } from "@/lib/types";
import { Lobby } from "@/components/lobby";
import { VcSelect } from "@/components/vc-select";
import { Negotiation } from "@/components/negotiation";
import { Leaderboard } from "@/components/leaderboard";

type Screen = "main" | "negotiation" | "leaderboard";

export default function Home() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [screen, setScreen] = useState<Screen>("main");
  const [activeVc, setActiveVc] = useState<VcType | null>(null);

  // Restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("boss-fight-player");
    if (stored) {
      const parsed = JSON.parse(stored);
      setPlayerId(parsed.id);
      setPlayerName(parsed.name);
    }
  }, []);

  // Fetch game state + subscribe to changes
  useEffect(() => {
    const supabase = getBrowserClient();

    supabase
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data) setGameState(data as GameState);
      });

    const channel = supabase
      .channel("game-state")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state" },
        (payload) => {
          setGameState(payload.new as GameState);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch player data when we have an ID
  const fetchPlayer = useCallback(async () => {
    if (!playerId) return;
    const supabase = getBrowserClient();
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .single();
    if (data) setPlayer(data as Player);
  }, [playerId]);

  useEffect(() => {
    fetchPlayer();
  }, [fetchPlayer]);

  // Subscribe to player updates (team assignment)
  useEffect(() => {
    if (!playerId) return;
    const supabase = getBrowserClient();

    const channel = supabase
      .channel("player-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "players",
          filter: `id=eq.${playerId}`,
        },
        (payload) => {
          setPlayer(payload.new as Player);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId]);

  function handleJoin(id: string, name: string) {
    setPlayerId(id);
    setPlayerName(name);
    localStorage.setItem("boss-fight-player", JSON.stringify({ id, name }));
  }

  // Not joined yet — show lobby
  if (!playerId) {
    return <Lobby onJoin={handleJoin} />;
  }

  // Waiting for game state
  if (!gameState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  // LOBBY state — joined, waiting
  if (gameState.status === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="text-5xl mb-4">⚔️</div>
        <h1 className="text-2xl font-bold mb-2">You're in, {playerName}!</h1>
        <p className="text-zinc-500">Waiting for host to assign teams...</p>
        <a
          href="/deck.pdf"
          target="_blank"
          className="mt-6 text-zinc-500 hover:text-white transition-colors text-sm"
        >
          📄 Study the Startup Deck
        </a>
      </div>
    );
  }

  // TEAMS state — show team assignment
  if (gameState.status === "teams") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <p className="text-zinc-500 text-sm mb-2">You are</p>
        <div className="text-7xl font-bold text-green-400 mb-4">
          Team {player?.team_number ?? "..."}
        </div>
        <p className="text-zinc-500">Find your teammates!</p>
        <p className="text-zinc-600 text-sm mt-4">
          Waiting for host to start the game...
        </p>
      </div>
    );
  }

  // PLAYING state
  if (gameState.status === "playing") {
    if (screen === "leaderboard") {
      return (
        <Leaderboard
          teamNumber={player?.team_number ?? null}
          onBack={() => setScreen("main")}
        />
      );
    }

    if (screen === "negotiation" && activeVc) {
      return (
        <Negotiation
          playerId={playerId}
          vcType={activeVc}
          teamNumber={player?.team_number ?? 0}
          onBack={() => {
            setScreen("main");
            setActiveVc(null);
          }}
          onDealClosed={() => {
            // Stay on deal result screen (handled inside Negotiation)
          }}
        />
      );
    }

    return (
      <VcSelect
        teamNumber={player?.team_number ?? 0}
        onSelect={(vc) => {
          setActiveVc(vc);
          setScreen("negotiation");
        }}
        onLeaderboard={() => setScreen("leaderboard")}
      />
    );
  }

  // FINISHED state — leaderboard only
  if (gameState.status === "finished") {
    return <Leaderboard teamNumber={player?.team_number ?? null} />;
  }

  return null;
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire up all game screens in main page"
```

---

### Task 12: Admin Page

**Files:**
- Create: `src/app/admin/page.tsx`

- [ ] **Step 1: Create admin page**

Write `src/app/admin/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { GameState } from "@/lib/types";
import { Leaderboard } from "@/components/leaderboard";

export default function AdminPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [numTeams, setNumTeams] = useState(8);
  const [loading, setLoading] = useState("");

  useEffect(() => {
    const supabase = getBrowserClient();

    // Fetch initial state
    supabase
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data) setGameState(data as GameState);
      });

    // Fetch player count
    supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        setPlayerCount(count ?? 0);
      });

    // Subscribe to game state
    const gsChannel = supabase
      .channel("admin-game-state")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state" },
        (payload) => setGameState(payload.new as GameState)
      )
      .subscribe();

    // Subscribe to new players
    const pChannel = supabase
      .channel("admin-players")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "players" },
        () => setPlayerCount((c) => c + 1)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gsChannel);
      supabase.removeChannel(pChannel);
    };
  }, []);

  async function adminAction(url: string, body?: object) {
    setLoading(url);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Action failed");
      }
    } catch {
      alert("Connection failed");
    } finally {
      setLoading("");
    }
  }

  if (!gameState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">⚔️ Boss Fight Admin</h1>

      {/* Status */}
      <div className="bg-zinc-900 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-zinc-500">Game Status</div>
            <div className="text-xl font-bold text-green-400 uppercase">
              {gameState.status}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-zinc-500">Players</div>
            <div className="text-xl font-bold">{playerCount}</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-3 mb-8">
        {gameState.status === "lobby" && (
          <div className="flex gap-3 items-end">
            <div>
              <label className="text-sm text-zinc-500 block mb-1">
                Number of teams
              </label>
              <input
                type="number"
                min={2}
                max={20}
                value={numTeams}
                onChange={(e) => setNumTeams(parseInt(e.target.value) || 2)}
                className="w-24 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white"
              />
            </div>
            <button
              onClick={() =>
                adminAction("/api/admin/teams", { numTeams })
              }
              disabled={!!loading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-500 disabled:opacity-50"
            >
              {loading === "/api/admin/teams"
                ? "Assigning..."
                : "Assign Teams"}
            </button>
          </div>
        )}

        {gameState.status === "teams" && (
          <button
            onClick={() => adminAction("/api/admin/start")}
            disabled={!!loading}
            className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-500 disabled:opacity-50 text-lg"
          >
            {loading === "/api/admin/start" ? "Starting..." : "🚀 Start Game"}
          </button>
        )}

        {gameState.status === "playing" && (
          <button
            onClick={() => {
              if (confirm("End the game? This will freeze the leaderboard.")) {
                adminAction("/api/admin/end");
              }
            }}
            disabled={!!loading}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-500 disabled:opacity-50"
          >
            {loading === "/api/admin/end" ? "Ending..." : "🛑 End Game"}
          </button>
        )}

        {gameState.status === "finished" && (
          <button
            onClick={() => {
              if (
                confirm(
                  "Reset everything? This deletes all players, teams, and scores."
                )
              ) {
                adminAction("/api/admin/reset");
              }
            }}
            disabled={!!loading}
            className="px-6 py-3 bg-zinc-800 text-white rounded-lg font-semibold hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading === "/api/admin/reset" ? "Resetting..." : "🔄 Reset Game"}
          </button>
        )}
      </div>

      {/* Leaderboard */}
      {(gameState.status === "playing" || gameState.status === "finished") && (
        <div className="border-t border-zinc-800 pt-6">
          <Leaderboard teamNumber={null} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/
git commit -m "feat: add admin control panel"
```

---

### Task 13: Deploy + Smoke Test

**Files:**
- Modify: `.gitignore` (add .superpowers/)
- Create: `public/deck.pdf` (placeholder)

- [ ] **Step 1: Add .superpowers to gitignore**

Append to `.gitignore`:

```
.superpowers/
```

- [ ] **Step 2: Create placeholder deck**

Create a minimal placeholder PDF at `public/deck.pdf`. Can be any valid PDF — it will be replaced with the real deck before the event.

```bash
echo "Placeholder - replace with real deck" > public/deck.txt
```

(A real PDF will be placed here before the event.)

- [ ] **Step 3: Set Vercel environment variables**

The following env vars must be set on Vercel for the production deployment:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
# Value: https://qkhfzxzhqeysvexbfuus.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
# Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFraGZ6eHpocWV5c3ZleGJmdXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjcxMjksImV4cCI6MjA5MTE0MzEyOX0.taD-98C5gZ8xPvtKP9XOIFZ_M0DbuCV_xGDdiutpO8A

vercel env add SUPABASE_SERVICE_ROLE_KEY
# Value: <from Supabase dashboard>
```

AI Gateway auth is handled automatically via OIDC — no provider keys needed on Vercel.

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "feat: complete Boss Fight game — ready for deploy"
git push origin main
```

Vercel auto-deploys on push. Check the deployment at https://boss-fight-coral.vercel.app

- [ ] **Step 5: Smoke test**

1. Open the production URL on your phone
2. Enter a name, join the game
3. Open /admin in a separate browser
4. Verify player count updates
5. Assign teams (set to 2)
6. Verify player sees team number
7. Start game
8. Pick a VC, send a message, verify AI responds
9. Accept a deal, verify valuation appears
10. Check leaderboard shows the score
11. End game, verify leaderboard freezes
12. Reset, verify everything clears
