import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const { numTeams } = await req.json();

  if (!numTeams || numTeams < 2) {
    return NextResponse.json(
      { error: "Need at least 2 teams" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data: players } = await supabase
    .from("players")
    .select("id")
    .order("created_at");

  if (!players || players.length === 0) {
    return NextResponse.json({ error: "No players" }, { status: 400 });
  }

  const shuffled = [...players].sort(() => Math.random() - 0.5);

  const updates = shuffled.map((player, i) => ({
    id: player.id,
    team_number: (i % numTeams) + 1,
  }));

  for (const update of updates) {
    await supabase
      .from("players")
      .update({ team_number: update.team_number })
      .eq("id", update.id);
  }

  await supabase
    .from("game_state")
    .update({ status: "teams", num_teams: numTeams })
    .eq("id", 1);

  return NextResponse.json({ ok: true, playerCount: players.length, numTeams });
}
