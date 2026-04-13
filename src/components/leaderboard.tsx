"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

interface LeaderboardEntry {
  player_id: string;
  name: string;
  best_visionary: number;
  best_empath: number;
  best_shark: number;
  total: number;
}

export function Leaderboard({
  currentPlayerId,
  onBack,
}: {
  currentPlayerId: string | null;
  onBack?: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  async function fetchLeaderboard() {
    const supabase = createClient();
    const { data } = await supabase
      .from("leaderboard")
      .select("*")
      .order("total", { ascending: false });

    if (data) setEntries(data as LeaderboardEntry[]);
  }

  useEffect(() => {
    fetchLeaderboard();

    const supabase = createClient();
    const channel = supabase
      .channel("leaderboard-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "negotiations" },
        () => {
          fetchLeaderboard();
        }
      )
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
      <p className="text-zinc-500 text-xs text-center mb-6">
        Best score per VC
      </p>

      <div className="max-w-lg mx-auto w-full space-y-2">
        {entries.length === 0 && (
          <p className="text-zinc-600 text-center mt-8 text-sm">
            No deals yet...
          </p>
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
                <span
                  className="font-pixel text-xs w-8"
                  style={{ color: medalColor(i) }}
                >
                  {i + 1}.
                </span>
                <span className={`text-sm ${isMe ? "font-bold" : ""}`}>
                  {entry.name}
                  {isMe && (
                    <span className="text-zinc-500 text-xs ml-2">(you)</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span style={{ color: "#6fdb6f" }}>
                  {entry.best_visionary > 0
                    ? `$${Number(entry.best_visionary).toFixed(1)}M`
                    : "---"}
                </span>
                <span style={{ color: "#db6fdb" }}>
                  {entry.best_empath > 0
                    ? `$${Number(entry.best_empath).toFixed(1)}M`
                    : "---"}
                </span>
                <span style={{ color: "#db6f6f" }}>
                  {entry.best_shark > 0
                    ? `$${Number(entry.best_shark).toFixed(1)}M`
                    : "---"}
                </span>
                <span
                  className="font-pixel text-xs ml-1"
                  style={{ color: medalColor(i) }}
                >
                  ${Number(entry.total).toFixed(1)}M
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
