import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = createServerClient();

  await supabase
    .from("game_state")
    .update({ status: "playing" })
    .eq("id", 1);

  return NextResponse.json({ ok: true });
}
