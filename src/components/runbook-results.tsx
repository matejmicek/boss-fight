"use client";

import { useEffect, useState } from "react";
import { PERSONAS, PERSONA_ORDER, type PersonaId } from "@/lib/runbook";

interface VcResult {
  persona_id: PersonaId;
  persona_name: string;
  valuation_m: number;
  reasoning: string;
}

interface Outcome {
  vcs: VcResult[];
}

interface Run {
  id: string;
  outcome: Outcome | null;
  status: string;
}

export function RunbookResults({
  runId,
  color,
  onComplete,
}: {
  runId: string;
  color: string;
  onComplete: (score: number) => void;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [revealed, setRevealed] = useState<Set<PersonaId>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runbook/run/${runId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setRun(data);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (!run || !run.outcome) {
    return (
      <div className="min-h-screen p-6 scanlines flex items-center justify-center">
        <div className="font-pixel text-xs text-zinc-500 animate-pulse">
          LOADING DEBRIEF...
        </div>
      </div>
    );
  }

  const { outcome } = run;
  const byPersona = new Map<PersonaId, VcResult>();
  for (const v of outcome.vcs) byPersona.set(v.persona_id, v);

  const reveal = (pid: PersonaId) =>
    setRevealed((r) => new Set(r).add(pid));

  return (
    <div className="min-h-screen p-4 scanlines flex flex-col">
      <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col">
        <div className="text-center mb-6">
          <div className="font-pixel text-[10px] text-zinc-500 mb-1">
            JAMIE IS BACK
          </div>
          <div className="font-pixel text-lg" style={{ color }}>
            THREE OFFERS
          </div>
          <div className="text-[11px] text-zinc-500 mt-2 italic max-w-md mx-auto">
            Jamie took your runbook into three VC calls. Here&apos;s what
            they came back with.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {PERSONA_ORDER.map((pid, i) => {
            const result = byPersona.get(pid);
            if (!result) return null;
            return (
              <VcCard
                key={pid}
                index={i}
                personaId={pid}
                result={result}
                revealed={revealed.has(pid)}
                color={color}
                onReveal={() => reveal(pid)}
              />
            );
          })}
        </div>

        <button
          onClick={() => onComplete(0)}
          className="w-full py-3 font-pixel text-xs pixel-btn"
          style={{ background: color, color: "#000" }}
        >
          CONTINUE →
        </button>
      </div>
    </div>
  );
}

function VcCard({
  index,
  personaId,
  result,
  revealed,
  color,
  onReveal,
}: {
  index: number;
  personaId: PersonaId;
  result: VcResult;
  revealed: boolean;
  color: string;
  onReveal: () => void;
}) {
  const persona = PERSONAS[personaId];
  const vcLetter = String.fromCharCode(65 + index);

  return (
    <div
      className="border-2 flex flex-col p-4 gap-3"
      style={{ borderColor: (revealed ? persona.tintColor : "#333") + "80" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 flex items-center justify-center font-pixel text-lg flex-shrink-0"
          style={{
            background: revealed ? persona.tintColor : "#222",
            color: revealed ? "#000" : "#888",
          }}
        >
          {revealed ? persona.portraitChar : vcLetter}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[10px] text-zinc-500 mb-0.5">
            {revealed ? persona.firm.toUpperCase() : `VC ${vcLetter}`}
          </div>
          <div
            className="font-pixel text-xs truncate"
            style={{ color: revealed ? persona.tintColor : "#aaa" }}
          >
            {revealed ? persona.name : "???"}
          </div>
        </div>
      </div>

      <div className="text-center border-t border-zinc-800 pt-3">
        <div className="font-pixel text-[9px] text-zinc-500 mb-1">
          POST-MONEY
        </div>
        <div className="font-pixel text-3xl" style={{ color: "#ffd700" }}>
          ${result.valuation_m}M
        </div>
      </div>

      <div className="text-[11px] text-zinc-400 italic leading-snug">
        &ldquo;{result.reasoning}&rdquo;
      </div>

      {revealed ? (
        <div className="text-[10px] text-zinc-500 leading-snug mt-auto">
          {persona.oneLiner}. {persona.bio}
        </div>
      ) : (
        <button
          onClick={onReveal}
          className="mt-auto w-full py-1.5 text-[10px] font-pixel border border-zinc-700 hover:border-white transition-colors"
          style={{ color }}
        >
          REVEAL WHO VC {vcLetter} WAS
        </button>
      )}
    </div>
  );
}
