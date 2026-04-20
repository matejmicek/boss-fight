import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

type ScoreTurn = { role: "user" | "assistant"; text: string };

// Mirrors the analyst's end_level scoring guide so the live score
// maps to what Sarah would give at the end.
const SYSTEM = `You are Sarah Chen, junior analyst at Meridian Ventures, silently grading a founder mid-conversation on LinkedIn.

Scoring (same scale you use at end of chat):
- 0-3: couldn't articulate basics, numbers were vague, or contradicted the LinkedIn/website.
- 4-6: decent but forgettable.
- 7-8: sharp, crisp answers on market/traction/team/wedge/ask — would forward.
- 9-10: exceptional — they just get it.

Output a single integer 0-10 reflecting your CURRENT read based on what's been said so far. Output ONLY the number. No punctuation. No words.

Early in the chat (1-2 founder turns), default toward 4-5 — you haven't seen enough to go extreme yet.`;

function parseScore(raw: string): number | null {
  const match = raw.match(/-?\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(10, n));
}

function renderTranscript(turns: ScoreTurn[]): string {
  return turns
    .slice(-16)
    .map((t) => `${t.role === "user" ? "FOUNDER" : "SARAH"}: ${t.text}`)
    .join("\n");
}

export async function POST(req: Request) {
  let transcript: ScoreTurn[];
  try {
    const body = await req.json();
    transcript = Array.isArray(body.transcript) ? body.transcript : [];
  } catch {
    return Response.json({ score: null });
  }

  if (transcript.length === 0) return Response.json({ score: null });

  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5"),
      system: SYSTEM,
      prompt: `Transcript so far:\n${renderTranscript(transcript)}\n\nOutput ONE integer, 0-10.`,
      maxOutputTokens: 5,
      maxRetries: 1,
    });
    const score = parseScore(text);
    return Response.json({ score });
  } catch (err) {
    console.warn("score route failed:", err);
    return Response.json({ score: null });
  }
}
