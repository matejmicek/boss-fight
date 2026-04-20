"use client";

import { useEffect, useState } from "react";
import { PERSONAS, PERSONA_ORDER, type PersonaId } from "@/lib/runbook";

interface Negotiation {
  persona_id: PersonaId;
  messages: { role: "associate" | "vc"; text: string }[];
  offer_m: number | null;
  walked: boolean;
  end_reason: string;
}

interface VcScore {
  persona_id: PersonaId;
  persona_name: string;
  offer_m: number | null;
  walked: boolean;
  points: number;
  reason: string;
}

interface Outcome {
  vcs: VcScore[];
  aggregate_score: number;
}

interface Run {
  id: string;
  negotiations: Negotiation[];
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
  const [openIdx, setOpenIdx] = useState<number | null>(null);
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

  const { outcome, negotiations } = run;

  const byPersona = new Map<PersonaId, Negotiation>();
  for (const n of negotiations) byPersona.set(n.persona_id, n);

  const ordered = PERSONA_ORDER.map((pid) => {
    const neg = byPersona.get(pid);
    const score = outcome.vcs.find((v) => v.persona_id === pid);
    return { pid, neg, score };
  });

  const revealPersona = (pid: PersonaId) => {
    setRevealed((r) => new Set(r).add(pid));
  };

  return (
    <div className="min-h-screen p-4 scanlines flex flex-col">
      <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col">
        <div className="text-center mb-6">
          <div className="font-pixel text-[10px] text-zinc-500 mb-1">
            JAMIE IS BACK
          </div>
          <div className="font-pixel text-lg" style={{ color }}>
            THE DEBRIEF
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {ordered.map(({ pid, neg, score }, i) => (
            <VcCard
              key={pid}
              index={i}
              personaId={pid}
              negotiation={neg}
              vcScore={score}
              revealed={revealed.has(pid)}
              expanded={openIdx === i}
              color={color}
              onReveal={() => revealPersona(pid)}
              onToggle={() => setOpenIdx(openIdx === i ? null : i)}
            />
          ))}
        </div>

        <div className="border-2 p-5 mb-6 text-center" style={{ borderColor: "#ffd700" }}>
          <div className="font-pixel text-[10px] text-zinc-500 mb-1">
            FINAL SCORE
          </div>
          <div className="font-pixel text-4xl" style={{ color: "#ffd700" }}>
            {outcome.aggregate_score}/10
          </div>
          <div className="text-[11px] text-zinc-500 mt-2 italic">
            {verdictLine(outcome)}
          </div>
        </div>

        <button
          onClick={() => onComplete(outcome.aggregate_score)}
          className="w-full py-3 font-pixel text-xs pixel-btn"
          style={{ background: color, color: "#000" }}
        >
          CONTINUE →
        </button>
      </div>
    </div>
  );
}

function verdictLine(outcome: Outcome): string {
  const deals = outcome.vcs.filter((v) => !v.walked).length;
  if (deals === 0) return "Jamie came back empty-handed.";
  if (deals === 3) return "Three for three. Brief of the year.";
  if (deals === 2) return "Two offers. Not a bad afternoon.";
  return "One offer. Something to work with.";
}

function VcCard({
  index,
  personaId,
  negotiation,
  vcScore,
  revealed,
  expanded,
  color,
  onReveal,
  onToggle,
}: {
  index: number;
  personaId: PersonaId;
  negotiation: Negotiation | undefined;
  vcScore: VcScore | undefined;
  revealed: boolean;
  expanded: boolean;
  color: string;
  onReveal: () => void;
  onToggle: () => void;
}) {
  const persona = PERSONAS[personaId];
  const vcLetter = String.fromCharCode(65 + index);
  const walked = vcScore?.walked ?? true;
  const offer = vcScore?.offer_m;

  return (
    <div
      className="border-2 flex flex-col"
      style={{ borderColor: (revealed ? persona.tintColor : "#333") + "80" }}
    >
      <button
        onClick={onToggle}
        className="p-3 text-left hover:bg-zinc-950 transition-colors"
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
          <div className="text-right">
            {walked ? (
              <div className="font-pixel text-xs" style={{ color: "#db6f6f" }}>
                WALK
              </div>
            ) : (
              <div className="font-pixel text-sm" style={{ color: "#ffd700" }}>
                ${offer}M
              </div>
            )}
          </div>
        </div>
        {vcScore && (
          <div className="text-[11px] text-zinc-500 italic mt-2 leading-snug">
            {vcScore.reason}
          </div>
        )}
      </button>

      {expanded && negotiation && (
        <div className="border-t border-zinc-800 px-3 py-3 bg-black">
          {!revealed && (
            <button
              onClick={onReveal}
              className="w-full mb-3 py-1.5 text-[10px] font-pixel border border-zinc-700 hover:border-white transition-colors"
              style={{ color }}
            >
              REVEAL WHO VC {vcLetter} WAS
            </button>
          )}

          {revealed && (
            <div className="mb-3 text-[11px] text-zinc-400 italic leading-snug">
              {persona.oneLiner}. {persona.bio}
            </div>
          )}

          <TranscriptReplay
            messages={negotiation.messages}
            persona={persona}
            revealed={revealed}
            onFinish={() => {
              if (!revealed) onReveal();
            }}
          />
        </div>
      )}
    </div>
  );
}

function TranscriptReplay({
  messages,
  persona,
  revealed,
  onFinish,
}: {
  messages: Negotiation["messages"];
  persona: (typeof PERSONAS)[PersonaId];
  revealed: boolean;
  onFinish: () => void;
}) {
  const [shown, setShown] = useState(1);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    setShown(1);
    setPlaying(true);
  }, [messages]);

  useEffect(() => {
    if (!playing) return;
    if (shown >= messages.length) {
      onFinish();
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setShown((n) => Math.min(messages.length, n + 1)), 1200);
    return () => clearTimeout(t);
  }, [shown, playing, messages.length, onFinish]);

  return (
    <div>
      <div className="space-y-2 max-h-[320px] overflow-y-auto chat-scroll pr-1">
        {messages.slice(0, shown).map((m, i) => {
          const isAssoc = m.role === "associate";
          const label = isAssoc ? "JAMIE" : revealed ? persona.name.toUpperCase() : "VC";
          return (
            <div key={i} className={`flex ${isAssoc ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[82%] px-3 py-2 text-[12px] leading-snug ${
                  isAssoc
                    ? "bg-zinc-900 border border-zinc-800 text-zinc-200"
                    : "bg-white text-black"
                }`}
              >
                <div className="font-pixel text-[8px] opacity-60 mb-1">
                  {label}
                </div>
                {m.text}
              </div>
            </div>
          );
        })}
      </div>
      {shown < messages.length && (
        <button
          onClick={() => {
            setShown(messages.length);
            setPlaying(false);
            onFinish();
          }}
          className="mt-2 w-full py-1 text-[10px] font-pixel text-zinc-500 hover:text-white transition-colors"
        >
          [ SKIP ]
        </button>
      )}
    </div>
  );
}
