import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = await createClient();

  // Keep logging for now
  await supabase.from("webhook_logs").insert({ payload: body });

  if (body.type !== "post_call_transcription") {
    return NextResponse.json({ ok: true });
  }

  const data = body.data;
  const dynamicVars = data?.conversation_initiation_client_data?.dynamic_variables;

  if (!dynamicVars?.player_id || !dynamicVars?.level_id) {
    return NextResponse.json({ ok: true }); // No player info, skip
  }

  const playerId = dynamicVars.player_id;
  const levelId = parseInt(dynamicVars.level_id, 10);

  // Guard: drop obvious non-calls (instant refresh, mic-denied reconnects).
  // Must be conservative — a real-but-brief call with "I need to end this
  // now" should still be scored. Accept when either (a) the founder got
  // meaningfully on the mic (≥2 non-empty user turns) OR (b) the call
  // lasted ≥15s. Reject only when both signals are absent.
  const transcript: Array<{ role?: string; message?: string }> = Array.isArray(
    data?.transcript
  )
    ? data.transcript
    : [];
  const userTurns = transcript.filter(
    (t) =>
      t.role === "user" &&
      typeof t.message === "string" &&
      t.message.trim().length > 0
  );
  const durationSecs = Number(data?.metadata?.call_duration_secs ?? 0);
  if (userTurns.length < 2 && durationSecs < 15) {
    console.log("webhook: skipping score — too short", {
      userTurns: userTurns.length,
      durationSecs,
    });
    return NextResponse.json({ ok: true, skipped: "too_short" });
  }

  const evalScore = data?.analysis?.data_collection_results?.["Eval Score"];
  const score = evalScore?.value ?? 0;
  const justification = evalScore?.rationale ?? data?.analysis?.transcript_summary ?? null;

  if (score === null || score === undefined) {
    return NextResponse.json({ ok: true }); // No score, skip
  }

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
