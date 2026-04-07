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
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <div className="text-5xl mb-2">⚔️</div>
      <h1 className="text-4xl font-bold mb-2">Boss Fight</h1>
      <p className="text-zinc-500 mb-8">VC Term Sheet Negotiation Game</p>

      <div className="w-full max-w-xs space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="Your name"
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          disabled={loading}
          autoFocus
        />

        <button
          onClick={handleJoin}
          disabled={loading || !name.trim()}
          className="w-full py-3 bg-white text-black rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-200 transition-colors"
        >
          {loading ? "Joining..." : "Join Game"}
        </button>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <a
          href="/deck.pdf"
          target="_blank"
          className="block text-center text-zinc-500 hover:text-white transition-colors text-sm mt-4"
        >
          📄 View Startup Deck
        </a>
      </div>
    </div>
  );
}
