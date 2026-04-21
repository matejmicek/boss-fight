"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";
import { PERSONA_ORDER } from "@/lib/runbook";
import { RunbookResults } from "./runbook-results";

type Phase = "cutscene" | "briefing" | "waiting" | "results" | "error";

interface RunbookForm {
  vision: string;
  arg1: string;
  arg2: string;
  arg3: string;
}

const DRAFT_KEY = "boss-fight-runbook-draft";

export function RunbookLevel({
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
  const [phase, setPhase] = useState<Phase>("cutscene");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [form, setForm] = useState<RunbookForm>(() => {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        try {
          return JSON.parse(raw) as RunbookForm;
        } catch {
          /* ignore */
        }
      }
    }
    return { vision: "", arg1: "", arg2: "", arg3: "" };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  const canSubmit = useMemo(() => {
    return (
      form.vision.trim().length > 0 &&
      form.arg1.trim().length > 0 &&
      form.arg2.trim().length > 0 &&
      form.arg3.trim().length > 0
    );
  }, [form]);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setPhase("waiting");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/runbook/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          levelId: level.id,
          runbook: {
            vision: form.vision.trim(),
            arguments: [form.arg1.trim(), form.arg2.trim(), form.arg3.trim()],
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body?.error ?? `Request failed (${res.status}).`);
        setPhase("error");
        return;
      }
      const data = (await res.json()) as { runId: string };
      window.localStorage.removeItem(DRAFT_KEY);
      setRunId(data.runId);
      setPhase("results");
    } catch (err) {
      console.warn("runbook submit failed:", err);
      setErrorMsg("Network error. Try again.");
      setPhase("error");
    }
  }, [canSubmit, form, level.id, playerId]);

  if (phase === "cutscene") {
    return <Cutscene color={color} onContinue={() => setPhase("briefing")} onBack={onBack} />;
  }

  if (phase === "briefing") {
    return (
      <Briefing
        color={color}
        form={form}
        setForm={setForm}
        canSubmit={canSubmit}
        onSubmit={submit}
        onBack={onBack}
      />
    );
  }

  if (phase === "waiting") {
    return <Waiting color={color} />;
  }

  if (phase === "error") {
    return (
      <ErrorScreen
        color={color}
        message={errorMsg ?? "Something went wrong."}
        onRetry={() => setPhase("briefing")}
        onBack={onBack}
      />
    );
  }

  if (phase === "results" && runId) {
    return (
      <RunbookResults
        runId={runId}
        color={color}
        onComplete={(score) => {
          onComplete(score);
          onBack();
        }}
      />
    );
  }

  return null;
}

// ---------- Cutscene ----------

type Speaker = "JAMIE" | "YOU";
type Line = { from: Speaker; text: string };

// Jamie (junior associate) is on the left, panicking. The founder (YOU) is on
// the right, reassuring from wherever they are.
const CUTSCENE_LINES: ReadonlyArray<Line> = [
  { from: "JAMIE", text: "wait. WAIT." },
  { from: "JAMIE", text: "the 2pm VCs. you want ME to take them??" },
  { from: "JAMIE", text: "i've been here 8 weeks" },
  { from: "YOU", text: "jamie. breathe." },
  { from: "YOU", text: "i'll send you a runbook. just stick to it." },
  { from: "JAMIE", text: "WHAT RUNBOOK" },
  { from: "YOU", text: "the one i'm about to send you." },
];

// Pacing: short pause before typing starts, longer "typing" for longer msgs
// so short panicked bursts feel snappy and longer reassurances feel deliberate.
function typingDurationMs(text: string): number {
  return Math.min(1600, 400 + text.length * 22);
}

