import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

type CoachTurn = { role: "user" | "assistant"; text: string };

const SYSTEM = `You are a silent pitch coach helping a founder practice against a VC {role}. You always coach what the founder should do in their NEXT message. Never grade the previous one.

HOW TO PICK THE HINT:
- If the VC's LAST message is a question or probe, the hint MUST be about answering THAT question well. The VC's latest ask is the single most important thing — always.
- Only raise an issue from earlier in the transcript (e.g. a vague mission line, a buzzword the founder already used) if the VC has NOT yet asked a new question — or as a secondary priority when you have a question to address AND the earlier issue is catastrophic. When in doubt, coach for the current question.
- Do not surface past flaws that the VC has already moved past.

Output: ONE short imperative directive, 3 to 8 words, ALL CAPS. No punctuation except spaces. No quotes. No explanation.

Two situations:

1) OPENING (no founder message yet, or only a greeting so far): coach them on the VERY FIRST pitch line. They need a captivating hook. Examples:
- LEAD WITH ONE KILLER HOOK
- OPEN WITH THE CATEGORY IN ONE LINE
- START WITH THE MOST UNFAIR FACT

2) VC JUST SPOKE (last message is from the VC): coach how to answer THAT specific question well. Examples by topic:
- Numbers question -> DROP CONCRETE METRICS NOW / WRAP NUMBERS IN A NARRATIVE
- Market question -> SIZE IT BOTTOM UP WITH REAL USERS
- Vision question -> PAINT THE TEN YEAR CATEGORY
- Team question -> NAME YOUR UNFAIR INSIGHT
- Defensibility -> SHOW WHAT COMPOUNDS OVER TIME

Never: "good job", "keep going", past-tense feedback, vague praise, multi-sentence advice, generic "be clearer."

Always imperative. Always forward-looking. Output ONLY the hint.

{role_focus}`;

const ROLE_FOCUS: Record<string, string> = {
  analyst:
    "ANALYST focus: Sarah cares about NUMBERS (traction, retention, revenue) and MARKET SIZE (bottom-up logic, real users). Coach the founder to be specific, back every number with a story, and never hand-wave TAM.",
  partner:
    "PARTNER focus: Marcus cares about BIG VISION (category-defining outcome), LONG-TERM DEFENSIBILITY (what compounds), and WHY THIS TEAM WINS (unfair insight, obsession). Never hint at MRR or unit economics. Push toward conviction, story, and scale.",
};

const FALLBACK = "WRITE YOUR STRONGEST OPENING HOOK";

function sanitize(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim();
  if (!cleaned) return FALLBACK;
  const words = cleaned.split(/\s+/).slice(0, 8);
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

  if (!["analyst", "partner"].includes(role)) {
    return Response.json({ hint: FALLBACK });
  }

  const system = SYSTEM.replace("{role}", role.toUpperCase()).replace(
    "{role_focus}",
    ROLE_FOCUS[role] ?? ""
  );

  const transcriptBlock =
    transcript.length === 0
      ? "(No messages yet. The founder is about to send their first cold DM.)"
      : renderTranscript(transcript);

  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5"),
      system,
      prompt: `Conversation so far:\n${transcriptBlock}\n\nThe founder is writing their NEXT message now. If the VC's most recent message is a question, your hint MUST help answer THAT question. Output ONE imperative hint (3-8 words, ALL CAPS). No punctuation.`,
      maxOutputTokens: 32,
      maxRetries: 1,
    });
    return Response.json({ hint: sanitize(text) });
  } catch (err) {
    console.warn("coach route failed:", err);
    return Response.json({ hint: FALLBACK });
  }
}
