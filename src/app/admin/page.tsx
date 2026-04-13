"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { GameState } from "@/lib/types";
import { Leaderboard } from "@/components/leaderboard";

export default function AdminPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [numTeams, setNumTeams] = useState(8);
  const [loading, setLoading] = useState("");

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data) setGameState(data as GameState);
      });

    supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        setPlayerCount(count ?? 0);
      });

    const gsChannel = supabase
      .channel("admin-game-state")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state" },
        (payload) => setGameState(payload.new as GameState)
      )
      .subscribe();

    const pChannel = supabase
      .channel("admin-players")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "players" },
        () => setPlayerCount((c) => c + 1)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gsChannel);
      supabase.removeChannel(pChannel);
    };
  }, []);

  async function adminAction(url: string, body?: object) {
    setLoading(url);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Action failed");
      }
    } catch {
      alert("Connection failed");
    } finally {
      setLoading("");
    }
  }

  if (!gameState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">⚔️ Boss Fight Admin</h1>

      <div className="bg-zinc-900 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-zinc-500">Game Status</div>
            <div className="text-xl font-bold text-green-400 uppercase">
              {gameState.status}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-zinc-500">Players</div>
            <div className="text-xl font-bold">{playerCount}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-8">
        {gameState.status === "lobby" && (
          <div className="flex gap-3 items-end">
            <div>
              <label className="text-sm text-zinc-500 block mb-1">
                Number of teams
              </label>
              <input
                type="number"
                min={2}
                max={20}
                value={numTeams}
                onChange={(e) => setNumTeams(parseInt(e.target.value) || 2)}
                className="w-24 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white"
              />
            </div>
            <button
              onClick={() =>
                adminAction("/api/admin/teams", { numTeams })
              }
              disabled={!!loading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-500 disabled:opacity-50"
            >
              {loading === "/api/admin/teams"
                ? "Assigning..."
                : "Assign Teams"}
            </button>
          </div>
        )}

        {gameState.status === "teams" && (
          <button
            onClick={() => adminAction("/api/admin/start")}
            disabled={!!loading}
            className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-500 disabled:opacity-50 text-lg"
          >
            {loading === "/api/admin/start" ? "Starting..." : "🚀 Start Game"}
          </button>
        )}

        {gameState.status === "playing" && (
          <button
            onClick={() => {
              if (confirm("End the game? This will freeze the leaderboard.")) {
                adminAction("/api/admin/end");
              }
            }}
            disabled={!!loading}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-500 disabled:opacity-50"
          >
            {loading === "/api/admin/end" ? "Ending..." : "🛑 End Game"}
          </button>
        )}

        {gameState.status === "finished" && (
          <button
            onClick={() => {
              if (
                confirm(
                  "Reset everything? This deletes all players, teams, and scores."
                )
              ) {
                adminAction("/api/admin/reset");
              }
            }}
            disabled={!!loading}
            className="px-6 py-3 bg-zinc-800 text-white rounded-lg font-semibold hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading === "/api/admin/reset" ? "Resetting..." : "🔄 Reset Game"}
          </button>
        )}
      </div>

      <div className="border-t border-zinc-800 pt-6">
        <Leaderboard currentPlayerId={null} />
      </div>
    </div>
  );
}
