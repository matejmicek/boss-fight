import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  PERSONAS,
  PERSONA_ORDER,
  MAX_TURNS,
  renderAssociateSystemPrompt,
  renderVcSystemPrompt,
  detectOutcome,
  computeOutcome,
  type Persona,
  type Runbook,
  type NegotiationResult,
  type PersonaId,
} from "@/lib/runbook";

// Fluid compute default is 300s; be explicit.
export const maxDuration = 300;

const MAX_ATTEMPTS = 2;

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
  const floor = typeof r.floor_m === "number" ? r.floor_m : NaN;
  if (!vision || !a0 || !a1 || !a2) return null;
  if (!Number.isFinite(floor) || floor < 1 || floor > 50) return null;
  return { vision, arguments: [a0, a1, a2], floor_m: Math.round(floor) };
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

function isTerminal(text: string): "deal" | "walk" | null {
  if (/\bDEAL\b/.test(text)) return "deal";
  if (/\bWALK\b/.test(text)) return "walk";
  return null;
}

async function runOneNegotiation(
  runbook: Runbook,
  persona: Persona
): Promise<NegotiationResult> {
  const assocSystem = renderAssociateSystemPrompt(runbook, persona);
  const vcSystem = renderVcSystemPrompt(persona);
  const turns: Turn[] = [];

  for (let i = 0; i < MAX_TURNS; i++) {
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
      if (isTerminal(text)) break;
    } catch (err) {
      console.warn(`[${persona.id}] associate turn ${i} failed:`, err);
      turns.push({ role: "associate", text: "WALK — technical issue." });
      break;
    }

    // VC responds
    try {
      const vc = await generateText({
        model: anthropic("claude-sonnet-4-6"),
        system: vcSystem,
        messages: toVcMessages(turns),
        maxOutputTokens: 220,
        maxRetries: 2,
      });
      const text = (vc.text || "").trim();
      turns.push({ role: "vc", text });
      if (isTerminal(text)) break;
    } catch (err) {
      console.warn(`[${persona.id}] vc turn ${i} failed:`, err);
      turns.push({ role: "vc", text: "WALK — technical issue." });
      break;
    }
  }

  const outcome = detectOutcome(turns);
  return {
    persona_id: persona.id,
    messages: turns,
    offer_m: outcome.offer_m,
    walked: outcome.walked,
    end_reason: outcome.end_reason,
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
      { error: "Runbook needs vision, 3 arguments, and a numeric floor (1–50)." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Attempt cap (matches L1/L2 semantics).
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
    const outcome = computeOutcome(results, runbook.floor_m);

    // Write aggregate score row — this is what drives the leaderboard.
    await supabase.from("scores").insert({
      player_id: playerId,
      level_id: levelId,
      score: outcome.aggregate_score,
      justification: outcome.vcs
        .map((v) =>
          v.walked ? `${v.persona_name}: walked` : `${v.persona_name}: $${v.offer_m}M`
        )
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
