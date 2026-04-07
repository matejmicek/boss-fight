import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const { name } = await req.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: gameState } = await supabase
    .from("game_state")
    .select("status")
    .eq("id", 1)
    .single();

  if (gameState?.status !== "lobby") {
    return NextResponse.json(
      { error: "Game already in progress" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("players")
    .insert({ name: name.trim() })
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
