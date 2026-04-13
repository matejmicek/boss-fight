"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { VcType } from "@/lib/types";

const VC_DISPLAY: Record<
  VcType,
  { name: string; tagline: string; color: string }
> = {
  visionary: {
    name: "The Visionary",
    tagline: "Just finished re-reading Zero to One",
    color: "#6fdb6f",
  },
  empath: {
    name: "The Empath",
    tagline: "Cried during your YC application video",
    color: "#db6fdb",
  },
  shark: {
    name: "The Shark",
    tagline: "Has a spreadsheet open before you sit down",
    color: "#db6f6f",
  },
};

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
    const supabase = getBrowserClient();

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

    const supabase = getBrowserClient();
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

  return (
    <div className="flex flex-col min-h-screen p-4">
      <div className="flex justify-end items-center mb-6">
        <button
          onClick={onLeaderboard}
          className="text-sm text-zinc-500 hover:text-white transition-colors"
        >
          🏆 Leaderboard
        </button>
      </div>

      <h2 className="text-xl font-bold mb-1 text-center">Pick a VC</h2>
      <p className="text-zinc-500 text-sm mb-6 text-center">
        Negotiate for the best valuation
      </p>

      <div className="space-y-3 max-w-md mx-auto w-full">
        {vcTypes.map((vc) => {
          const info = VC_DISPLAY[vc];
          const score = scores[vc];

          return (
            <button
              key={vc}
              onClick={() => onSelect(vc)}
              className="w-full p-4 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                borderColor: info.color + "40",
                background: info.color + "10",
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold" style={{ color: info.color }}>
                    {info.name}
                  </div>
                  <div className="text-zinc-500 text-sm italic mt-1">
                    &quot;{info.tagline}&quot;
                  </div>
                </div>
                <div className="text-right text-sm">
                  {score !== null ? (
                    <div style={{ color: "#ffd700" }}>
                      Best: ${score.toFixed(1)}M
                    </div>
                  ) : (
                    <div className="text-zinc-600">No attempt yet</div>
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
        className="block text-center text-zinc-600 hover:text-white transition-colors text-sm mt-6"
      >
        📄 View Deck
      </a>
    </div>
  );
}
