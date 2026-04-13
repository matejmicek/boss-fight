import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scores")
    .select("*, players(name), levels(name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE() {
  const supabase = await createClient();
  await supabase.from("scores").delete().not("id", "is", null);
  return NextResponse.json({ ok: true });
}
