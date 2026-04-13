"use client";

import { useState } from "react";

export function Lobby({
  onJoin,
}: {
  onJoin: (playerId: string, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin() {
    if (!name.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to join");
        return;
      }

      const data = await res.json();
      onJoin(data.id, data.name);
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 scanlines">
      <h1 className="font-pixel text-3xl mb-2 text-white">BOSS FIGHT</h1>
      <p className="font-pixel text-[10px] text-zinc-500 mb-10 tracking-wider">
        VC TERM SHEET NEGOTIATION
      </p>

      <div className="w-full max-w-xs space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="ENTER YOUR NAME"
          className="w-full px-4 py-3 bg-zinc-900 border-2 border-zinc-700 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400"
          disabled={loading}
          autoFocus
        />

        <button
          onClick={handleJoin}
          disabled={loading || !name.trim()}
          className="w-full py-3 bg-white text-black font-pixel text-xs pixel-btn"
        >
          {loading ? "JOINING..." : "START GAME"}
        </button>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}

        <a
          href="/deck.pdf"
          target="_blank"
          className="block text-center text-zinc-500 hover:text-white transition-colors text-xs mt-4"
        >
          [ VIEW STARTUP DECK ]
        </a>
      </div>
    </div>
  );
}