function Cutscene({
  color,
  onContinue,
  onBack,
}: {
  color: string;
  onContinue: () => void;
  onBack: () => void;
}) {
  // visibleCount = number of committed message bubbles on screen.
  // typing = the speaker currently "typing" the next message, or null.
  const [visibleCount, setVisibleCount] = useState(0);
  const [typing, setTyping] = useState<Speaker | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Drive the reveal sequence: show typing indicator → pause → commit message.
  useEffect(() => {
    if (visibleCount >= CUTSCENE_LINES.length) return;
    const next = CUTSCENE_LINES[visibleCount];
    const gap = visibleCount === 0 ? 200 : 350;
    const typingAt = setTimeout(() => setTyping(next.from), gap);
    const revealAt = setTimeout(() => {
      setTyping(null);
      setVisibleCount((c) => c + 1);
    }, gap + typingDurationMs(next.text));
    return () => {
      clearTimeout(typingAt);
      clearTimeout(revealAt);
    };
  }, [visibleCount]);

  // Keep the latest bubble in view as new ones arrive.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleCount, typing]);

  const done = visibleCount >= CUTSCENE_LINES.length && !typing;

  return (
    <div className="min-h-screen p-6 scanlines flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <button
          onClick={onBack}
          className="font-pixel text-[10px] text-zinc-500 hover:text-white transition-colors"
        >
          [ BACK ]
        </button>
        <div className="font-pixel text-[10px]" style={{ color }}>
          LEVEL 3 · THE RUNBOOK
        </div>
      </div>

      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center">
        <div className="font-pixel text-[10px] text-zinc-500 mb-3 text-center">
          1:47 PM · SMS
        </div>
        <div className="space-y-2 min-h-[340px]">
          {CUTSCENE_LINES.slice(0, visibleCount).map((l, i) => (
            <Bubble key={i} line={l} />
          ))}
          {typing && <TypingBubble from={typing} />}
          <div ref={endRef} />
        </div>

        <button
          onClick={onContinue}
          disabled={!done}
          className="mt-8 w-full py-3 font-pixel text-xs pixel-btn disabled:opacity-30"
          style={{
            background: done ? color : "#222",
            color: done ? "#000" : "#888",
          }}
        >
          {done ? "BRIEF JAMIE →" : "..."}
        </button>
      </div>
    </div>
  );
}

function Bubble({ line }: { line: Line }) {
  const mine = line.from === "YOU";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} bubble-in`}>
      <div
        className={`max-w-[75%] px-3 py-2 text-sm leading-snug ${
          mine
            ? "bg-white text-black"
            : "bg-zinc-900 text-white border border-zinc-800"
        }`}
      >
        <div className="font-pixel text-[8px] opacity-60 mb-1">{line.from}</div>
        {line.text}
      </div>
    </div>
  );
}

function TypingBubble({ from }: { from: Speaker }) {
  const mine = from === "YOU";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} bubble-in`}>
      <div
        className={`px-3 py-2 ${
          mine
            ? "bg-white text-black"
            : "bg-zinc-900 text-white border border-zinc-800"
        }`}
      >
        <div className="font-pixel text-[8px] opacity-60 mb-1">{from}</div>
        <div className="flex gap-1 items-end h-3">
          <span
            className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Briefing (runbook form) ----------

