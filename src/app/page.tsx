"use client";

import { useState, useEffect } from "react";
import { Level } from "@/lib/types";
import { Lobby } from "@/components/lobby";
import { LevelSelect } from "@/components/level-select";
import { ChatLevel } from "@/components/chat-level";
import { VoiceLevel } from "@/components/voice-level";
import { Leaderboard } from "@/components/leaderboard";

type Screen = "level-select" | "playing" | "leaderboard";

export default function Home() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("level-select");
  const [activeLevel, setActiveLevel] = useState<Level | null>(null);
  const [pendingLevelId, setPendingLevelId] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("boss-fight-player");
    if (stored) {
      const parsed = JSON.parse(stored);
      setPlayerId(parsed.id);
      setPlayerName(parsed.name);
    }
  }, []);

  function handleJoin(id: string, name: string) {
    setPlayerId(id);
    setPlayerName(name);
    localStorage.setItem("boss-fight-player", JSON.stringify({ id, name }));
  }

  function handleReset() {
    localStorage.removeItem("boss-fight-player");
    setPlayerId(null);
    setPlayerName(null);
    setScreen("level-select");
    setActiveLevel(null);
    setPendingLevelId(null);
  }

  if (!playerId) {
    return <Lobby onJoin={handleJoin} />;
  }

  if (screen === "leaderboard") {
    return (
      <Leaderboard
        currentPlayerId={playerId}
        onBack={() => setScreen("level-select")}
      />
    );
  }

  if (screen === "playing" && activeLevel) {
    if (activeLevel.type === "chat") {
      return (
        <ChatLevel
          playerId={playerId}
          level={activeLevel}
          onBack={() => {
            setScreen("level-select");
            setActiveLevel(null);
          }}
          onComplete={() => {}}
        />
      );
    }

    if (activeLevel.type === "voice") {
      return (
        <VoiceLevel
          playerId={playerId}
          level={activeLevel}
          onBack={() => {
            setPendingLevelId(activeLevel.id);
            setScreen("level-select");
            setActiveLevel(null);
          }}
          onComplete={() => {}}
        />
      );
    }
  }

  return (
    <LevelSelect
      playerId={playerId}
      playerName={playerName}
      pendingLevelId={pendingLevelId}
      onSelect={(level) => {
        setPendingLevelId(null);
        setActiveLevel(level);
        setScreen("playing");
      }}
      onLeaderboard={() => setScreen("leaderboard")}
      onReset={handleReset}
    />
  );
}
