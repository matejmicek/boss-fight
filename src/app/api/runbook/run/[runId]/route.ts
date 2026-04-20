import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> }
) {
  const { runId } = await ctx.params;
  if (!runId) return NextResponse.json({ error: "Missing runId" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("runbook_runs")
    .select("id, player_id, level_id, runbook, negotiations, outcome, status, created_at")
    .eq("id", runId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
