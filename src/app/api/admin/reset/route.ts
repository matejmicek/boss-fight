import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST() {
  const supabase = await createClient();

  await supabase.from("negotiations").delete().not("id", "is", null);
  await supabase.from("players").delete().not("id", "is", null);
  await supabase
    .from("game_state")
    .update({ status: "lobby", num_teams: null })
    .eq("id", 1);

  return NextResponse.json({ ok: true });
}