function Briefing({
  color,
  form,
  setForm,
  canSubmit,
  onSubmit,
  onBack,
}: {
  color: string;
  form: RunbookForm;
  setForm: (updater: (f: RunbookForm) => RunbookForm) => void;
  canSubmit: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen p-6 scanlines flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={onBack}
          className="font-pixel text-[10px] text-zinc-500 hover:text-white transition-colors"
        >
          [ BACK ]
        </button>
        <div className="font-pixel text-[10px]" style={{ color }}>
          THE RUNBOOK
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full flex-1 flex flex-col">
        <div className="border-2 p-3 mb-6" style={{ borderColor: color + "60" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 flex items-center justify-center font-pixel text-lg"
              style={{ background: color, color: "#000" }}
            >
              J
            </div>
            <div>
              <div className="font-pixel text-xs" style={{ color }}>
                JAMIE PARK
              </div>
              <div className="text-[11px] text-zinc-500 italic">
                Your junior associate. Eager, literal, MBA-fresh. Will follow your
                runbook to the letter.
              </div>
            </div>
          </div>
        </div>

        <p className="text-zinc-400 text-sm mb-6">
          You have 3 VC calls booked at 2pm. Jamie will cover all three. Brief
          them now.
        </p>

        <div className="space-y-5">
          <Field
            label="VISION (one sentence)"
            hint="What Jamie should say when a VC asks 'what are you building?'"
            value={form.vision}
            maxLength={180}
            onChange={(v) => setForm((f) => ({ ...f, vision: v }))}
          />
          <Field
            label="ARGUMENT 1 — LEAD WITH THIS"
            hint="The single strongest thing about the company."
            value={form.arg1}
            maxLength={200}
            onChange={(v) => setForm((f) => ({ ...f, arg1: v }))}
          />
          <Field
            label="ARGUMENT 2"
            value={form.arg2}
            maxLength={200}
            onChange={(v) => setForm((f) => ({ ...f, arg2: v }))}
          />
          <Field
            label="ARGUMENT 3"
            value={form.arg3}
            maxLength={200}
            onChange={(v) => setForm((f) => ({ ...f, arg3: v }))}
          />
        </div>

        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="mt-8 w-full py-3 font-pixel text-xs pixel-btn"
          style={{
            background: canSubmit ? color : "#222",
            color: canSubmit ? "#000" : "#888",
          }}
        >
          SEND JAMIE IN →
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  maxLength: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="font-pixel text-[10px] text-zinc-400 mb-1 block">
        {label}
      </label>
      {hint && (
        <div className="text-[11px] text-zinc-500 italic mb-2">{hint}</div>
      )}
      <textarea
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-white outline-none text-white text-sm resize-none"
      />
      <div className="text-[10px] text-zinc-600 mt-1 text-right">
        {value.length}/{maxLength}
      </div>
    </div>
  );
}

// ---------- Waiting ----------

function Waiting({ color }: { color: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 700);
    return () => clearInterval(i);
  }, []);

  const statusLines = [
    "Jamie is walking into the lobby…",
    "Pleasantries. Coffee. Small talk.",
    "Running through your arguments…",
    "Getting grilled on numbers…",
    "Pushing back on the anchor…",
    "Closing the call…",
  ];
  const statusIdx = Math.floor(tick / 4) % statusLines.length;

  return (
    <div className="min-h-screen p-6 scanlines flex flex-col items-center justify-center">
      <div className="font-pixel text-xs mb-8" style={{ color }}>
        JAMIE IS IN MEETINGS
      </div>

      <div className="flex gap-6 mb-8">
        {PERSONA_ORDER.map((pid, i) => {
          const active = (tick % PERSONA_ORDER.length) === i;
          return (
            <div
              key={pid}
              className="w-20 h-20 border-2 flex items-center justify-center font-pixel text-3xl transition-all"
              style={{
                borderColor: active ? color : "#333",
                color: active ? color : "#444",
                transform: active ? "scale(1.08)" : "scale(1)",
              }}
            >
              VC {String.fromCharCode(65 + i)}
            </div>
          );
        })}
      </div>

      <div className="font-pixel text-[10px] text-zinc-500 text-center max-w-sm min-h-[2em]">
        {statusLines[statusIdx]}
      </div>
      <div className="text-[10px] text-zinc-700 mt-6">
        (This usually takes 20–40 seconds.)
      </div>
    </div>
  );
}

// ---------- Error ----------

function ErrorScreen({
  color,
  message,
  onRetry,
  onBack,
}: {
  color: string;
  message: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen p-6 scanlines flex flex-col items-center justify-center">
      <div className="font-pixel text-sm mb-2" style={{ color: "#db6f6f" }}>
        SOMETHING WENT WRONG
      </div>
      <div className="text-zinc-400 text-sm mb-8 max-w-sm text-center">
        {message}
      </div>
      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="px-4 py-2 font-pixel text-xs text-zinc-400 border border-zinc-700 pixel-btn"
        >
          BACK
        </button>
        <button
          onClick={onRetry}
          className="px-4 py-2 font-pixel text-xs pixel-btn"
          style={{ background: color, color: "#000" }}
        >
          RETRY
        </button>
      </div>
    </div>
  );
}
