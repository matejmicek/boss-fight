"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import {
  AssistantRuntimeProvider,
  useAuiState,
} from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";
import { createClient } from "@/utils/supabase/client";
import { CoachHint } from "./coach-hint";

export function ChatLevel(props: {
  playerId: string;
  level: Level;
  onBack: () => void;
  onComplete: (score: number) => void;
}) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/conversations/active?playerId=${props.playerId}&levelId=${props.level.id}`
    )
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (cancelled) return;
        const msgs = Array.isArray(d?.messages) ? d.messages : [];
        setInitialMessages(msgs as UIMessage[]);
      })
      .catch(() => {
        if (!cancelled) setInitialMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [props.playerId, props.level.id]);

  if (initialMessages === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="font-pixel text-xs text-zinc-500 animate-pulse">
          LOADING...
        </p>
      </div>
    );
  }

  return <ChatLevelInner {...props} initialMessages={initialMessages} />;
}

function ChatLevelInner({
  playerId,
  level,
  onBack,
  onComplete,
  initialMessages,
}: {
  playerId: string;
  level: Level;
  onBack: () => void;
  onComplete: (score: number) => void;
  initialMessages: UIMessage[];
}) {
  const color = getLevelColor(level);
  const systemPrompt = level.config.system_prompt || "";
  const opener = level.config.opener || "";
  const coachRole =
    (level.config.coach_role as string | undefined) === "partner"
      ? "partner"
      : "analyst";

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        body: { system: systemPrompt, levelId: level.id, playerId },
      }),
    [systemPrompt, level.id, playerId]
  );

  const seededMessages = useMemo<UIMessage[]>(() => {
    if (initialMessages.length > 0 || !opener) return initialMessages;
    return [
      {
        id: "opener-seed",
        role: "assistant",
        parts: [{ type: "text", text: opener }],
      } as UIMessage,
    ];
  }, [initialMessages, opener]);

  const runtime = useChatRuntime({
    messages: seededMessages,
    transport,
  });

  const [hint, setHint] = useState<string | null>(null);

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
          <div className="flex items-center gap-4">
            <a
              href="/deck"
              target="_blank"
              className="text-zinc-500 hover:text-white transition-colors text-xs"
            >
              [ DECK ]
            </a>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-zinc-900 flex justify-center">
          <CoachHint hint={hint} color={color} />
        </div>

        <ConversationWatcher coachRole={coachRole} onHint={setHint} />

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

type AuiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: ReadonlyArray<{ type: string; text?: string }>;
};

function extractText(msg: AuiMessage): string {
  return msg.content
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join(" ")
    .trim();
}

function ConversationWatcher({
  coachRole,
  onHint,
}: {
  coachRole: "analyst" | "partner";
  onHint: (h: string) => void;
}) {
  const messages = useAuiState(
    (s) => s.thread.messages as unknown as ReadonlyArray<AuiMessage>
  );
  const isRunning = useAuiState(
    (s) => (s.thread as unknown as { isRunning?: boolean }).isRunning ?? false
  );
  const lastCoachedKeyRef = useRef<string | null>(null);
  const coachInFlightRef = useRef(false);

  useEffect(() => {
    if (!messages) return;

    const transcript = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        text: extractText(m),
      }))
      .filter((t) => t.text);

    const last = messages[messages.length - 1];
    const founderTurn = !last || last.role === "assistant";
    // Don't fire mid-stream: wait for the assistant to finish so the coach
    // sees the VC's complete question, not a partial prefix.
    const coachKey =
      founderTurn && !isRunning ? (last?.id ?? "__opening__") : null;

    if (
      coachKey &&
      coachKey !== lastCoachedKeyRef.current &&
      !coachInFlightRef.current
    ) {
      lastCoachedKeyRef.current = coachKey;
      coachInFlightRef.current = true;
      fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: coachRole, transcript }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.hint === "string") onHint(d.hint);
        })
        .catch(() => {
          /* ignore */
        })
        .finally(() => {
          coachInFlightRef.current = false;
        });
    }
  }, [messages, isRunning, coachRole, onHint]);

  return null;
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
  const [completed, setCompleted] = useState(false);

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
          const row = payload.new as { level_id: number };
          if (row.level_id === levelId) {
            setCompleted(true);
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
        <div
          className="font-pixel text-xl mb-2"
          style={{ color: "#ffd700" }}
        >
          LEVEL COMPLETE
        </div>
        <div className="text-zinc-500 text-xs text-center max-w-sm">
          Final rankings will be revealed at the end of the event.
        </div>
        <button
          onClick={() => {
            onComplete(0);
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
      <div
        className="font-pixel text-[10px] text-zinc-600"
        style={{ color: color + "80" }}
      >
        CONVINCE THEM
      </div>
    </div>
  );
}
