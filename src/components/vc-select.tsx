"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { VcType } from "@/lib/types";
import { VC_INFO } from "@/lib/vc-prompts";

interface MyScores {
  visionary: number | null;
  empath: number | null;
  shark: number | null;
}

export function VcSelect({
  playerId,
  onSelect,
  onLeaderboard,
}: {
  playerId: string;
  onSelect: (vc: VcType) => void;
  onLeaderboard: () => void;
}) {
  const [scores, setScores] = useState<MyScores>({
    visionary: null,
    empath: null,
    shark: null,
  });

  async function fetchScores() {
    const supabase = createClient();

    const { data: deals } = await supabase
      .from("negotiations")
      .select("vc_type, final_valuation")
      .eq("player_id", playerId);

    if (!deals) return;

    const best: MyScores = { visionary: null, empath: null, shark: null };
    for (const deal of deals as { vc_type: string; final_valuation: number }[]) {
      const vc = deal.vc_type as VcType;
      const val = Number(deal.final_valuation);
      if (best[vc] === null || val > best[vc]!) {
        best[vc] = val;
      }
    }
    setScores(best);
  }

  useEffect(() => {
    fetchScores();

    const supabase = createClient();
    const channel = supabase
      .channel("my-scores")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "negotiations" },
        () => {
          fetchScores();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const vcTypes: VcType[] = ["visionary", "empath", "shark"];
  const levelLabels = ["LVL 1", "LVL 2", "LVL 3"];

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

      <h2 className="font-pixel text-lg mb-1 text-center">SELECT BOSS</h2>
      <p className="text-zinc-500 text-xs mb-8 text-center">
        Negotiate for the best valuation
      </p>

      <div className="space-y-3 max-w-md mx-auto w-full">
        {vcTypes.map((vc, i) => {
          const info = VC_INFO[vc];
          const score = scores[vc];

          return (
            <button
              key={vc}
              onClick={() => onSelect(vc)}
              className="w-full p-4 border-2 text-left transition-all pixel-btn bg-zinc-950"
              style={{ borderColor: info.color + "60" }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-[10px] text-zinc-600 mb-1">
                    {levelLabels[i]}
                  </div>
                  <div
                    className="font-pixel text-xs"
                    style={{ color: info.color }}
                  >
                    {info.name.toUpperCase()}
                  </div>
                  <div className="text-zinc-500 text-xs italic mt-1">
                    &quot;{info.tagline}&quot;
                  </div>
                </div>
                <div className="text-right text-xs">
                  {score !== null ? (
                    <div style={{ color: "#ffd700" }}>
                      BEST: ${score.toFixed(1)}M
                    </div>
                  ) : (
                    <div className="text-zinc-600">---</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <a
        href="/deck.pdf"
        target="_blank"
        className="block text-center text-zinc-600 hover:text-white transition-colors text-xs mt-6"
      >
        [ VIEW DECK ]
      </a>
    </div>
  );
}
