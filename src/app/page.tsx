"use client";

import { useState, useEffect, useCallback } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { GameState, Player } from "@/lib/types";
import { Lobby } from "@/components/lobby";

export default function Home() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("boss-fight-player");
    if (stored) {
      const parsed = JSON.parse(stored);
      setPlayerId(parsed.id);
      setPlayerName(parsed.name);
    }
  }, []);

  useEffect(() => {
    const supabase = getBrowserClient();

    supabase
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data) setGameState(data as GameState);
      });

    const channel = supabase
      .channel("game-state")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state" },
        (payload) => {
          setGameState(payload.new as GameState);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPlayer = useCallback(async () => {
    if (!playerId) return;
    const supabase = getBrowserClient();
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .single();
    if (data) setPlayer(data as Player);
  }, [playerId]);

  useEffect(() => {
    fetchPlayer();
  }, [fetchPlayer]);

  useEffect(() => {
    if (!playerId) return;
    const supabase = getBrowserClient();

    const channel = supabase
      .channel("player-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "players",
          filter: `id=eq.${playerId}`,
        },
        (payload) => {
          setPlayer(payload.new as Player);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId]);

  function handleJoin(id: string, name: string) {
    setPlayerId(id);
    setPlayerName(name);
    localStorage.setItem("boss-fight-player", JSON.stringify({ id, name }));
  }

  if (!playerId) {
    return <Lobby onJoin={handleJoin} />;
  }

  if (!gameState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (gameState.status === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="text-5xl mb-4">⚔️</div>
        <h1 className="text-2xl font-bold mb-2">You're in, {playerName}!</h1>
        <p className="text-zinc-500">Waiting for host to assign teams...</p>
        <a
          href="/deck.pdf"
          target="_blank"
          className="mt-6 text-zinc-500 hover:text-white transition-colors text-sm"
        >
          📄 Study the Startup Deck
        </a>
      </div>
    );
  }

  if (gameState.status === "teams") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <p className="text-zinc-500 text-sm mb-2">You are</p>
        <div className="text-7xl font-bold text-green-400 mb-4">
          Team {player?.team_number ?? "..."}
        </div>
        <p className="text-zinc-500">Find your teammates!</p>
        <p className="text-zinc-600 text-sm mt-4">
          Waiting for host to start the game...
        </p>
      </div>
    );
  }

  if (gameState.status === "playing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <h1 className="text-2xl font-bold mb-4">Game On!</h1>
        <p className="text-zinc-500">
          Team {player?.team_number} — {playerName}
        </p>
        <p className="text-zinc-600 text-sm mt-2">VC Select coming next...</p>
      </div>
    );
  }

  if (gameState.status === "finished") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <h1 className="text-2xl font-bold mb-4">🏆 Game Over!</h1>
        <p className="text-zinc-500">Leaderboard coming next...</p>
      </div>
    );
  }

  return null;
}
