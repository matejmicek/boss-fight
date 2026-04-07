# Boss Fight — Game Design Spec

VC term sheet negotiation game for Credo Ventures Founder Summit. 40 founders, teams of ~4, negotiate with 3 AI VC personalities to get the best pre-money valuation. Team with the highest combined score wins.

## Game Flow

1. **Lobby** — Players join by entering their name. They can view the shared startup deck (PDF). No authentication.
2. **Team Assignment** — Admin sets number of teams. App randomly assigns players. Each player sees their team number and regroups physically.
3. **Play** — All 3 VCs unlock simultaneously. Players pick a VC, negotiate via chat, close or walk away, and can retry any VC any number of times. Best score per VC per team counts.
4. **End** — Admin ends the game. Leaderboard freezes. Winner announced.

No timers in the app. Host manages time from stage verbally.

## Players & Teams

- ~40 players, ~10 teams of ~4
- Players join with a display name (no login/auth)
- Admin chooses number of teams, app assigns randomly
- Player stays on their team for the entire game
- Each player negotiates individually but scores contribute to team total

## The Startup Deck

- One PDF deck shared by all players — the fictional pre-seed startup they're all pitching
- Deck is uploaded/configured by admin before the event (placed at a URL or in /public)
- The AI VCs also have the deck contents in their system prompt
- Players must stick to facts in the deck — VCs call out fabricated claims
- Deck content is a placeholder until the real PDF is provided

## VC Personalities

Three AI VCs, each with a distinct personality, negotiation style, and valuation range. All available simultaneously.

### The Visionary
- **One-liner:** "Just finished re-reading Zero to One"
- **What moves them:** Big vision, massive TAM, moonshot thinking, market domination narrative
- **What doesn't work:** Modest pitches, incremental thinking, "we'll figure it out"
- **Tone:** Friendly, enthusiastic, but financially disciplined
- **Anchor:** $3M pre-money
- **Ceiling:** ~$8M (achievable with an exceptional vision pitch)

### The Empath
- **One-liner:** "Cried during your YC application video"
- **What moves them:** Personal founder story, founder-market fit, genuine passion, why you care
- **What doesn't work:** Generic pitches, pure numbers talk, anything that feels rehearsed
- **Tone:** Warm, curious about you as a person, but shrewd on numbers
- **Anchor:** $2M pre-money
- **Ceiling:** ~$6M (achievable with authentic personal connection)

### The Shark
- **One-liner:** "Has a spreadsheet open before you sit down"
- **What moves them:** Unit economics, defensibility, data, competitive moats, firm pushback
- **What doesn't work:** Vision talk, emotional appeals, hand-waving on numbers
- **Tone:** Hostile, negs the startup, creates urgency ("we're looking at competitors"), actively pokes holes
- **Anchor:** $1.5M pre-money
- **Ceiling:** ~$4M (very hard to reach, only with ironclad data arguments and firm negotiation)

Key design: tactics that work on one VC actively backfire on others. Founders must read the room and adapt.

VC prompt engineering, calibration, and testing is an implementation responsibility — the prompts must be tuned so that the ranges feel fair and the personalities are distinct and entertaining.

## Negotiation Mechanics

- **Free-form chat** — no structured offer/counter-offer UI, just natural conversation
- **Each attempt is a fresh conversation** — the VC doesn't remember previous attempts
- **Closing a deal:** Player explicitly accepts the VC's current offer (or the VC accepts the player's terms). A "Accept deal" button locks in the valuation. The API extracts the valuation by asking Claude to parse the final agreed number from the conversation history as a structured response.
- **Walking away:** Player can abandon a negotiation at any time via "Walk away" button. No score recorded for that attempt.
- **VC walks away:** If a founder is too aggressive, rude, or unreasonable, the VC can walk away — ending the negotiation with no deal. The AI's system prompt instructs it to do this in extreme cases.
- **Lie detection:** The AI VC has the deck in its system prompt. If a player claims something not in the deck, the VC pushes back and may lower their offer.
- **Best score wins:** If a player negotiates with the same VC multiple times, only the highest valuation counts for the team.

## Scoring

