"use client";

import { useState, useEffect } from "react";
import { Level } from "@/lib/types";
import { Lobby } from "@/components/lobby";
import { LevelSelect } from "@/components/level-select";
import { ChatLevel } from "@/components/chat-level";
import { VoiceLevel } from "@/components/voice-level";
import { RunbookLevel } from "@/components/runbook-level";
import { HowToPlay } from "@/components/how-to-play";

type Screen = "level-select" | "playing";

const HOWTO_FLAG = "boss-fight-seen-howto";

export default function Home() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("level-select");
  const [activeLevel, setActiveLevel] = useState<Level | null>(null);
  const [pendingLevelId, setPendingLevelId] = useState<number | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);

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
    if (!localStorage.getItem(HOWTO_FLAG)) {
      setShowHowTo(true);
    }
  }

  function handleDismissHowTo() {
    localStorage.setItem(HOWTO_FLAG, "1");
    setShowHowTo(false);
  }

  function handleReset() {
    localStorage.removeItem("boss-fight-player");
    localStorage.removeItem(HOWTO_FLAG);
    setPlayerId(null);
    setPlayerName(null);
    setScreen("level-select");
    setActiveLevel(null);
    setPendingLevelId(null);
    setShowHowTo(false);
  }

  if (!playerId) {
    return <Lobby onJoin={handleJoin} />;
  }

  if (showHowTo) {
    return (
      <HowToPlay
        playerName={playerName ?? ""}
        onContinue={handleDismissHowTo}
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

    if (activeLevel.type === "negotiation") {
      return (
        <RunbookLevel
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
      onReset={handleReset}
    />
  );
}
