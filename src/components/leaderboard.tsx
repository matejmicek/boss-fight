"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { LeaderboardEntry } from "@/lib/types";

export function Leaderboard({
  teamNumber,
  onBack,
}: {
  teamNumber: number | null;
  onBack?: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  async function fetchLeaderboard() {
    const supabase = getBrowserClient();
    const { data } = await supabase
      .from("leaderboard")
      .select("*")
      .order("total", { ascending: false });

    if (data) setEntries(data as LeaderboardEntry[]);
  }

  useEffect(() => {
    fetchLeaderboard();

    const supabase = getBrowserClient();
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
    <div className="flex flex-col min-h-screen p-4">
      {onBack && (
        <button
          onClick={onBack}
          className="self-start text-sm text-zinc-500 hover:text-white transition-colors mb-4"
        >
          ← Back
        </button>
      )}

      <h2 className="text-2xl font-bold text-center mb-1">🏆 Leaderboard</h2>
      <p className="text-zinc-500 text-sm text-center mb-6">
        Best score per VC per team
      </p>

      <div className="max-w-lg mx-auto w-full space-y-2">
        {entries.length === 0 && (
          <p className="text-zinc-600 text-center mt-8">No deals yet...</p>
        )}

        {entries.map((entry, i) => {
          const isMyTeam = entry.team_number === teamNumber;

          return (
            <div
              key={entry.team_number}
              className={`flex items-center justify-between p-3 rounded-xl ${
                isMyTeam
                  ? "bg-zinc-800 border border-zinc-700"
                  : "bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-lg font-bold w-8"
                  style={{ color: medalColor(i) }}
                >
                  {i + 1}.
                </span>
                <span className={isMyTeam ? "font-bold" : ""}>
                  Team {entry.team_number}
                  {isMyTeam && (
                    <span className="text-zinc-500 text-xs ml-2">(you)</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span style={{ color: "#6fdb6f" }}>
                  {entry.best_visionary > 0
                    ? `$${Number(entry.best_visionary).toFixed(1)}M`
                    : "—"}
                </span>
                <span style={{ color: "#db6fdb" }}>
                  {entry.best_empath > 0
                    ? `$${Number(entry.best_empath).toFixed(1)}M`
                    : "—"}
                </span>
                <span style={{ color: "#db6f6f" }}>
                  {entry.best_shark > 0
                    ? `$${Number(entry.best_shark).toFixed(1)}M`
                    : "—"}
                </span>
                <span
                  className="font-bold text-sm ml-1"
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
