"use client";

import { useState } from "react";
import {
  AssistantRuntimeProvider,
  useAssistantRuntime,
} from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { VcType } from "@/lib/types";
import { getVcSystemPrompt, VC_INFO } from "@/lib/vc-prompts";

export function Negotiation({
  playerId,
  vcType,
  onBack,
  onDealClosed,
}: {
  playerId: string;
  vcType: VcType;
  onBack: () => void;
  onDealClosed: (valuation: number) => void;
}) {
  const vc = VC_INFO[vcType];
  const systemPrompt = getVcSystemPrompt(vcType);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: { system: systemPrompt },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-screen">
        <div
          className="flex justify-between items-center px-4 py-3 border-b-2"
          style={{ borderColor: vc.color + "60" }}
        >
          <div className="font-pixel text-xs" style={{ color: vc.color }}>
            {vc.name.toUpperCase()}
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

        <NegotiationFooter
          playerId={playerId}
          vcType={vcType}
          onBack={onBack}
          onDealClosed={onDealClosed}
          vcColor={vc.color}
        />
      </div>
    </AssistantRuntimeProvider>
  );
}

function NegotiationFooter({
  playerId,
  vcType,
  onBack,
  onDealClosed,
  vcColor,
}: {
  playerId: string;
  vcType: VcType;
  onBack: () => void;
  onDealClosed: (valuation: number) => void;
  vcColor: string;
}) {
  const runtime = useAssistantRuntime();
  const [closing, setClosing] = useState(false);
  const [dealResult, setDealResult] = useState<number | null>(null);

  async function handleAcceptDeal() {
    const threadState = runtime.thread.getState();
    const msgs = threadState.messages;

    if (msgs.length < 2) return;
    setClosing(true);

    const formatted = msgs.map((m) => ({
      role: m.role,
      content: m.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(""),
    }));

    try {
      const res = await fetch("/api/deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, vcType, messages: formatted }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to close deal");
        setClosing(false);
        return;
      }

      const data = await res.json();
      setDealResult(data.valuation);
      onDealClosed(data.valuation);
    } catch {
      alert("Connection failed");
      setClosing(false);
    }
  }

  if (dealResult !== null) {
    return (
      <div className="flex flex-col items-center justify-center p-6">
        <div className="font-pixel text-2xl mb-4" style={{ color: "#ffd700" }}>DEAL!</div>
        <div className="text-4xl font-bold" style={{ color: "#ffd700" }}>
          ${dealResult.toFixed(1)}M
        </div>
        <p className="text-zinc-500 mt-1 text-sm">pre-money valuation</p>
        <button
          onClick={onBack}
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
      <button
        onClick={handleAcceptDeal}
        disabled={closing}
        className="font-pixel text-sm disabled:opacity-30 transition-colors"
        style={{ color: vcColor }}
      >
        {closing ? "CLOSING..." : "DEAL!"}
      </button>
    </div>
  );
}
