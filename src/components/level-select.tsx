"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Level } from "@/lib/types";
import { getLevelColor, LEVEL_TYPE_LABELS } from "@/lib/levels";

interface MyScores {
  [levelId: number]: { best: number; attempts: number };
}

export function LevelSelect({
  playerId,
  onSelect,
  onLeaderboard,
}: {
  playerId: string;
  onSelect: (level: Level, attemptNumber: number) => void;
  onLeaderboard: () => void;
}) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [scores, setScores] = useState<MyScores>({});

  async function fetchLevels() {
    const res = await fetch("/api/levels");
    if (res.ok) {
      const data = await res.json();
      setLevels(data);
    }
  }

  async function fetchScores() {
    const supabase = createClient();
    const { data } = await supabase
      .from("scores")
      .select("level_id, score")
      .eq("player_id", playerId);

    if (!data) return;

    const best: MyScores = {};
    for (const row of data) {
      const lid = row.level_id as number;
      const s = row.score as number;
      if (!best[lid]) {
        best[lid] = { best: s, attempts: 1 };
      } else {
        best[lid].attempts++;
        if (s > best[lid].best) best[lid].best = s;
      }
    }
    setScores(best);
  }

  useEffect(() => {
    fetchLevels();
    fetchScores();

    const supabase = createClient();

    const levelsChannel = supabase
      .channel("levels-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "levels" },
        () => fetchLevels()
      )
      .subscribe();

    const scoresChannel = supabase
      .channel("my-level-scores")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scores" },
        () => fetchScores()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(levelsChannel);
      supabase.removeChannel(scoresChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  return (
    <div className="flex flex-col min-h-screen p-4 scanlines">
      <div className="flex justify-end items-center mb-6">
        <button
          onClick={onLeaderboard}
          className="font-pixel text-[10px] text-zinc-500 hover:text-white transition-colors"
        >
          [ LEADERBOARD ]
        </button>
      </div>

      <h2 className="font-pixel text-lg mb-1 text-center">SELECT LEVEL</h2>
      <p className="text-zinc-500 text-xs mb-8 text-center">
        Convince the VCs to invest
      </p>

      <div className="space-y-3 max-w-md mx-auto w-full">
        {levels.map((level) => {
          const color = getLevelColor(level);
          const info = scores[level.id];
          const maxAttempts = 2;
          const attemptsUsed = info?.attempts ?? 0;
          const noRetries = attemptsUsed >= maxAttempts;
          const locked = !level.unlocked || noRetries;
          const typeLabel = LEVEL_TYPE_LABELS[level.type] || level.type.toUpperCase();

          return (
            <button
              key={level.id}
              onClick={() => !locked && onSelect(level, attemptsUsed + 1)}
              disabled={locked}
              className={`w-full p-4 border-2 text-left transition-all bg-zinc-950 ${
                locked ? "opacity-40 cursor-not-allowed" : "pixel-btn"
              }`}
              style={{ borderColor: locked ? "#333" : color + "60" }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-zinc-600">
                      LVL {level.id}
                    </span>
                    <span
                      className="text-[8px] px-1.5 py-0.5 border"
                      style={{
                        color: locked ? "#666" : color,
                        borderColor: locked ? "#444" : color + "40",
                      }}
                    >
                      {typeLabel}
                    </span>
                  </div>
                  <div
                    className="font-pixel text-xs"
                    style={{ color: locked ? "#666" : color }}
                  >
                    {!level.unlocked ? "LOCKED" : noRetries ? "NO RETRIES LEFT" : level.name.toUpperCase()}
                  </div>
                  {!locked && level.description && (
                    <div className="text-zinc-500 text-xs italic mt-1">
                      &quot;{level.description}&quot;
                    </div>
                  )}
                </div>
                <div className="text-right text-xs">
                  {level.unlocked && info ? (
                    <>
                      <div style={{ color: "#ffd700" }}>
                        BEST: {info.best}/10
                      </div>
                      <div className="text-zinc-600 text-[10px] mt-1">
                        {attemptsUsed}/{maxAttempts} TRIES
                      </div>
                    </>
                  ) : level.unlocked ? (
                    <div className="text-zinc-600">---</div>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
