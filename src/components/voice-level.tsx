"use client";

import { useState, useEffect, useCallback } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";
import { createClient } from "@/utils/supabase/client";

export function VoiceLevel(props: {
  playerId: string;
  level: Level;
  onBack: () => void;
  onComplete: (score: number) => void;
}) {
  return (
    <ConversationProvider>
      <VoiceLevelInner {...props} />
    </ConversationProvider>
  );
}

function VoiceLevelInner({
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
  const agentId = level.config.elevenlabs_agent_id as string;
  const [completed, setCompleted] = useState<{ score: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const conversation = useConversation({
    onError: (err) => setError(typeof err === "string" ? err : "Voice connection failed"),
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`voice-score-${playerId}-${level.id}`)
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
          if (row.level_id === level.id) {
            setCompleted({ score: row.score });
            conversation.endSession();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId, level.id, conversation]);

  const startCall = useCallback(async () => {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({
        agentId,
        connectionType: "webrtc",
        dynamicVariables: {
          player_id: playerId,
          level_id: String(level.id),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start call");
    }
  }, [agentId, conversation, playerId, level.id]);

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 scanlines">
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
    <div className="flex flex-col items-center justify-center min-h-screen p-6 scanlines">
      <div className="font-pixel text-xs mb-2" style={{ color }}>
        {level.name.toUpperCase()}
      </div>
      <p className="text-zinc-500 text-xs mb-8 text-center">
        {level.description}
      </p>

      {conversation.status === "connected" ? (
        <div className="flex flex-col items-center gap-6">
          <div
            className="w-24 h-24 border-2 flex items-center justify-center"
            style={{ borderColor: color }}
          >
            <div
              className={`w-4 h-4 rounded-full ${
                conversation.isSpeaking ? "animate-pulse" : ""
              }`}
              style={{ backgroundColor: color }}
            />
          </div>
          <p className="font-pixel text-[10px] text-zinc-400">
            {conversation.isSpeaking ? "PARTNER SPEAKING" : "LISTENING..."}
          </p>
          <button
            onClick={() => conversation.endSession()}
            className="px-6 py-3 border-2 border-red-800 text-red-400 hover:border-red-600 transition-colors text-xs pixel-btn font-pixel"
          >
            END CALL
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={startCall}
            className="px-8 py-4 border-2 transition-colors text-sm pixel-btn font-pixel"
            style={{ borderColor: color + "60", color }}
          >
            START CALL
          </button>
          {error && (
            <p className="text-red-500 text-xs text-center max-w-xs">{error}</p>
          )}
        </div>
      )}

      <button
        onClick={onBack}
        className="mt-8 font-pixel text-[10px] text-zinc-600 hover:text-white transition-colors"
      >
        [ BACK ]
      </button>
    </div>
  );
}
