import { anthropic } from "@ai-sdk/anthropic";
import { generateText, tool } from "ai";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  PERSONAS,
  PERSONA_ORDER,
  MAX_TURNS,
  VALUATION_MIN_M,
  VALUATION_MAX_M,
  returnValuationSchema,
  renderAssociateSystemPrompt,
  renderVcSystemPrompt,
  computeOutcome,
  type Persona,
  type Runbook,
  type NegotiationResult,
  type PersonaId,
} from "@/lib/runbook";

// Fluid compute default is 300s; be explicit.
export const maxDuration = 300;

const MAX_ATTEMPTS = 1;

type Turn = { role: "associate" | "vc"; text: string };

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function validateRunbook(raw: unknown): Runbook | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const vision = typeof r.vision === "string" ? truncate(r.vision.trim(), 200) : "";
  const args = Array.isArray(r.arguments) ? r.arguments : [];
  const a0 = typeof args[0] === "string" ? truncate(args[0].trim(), 220) : "";
  const a1 = typeof args[1] === "string" ? truncate(args[1].trim(), 220) : "";
  const a2 = typeof args[2] === "string" ? truncate(args[2].trim(), 220) : "";
  if (!vision || !a0 || !a1 || !a2) return null;
  return { vision, arguments: [a0, a1, a2] };
}

function toAssociateMessages(turns: Turn[]) {
  return turns.map((t) => ({
    role: t.role === "associate" ? ("assistant" as const) : ("user" as const),
    content: t.text,
  }));
}

function toVcMessages(turns: Turn[]) {
  return turns.map((t) => ({
    role: t.role === "vc" ? ("assistant" as const) : ("user" as const),
    content: t.text,
  }));
}

function clampValuation(v: number): number {
  if (!Number.isFinite(v)) return VALUATION_MIN_M;
  const clamped = Math.max(VALUATION_MIN_M, Math.min(VALUATION_MAX_M, v));
  return Math.round(clamped * 10) / 10;
}

// The VC can end the call at any turn by invoking `return_valuation`. We
// surface the tool on every VC turn, and if they don't call it within
// MAX_TURNS we run one last forced turn telling them to commit.
const returnValuationTool = tool({
  description:
    "End the conversation and return your final post-money valuation. Call this once you've heard enough to commit to a number.",
  inputSchema: returnValuationSchema,
});

async function requestVcTurn(opts: {
  vcSystem: string;
  turns: Turn[];
  forceClose: boolean;
}): Promise<
  | { kind: "text"; text: string }
  | { kind: "valuation"; valuation_m: number; reasoning: string }
> {
  const systemSuffix = opts.forceClose
    ? "\n\nIMPORTANT: End the conversation NOW. Call return_valuation with your final post-money valuation and one-sentence reasoning. Do not reply with any more text."
    : "";

  const result = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: opts.vcSystem + systemSuffix,
    messages: toVcMessages(opts.turns),
    tools: { return_valuation: returnValuationTool },
    toolChoice: opts.forceClose ? { type: "tool", toolName: "return_valuation" } : "auto",
    maxOutputTokens: 300,
    maxRetries: 2,
  });

  const call = result.toolCalls?.find(
    (tc) => tc.toolName === "return_valuation" && !tc.dynamic && !tc.invalid
  );
  if (call) {
    const input = call.input as { valuation_m: number; reasoning: string };
    return {
      kind: "valuation",
      valuation_m: clampValuation(input.valuation_m),
      reasoning: String(input.reasoning ?? "").trim(),
    };
  }
  const text = (result.text || "").trim();
  if (text) return { kind: "text", text };
  // Model returned nothing useful — treat as a soft failure so the caller can
  // retry with a force close.
  return { kind: "text", text: "" };
}

