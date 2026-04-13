"use client";

import { useState, useEffect, useCallback } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";

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
  const [error, setError] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);

  const conversation = useConversation({
    onConnect: () => setError(null),
    onDisconnect: () => {
      setCallEnded(true);
    },
    onError: (err) => console.warn("ElevenLabs error:", err),
  });


  const startCall = useCallback(async () => {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      await conversation.startSession({
        agentId,
        connectionType: "websocket",
        dynamicVariables: {
          player_id: playerId,
          level_id: String(level.id),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start call");
    }
  }, [agentId, conversation, playerId, level.id]);

  // When the call ends (user or agent hangs up), go back to level select
  // The score will arrive via webhook -> supabase -> realtime on level select
  useEffect(() => {
    if (callEnded) {
      onBack();
    }
  }, [callEnded, onBack]);

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
      ) : conversation.status === "connecting" ? (
        <div className="flex flex-col items-center gap-4">
          <div className="font-pixel text-xs" style={{ color }}>
            CONNECTING...
          </div>
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
