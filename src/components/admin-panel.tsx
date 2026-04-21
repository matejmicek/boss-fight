"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Level } from "@/lib/types";
import { getLevelColor } from "@/lib/levels";

interface ScoreRow {
  id: string;
  score: number;
  justification: string | null;
  created_at: string;
  player_id?: string;
  level_id?: number;
  players: { name: string };
  levels: { name: string };
}

interface LevelResult {
  level_id: number;
  level_name: string;
  level_type: string;
  participants: number;
  method: "llm_batch" | "structured_score" | "insufficient_players";
  rankings: Array<{
    player_id: string;
    player_name: string;
    rank: number;
    per_evaluator: Record<string, number>;
    transcript?: Array<{ role: "vc" | "founder"; text: string }>;
  }>;
  evaluators: Array<{
    key: string;
    label: string;
    criteria: string;
    ranking: Array<{ player_id: string; player_name: string; rank: number }>;
    ok: boolean;
  }>;
  diagnostics: string[];
}

interface FinalLeaderboard {
  computed_at: string;
  levels: LevelResult[];
}

const LVL1_ID = 1;
const LVL2_ID = 2;
const LVL3_ID = 3;
const LVL2_EVALUATORS = ["vision", "defensibility", "team"] as const;
const LVL3_PERSONAS: Array<{ key: string; label: string }> = [
  { key: "priya", label: "PRIYA" },
  { key: "teddy", label: "TEDDY" },
  { key: "kenji", label: "KENJI" },
];

