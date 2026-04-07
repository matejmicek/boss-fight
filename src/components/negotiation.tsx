"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart } from "ai";
import { VcType } from "@/lib/types";

const VC_DISPLAY: Record<VcType, { name: string; color: string }> = {
  visionary: { name: "The Visionary", color: "#6fdb6f" },
  empath: { name: "The Empath", color: "#db6fdb" },
  shark: { name: "The Shark", color: "#db6f6f" },
};

export function Negotiation({
  playerId,
  vcType,
  teamNumber,
  onBack,
  onDealClosed,
}: {
  playerId: string;
  vcType: VcType;
  teamNumber: number;
  onBack: () => void;
  onDealClosed: (valuation: number) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [dealResult, setDealResult] = useState<number | null>(null);
  const [input, setInput] = useState("");

  const vc = VC_DISPLAY[vcType];

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { vcType },
    }),
  });

  async function handleAcceptDeal() {
    if (messages.length < 2) return;
    setClosing(true);

    try {
      const res = await fetch("/api/deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          vcType,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.parts
              .filter(isTextUIPart)
              .map((p) => p.text)
              .join(""),
          })),
        }),
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
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="text-5xl mb-4">🤝</div>
        <h2 className="text-2xl font-bold mb-2">Deal Closed!</h2>
        <div className="text-4xl font-bold mt-2" style={{ color: "#ffd700" }}>
          ${dealResult.toFixed(1)}M
        </div>
        <p className="text-zinc-500 mt-1">pre-money valuation</p>
        <button
          onClick={onBack}
          className="mt-8 px-6 py-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          Back to VCs
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <div
        className="flex justify-between items-center px-4 py-3 border-b"
        style={{ borderColor: vc.color + "30" }}
      >
        <div className="font-bold" style={{ color: vc.color }}>
          {vc.name}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">Team {teamNumber}</span>
          <a
            href="/deck.pdf"
            target="_blank"
            className="text-zinc-500 hover:text-white transition-colors"
          >
            📄 Deck
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 chat-scroll">
        {messages.length === 0 && (
          <p className="text-zinc-600 text-sm text-center mt-8">
            Start the negotiation. The VC is waiting...
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] px-4 py-3 rounded-xl text-sm ${
              m.role === "user"
                ? "ml-auto bg-zinc-800 text-white"
                : "bg-zinc-900 border border-zinc-800"
            }`}
          >
            {m.role === "assistant" && (
              <div
                className="text-xs mb-1 font-semibold"
                style={{ color: vc.color }}
              >
                {vc.name}
              </div>
            )}
            {m.parts.filter(isTextUIPart).map((p, i) => (
              <span key={i}>{p.text}</span>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-800 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) {
              sendMessage({ text: input });
              setInput("");
            }
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            disabled={status === "streaming" || status === "submitted" || closing}
            autoFocus
          />
          <button
            type="submit"
            disabled={status === "streaming" || status === "submitted" || !input.trim() || closing}
            className="px-4 py-2.5 bg-white text-black rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            Send
          </button>
        </form>

        <div className="flex justify-between mt-2 px-1">
          <button
            onClick={onBack}
            className="text-sm transition-colors"
            style={{ color: "#db6f6f" }}
          >
            ✕ Walk away
          </button>
          <button
            onClick={handleAcceptDeal}
            disabled={messages.length < 2 || status === "streaming" || status === "submitted" || closing}
            className="text-sm disabled:opacity-30 transition-colors"
            style={{ color: "#6fdb6f" }}
          >
            {closing ? "Closing..." : "✓ Accept deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
