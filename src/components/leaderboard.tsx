"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Level, LeaderboardEntry, MAX_ATTEMPTS_PER_LEVEL } from "@/lib/types";
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
    const { data } = await supabase
      .from("leaderboard")
      .select("*")
      .order("total", { ascending: false });
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scores" },
        () => fetchLeaderboard()
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

  function getLevelEntry(entry: LeaderboardEntry, levelId: number) {
    return entry.level_scores.find((ls) => ls.level_id === levelId);
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
      <p className="text-zinc-500 text-xs text-center mb-6">
        Best score per level. Total = sum of bests.
      </p>

      <div className="max-w-5xl mx-auto w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-800">
              <th className="font-pixel text-[10px] text-zinc-500 text-left py-3 px-2 w-10">
                #
              </th>
              <th className="font-pixel text-[10px] text-zinc-500 text-left py-3 px-2">
                PLAYER
              </th>
              {levels.map((level) => (
                <th
                  key={level.id}
                  className="font-pixel text-[10px] text-left py-3 px-2"
                  style={{ color: getLevelColor(level) }}
                >
                  {level.name.toUpperCase()}
                </th>
              ))}
              <th className="font-pixel text-[10px] text-zinc-500 text-right py-3 px-2">
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={3 + levels.length}
                  className="text-zinc-600 text-center py-8"
                >
                  No scores yet...
                </td>
              </tr>
            )}

            {entries.map((entry, i) => {
              const isMe = entry.player_id === currentPlayerId;
              return (
                <tr
                  key={entry.player_id}
                  className={`border-b border-zinc-900 ${
                    isMe ? "bg-zinc-900" : ""
                  }`}
                >
                  <td
                    className="font-pixel text-xs py-3 px-2"
                    style={{ color: medalColor(i) }}
                  >
                    {i + 1}
                  </td>
                  <td className="py-3 px-2">
                    <span className={isMe ? "font-bold text-white" : "text-zinc-200"}>
                      {entry.name}
                    </span>
                    {isMe && (
                      <span className="text-zinc-500 text-xs ml-2">(you)</span>
                    )}
                  </td>
                  {levels.map((level) => {
                    const info = getLevelEntry(entry, level.id);
                    const color = getLevelColor(level);
                    return (
                      <td key={level.id} className="py-3 px-2">
                        <LevelCell info={info} color={color} />
                      </td>
                    );
                  })}
                  <td className="py-3 px-2 text-right">
                    <span
                      className="font-pixel text-sm"
                      style={{ color: medalColor(i) }}
                    >
                      {entry.total}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LevelCell({
  info,
  color,
}: {
  info: { score: number; attempts: number } | undefined;
  color: string;
}) {
  if (!info) {
    return (
      <div className="text-zinc-700 text-xs">
        <div>—</div>
        <div className="mt-1 flex gap-1">
          {Array.from({ length: MAX_ATTEMPTS_PER_LEVEL }).map((_, i) => (
            <span
              key={i}
              className="inline-block w-2 h-2 rounded-full border border-zinc-800"
            />
          ))}
        </div>
      </div>
    );
  }

  const filled = Math.round((info.score / 10) * 10);
  return (
    <div className="text-xs">
      <div className="flex items-baseline gap-1">
        <span className="font-pixel text-sm" style={{ color }}>
          {info.score}
        </span>
        <span className="text-zinc-600 text-[10px]">/10</span>
      </div>
      <div className="mt-1 flex gap-[2px]">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="inline-block w-1.5 h-2"
            style={{
              backgroundColor: i < filled ? color : "#222",
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-1 items-center">
        {Array.from({ length: MAX_ATTEMPTS_PER_LEVEL }).map((_, i) => (
          <span
            key={i}
            className="inline-block w-2 h-2 rounded-full"
            style={{
              backgroundColor:
                i < info.attempts ? color : "transparent",
              border: `1px solid ${
                i < info.attempts ? color : "#3f3f46"
              }`,
            }}
          />
        ))}
        <span className="text-zinc-600 text-[9px] ml-1">
          {info.attempts}/{MAX_ATTEMPTS_PER_LEVEL} tries
        </span>
      </div>
    </div>
  );
}
