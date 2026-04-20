import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

type CoachTurn = { role: "user" | "assistant"; text: string };

const SYSTEM = `You are a silent pitch coach watching a founder practice against a VC {role}. After the founder's latest message, output ONE hint of 1-3 words. ALL CAPS. No punctuation. No quotes. No explanation.

Good hints: QUANTIFY MARKET, NAME A CUSTOMER, SLOW DOWN, HOOK HARDER, DROP JARGON, ANSWER DIRECTLY, SHOW FIRE, CITE DATA, WHY YOU, ASK CLEARLY, BIGGER VISION, GET PERSONAL, BE BOLDER, LESS BUZZWORDS, SAY THE NUMBER.

Bad (never): "good job", "try harder", multi-sentence advice.

If the founder is doing well, output KEEP GOING.

{role_focus}

Output ONLY the hint.`;

const ROLE_FOCUS: Record<string, string> = {
  analyst:
    "ANALYST focus: the founder should sound crisp on market size, traction numbers, team edge, wedge/moat, and the ask. Hint them toward SPECIFICS and NUMBERS.",
  partner:
    "PARTNER focus: the founder should sound convincing on big vision, personal origin/why-them, team magnetism, and world-changing narrative. Hint them toward CONVICTION, STORY, and BOLDNESS. Do not tell them to quantify or cite MRR — Marcus doesn't care.",
};

const FALLBACK = "KEEP GOING";

function sanitize(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim();
  if (!cleaned) return FALLBACK;
  const words = cleaned.split(/\s+/).slice(0, 3);
  return words.join(" ");
}

function renderTranscript(turns: CoachTurn[]): string {
  return turns
    .slice(-12)
    .map((t) => `${t.role === "user" ? "FOUNDER" : "VC"}: ${t.text}`)
    .join("\n");
}

export async function POST(req: Request) {
  let role: string;
  let transcript: CoachTurn[];
  try {
    const body = await req.json();
    role = typeof body.role === "string" ? body.role : "";
    transcript = Array.isArray(body.transcript) ? body.transcript : [];
  } catch {
    return Response.json({ hint: FALLBACK });
  }

  if (!["analyst", "partner"].includes(role) || transcript.length === 0) {
    return Response.json({ hint: FALLBACK });
  }

  const system = SYSTEM.replace("{role}", role.toUpperCase()).replace(
    "{role_focus}",
    ROLE_FOCUS[role] ?? ""
  );

  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5"),
      system,
      prompt: `Conversation so far:\n${renderTranscript(transcript)}\n\nOutput ONE hint (1-3 words, ALL CAPS). No punctuation.`,
      maxOutputTokens: 12,
      maxRetries: 1,
    });
    return Response.json({ hint: sanitize(text) });
  } catch (err) {
    console.warn("coach route failed:", err);
    return Response.json({ hint: FALLBACK });
  }
}
