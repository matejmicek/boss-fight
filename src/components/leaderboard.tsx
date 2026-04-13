"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Level, LeaderboardEntry } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";

export function Leaderboard({
  currentPlayerId,
  onBack,
}: {
  currentPlayerId: string | null;
  onBack?: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);

  async function fetchLeaderboard() {
    const supabase = createClient();
    const { data } = await supabase.from("leaderboard").select("*").order("total", { ascending: false });
    if (data) setEntries(data as LeaderboardEntry[]);
  }

  async function fetchLevels() {
    const res = await fetch("/api/levels");
    if (res.ok) setLevels(await res.json());
  }

  useEffect(() => {
    fetchLeaderboard();
    fetchLevels();

    const supabase = createClient();
    const channel = supabase
      .channel("leaderboard-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scores" }, () => fetchLeaderboard())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const medalColor = (rank: number) => {
    if (rank === 0) return "#ffd700";
    if (rank === 1) return "#c0c0c0";
    if (rank === 2) return "#cd7f32";
    return "#666";
  };

  function getScoreForLevel(entry: LeaderboardEntry, levelId: number): number | null {
    const found = entry.level_scores.find((ls) => ls.level_id === levelId);
    return found ? found.score : null;
  }

  return (
    <div className="flex flex-col min-h-screen p-4 scanlines">
      {onBack && (
        <button
          onClick={onBack}
          className="self-start text-xs text-zinc-500 hover:text-white transition-colors mb-4"
        >
          [ BACK ]
        </button>
      )}

      <h2 className="font-pixel text-lg text-center mb-1">HIGH SCORES</h2>
      <p className="text-zinc-500 text-xs text-center mb-6">Best score per level</p>

      <div className="max-w-2xl mx-auto w-full space-y-2">
        {entries.length === 0 && (
          <p className="text-zinc-600 text-center mt-8 text-sm">No scores yet...</p>
        )}

        {entries.map((entry, i) => {
          const isMe = entry.player_id === currentPlayerId;

          return (
            <div
              key={entry.player_id}
              className={`flex items-center justify-between p-3 border-2 ${
                isMe ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 bg-zinc-950"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-pixel text-xs w-8" style={{ color: medalColor(i) }}>
                  {i + 1}.
                </span>
                <span className={`text-sm ${isMe ? "font-bold" : ""}`}>
                  {entry.name}
                  {isMe && <span className="text-zinc-500 text-xs ml-2">(you)</span>}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                {levels.map((level) => {
                  const score = getScoreForLevel(entry, level.id);
                  const color = getLevelColor(level);
                  return (
                    <span key={level.id} style={{ color: score ? color : "#444" }}>
                      {score !== null ? `${score}/10` : "---"}
                    </span>
                  );
                })}
                <span className="font-pixel text-xs ml-1" style={{ color: medalColor(i) }}>
                  {entry.total}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