async function runOneNegotiation(
  runbook: Runbook,
  persona: Persona
): Promise<NegotiationResult> {
  const assocSystem = renderAssociateSystemPrompt(runbook, persona);
  const vcSystem = renderVcSystemPrompt(persona);
  const turns: Turn[] = [];
  let closing: { valuation_m: number; reasoning: string } | null = null;

  for (let i = 0; i < MAX_TURNS && !closing; i++) {
    // Associate speaks
    try {
      const assoc = await generateText({
        model: anthropic("claude-sonnet-4-6"),
        system: assocSystem,
        messages:
          turns.length === 0
            ? [{ role: "user", content: "(The call connects. Say hello and open with the runbook.)" }]
            : toAssociateMessages(turns),
        maxOutputTokens: 220,
        maxRetries: 2,
      });
      const text = (assoc.text || "").trim();
      turns.push({ role: "associate", text });
    } catch (err) {
      console.warn(`[${persona.id}] associate turn ${i} failed:`, err);
      turns.push({ role: "associate", text: "(Jamie hesitates — technical issue.)" });
    }

    // VC responds (may end the call via tool)
    try {
      const res = await requestVcTurn({ vcSystem, turns, forceClose: false });
      if (res.kind === "valuation") {
        closing = { valuation_m: res.valuation_m, reasoning: res.reasoning };
        break;
      }
      turns.push({ role: "vc", text: res.text });
    } catch (err) {
      console.warn(`[${persona.id}] vc turn ${i} failed:`, err);
      turns.push({ role: "vc", text: "(VC goes quiet — technical issue.)" });
    }
  }

  // If the VC never closed in the allotted turns, force them to commit now.
  if (!closing) {
    try {
      const res = await requestVcTurn({ vcSystem, turns, forceClose: true });
      if (res.kind === "valuation") {
        closing = { valuation_m: res.valuation_m, reasoning: res.reasoning };
      }
    } catch (err) {
      console.warn(`[${persona.id}] forced close failed:`, err);
    }
  }

  const final = closing ?? {
    valuation_m: VALUATION_MIN_M,
    reasoning: "Defaulting to floor after a failed close.",
  };

  return {
    persona_id: persona.id,
    messages: turns,
    valuation_m: final.valuation_m,
    reasoning: final.reasoning,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { playerId, levelId, runbook: rawRunbook } = (body ?? {}) as {
    playerId?: string;
    levelId?: number;
    runbook?: unknown;
  };

  if (!playerId || typeof playerId !== "string") {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }
  if (!levelId || typeof levelId !== "number") {
    return NextResponse.json({ error: "Missing levelId" }, { status: 400 });
  }

  const runbook = validateRunbook(rawRunbook);
  if (!runbook) {
    return NextResponse.json(
      { error: "Runbook needs a vision and 3 arguments." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Attempt cap. L3 no longer derives a score from the negotiation, but we
  // still drop a score=0 completion marker on finish (see below) so that the
  // shared attempt-counter logic (level-select, /api/scores/attempt) keeps
  // working without a special case.
  const { count, error: countErr } = await supabase
    .from("scores")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .eq("level_id", levelId);
  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "No attempts remaining" }, { status: 403 });
  }

  // Create the run row up-front so the client can subscribe by id.
  const { data: run, error: insertErr } = await supabase
    .from("runbook_runs")
    .insert({
      player_id: playerId,
      level_id: levelId,
      runbook: runbook as unknown as Record<string, unknown>,
      negotiations: [],
      status: "running",
    })
    .select("id")
    .single();

  if (insertErr || !run) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Could not start run" },
      { status: 500 }
    );
  }

  const runId = run.id as string;

  // Kick off 3 negotiations in parallel. As each finishes, atomically append
  // its result to runbook_runs.negotiations so the client gets live progress
  // via realtime UPDATEs on the row.
  const promises = PERSONA_ORDER.map(async (pid: PersonaId) => {
    const persona = PERSONAS[pid];
    const result = await runOneNegotiation(runbook, persona);
    const { error: appendErr } = await supabase.rpc("append_negotiation", {
      run_id: runId,
      neg: result as unknown as Record<string, unknown>,
    });
    if (appendErr) console.warn("append_negotiation failed:", appendErr);
    return result;
  });

  try {
    const results = await Promise.all(promises);
    const outcome = computeOutcome(results);

    // Completion marker (score=0). L3 is not scored — finalize.ts reads the
    // per-VC valuations directly off runbook_runs.outcome.vcs. We only write
    // the row so the generic attempt-counter and level-select "COMPLETED"
    // state keep working.
    await supabase.from("scores").insert({
      player_id: playerId,
      level_id: levelId,
      score: 0,
      justification: outcome.vcs
        .map((v) => `${v.persona_name}: $${v.valuation_m}M`)
        .join(" · "),
    });

    await supabase
      .from("runbook_runs")
      .update({
        outcome,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return NextResponse.json({ runId, outcome });
  } catch (err) {
    console.error("runbook run failed:", err);
    await supabase
      .from("runbook_runs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", runId);
    return NextResponse.json(
      { error: "Negotiation run failed" },
      { status: 500 }
    );
  }
}
