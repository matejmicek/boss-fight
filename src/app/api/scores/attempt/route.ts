import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { PARTNER_LEVEL_NAMES } from "@/lib/levels";

// Wipes an attempt so the player can retry. Removes the score row (which
// gates the attempt counter) plus any side-state tied to that level — chat
// conversations for chat-type levels, runbook_runs for negotiation. Voice
// transcripts live in webhook_logs and aren't cleaned, but finalize always
// picks the most recent entry per (player, level) so stale rows don't matter.
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  const levelIdRaw = url.searchParams.get("levelId");

  if (!playerId || !levelIdRaw) {
    return NextResponse.json(
      { error: "Missing playerId or levelId" },
      { status: 400 }
    );
  }
  const levelId = parseInt(levelIdRaw, 10);
  if (Number.isNaN(levelId)) {
    return NextResponse.json({ error: "Invalid levelId" }, { status: 400 });
  }

  const supabase = await createClient();

  // Partner voice + text share one attempt pool. Resolve the full group.
  const { data: thisLevel } = await supabase
    .from("levels")
    .select("name, type")
    .eq("id", levelId)
    .maybeSingle();
  if (!thisLevel) {
    return NextResponse.json({ error: "Level not found" }, { status: 404 });
  }

  const inPartnerGroup = PARTNER_LEVEL_NAMES.has(thisLevel.name);
  let targetLevels: Array<{ id: number; type: string }>;
  if (inPartnerGroup) {
    const { data: partnerRows } = await supabase
      .from("levels")
      .select("id, type")
      .in("name", [...PARTNER_LEVEL_NAMES]);
    targetLevels =
      partnerRows && partnerRows.length > 0
        ? partnerRows
        : [{ id: levelId, type: thisLevel.type }];
  } else {
    targetLevels = [{ id: levelId, type: thisLevel.type }];
  }
  const targetIds = targetLevels.map((l) => l.id);

  const { error: scoreErr } = await supabase
    .from("scores")
    .delete()
    .eq("player_id", playerId)
    .in("level_id", targetIds);
  if (scoreErr) {
    return NextResponse.json({ error: scoreErr.message }, { status: 500 });
  }

  const chatIds = targetLevels
    .filter((l) => l.type === "chat")
    .map((l) => l.id);
  if (chatIds.length > 0) {
    await supabase
      .from("conversations")
      .delete()
      .eq("player_id", playerId)
      .in("level_id", chatIds);
  }

  const negotiationIds = targetLevels
    .filter((l) => l.type === "negotiation")
    .map((l) => l.id);
  if (negotiationIds.length > 0) {
    await supabase
      .from("runbook_runs")
      .delete()
      .eq("player_id", playerId)
      .in("level_id", negotiationIds);
  }

  return NextResponse.json({ ok: true, cleared: targetIds });
}
