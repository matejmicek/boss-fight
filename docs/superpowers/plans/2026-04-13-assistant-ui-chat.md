# assistant-ui Chat Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-built chat UI with assistant-ui and add a retro pixel aesthetic across the app.

**Architecture:** Install `@assistant-ui/react` + `@assistant-ui/react-ai-sdk`, scaffold the chat components, wire them into the existing Negotiation component with per-VC system prompts, add server-side retry for 429s, and apply retro pixel styling. Game mechanics (VC select, deal closing, leaderboard, Supabase) stay untouched.

**Tech Stack:** assistant-ui, AI SDK v6, @ai-sdk/anthropic, Next.js 16, Tailwind CSS v4, Press Start 2P font

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Modify | Add assistant-ui deps |
| `src/app/layout.tsx` | Modify | Add Press Start 2P font |
| `src/app/globals.css` | Modify | Add retro pixel styles |
| `src/app/api/chat/route.ts` | Modify | Accept system prompt, add maxRetries |
| `src/components/negotiation.tsx` | Rewrite | Use assistant-ui Thread instead of hand-built chat |
| `src/components/lobby.tsx` | Modify | Apply retro pixel styling |
| `src/components/vc-select.tsx` | Modify | Apply retro pixel styling |
| `src/components/leaderboard.tsx` | Modify | Apply retro pixel styling |
| `src/components/assistant-ui/*` | New | Scaffolded by assistant-ui init CLI |

---

### Task 1: Install assistant-ui and scaffold components

**Files:**
- Modify: `package.json`
- Create: `src/components/assistant-ui/*` (scaffolded by CLI)
- Create: `components.json` (shadcn config, created by CLI)

