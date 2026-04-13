# Replace Chat UI with assistant-ui

## Goal

Replace the hand-built chat in the Negotiation component with assistant-ui, an installable chat UI library that wraps AI SDK. The result should be a bulletproof chat experience: streaming, error handling, retry/backoff, markdown rendering, scroll management - all handled by the library, not our code.

## What stays the same

- VC select screen, deal closing flow, leaderboard - untouched
- Supabase for game data (players, negotiations) - untouched
- Three VC personalities with system prompts - untouched
- `/api/deal/route.ts` - untouched
- No chat persistence needed (messages live in memory per session)

## What changes

### 1. Install assistant-ui

```
pnpm add @assistant-ui/react @assistant-ui/react-ai-sdk
npx assistant-ui@latest init
```

This scaffolds editable chat components into `/components/assistant-ui/` (Thread, Composer, Message, etc.). These are shadcn-style source files we own and can style.

### 2. Update API route (`/api/chat/route.ts`)

- Accept `system` from the request body (VC personality prompt)
- Use `convertToModelMessages` (async in AI SDK v6)
- Add `maxRetries: 3` to `streamText` for server-side retry with exponential backoff on 429/5xx
- Keep `maxOutputTokens: 300`
- Keep using `anthropic("claude-sonnet-4-6-20250514")` via `@ai-sdk/anthropic`

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText } from "ai";

export async function POST(req: Request) {
  const { messages, system } = await req.json();

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

### 3. Replace Negotiation chat UI (`/components/negotiation.tsx`)

- Remove hand-built message list, input form, and manual `useChat` wiring
- Use `useChatRuntime` from `@assistant-ui/react-ai-sdk` with `AssistantChatTransport`
- Pass VC system prompt via the transport config
- Wrap in `AssistantRuntimeProvider` + `<Thread />`
- Keep the game chrome: header (VC name/color), "Walk away" button, "Accept deal" button
- The deal closing logic reads messages from the assistant-ui runtime

### 4. Error resilience (two layers)

**Server-side (API route):**
- `maxRetries: 3` on `streamText` - handles 429 rate limits and 5xx errors with exponential backoff
- This is built into AI SDK, not custom code

**Client-side (assistant-ui):**
- If all retries fail, assistant-ui renders an error state on the message with a retry button
- No broken UI, no silent failures
- User can click retry to re-send

### 5. Styling

Retro pixelated aesthetic (think PostHog docs, Parallel AI website). Light touch - don't break anything.

- Dark background, retro/pixel font (e.g. Press Start 2P or similar from Google Fonts)
- Pixelated borders, blocky UI elements
- VC personality colors preserved (green/purple/red)
- User messages: dark background, right-aligned
- Assistant messages: VC name label in personality color, left-aligned
- Composer: dark input, pixelated send button
- Keep it simple - just enough to look intentionally retro, not overwrought

## Files touched

| File | Action |
|------|--------|
| `package.json` | Add `@assistant-ui/react`, `@assistant-ui/react-ai-sdk` |
| `components/assistant-ui/*` | New - scaffolded by `init` CLI |
| `src/app/api/chat/route.ts` | Update - accept system prompt, add retries |
| `src/components/negotiation.tsx` | Rewrite - use assistant-ui Thread instead of hand-built chat |

## Out of scope

- Chat persistence / message history across sessions
- Authentication
- File attachments (not needed for negotiation game)
- Thread list / sidebar
- Any changes to Supabase schema
