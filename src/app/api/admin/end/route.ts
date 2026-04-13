import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST() {
  const supabase = await createClient();

  await supabase
    .from("game_state")
    .update({ status: "finished" })
    .eq("id", 1);

  return NextResponse.json({ ok: true });
}
