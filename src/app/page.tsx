"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { VcType } from "@/lib/types";
import { Lobby } from "@/components/lobby";
import { VcSelect } from "@/components/vc-select";
import { Negotiation } from "@/components/negotiation";
import { Leaderboard } from "@/components/leaderboard";

type Screen = "vc-select" | "negotiation" | "leaderboard";

export default function Home() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("vc-select");
  const [activeVc, setActiveVc] = useState<VcType | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("boss-fight-player");
    if (stored) {
      const parsed = JSON.parse(stored);
      setPlayerId(parsed.id);
      setPlayerName(parsed.name);
    }
  }, []);

  // Verify stored player still exists in DB
  const verifyPlayer = useCallback(async () => {
    if (!playerId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("players")
      .select("id")
      .eq("id", playerId)
      .single();
    if (!data) {
      localStorage.removeItem("boss-fight-player");
      setPlayerId(null);
      setPlayerName(null);
    }
  }, [playerId]);

  useEffect(() => {
    verifyPlayer();
  }, [verifyPlayer]);

  function handleJoin(id: string, name: string) {
    setPlayerId(id);
    setPlayerName(name);
    localStorage.setItem("boss-fight-player", JSON.stringify({ id, name }));
  }

  if (!playerId) {
    return <Lobby onJoin={handleJoin} />;
  }

  if (screen === "leaderboard") {
    return (
      <Leaderboard
        currentPlayerId={playerId}
        onBack={() => setScreen("vc-select")}
      />
    );
  }

  if (screen === "negotiation" && activeVc) {
    return (
      <Negotiation
        playerId={playerId}
        vcType={activeVc}
        onBack={() => {
          setScreen("vc-select");
          setActiveVc(null);
        }}
        onDealClosed={() => {}}
      />
    );
  }

  return (
    <VcSelect
      playerId={playerId}
      onSelect={(vc) => {
        setActiveVc(vc);
        setScreen("negotiation");
      }}
      onLeaderboard={() => setScreen("leaderboard")}
    />
  );
}
