"use client";

import { useState, useEffect } from "react";
import {
  AssistantRuntimeProvider,
  useAssistantRuntime,
} from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";
import { createClient } from "@/utils/supabase/client";

export function ChatLevel({
  playerId,
  level,
  onBack,
  onComplete,
}: {
  playerId: string;
  level: Level;
  onBack: () => void;
  onComplete: (score: number) => void;
}) {
  const color = getLevelColor(level);
  const systemPrompt = level.config.system_prompt || "";

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: {
        system: systemPrompt,
        levelId: level.id,
        playerId,
      },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-screen">
        <div
          className="flex justify-between items-center px-4 py-3 border-b-2"
          style={{ borderColor: color + "60" }}
        >
          <div className="font-pixel text-xs" style={{ color }}>
            {level.name.toUpperCase()}
          </div>
          <a
            href="/deck.pdf"
            target="_blank"
            className="text-zinc-500 hover:text-white transition-colors text-xs"
          >
            [ DECK ]
          </a>
        </div>

        <div className="flex-1 overflow-hidden">
          <Thread />
        </div>

        <ChatLevelFooter
          playerId={playerId}
          levelId={level.id}
          color={color}
          onBack={onBack}
          onComplete={onComplete}
        />
      </div>
    </AssistantRuntimeProvider>
  );
}

function ChatLevelFooter({
  playerId,
  levelId,
  color,
  onBack,
  onComplete,
}: {
  playerId: string;
  levelId: number;
  color: string;
  onBack: () => void;
  onComplete: (score: number) => void;
}) {
  const runtime = useAssistantRuntime();
  const [completed, setCompleted] = useState<{ score: number } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`score-${playerId}-${levelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scores",
          filter: `player_id=eq.${playerId}`,
        },
        (payload) => {
          const row = payload.new as { level_id: number; score: number };
          if (row.level_id === levelId) {
            setCompleted({ score: row.score });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId, levelId]);

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border-t border-zinc-800">
        <div className="font-pixel text-xl mb-2" style={{ color: "#ffd700" }}>
          LEVEL COMPLETE
        </div>
        <div className="text-4xl font-bold" style={{ color: "#ffd700" }}>
          {completed.score}/10
        </div>
        <button
          onClick={() => {
            onComplete(completed.score);
            onBack();
          }}
          className="mt-6 px-6 py-3 border-2 border-zinc-700 hover:border-zinc-500 transition-colors text-xs pixel-btn"
        >
          CONTINUE
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-between px-4 py-2 border-t border-zinc-800">
      <button
        onClick={onBack}
        className="font-pixel text-sm transition-colors"
        style={{ color: "#db6f6f" }}
      >
        QUIT
      </button>
      <div className="font-pixel text-[10px] text-zinc-600" style={{ color: color + "80" }}>
        CONVINCE THEM
      </div>
    </div>
  );
}
