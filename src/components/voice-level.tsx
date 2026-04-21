"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";
import { createClient } from "@/utils/supabase/client";
import { ScoreReveal } from "./score-reveal";

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
  const [completed, setCompleted] = useState<{ score: number } | null>(null);

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

  // Hang up cleanly on real unmount so ElevenLabs doesn't keep the session
  // alive. We must NOT put `conversation` in the dep array — useConversation()
  // returns a new object identity on every render, which would fire this
  // cleanup on every re-render mid-call and kill the session 4 seconds in.
  const conversationRef = useRef(conversation);
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);
  useEffect(() => {
    return () => {
      const c = conversationRef.current;
      if (c && c.status === "connected") {
        try {
          c.endSession();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // After the call ends, wait for the webhook score to arrive.
  useEffect(() => {
    if (!callEnded) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`vscore-${playerId}-${level.id}-${Date.now()}`)
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
          if (row.level_id === level.id) setCompleted({ score: row.score });
        }
      )
      .subscribe();

    const timeout = setTimeout(() => {
      setCompleted((c) => c ?? { score: -1 });
    }, 25000);

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [callEnded, playerId, level.id]);

  if (completed) {
    if (completed.score < 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 scanlines gap-6">
          <div className="font-pixel text-xs" style={{ color }}>
            SCORE UNAVAILABLE
          </div>
          <p className="text-zinc-500 text-xs max-w-xs text-center">
            The call ended but we never got an evaluation. No attempt burned.
          </p>
          <button
            onClick={onBack}
            className="px-6 py-3 border-2 border-zinc-700 hover:border-zinc-500 transition-colors text-xs pixel-btn font-pixel"
          >
            BACK
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 scanlines">
        <ScoreReveal
          score={completed.score}
          onContinue={() => {
            onComplete(completed.score);
            onBack();
          }}
        />
      </div>
    );
  }

  if (callEnded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 scanlines gap-4">
        <div
          className="font-pixel text-xs animate-pulse"
          style={{ color }}
        >
          ANALYZING CALL...
        </div>
        <p className="text-zinc-500 text-[10px] max-w-xs text-center">
          Marcus is reviewing. Hang tight.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 scanlines">
      <div className="font-pixel text-xs mb-2" style={{ color }}>
        {level.name.toUpperCase()}
      </div>
      <p className="text-zinc-500 text-xs mb-6 text-center">
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
            <p className="text-red-500 text-xs text-center max-w-xs">
              {error}
            </p>
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