- [ ] **Step 1: Install assistant-ui packages**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm add @assistant-ui/react @assistant-ui/react-ai-sdk
```

- [ ] **Step 2: Run assistant-ui init**

```bash
cd /Users/matejmicek/Developer/boss-fight
npx assistant-ui@latest init
```

This scaffolds Thread, Composer, Message components into the project. It may prompt for shadcn setup if not configured. Accept defaults. If it asks about the `src/` directory or path aliases, confirm `@/*` maps to `./src/*`.

- [ ] **Step 3: Verify scaffolded files exist**

```bash
ls src/components/assistant-ui/ 2>/dev/null || ls components/assistant-ui/
```

Expected: Files like `thread.tsx`, possibly `composer.tsx`, `message.tsx` etc. Note the actual path for subsequent tasks.

- [ ] **Step 4: Verify the app still builds**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm build
```

Expected: Build succeeds. The new components are not imported yet so nothing should break.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: install assistant-ui and scaffold chat components"
```

---

### Task 2: Update API route for assistant-ui

**Files:**
- Modify: `src/app/api/chat/route.ts`

The current route receives `{ messages, vcType }` and looks up the system prompt server-side. assistant-ui sends `{ messages, system }` from the frontend, so we switch to accepting `system` directly and add `maxRetries: 3` for 429 backoff.

- [ ] **Step 1: Rewrite the API route**

Replace the contents of `src/app/api/chat/route.ts` with:

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText } from "ai";

export async function POST(req: Request) {
  const { messages, system } = await req.json();

  if (!system) {
    return new Response("Missing system prompt", { status: 400 });
  }

  const result = streamText({
    model: anthropic("claude-sonnet-4-6-20250514"),
    system,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 300,
    maxRetries: 3,
  });

  return result.toUIMessageStreamResponse();
}
```

Key changes:
- Accepts `system` from request body instead of looking up `vcType`
- Uses `convertToModelMessages` (async in AI SDK v6) for assistant-ui message format
- `maxRetries: 3` handles 429 and 5xx with exponential backoff (built into AI SDK)

- [ ] **Step 2: Verify the app still builds**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm build
```

Expected: Build succeeds. The negotiation component still uses the old `useChat` but that's OK - we rewrite it next.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: update chat API route for assistant-ui with retry backoff"
```

---

### Task 3: Rewrite Negotiation component with assistant-ui

**Files:**
- Rewrite: `src/components/negotiation.tsx`

This is the core change. Replace the hand-built chat (message list, input form, manual `useChat`) with assistant-ui's `Thread` component wrapped in `AssistantRuntimeProvider`.

The deal closing flow needs access to messages from the runtime to send to `/api/deal`. We use `useThreadRuntime()` from assistant-ui to access the current thread's messages.

- [ ] **Step 1: Rewrite negotiation.tsx**

Replace the contents of `src/components/negotiation.tsx` with:

```tsx
"use client";

import { useState } from "react";
import {
  AssistantRuntimeProvider,
  useAssistantRuntime,
} from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { VcType } from "@/lib/types";
import { getVcSystemPrompt, VC_INFO } from "@/lib/vc-prompts";

export function Negotiation({
  playerId,
  vcType,
  onBack,
  onDealClosed,
}: {
  playerId: string;
  vcType: VcType;
  onBack: () => void;
  onDealClosed: (valuation: number) => void;
}) {
  const vc = VC_INFO[vcType];
  const systemPrompt = getVcSystemPrompt(vcType);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      system: systemPrompt,
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-screen">
        <div
          className="flex justify-between items-center px-4 py-3 border-b-2"
          style={{ borderColor: vc.color + "60" }}
        >
          <div className="font-bold text-sm" style={{ color: vc.color }}>
            {vc.name}
          </div>
          <a
            href="/deck.pdf"
            target="_blank"
            className="text-zinc-500 hover:text-white transition-colors text-sm"
          >
            View Deck
          </a>
        </div>

        <div className="flex-1 overflow-hidden">
          <Thread />
        </div>

        <NegotiationFooter
          playerId={playerId}
          vcType={vcType}
          onBack={onBack}
          onDealClosed={onDealClosed}
          vcColor={vc.color}
        />
      </div>
    </AssistantRuntimeProvider>
  );
}

function NegotiationFooter({
  playerId,
  vcType,
  onBack,
  onDealClosed,
  vcColor,
}: {
  playerId: string;
  vcType: VcType;
  onBack: () => void;
  onDealClosed: (valuation: number) => void;
  vcColor: string;
}) {
  const runtime = useAssistantRuntime();
  const [closing, setClosing] = useState(false);
  const [dealResult, setDealResult] = useState<number | null>(null);

  async function handleAcceptDeal() {
    const threadState = runtime.thread.getState();
    const msgs = threadState.messages;

    if (msgs.length < 2) return;
    setClosing(true);

    const formatted = msgs.map((m) => ({
      role: m.role,
      content: m.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(""),
    }));

    try {
      const res = await fetch("/api/deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, vcType, messages: formatted }),
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

  if (dealResult !== null) {
    return (
      <div className="flex flex-col items-center justify-center p-6">
        <div className="text-5xl mb-4">DEAL!</div>
        <div className="text-4xl font-bold" style={{ color: "#ffd700" }}>
          ${dealResult.toFixed(1)}M
        </div>
        <p className="text-zinc-500 mt-1 text-sm">pre-money valuation</p>
        <button
          onClick={onBack}
          className="mt-6 px-6 py-3 border-2 border-zinc-700 hover:border-zinc-500 transition-colors text-sm"
        >
          Back to VCs
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-between px-4 py-2 border-t border-zinc-800">
      <button
        onClick={onBack}
        className="text-sm transition-colors"
        style={{ color: "#db6f6f" }}
      >
        Walk away
      </button>
      <button
        onClick={handleAcceptDeal}
        disabled={closing}
        className="text-sm disabled:opacity-30 transition-colors"
        style={{ color: vcColor }}
      >
        {closing ? "Closing..." : "Accept deal"}
      </button>
    </div>
  );
}
```

Key decisions:
- `useChatRuntime` + `AssistantChatTransport` sends the VC system prompt to the API route
- `useAssistantRuntime()` in the footer gives access to thread messages for deal closing
- Message extraction maps assistant-ui's content parts to `{role, content}` for the deal API
- `NegotiationFooter` is a separate component inside the provider so it can use `useAssistantRuntime`
- The `<Thread />` component handles the entire chat UI (messages, input, streaming, errors, retry)

- [ ] **Step 2: Verify the app builds**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Test manually**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm dev
```

Open http://localhost:3000. Join the game, pick a VC, verify:
1. Chat loads with assistant-ui Thread
2. You can type a message and get a streaming response from Claude
3. The VC personality comes through in responses
4. "Accept deal" extracts valuation and saves to Supabase
5. "Walk away" returns to VC select
6. If you send many messages rapidly, 429s are retried silently

- [ ] **Step 4: Commit**

```bash
git add src/components/negotiation.tsx
git commit -m "feat: replace hand-built chat with assistant-ui Thread"
```

---

### Task 4: Retro pixel styling - fonts and global CSS

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

Add Press Start 2P (pixel font) for headings and game chrome. Keep Geist Mono for chat messages and body text (readability). Add retro pixel utility styles.

- [ ] **Step 1: Update layout.tsx to add Press Start 2P font**

Replace the contents of `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const pixel = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
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
    <html lang="en" className={`${mono.variable} ${pixel.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-black text-white font-[family-name:var(--font-mono)]">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Add retro pixel utility styles to globals.css**

Replace the contents of `src/app/globals.css` with:

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
  background: #0a0a0a;
  color: #fff;
}

/* Pixel font utility */
.font-pixel {
  font-family: var(--font-pixel), monospace;
}

