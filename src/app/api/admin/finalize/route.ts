import { NextResponse } from "next/server";
import { finalizeLeaderboard } from "@/lib/finalize";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 300;

// GET: return the latest cached finalization per level (no computation).
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("finalizations")
      .select("level_id, result, updated_at")
      .order("level_id");
    if (error) throw error;
    return NextResponse.json({
      levels: (data ?? []).map((r) => ({
        ...(r.result as Record<string, unknown>),
        cached_at: r.updated_at,
      })),
    });
  } catch (err) {
    console.error("finalize GET failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 500 }
    );
  }
}

// POST: run the evaluator and persist the result.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const sinceMs = Number(url.searchParams.get("since")) || undefined;
  const levelsParam = url.searchParams.get("levels");
  const levelIds = levelsParam
    ? levelsParam
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n))
    : undefined;
  try {
    const result = await finalizeLeaderboard({ sinceMs, levelIds });

    // Persist each level's result. Upsert by level_id so repeat runs overwrite.
    const supabase = await createClient();
    const now = new Date().toISOString();
    const rows = result.levels.map((lvl) => ({
      level_id: lvl.level_id,
      result: lvl as unknown as Record<string, unknown>,
      updated_at: now,
    }));
    if (rows.length > 0) {
      const { error } = await supabase
        .from("finalizations")
        .upsert(rows, { onConflict: "level_id" });
      if (error) console.warn("finalizations upsert failed:", error);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("finalize failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "finalize failed" },
      { status: 500 }
    );
  }
}

// DELETE: clear cached finalizations (used when admin resets scores).
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("finalizations")
      .delete()
      .not("level_id", "is", null);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "delete failed" },
      { status: 500 }
    );
  }
}
