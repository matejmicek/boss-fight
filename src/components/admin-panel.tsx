"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";

interface ScoreRow {
  id: string;
  score: number;
  justification: string | null;
  created_at: string;
  players: { name: string };
  levels: { name: string };
}

export function AdminPanel() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState("");

  async function fetchLevels() {
    const res = await fetch("/api/levels");
    if (res.ok) setLevels(await res.json());
  }

  async function fetchScores() {
    const res = await fetch("/api/admin/scores");
    if (res.ok) setScores(await res.json());
  }

  useEffect(() => {
    fetchLevels();
    fetchScores();

    const supabase = createClient();

    const ch1 = supabase
      .channel("admin-levels")
      .on("postgres_changes", { event: "*", schema: "public", table: "levels" }, () => fetchLevels())
      .subscribe();

    const ch2 = supabase
      .channel("admin-scores")
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, () => fetchScores())
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, []);

  async function toggleLevel(levelId: number, unlocked: boolean) {
    setLoading(`level-${levelId}`);
    await fetch("/api/admin/levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ levelId, unlocked }),
    });
    setLoading("");
  }

  async function resetScores() {
    if (!confirm("Wipe ALL scores? This cannot be undone.")) return;
    setLoading("reset");
    await fetch("/api/admin/scores", { method: "DELETE" });
    setLoading("");
  }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <h1 className="font-pixel text-xl mb-6">ADMIN</h1>

      <section className="mb-8">
        <h2 className="font-pixel text-sm mb-3 text-zinc-400">LEVELS</h2>
        <div className="space-y-2">
          {levels.map((level) => {
            const color = getLevelColor(level);
            return (
              <div
                key={level.id}
                className="flex items-center justify-between p-3 border-2 border-zinc-800 bg-zinc-950"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600">#{level.id}</span>
                  <span className="font-pixel text-xs" style={{ color }}>
                    {level.name.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-zinc-600">({level.type})</span>
                </div>
                <button
                  onClick={() => toggleLevel(level.id, !level.unlocked)}
                  disabled={loading === `level-${level.id}`}
                  className={`font-pixel text-[10px] px-3 py-1 border-2 transition-colors ${
                    level.unlocked
                      ? "border-green-800 text-green-400"
                      : "border-zinc-700 text-zinc-500"
                  }`}
                >
                  {level.unlocked ? "UNLOCKED" : "LOCKED"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-pixel text-sm text-zinc-400">SCORES</h2>
          <button
            onClick={resetScores}
            disabled={loading === "reset"}
            className="font-pixel text-[10px] px-3 py-1 border-2 border-red-900 text-red-400 hover:border-red-700 transition-colors"
          >
            {loading === "reset" ? "RESETTING..." : "RESET ALL"}
          </button>
        </div>

        {scores.length === 0 ? (
          <p className="text-zinc-600 text-sm">No scores yet.</p>
        ) : (
          <div className="space-y-1">
            {scores.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between p-2 border border-zinc-800 text-xs"
              >
                <div className="flex-1">
                  <span className="text-white">{s.players?.name}</span>
                  <span className="text-zinc-600 mx-2">on</span>
                  <span className="text-zinc-400">{s.levels?.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="font-pixel text-xs"
                    style={{ color: s.score >= 7 ? "#ffd700" : s.score >= 4 ? "#c0c0c0" : "#db6f6f" }}
                  >
                    {s.score}/10
                  </span>
                </div>
                {s.justification && (
                  <div className="text-zinc-500 text-[11px] mt-1 w-full">
                    {s.justification}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
