import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  const levelIdRaw = url.searchParams.get("levelId");
  if (!playerId || !levelIdRaw) {
    return NextResponse.json({ messages: [] });
  }
  const levelId = parseInt(levelIdRaw, 10);
  if (Number.isNaN(levelId)) {
    return NextResponse.json({ messages: [] });
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("messages")
    .eq("player_id", playerId)
    .eq("level_id", levelId)
    .eq("status", "active")
    .maybeSingle();

  return NextResponse.json({ messages: data?.messages ?? [] });
}