/* Retro pixelated border style */
.pixel-border {
  border: 2px solid #333;
  box-shadow:
    2px 2px 0 #333,
    -2px -2px 0 #333,
    2px -2px 0 #333,
    -2px 2px 0 #333;
}

/* Pixel button style */
.pixel-btn {
  border: 2px solid #555;
  box-shadow: 3px 3px 0 #222;
  transition: transform 0.1s, box-shadow 0.1s;
}
.pixel-btn:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 #222;
}
.pixel-btn:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 #222;
}
.pixel-btn:disabled {
  opacity: 0.4;
  transform: none;
  box-shadow: 3px 3px 0 #222;
}

/* Scrollbar */
.chat-scroll::-webkit-scrollbar {
  width: 4px;
}
.chat-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.chat-scroll::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 0;
}

/* Subtle scanline overlay for retro feel */
.scanlines::after {
  content: "";
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.05) 2px,
    rgba(0, 0, 0, 0.05) 4px
  );
  pointer-events: none;
  z-index: 50;
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat: add retro pixel font and global styles"
```

---

### Task 5: Retro pixel styling - Lobby component

**Files:**
- Modify: `src/components/lobby.tsx`

Apply pixel font to headings, pixel-border to the card, pixel-btn to buttons.

- [ ] **Step 1: Update lobby.tsx**

Replace the contents of `src/components/lobby.tsx` with:

```tsx
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
    <div className="flex flex-col items-center justify-center min-h-screen p-6 scanlines">
      <h1 className="font-pixel text-3xl mb-2 text-white">BOSS FIGHT</h1>
      <p className="font-pixel text-[10px] text-zinc-500 mb-10 tracking-wider">
        VC TERM SHEET NEGOTIATION
      </p>

      <div className="w-full max-w-xs space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="ENTER YOUR NAME"
          className="w-full px-4 py-3 bg-zinc-900 border-2 border-zinc-700 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400"
          disabled={loading}
          autoFocus
        />

        <button
          onClick={handleJoin}
          disabled={loading || !name.trim()}
          className="w-full py-3 bg-white text-black font-pixel text-xs pixel-btn"
        >
          {loading ? "JOINING..." : "START GAME"}
        </button>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}

        <a
          href="/deck.pdf"
          target="_blank"
          className="block text-center text-zinc-500 hover:text-white transition-colors text-xs mt-4"
        >
          [ VIEW STARTUP DECK ]
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify visually**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm dev
```

Open http://localhost:3000. The lobby should show pixel-font title "BOSS FIGHT", blocky input and button with pixel shadow effects, subtle scanlines.

- [ ] **Step 3: Commit**

```bash
git add src/components/lobby.tsx
git commit -m "feat: apply retro pixel styling to lobby"
```

---

### Task 6: Retro pixel styling - VC Select component

**Files:**
- Modify: `src/components/vc-select.tsx`

Apply pixel font to headings, pixel-border to VC cards.

- [ ] **Step 1: Update vc-select.tsx**

Replace the contents of `src/components/vc-select.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { VcType } from "@/lib/types";
import { VC_INFO } from "@/lib/vc-prompts";

interface MyScores {
  visionary: number | null;
  empath: number | null;
  shark: number | null;
}