export function AdminPanel() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState("");
  const [lvl1, setLvl1] = useState<LevelResult | null>(null);
  const [lvl2, setLvl2] = useState<LevelResult | null>(null);
  const [lvl3, setLvl3] = useState<LevelResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Rehydrate past evaluations from the DB so a refresh doesn't wipe the table
  // and a second admin browser sees the same state.
  useEffect(() => {
    fetch("/api/admin/finalize")
      .then((r) => (r.ok ? r.json() : { levels: [] }))
      .then((data: { levels: LevelResult[] }) => {
        for (const lvl of data.levels ?? []) {
          if (lvl.level_id === LVL1_ID) setLvl1(lvl);
          if (lvl.level_id === LVL2_ID) setLvl2(lvl);
          if (lvl.level_id === LVL3_ID) setLvl3(lvl);
        }
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  async function fetchLevels() {
    const res = await fetch("/api/levels");
    if (res.ok) setLevels(await res.json());
  }

  async function fetchScores() {
    const res = await fetch("/api/admin/scores");
    if (res.ok) setScores(await res.json());
  }

  useEffect(() => {
    fetchLevels();
    fetchScores();

    const supabase = createClient();
    const ch1 = supabase
      .channel("admin-levels")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "levels" },
        () => fetchLevels()
      )
      .subscribe();
    const ch2 = supabase
      .channel("admin-scores")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scores" },
        () => fetchScores()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, []);

  async function toggleLevel(levelId: number, unlocked: boolean) {
    setLoading(`level-${levelId}`);
    await fetch("/api/admin/levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ levelId, unlocked }),
    });
    setLoading("");
  }

  async function resetScores() {
    if (!confirm("Wipe ALL scores? This cannot be undone.")) return;
    setLoading("reset");
    await Promise.all([
      fetch("/api/admin/scores", { method: "DELETE" }),
      fetch("/api/admin/finalize", { method: "DELETE" }),
    ]);
    setLvl1(null);
    setLvl2(null);
    setLvl3(null);
    setLoading("");
  }

  async function evaluate(levelId: number) {
    const key = `eval-${levelId}`;
    setLoading(key);
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      const res = await fetch(
        `/api/admin/finalize?levels=${levelId}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: FinalLeaderboard = await res.json();
      const lvl = data.levels.find((l) => l.level_id === levelId) ?? null;
      if (levelId === LVL1_ID) setLvl1(lvl);
      if (levelId === LVL2_ID) setLvl2(lvl);
      if (levelId === LVL3_ID) setLvl3(lvl);
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [key]: err instanceof Error ? err.message : "evaluate failed",
      }));
    } finally {
      setLoading("");
    }
  }

  // Union of all players who have any score anywhere — they're the team list.
  const players = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of scores) {
      if (s.player_id && !m.has(s.player_id)) {
        m.set(s.player_id, s.players?.name ?? s.player_id.slice(0, 6));
      }
    }
    return m;
  }, [scores]);

  // Build per-column Borda points per player.
  const rows = useMemo(() => {
    const n1 = lvl1?.participants ?? 0;
    const n2 = lvl2?.participants ?? 0;

    // L1 has a single evaluator — the aggregated `rankings[]` rank is the
    // screen rank. Borda = N - rank + 1.
    const l1Borda = new Map<string, number>();
    for (const r of lvl1?.rankings ?? []) {
      l1Borda.set(r.player_id, Math.max(0, n1 - r.rank + 1));
    }

    // L2: pull each evaluator's own ranking.
    const l2Bordas: Record<string, Map<string, number>> = {
      vision: new Map(),
      defensibility: new Map(),
      team: new Map(),
    };
    for (const e of lvl2?.evaluators ?? []) {
      if (!e.ok) continue;
      const col = l2Bordas[e.key];
      if (!col) continue;
      for (const r of e.ranking) {
        col.set(r.player_id, Math.max(0, n2 - r.rank + 1));
      }
    }

    // L3 per-persona valuations (raw $M, not Borda). We look them up per
    // player from rankings[].per_evaluator keyed by persona id.
    const l3Valuations = new Map<string, Record<string, number>>();
    for (const r of lvl3?.rankings ?? []) {
      l3Valuations.set(r.player_id, r.per_evaluator ?? {});
    }

    const rowsOut = [...players.entries()].map(([pid, name]) => {
      const l1 = l1Borda.get(pid) ?? 0;
      const vision = l2Bordas.vision.get(pid) ?? 0;
      const defense = l2Bordas.defensibility.get(pid) ?? 0;
      const team = l2Bordas.team.get(pid) ?? 0;
      const total = l1 + vision + defense + team;
      const vals = l3Valuations.get(pid) ?? {};
      return {
        player_id: pid,
        player_name: name,
        l1,
        vision,
        defense,
        team,
        total,
        priya: typeof vals.priya === "number" ? vals.priya : null,
        teddy: typeof vals.teddy === "number" ? vals.teddy : null,
        kenji: typeof vals.kenji === "number" ? vals.kenji : null,
      };
    });

    rowsOut.sort((a, b) => b.total - a.total || a.player_name.localeCompare(b.player_name));
    return rowsOut;
  }, [players, lvl1, lvl2, lvl3]);

  const l2Evaluators = lvl2?.evaluators ?? [];
  const l2EvaluatorByKey = new Map(l2Evaluators.map((e) => [e.key, e]));

  // Transcripts keyed by player_id, separately per level. Populated whenever
  // that level's evaluation ran — admin hovers on a row to inspect.
  const transcriptsByPlayer = useMemo(() => {
    type Turn = { role: "vc" | "founder"; text: string };
    const l1: Map<string, Turn[]> = new Map();
    const l2: Map<string, Turn[]> = new Map();
    for (const r of lvl1?.rankings ?? []) {
      if (r.transcript && r.transcript.length > 0)
        l1.set(r.player_id, r.transcript);
    }
    for (const r of lvl2?.rankings ?? []) {
      if (r.transcript && r.transcript.length > 0)
        l2.set(r.player_id, r.transcript);
    }
    return { l1, l2 };
  }, [lvl1, lvl2]);

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <h1 className="font-pixel text-xl mb-6">ADMIN</h1>

      <section className="mb-8">
        <h2 className="font-pixel text-sm mb-3 text-zinc-400">LEVELS</h2>
        <div className="space-y-2">
          {levels.map((level) => {
            const color = getLevelColor(level);
            return (
              <div
                key={level.id}
                className="flex items-center justify-between p-3 border-2 border-zinc-800 bg-zinc-950"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600">#{level.id}</span>
                  <span className="font-pixel text-xs" style={{ color }}>
                    {level.name.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    ({level.type})
                  </span>
                </div>
                <button
                  onClick={() => toggleLevel(level.id, !level.unlocked)}
                  disabled={loading === `level-${level.id}`}
                  className={`font-pixel text-[10px] px-3 py-1 border-2 transition-colors ${
                    level.unlocked
                      ? "border-green-800 text-green-400"
                      : "border-zinc-700 text-zinc-500"
                  }`}
                >
                  {level.unlocked ? "UNLOCKED" : "LOCKED"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-pixel text-sm text-zinc-400">LEADERBOARD</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => evaluate(LVL1_ID)}
              disabled={loading === `eval-${LVL1_ID}`}
              className="font-pixel text-[10px] px-3 py-1 border-2 border-yellow-800 text-yellow-400 hover:border-yellow-600 transition-colors"
            >
              {loading === `eval-${LVL1_ID}`
                ? "EVALUATING LVL 1..."
                : "EVALUATE LVL 1"}
            </button>
            <button
              onClick={() => evaluate(LVL2_ID)}
              disabled={loading === `eval-${LVL2_ID}`}
              className="font-pixel text-[10px] px-3 py-1 border-2 border-yellow-800 text-yellow-400 hover:border-yellow-600 transition-colors"
            >
              {loading === `eval-${LVL2_ID}`
                ? "EVALUATING LVL 2..."
                : "EVALUATE LVL 2"}
            </button>
            <button
              onClick={() => evaluate(LVL3_ID)}
              disabled={loading === `eval-${LVL3_ID}`}
              className="font-pixel text-[10px] px-3 py-1 border-2 border-yellow-800 text-yellow-400 hover:border-yellow-600 transition-colors"
            >
              {loading === `eval-${LVL3_ID}`
                ? "EVALUATING LVL 3..."
                : "EVALUATE LVL 3"}
            </button>
            <button
              onClick={resetScores}
              disabled={loading === "reset"}
              className="font-pixel text-[10px] px-3 py-1 border-2 border-red-900 text-red-400 hover:border-red-700 transition-colors"
            >
              {loading === "reset" ? "RESETTING..." : "RESET ALL SCORES"}
            </button>
          </div>
        </div>

        {(errors["eval-1"] || errors["eval-2"] || errors["eval-3"]) && (
          <div className="text-red-400 text-xs mb-3 space-y-1">
            {errors["eval-1"] && <p>Lvl 1: {errors["eval-1"]}</p>}
            {errors["eval-2"] && <p>Lvl 2: {errors["eval-2"]}</p>}
            {errors["eval-3"] && <p>Lvl 3: {errors["eval-3"]}</p>}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-zinc-600 text-sm">No teams yet.</p>
        ) : (
          <div>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="font-pixel text-[10px] text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-2 pr-3">TEAM</th>
                  <th className="text-right py-2 px-3">
                    L1 · SCREEN
                    {!lvl1 && (
                      <span className="ml-1 text-zinc-700">(--)</span>
                    )}
                  </th>
                  <th className="text-right py-2 px-3">
                    L2 · VISION
                    {!l2EvaluatorByKey.get("vision")?.ok && lvl2 && (
                      <span className="ml-1 text-red-500">(!)</span>
                    )}
                    {!lvl2 && (
                      <span className="ml-1 text-zinc-700">(--)</span>
                    )}
                  </th>
                  <th className="text-right py-2 px-3">
                    L2 · DEFENSE
                    {!l2EvaluatorByKey.get("defensibility")?.ok && lvl2 && (
                      <span className="ml-1 text-red-500">(!)</span>
                    )}
                    {!lvl2 && (
                      <span className="ml-1 text-zinc-700">(--)</span>
                    )}
                  </th>
                  <th className="text-right py-2 px-3">
                    L2 · TEAM
                    {!l2EvaluatorByKey.get("team")?.ok && lvl2 && (
                      <span className="ml-1 text-red-500">(!)</span>
                    )}
                    {!lvl2 && (
                      <span className="ml-1 text-zinc-700">(--)</span>
                    )}
                  </th>
                  {LVL3_PERSONAS.map((p) => (
                    <th
                      key={p.key}
                      className="text-right py-2 px-3 border-l border-zinc-900"
                    >
                      L3 · {p.label}
                      {!lvl3 && (
                        <span className="ml-1 text-zinc-700">(--)</span>
                      )}
                    </th>
                  ))}
                  <th className="text-right py-2 pl-3 text-yellow-500">
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.player_id}
                    className="border-b border-zinc-900 hover:bg-zinc-950"
                  >
                    <td className="py-2 pr-3 relative">
                      <span className="text-zinc-600 mr-2">#{i + 1}</span>
                      <span className="text-white">{r.player_name}</span>
                      <span className="ml-2 space-x-1 text-[10px] font-pixel">
                        <TranscriptHover
                          label="L1"
                          turns={transcriptsByPlayer.l1.get(r.player_id)}
                          headerLabel="LVL 1 · ANALYST TRANSCRIPT"
                        />
                        <TranscriptHover
                          label="L2"
                          turns={transcriptsByPlayer.l2.get(r.player_id)}
                          headerLabel="LVL 2 · PARTNER TRANSCRIPT"
                        />
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {scoreCell(r.l1, lvl1 != null)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {scoreCell(
                        r.vision,
                        l2EvaluatorByKey.get("vision")?.ok ?? false
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {scoreCell(
                        r.defense,
                        l2EvaluatorByKey.get("defensibility")?.ok ?? false
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {scoreCell(
                        r.team,
                        l2EvaluatorByKey.get("team")?.ok ?? false
                      )}
                    </td>
                    {LVL3_PERSONAS.map((p) => {
                      const v = r[p.key as "priya" | "teddy" | "kenji"];
                      return (
                        <td
                          key={p.key}
                          className="py-2 px-3 text-right font-mono border-l border-zinc-900"
                        >
                          {v == null ? (
                            <span className="text-zinc-700">--</span>
                          ) : (
                            <span className="text-zinc-200">${v}M</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right font-pixel text-yellow-400">
                      {r.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(lvl1 || lvl2 || lvl3) && (
          <div className="mt-4 space-y-2">
            {lvl1?.diagnostics && lvl1.diagnostics.length > 0 && (
              <ul className="text-[10px] text-amber-500 list-disc list-inside">
                {lvl1.diagnostics.map((d, i) => (
                  <li key={`d1-${i}`}>L1: {d}</li>
                ))}
              </ul>
            )}
            {lvl2?.diagnostics && lvl2.diagnostics.length > 0 && (
              <ul className="text-[10px] text-amber-500 list-disc list-inside">
                {lvl2.diagnostics.map((d, i) => (
                  <li key={`d2-${i}`}>L2: {d}</li>
                ))}
              </ul>
            )}
            {lvl3?.diagnostics && lvl3.diagnostics.length > 0 && (
              <ul className="text-[10px] text-amber-500 list-disc list-inside">
                {lvl3.diagnostics.map((d, i) => (
                  <li key={`d3-${i}`}>L3: {d}</li>
                ))}
              </ul>
            )}
            <EvaluatorDisclosure lvl1={lvl1} lvl2={lvl2} />
          </div>
        )}
      </section>
    </div>
  );
}

function scoreCell(v: number, hasData: boolean) {
  if (!hasData) {
    return <span className="text-zinc-700">--</span>;
  }
  if (v === 0) {
    return <span className="text-zinc-700">0</span>;
  }
  return <span className="text-zinc-200">{v}</span>;
}

function EvaluatorDisclosure({
  lvl1,
  lvl2,
}: {
  lvl1: LevelResult | null;
  lvl2: LevelResult | null;
}) {
  const all = [...(lvl1?.evaluators ?? []), ...(lvl2?.evaluators ?? [])];
  if (all.length === 0) return null;
  return (
    <details className="text-[10px] text-zinc-600">
      <summary className="cursor-pointer hover:text-zinc-400">
        Evaluator prompts ({all.length})
      </summary>
      <ul className="mt-2 space-y-2 pl-3">
        {all.map((e, i) => (
          <li key={`${e.key}-${i}`}>
            <div className="text-zinc-400">
              {e.label}
              {!e.ok && <span className="ml-2 text-red-400">(failed)</span>}
            </div>
            <div className="text-zinc-600 italic">{e.criteria}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}

type Turn = { role: "vc" | "founder"; text: string };

function TranscriptHover({
  label,
  turns,
  headerLabel,
}: {
  label: string;
  turns: Turn[] | undefined;
  headerLabel: string;
}) {
  const hasTurns = turns && turns.length > 0;
  return (
    <span className="group relative inline-block">
      <span
        className={
          hasTurns
            ? "text-yellow-600 underline decoration-dotted cursor-help"
            : "text-zinc-700 cursor-not-allowed"
        }
      >
        [{label}]
      </span>
      {hasTurns && (
        <div
          className="hidden group-hover:block absolute left-0 top-full mt-1 z-50 w-[600px] max-h-[500px] overflow-y-auto bg-black border-2 border-zinc-700 p-3 text-[11px] shadow-lg"
          style={{ whiteSpace: "normal" }}
        >
          <div className="font-pixel text-[10px] text-zinc-500 mb-2">
            {headerLabel}
          </div>
          <TranscriptBody turns={turns} />
        </div>
      )}
    </span>
  );
}

function TranscriptBody({ turns }: { turns: Turn[] }) {
  return (
    <div className="space-y-1.5 font-mono">
      {turns.map((t, i) => (
        <div key={i}>
          <span
            className={
              t.role === "vc" ? "text-zinc-400" : "text-green-400"
            }
          >
            {t.role === "vc" ? "VC" : "FOUNDER"}:
          </span>{" "}
          <span className="text-zinc-300 whitespace-pre-wrap">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
