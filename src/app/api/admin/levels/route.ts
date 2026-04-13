import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const { levelId, unlocked } = await req.json();
  if (typeof levelId !== "number" || typeof unlocked !== "boolean") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("levels").update({ unlocked }).eq("id", levelId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