export function VcSelect({
  playerId,
  onSelect,
  onLeaderboard,
}: {
  playerId: string;
  onSelect: (vc: VcType) => void;
  onLeaderboard: () => void;
}) {
  const [scores, setScores] = useState<MyScores>({
    visionary: null,
    empath: null,
    shark: null,
  });

  async function fetchScores() {
    const supabase = createClient();

    const { data: deals } = await supabase
      .from("negotiations")
      .select("vc_type, final_valuation")
      .eq("player_id", playerId);

    if (!deals) return;

    const best: MyScores = { visionary: null, empath: null, shark: null };
    for (const deal of deals as { vc_type: string; final_valuation: number }[]) {
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

    const supabase = createClient();
    const channel = supabase
      .channel("my-scores")
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
  }, [playerId]);

  const vcTypes: VcType[] = ["visionary", "empath", "shark"];
  const levelLabels = ["LVL 1", "LVL 2", "LVL 3"];

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

      <h2 className="font-pixel text-lg mb-1 text-center">SELECT BOSS</h2>
      <p className="text-zinc-500 text-xs mb-8 text-center">
        Negotiate for the best valuation
      </p>

      <div className="space-y-3 max-w-md mx-auto w-full">
        {vcTypes.map((vc, i) => {
          const info = VC_INFO[vc];
          const score = scores[vc];

          return (
            <button
              key={vc}
              onClick={() => onSelect(vc)}
              className="w-full p-4 border-2 text-left transition-all pixel-btn bg-zinc-950"
              style={{ borderColor: info.color + "60" }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-[10px] text-zinc-600 mb-1">
                    {levelLabels[i]}
                  </div>
                  <div
                    className="font-pixel text-xs"
                    style={{ color: info.color }}
                  >
                    {info.name.toUpperCase()}
                  </div>
                  <div className="text-zinc-500 text-xs italic mt-1">
                    &quot;{info.tagline}&quot;
                  </div>
                </div>
                <div className="text-right text-xs">
                  {score !== null ? (
                    <div style={{ color: "#ffd700" }}>
                      BEST: ${score.toFixed(1)}M
                    </div>
                  ) : (
                    <div className="text-zinc-600">---</div>
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
        className="block text-center text-zinc-600 hover:text-white transition-colors text-xs mt-6"
      >
        [ VIEW DECK ]
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Verify visually**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm dev
```

Open http://localhost:3000, join the game. VC select should show pixel-font headings, level labels, VC cards with colored pixel borders.

- [ ] **Step 3: Commit**

```bash
git add src/components/vc-select.tsx
git commit -m "feat: apply retro pixel styling to VC select"
```

---

### Task 7: Retro pixel styling - Leaderboard component

**Files:**
- Modify: `src/components/leaderboard.tsx`

Apply pixel font to headings, clean up the layout with retro styling.

- [ ] **Step 1: Update leaderboard.tsx**

Replace the contents of `src/components/leaderboard.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

interface LeaderboardEntry {
  player_id: string;
  name: string;
  best_visionary: number;
  best_empath: number;
  best_shark: number;
  total: number;
}

export function Leaderboard({
  currentPlayerId,
  onBack,
}: {
  currentPlayerId: string | null;
  onBack?: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  async function fetchLeaderboard() {
    const supabase = createClient();
    const { data } = await supabase
      .from("leaderboard")
      .select("*")
      .order("total", { ascending: false });

    if (data) setEntries(data as LeaderboardEntry[]);
  }

  useEffect(() => {
    fetchLeaderboard();

    const supabase = createClient();
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
        Best score per VC
      </p>

      <div className="max-w-lg mx-auto w-full space-y-2">
        {entries.length === 0 && (
          <p className="text-zinc-600 text-center mt-8 text-sm">
            No deals yet...
          </p>
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
                <span
                  className="font-pixel text-xs w-8"
                  style={{ color: medalColor(i) }}
                >
                  {i + 1}.
                </span>
                <span className={`text-sm ${isMe ? "font-bold" : ""}`}>
                  {entry.name}
                  {isMe && (
                    <span className="text-zinc-500 text-xs ml-2">(you)</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span style={{ color: "#6fdb6f" }}>
                  {entry.best_visionary > 0
                    ? `$${Number(entry.best_visionary).toFixed(1)}M`
                    : "---"}
                </span>
                <span style={{ color: "#db6fdb" }}>
                  {entry.best_empath > 0
                    ? `$${Number(entry.best_empath).toFixed(1)}M`
                    : "---"}
                </span>
                <span style={{ color: "#db6f6f" }}>
                  {entry.best_shark > 0
                    ? `$${Number(entry.best_shark).toFixed(1)}M`
                    : "---"}
                </span>
                <span
                  className="font-pixel text-xs ml-1"
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

- [ ] **Step 2: Verify visually**

Open http://localhost:3000, navigate to leaderboard. Should show "HIGH SCORES" in pixel font, entries with pixel borders, medal colors preserved.

- [ ] **Step 3: Commit**

```bash
git add src/components/leaderboard.tsx
git commit -m "feat: apply retro pixel styling to leaderboard"
```

---

### Task 8: Style Negotiation game chrome and assistant-ui Thread

**Files:**
- Modify: `src/components/negotiation.tsx` (header, footer styling)
- Modify: `src/components/assistant-ui/thread.tsx` (or wherever the Thread component was scaffolded)

Apply pixel styling to the negotiation header/footer and customize the assistant-ui Thread to match the dark retro theme.

- [ ] **Step 1: Update negotiation header and footer styling**

In `src/components/negotiation.tsx`, update the header section of the `Negotiation` component:

Change the header div from:
```tsx
        <div
          className="flex justify-between items-center px-4 py-3 border-b-2"
          style={{ borderColor: vc.color + "60" }}
        >
          <div className="font-bold text-sm" style={{ color: vc.color }}>
            {vc.name}
          </div>
          <a
            href="/deck.pdf"
            target="_blank"
            className="text-zinc-500 hover:text-white transition-colors text-sm"
          >
            View Deck
          </a>
        </div>
```

To:
```tsx
        <div
          className="flex justify-between items-center px-4 py-3 border-b-2"
          style={{ borderColor: vc.color + "60" }}
        >
          <div className="font-pixel text-xs" style={{ color: vc.color }}>
            {vc.name.toUpperCase()}
          </div>
          <a
            href="/deck.pdf"
            target="_blank"
            className="text-zinc-500 hover:text-white transition-colors text-xs"
          >
            [ DECK ]
          </a>
        </div>
```

Update the deal result section - change `<div className="text-5xl mb-4">DEAL!</div>` to:
```tsx
        <div className="font-pixel text-2xl mb-4" style={{ color: "#ffd700" }}>DEAL!</div>
```

And the "Back to VCs" button:
```tsx
        <button
          onClick={onBack}
          className="mt-6 px-6 py-3 border-2 border-zinc-700 hover:border-zinc-500 transition-colors text-xs pixel-btn"
        >
          CONTINUE
        </button>
```

Update the footer buttons - change "Walk away" to:
```tsx
      <button
        onClick={onBack}
        className="text-xs transition-colors font-pixel"
        style={{ color: "#db6f6f" }}
      >
        QUIT
      </button>
```

And "Accept deal" to:
```tsx
      <button
        onClick={handleAcceptDeal}
        disabled={closing}
        className="text-xs disabled:opacity-30 transition-colors font-pixel"
        style={{ color: vcColor }}
      >
        {closing ? "CLOSING..." : "DEAL!"}
      </button>
```

- [ ] **Step 2: Customize the scaffolded Thread component**

Open the scaffolded Thread component (path determined in Task 1, likely `src/components/assistant-ui/thread.tsx`). The exact file contents depend on what `assistant-ui init` generated. Make these adjustments to match the dark retro theme:

- Set the Thread root background to transparent/black (inherits from game)
- Ensure message bubbles use dark zinc backgrounds with border-2 instead of rounded-xl
- Set the composer input background to zinc-900 with zinc-700 border
- Make sure the send button uses the pixel-btn class

The scaffolded components are fully editable source files. Read the generated file first, then apply Tailwind class changes to match the retro aesthetic without changing any functional code.

- [ ] **Step 3: Verify the full flow**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm dev
```

Test the complete flow:
1. Lobby: pixel font title, retro input/button
2. VC Select: level labels, pixel borders on cards
3. Chat: assistant-ui Thread with dark retro styling, VC name in pixel font
4. Send a message, verify streaming works
5. Accept deal, verify valuation extraction
6. Leaderboard: pixel font "HIGH SCORES", retro borders

- [ ] **Step 4: Verify build**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: apply retro pixel styling to negotiation and assistant-ui thread"
```

---

### Task 9: Final cleanup

**Files:**
- Possibly modify: `src/components/negotiation.tsx` (remove dead imports)
- Possibly modify: `package.json` (verify no unused deps)

- [ ] **Step 1: Check for dead imports**

The old negotiation component imported `useChat`, `DefaultChatTransport`, `isTextUIPart` from `@ai-sdk/react` and `ai`. Verify these are no longer directly imported anywhere:

```bash
cd /Users/matejmicek/Developer/boss-fight
grep -r "DefaultChatTransport\|isTextUIPart" src/ --include="*.tsx" --include="*.ts"
```

Expected: No results (these were only used in the old negotiation.tsx).

- [ ] **Step 2: Verify the app runs end-to-end**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm dev
```

Full manual smoke test:
1. Join as a new player
2. Select each VC type, send at least one message, verify streaming response
3. Close a deal with one VC, verify valuation shows up
4. Check leaderboard shows the deal
5. Verify no console errors in browser devtools

- [ ] **Step 3: Final build check**

```bash
cd /Users/matejmicek/Developer/boss-fight
pnpm build
```

Expected: Clean build, no warnings about unused variables or missing modules.

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore: remove dead imports and final cleanup"
```