- **Score = pre-money valuation** from a closed deal
- **Team score = best Visionary score + best Empath score + best Shark score**
- A team with no deal on a VC gets $0 for that VC
- **Leaderboard shows:** team rank, per-VC best scores, total
- Leaderboard updates in real-time as deals close

## Screens

### Player Screens

1. **Lobby** — Name input, "Join Game" button, link to view startup deck PDF. Shows "Waiting for host..." until teams assigned.
2. **Team Assignment** — Large team number display. "Find your teammates!" message. Shows "Waiting for game to start..." until admin starts game.
3. **VC Select** — Three VC cards with name, one-liner, and team's best score for that VC (or "No attempt yet"). Tap to start a negotiation.
4. **Negotiation** — Chat interface. VC name and color at top. Team number shown. "View Deck" link. Message input. "Accept deal" and "Walk away" action buttons.
5. **Leaderboard** — Ranked list of teams. Per-VC score breakdown (color-coded). Total score. Highlights player's own team.

### Admin Screen (/admin)

- Player count (joined so far)
- "Set Teams" — number input + "Assign Teams" button
- "Start Game" button
- "End Game" button
- Live leaderboard view
- Deck configuration (URL or file path)

Admin controls are simple buttons — no complex UI. Admin page is not secured (URL obscurity is sufficient for a live event).

## Architecture

### Stack
- **Frontend:** Next.js 16 App Router, Tailwind CSS, Supabase JS client
- **Backend:** Next.js API routes (chat endpoint that calls Claude API)
- **Database:** Supabase Postgres (project: boss-fight, region: eu-west-1, ID: qkhfzxzhqeysvexbfuus)
- **Real-time:** Supabase Realtime for game state changes, leaderboard updates, team assignments
- **AI:** Claude API for VC conversations
- **Deploy:** Vercel with GitHub auto-deploy

### Data Model

**game_state** (single row)
- id (int, always 1)
- status: enum (lobby | teams | playing | finished)
- num_teams: int (nullable)
- deck_url: text (nullable)

**players**
- id: uuid
- name: text
- team_number: int (nullable, assigned when admin creates teams)
- created_at: timestamp

**negotiations**
- id: uuid
- player_id: uuid (FK → players)
- vc_type: enum (visionary | empath | shark)
- messages: jsonb (array of {role, content})
- final_valuation: numeric (nullable, set when deal closes)
- deal_closed: boolean (default false)
- created_at: timestamp

**leaderboard** (database view)
- team_number
- best_visionary: max valuation from closed deals with visionary for this team
- best_empath: max valuation from closed deals with empath for this team
- best_shark: max valuation from closed deals with shark for this team
- total: sum of best scores

### Real-time Subscriptions

- **game_state changes** → all clients react to status transitions (lobby → teams → playing → finished)
- **players table** → lobby shows live join count; team assignment triggers team display
- **negotiations inserts/updates** → leaderboard recalculates when deals close

### API Routes

- `POST /api/join` — create player, return player ID
- `POST /api/chat` — send message to VC, return AI response. Accepts: player_id, vc_type, messages array. Streams response.
- `POST /api/deal` — close a deal. Extracts final valuation from conversation. Accepts: negotiation_id.
- `POST /api/admin/teams` — assign teams. Accepts: num_teams.
- `POST /api/admin/start` — set game status to playing.
- `POST /api/admin/end` — set game status to finished.

## Intentionally Not Building

- Timers / countdown clocks — host manages from stage
- Cooldowns between attempts
- Authentication / login
- Chat history browsing for players
- Deck upload UI — configured via admin or placed in /public
- Animations or visual polish beyond functional styling
- Per-player statistics or detailed analytics
- Sound effects or notifications

## Infrastructure Notes

- Vercel Hobby plan may hit function invocation limits with 40 concurrent users. Recommend upgrading to Pro ($20/mo) for the event.
- Supabase free/pro tier handles 500 concurrent Realtime connections — 50 users is well within limits.
- Claude API rate limits (even lowest tier ~50 RPM) are sufficient for this use case.
- No timer sync complexity — simplifies implementation significantly.
