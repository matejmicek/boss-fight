import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const body = await req.json();

  if (body.type !== "post_call_transcription") {
    return NextResponse.json({ ok: true });
  }

  const data = body.data;
  const dynamicVars = data?.conversation_initiation_client_data?.dynamic_variables;

  if (!dynamicVars?.player_id || !dynamicVars?.level_id) {
    console.error("Missing player_id or level_id in webhook dynamic variables");
    return NextResponse.json({ error: "Missing identifiers" }, { status: 400 });
  }

  const playerId = dynamicVars.player_id;
  const levelId = parseInt(dynamicVars.level_id, 10);

  const dataResults = data?.analysis?.data_collection_results;
  const score = dataResults?.score?.value ?? 0;
  const justification = dataResults?.justification?.value ?? data?.analysis?.transcript_summary ?? null;

  const supabase = await createClient();

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
