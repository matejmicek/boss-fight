import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

// Opus with the 1M-context beta header. Overkill for 15 players (~50K input
// tokens), but the user wants headroom for much bigger cohorts.
const opus = createAnthropic({
  headers: { "anthropic-beta": "context-1m-2025-08-07" },
});

const MODEL_ID = "claude-opus-4-7";
const MAX_TURNS_PER_TRANSCRIPT = 30;
const MAX_CHARS_PER_TURN = 400;
const MAX_OUTPUT_TOKENS = 4096;

// ----- Types ---------------------------------------------------------------

export interface PlayerTranscript {
  player_id: string;
  player_name: string;
  turns: { role: "vc" | "founder"; text: string }[];
  absolute_score?: number | null;
}

// An evaluator is a simple, disclosable prompt that orders founders on one
// dimension. Its `criteria` field is the full user-facing description of what
// this evaluator measures.
export interface EvaluatorSpec {
  key: string;
  label: string;
  criteria: string;
}

export const ANALYST_EVALUATORS: EvaluatorSpec[] = [
  {
    key: "screen",
    label: "Screen",
    criteria:
      "Rank these founders on how well they handled a cold-DM LinkedIn screen with a junior VC analyst who probed two things: real traction numbers, and bottom-up market sizing. Better founders gave concrete, credible metrics paired with narrative, and defended their market with actual reasoning. Worse founders hand-waved, used buzzwords, or padded TAM top-down.",
  },
];

export const PARTNER_EVALUATORS: EvaluatorSpec[] = [
  {
    key: "vision",
    label: "Vision",
    criteria:
      "Rank these founders on their answer to the big 5-to-10-year category-defining vision question. Better founders painted a specific, ambitious end-state for the company and the market. Worse ones gave buzzwords, feature-sized answers, or couldn't articulate a category at all.",
  },
  {
    key: "defensibility",
    label: "Defensibility",
    criteria:
      "Rank these founders on their answer to long-term defensibility — what actually stops Instagram, TikTok, or a well-funded team from shipping this as a feature. Better founders named a specific mechanism that compounds over time (data, graph, brand, switching cost). Worse ones leaned on 'network effects' without explaining why.",
  },
  {
    key: "team",
    label: "Team",
    criteria:
      "Rank these founders on their answer to why this specific team wins this market. Better founders surfaced unfair insight, deep obsession, or hard-won scar tissue unique to them. Worse ones leaned on resumes or implied anyone could build this.",
  },
];

export interface LevelRanking {
  level_id: number;
  level_name: string;
  level_type: "chat" | "voice" | "negotiation";
  participants: number;
  method: "llm_batch" | "structured_score" | "insufficient_players";
  rankings: Array<{
    player_id: string;
    player_name: string;
    rank: number;
    per_evaluator: Record<string, number>; // evaluator key -> rank from that evaluator
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

export interface FinalizeOptions {
  sinceMs?: number;
  levelIds?: number[];
}

export interface FinalLeaderboard {
  computed_at: string;
  levels: LevelRanking[];
}

// ----- Transcript normalization -------------------------------------------

function clip(s: string): string {
  const trimmed = s.trim().replace(/\s+/g, " ");
  return trimmed.length > MAX_CHARS_PER_TURN
    ? trimmed.slice(0, MAX_CHARS_PER_TURN) + "…"
    : trimmed;
}

function renderTranscript(t: PlayerTranscript): string {
  const turns = t.turns.slice(-MAX_TURNS_PER_TRANSCRIPT);
  return turns
    .map((u) => `${u.role === "vc" ? "VC" : "FOUNDER"}: ${clip(u.text)}`)
    .join("\n");
}

// Extract plain-text turns from the AI-SDK UIMessage shape stored in
// conversations.messages. Defensive — field names vary slightly.
function turnsFromChatMessages(messages: unknown): PlayerTranscript["turns"] {
  if (!Array.isArray(messages)) return [];
  const out: PlayerTranscript["turns"] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as { role?: string; parts?: unknown; content?: unknown };
    const role: "vc" | "founder" | null =
      m.role === "user" ? "founder" : m.role === "assistant" ? "vc" : null;
    if (!role) continue;

    let text = "";
    if (Array.isArray(m.parts)) {
      text = (m.parts as Array<{ type?: string; text?: string }>)
        .filter((p) => p && p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join(" ");
    } else if (typeof m.content === "string") {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = (m.content as Array<{ type?: string; text?: string }>)
        .filter((p) => p && p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join(" ");
    }
    text = text.trim();
    if (!text) continue;
    out.push({ role, text });
  }
  return out;
}

function turnsFromVoiceTranscript(
  transcript: unknown
): PlayerTranscript["turns"] {
  if (!Array.isArray(transcript)) return [];
  const out: PlayerTranscript["turns"] = [];
  for (const raw of transcript) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as { role?: string; message?: string };
    const role: "vc" | "founder" | null =
      t.role === "user" ? "founder" : t.role === "agent" ? "vc" : null;
    if (!role) continue;
    const text = typeof t.message === "string" ? t.message.trim() : "";
    if (!text) continue;
    out.push({ role, text });
  }
  return out;
}

// ----- Data gathering -----------------------------------------------------

type LevelRow = {
  id: number;
  name: string;
  type: "chat" | "voice" | "negotiation";
};

async function loadLevels(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<LevelRow[]> {
  const { data, error } = await supabase
    .from("levels")
    .select("id, name, type")
    .order("id");
  if (error) throw new Error(`levels load failed: ${error.message}`);
  return (data ?? []) as LevelRow[];
}

async function loadBestScores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sinceMs?: number
): Promise<
  Map<
    number,
    Array<{
      player_id: string;
      player_name: string;
      score: number;
      scored_at: string;
    }>
  >
> {
  // Best score per (player, level), with player name.
  let q = supabase
    .from("scores")
    .select("player_id, level_id, score, created_at, players(name)")
    .order("score", { ascending: false })
    .order("created_at", { ascending: false });
  if (sinceMs && sinceMs > 0) {
    const cutoff = new Date(Date.now() - sinceMs).toISOString();
    q = q.gte("created_at", cutoff);
  }
  const { data, error } = await q;
  if (error) throw new Error(`scores load failed: ${error.message}`);

  const byLevel = new Map<
    number,
    Array<{
      player_id: string;
      player_name: string;
      score: number;
      scored_at: string;
    }>
  >();
  const seen = new Set<string>(); // `${player_id}:${level_id}`
  for (const row of (data ?? []) as Array<{
    player_id: string;
    level_id: number;
    score: number;
    created_at: string;
    players: { name: string } | { name: string }[] | null;
  }>) {
    const key = `${row.player_id}:${row.level_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const playerRel = row.players;
    const name = Array.isArray(playerRel)
      ? playerRel[0]?.name
      : playerRel?.name;
    const bucket = byLevel.get(row.level_id) ?? [];
    bucket.push({
      player_id: row.player_id,
      player_name: name ?? row.player_id.slice(0, 6),
      score: row.score,
      scored_at: row.created_at,
    });
    byLevel.set(row.level_id, bucket);
  }
  return byLevel;
}

async function loadChatTranscripts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  levelId: number
): Promise<Map<string, unknown>> {
  // Most-recent completed conversation per player for this level.
  const { data, error } = await supabase
    .from("conversations")
    .select("player_id, messages, updated_at, status")
    .eq("level_id", levelId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`conversations load failed: ${error.message}`);

  const out = new Map<string, unknown>();
  for (const row of (data ?? []) as Array<{
    player_id: string;
    messages: unknown;
    updated_at: string;
    status: string;
  }>) {
    if (out.has(row.player_id)) continue;
    out.set(row.player_id, row.messages);
  }
  return out;
}

async function loadVoiceTranscripts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  levelId: number
): Promise<Map<string, unknown>> {
  // Most-recent post_call_transcription webhook per player for this level.
  const { data, error } = await supabase
    .from("webhook_logs")
    .select("payload, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`webhook_logs load failed: ${error.message}`);

  const out = new Map<string, unknown>();
  for (const row of (data ?? []) as Array<{
    payload: Record<string, unknown> | null;
    created_at: string;
  }>) {
    const p = row.payload;
    if (!p || p.type !== "post_call_transcription") continue;
    const d = (p.data ?? {}) as Record<string, unknown>;
    const dv =
      (
        (d.conversation_initiation_client_data ?? {}) as Record<string, unknown>
      ).dynamic_variables ?? {};
    const pid = (dv as Record<string, string>).player_id;
    const lid = parseInt((dv as Record<string, string>).level_id ?? "", 10);
    if (!pid || lid !== levelId) continue;
    if (out.has(pid)) continue;
    out.set(pid, d.transcript ?? []);
  }
  return out;
}

// ----- Evaluator (one prompt, one ordering) -------------------------------

const RankingSchema = z.object({
  ranking: z.array(
    z.object({
      label: z.string(),
      rank: z.number().int().min(1),
    })
  ),
});

function buildEvaluatorPrompt(
  criteria: string,
  labeled: Array<{ label: string; transcript: PlayerTranscript }>
): { system: string; user: string } {
  const n = labeled.length;
  const system = `${criteria}

You will receive ${n} anonymized founder transcripts labeled [A], [B], [C], etc. Output ONLY the following JSON (no prose, no markdown):
{"ranking": [{"label": "[A]", "rank": 1}, ...]}

Every label must appear exactly once. Ranks must be the integers 1 through ${n} with no gaps or ties.`;

  const body = labeled
    .map(
      ({ label, transcript }) =>
        `${label}\n${renderTranscript(transcript)}`
    )
    .join("\n\n---\n\n");

  return { system, user: body };
}

function stripJsonFences(raw: string): string {
  const s = raw.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1].trim();
  return s;
}

function tryParseRanking(raw: string): z.infer<typeof RankingSchema> | null {
  try {
    const parsed = JSON.parse(stripJsonFences(raw));
    const result = RankingSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function validateRanking(
  parsed: z.infer<typeof RankingSchema>,
  expectedLabels: Set<string>
): { ok: true; map: Map<string, number> } | { ok: false; reason: string } {
  const { ranking } = parsed;
  const n = expectedLabels.size;
  if (ranking.length !== n) {
    return { ok: false, reason: `got ${ranking.length} entries, expected ${n}` };
  }
  const labelsSeen = new Set<string>();
  const ranksSeen = new Set<number>();
  const map = new Map<string, number>();
  for (const r of ranking) {
    if (!expectedLabels.has(r.label)) {
      return { ok: false, reason: `unknown label ${r.label}` };
    }
    if (labelsSeen.has(r.label)) {
      return { ok: false, reason: `duplicate label ${r.label}` };
    }
    if (r.rank < 1 || r.rank > n) {
      return { ok: false, reason: `rank ${r.rank} out of range` };
    }
    if (ranksSeen.has(r.rank)) {
      return { ok: false, reason: `duplicate rank ${r.rank}` };
    }
    labelsSeen.add(r.label);
    ranksSeen.add(r.rank);
    map.set(r.label, r.rank);
  }
  return { ok: true, map };
}

// Deterministic per-evaluator shuffle so the same player isn't always in
// the same slot across evaluators. Stable across reruns for reproducibility.
function labelTranscripts(
  transcripts: PlayerTranscript[],
  salt: string
): Array<{ label: string; transcript: PlayerTranscript }> {
  const withKey = transcripts.map((t, i) => ({
    t,
    key: hashString(`${salt}:${i}:${t.player_id}`),
  }));
  withKey.sort((a, b) => a.key - b.key);
  return withKey.map(({ t }, i) => ({
    label: `[${indexToLabel(i)}]`,
    transcript: t,
  }));
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function indexToLabel(i: number): string {
  const A = 65;
  if (i < 26) return String.fromCharCode(A + i);
  return (
    String.fromCharCode(A + Math.floor(i / 26) - 1) +
    String.fromCharCode(A + (i % 26))
  );
}

async function runEvaluator(
  spec: EvaluatorSpec,
  transcripts: PlayerTranscript[]
): Promise<Map<string, number> | null> {
  const labeled = labelTranscripts(transcripts, spec.key);
  const expectedLabels = new Set(labeled.map((l) => l.label));
  const { system, user } = buildEvaluatorPrompt(spec.criteria, labeled);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text } = await generateText({
        model: opus(MODEL_ID),
        system,
        prompt: user,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: 1,
      });
      const parsed = tryParseRanking(text);
      if (!parsed) continue;
      const checked = validateRanking(parsed, expectedLabels);
      if (!checked.ok) continue;

      const labelToPlayer = new Map<string, string>();
      for (const l of labeled)
        labelToPlayer.set(l.label, l.transcript.player_id);
      const out = new Map<string, number>();
      for (const [label, rank] of checked.map.entries()) {
        const pid = labelToPlayer.get(label);
        if (pid) out.set(pid, rank);
      }
      return out;
    } catch (err) {
      console.warn(
        `runEvaluator (${spec.key}) attempt ${attempt} failed:`,
        err
      );
    }
  }
  return null;
}

// Run all evaluators in parallel, aggregate avg-rank across successful ones.
async function runEvaluators(
  specs: EvaluatorSpec[],
  transcripts: PlayerTranscript[]
): Promise<{
  rankings: LevelRanking["rankings"];
  evaluators: LevelRanking["evaluators"];
  diagnostics: string[];
} | null> {
  const n = transcripts.length;
  const nameByPid = new Map(
    transcripts.map((t) => [t.player_id, t.player_name])
  );

  const results = await Promise.all(
    specs.map((s) => runEvaluator(s, transcripts))
  );

  const evaluatorsOut: LevelRanking["evaluators"] = specs.map((spec, i) => {
    const map = results[i];
    const ranking = map
      ? [...map.entries()]
          .map(([pid, rank]) => ({
            player_id: pid,
            player_name: nameByPid.get(pid) ?? pid.slice(0, 6),
            rank,
          }))
          .sort((a, b) => a.rank - b.rank)
      : [];
    return {
      key: spec.key,
      label: spec.label,
      criteria: spec.criteria,
      ranking,
      ok: map !== null,
    };
  });

  const successes = results.filter(
    (r): r is Map<string, number> => r !== null
  );
  const diagnostics: string[] = [];
  if (successes.length === 0) {
    diagnostics.push(`All ${specs.length} evaluators failed`);
    return null;
  }
  if (successes.length < specs.length) {
    const failed = specs
      .filter((_, i) => results[i] === null)
      .map((s) => s.label);
    diagnostics.push(
      `${failed.length}/${specs.length} evaluators failed (${failed.join(", ")}) — using the rest`
    );
  }

  // Aggregate.
  const perPlayer = new Map<
    string,
    { rankSum: number; count: number; per_evaluator: Record<string, number> }
  >();
  for (const t of transcripts)
    perPlayer.set(t.player_id, { rankSum: 0, count: 0, per_evaluator: {} });
  for (let i = 0; i < specs.length; i++) {
    const map = results[i];
    if (!map) continue;
    const spec = specs[i];
    for (const [pid, rank] of map.entries()) {
      const agg = perPlayer.get(pid);
      if (!agg) continue;
      agg.rankSum += rank;
      agg.count += 1;
      agg.per_evaluator[spec.key] = rank;
    }
  }

  // Any player never placed (every evaluator failed to rank them)? Bottom.
  const unranked: string[] = [];
  for (const [pid, agg] of perPlayer.entries()) {
    if (agg.count === 0) {
      unranked.push(pid);
      agg.rankSum = n + 1;
      agg.count = 1;
    }
  }
  if (unranked.length > 0) {
    diagnostics.push(
      `${unranked.length} players had no rank from any evaluator; pinned to bottom`
    );
  }

  const ranked = [...perPlayer.entries()]
    .map(([pid, agg]) => ({
      player_id: pid,
      avgRank: agg.rankSum / agg.count,
      per_evaluator: agg.per_evaluator,
    }))
    .sort((a, b) => a.avgRank - b.avgRank);

  const turnsByPid = new Map(transcripts.map((t) => [t.player_id, t.turns]));

  const rankings: LevelRanking["rankings"] = ranked.map((r, idx) => ({
    player_id: r.player_id,
    player_name: nameByPid.get(r.player_id) ?? r.player_id.slice(0, 6),
    rank: idx + 1,
    per_evaluator: r.per_evaluator,
    transcript: turnsByPid.get(r.player_id),
  }));

  return { rankings, evaluators: evaluatorsOut, diagnostics };
}

function evaluatorsForLevel(levelName: string): EvaluatorSpec[] {
  if (levelName === "The Analyst") return ANALYST_EVALUATORS;
  if (isPartnerLevel(levelName)) return PARTNER_EVALUATORS;
  return ANALYST_EVALUATORS; // sensible default
}

// The Partner level has two routes: voice ("The Partner") and text ("The
// Partner (Text)"). Both are scored with PARTNER_EVALUATORS and merged into a
// single ranking — a player does one or the other, not both.
const PARTNER_LEVEL_NAMES: ReadonlySet<string> = new Set([
  "The Partner",
  "The Partner (Text)",
]);

function isPartnerLevel(name: string): boolean {
  return PARTNER_LEVEL_NAMES.has(name);
}

async function rankPartnerGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partnerLevels: LevelRow[],
  bestScores: Map<
    number,
    Array<{
      player_id: string;
      player_name: string;
      score: number;
      scored_at: string;
    }>
  >
): Promise<LevelRanking> {
  // Primary is the canonical ID we expose on the LevelRanking output — the
  // voice level if it exists, otherwise the first one by id.
  const primary =
    partnerLevels.find((l) => l.type === "voice") ?? partnerLevels[0];

  // One entry per player: best partner attempt across both routes.
  // Tie-break by most recent, so if the user ran the voice level then fell
  // back to text, we pick whichever performed better.
  const bestByPlayer = new Map<
    string,
    {
      player_id: string;
      player_name: string;
      score: number;
      scored_at: string;
      level_id: number;
      level_type: "chat" | "voice" | "negotiation";
    }
  >();
  for (const lvl of partnerLevels) {
    const scored = bestScores.get(lvl.id) ?? [];
    for (const s of scored) {
      const prev = bestByPlayer.get(s.player_id);
      const better =
        !prev ||
        s.score > prev.score ||
        (s.score === prev.score && s.scored_at > prev.scored_at);
      if (better) {
        bestByPlayer.set(s.player_id, {
          ...s,
          level_id: lvl.id,
          level_type: lvl.type,
        });
      }
    }
  }

  const participants = [...bestByPlayer.values()];

  const baseRanking = (method: LevelRanking["method"], diagnostics: string[]) => ({
    level_id: primary.id,
    level_name: primary.name,
    level_type: primary.type,
    participants: participants.length,
    method,
    rankings: participants.map((p, idx) => ({
      player_id: p.player_id,
      player_name: p.player_name,
      rank: idx + 1,
      per_evaluator: { absolute: p.score },
    })),
    evaluators: [],
    diagnostics,
  });

  if (participants.length < 2) {
    return baseRanking("insufficient_players", [
      `Only ${participants.length} scored players across partner routes — skipped LLM ranking`,
    ]);
  }

  // Load transcripts for each partner level from its own storage (chat →
  // conversations, voice → webhook_logs).
  const chatByLevel = new Map<number, Map<string, unknown>>();
  const voiceByLevel = new Map<number, Map<string, unknown>>();
  for (const lvl of partnerLevels) {
    if (lvl.type === "chat") {
      chatByLevel.set(lvl.id, await loadChatTranscripts(supabase, lvl.id));
    } else if (lvl.type === "voice") {
      voiceByLevel.set(lvl.id, await loadVoiceTranscripts(supabase, lvl.id));
    }
  }

  const participantTranscripts: PlayerTranscript[] = [];
  const missing: string[] = [];
  for (const p of participants) {
    let raw: unknown;
    let turns: PlayerTranscript["turns"] = [];
    if (p.level_type === "chat") {
      raw = chatByLevel.get(p.level_id)?.get(p.player_id);
      turns = turnsFromChatMessages(raw);
    } else {
      raw = voiceByLevel.get(p.level_id)?.get(p.player_id);
      turns = turnsFromVoiceTranscript(raw);
    }
    if (turns.length === 0) {
      missing.push(p.player_name);
      continue;
    }
    participantTranscripts.push({
      player_id: p.player_id,
      player_name: p.player_name,
      turns,
      absolute_score: p.score,
    });
  }

  if (participantTranscripts.length < 2) {
    return {
      ...baseRanking(
        "insufficient_players",
        missing.length ? [`Missing transcripts for: ${missing.join(", ")}`] : []
      ),
      participants: participantTranscripts.length,
      rankings: participantTranscripts.map((t, idx) => ({
        player_id: t.player_id,
        player_name: t.player_name,
        rank: idx + 1,
        per_evaluator: { absolute: t.absolute_score ?? 0 },
        transcript: t.turns,
      })),
    };
  }

  const ranked = await runEvaluators(PARTNER_EVALUATORS, participantTranscripts);
  if (!ranked) {
    const sorted = [...participantTranscripts].sort(
      (a, b) => (b.absolute_score ?? 0) - (a.absolute_score ?? 0)
    );
    return {
      level_id: primary.id,
      level_name: primary.name,
      level_type: primary.type,
      participants: sorted.length,
      method: "structured_score",
      rankings: sorted.map((t, idx) => ({
        player_id: t.player_id,
        player_name: t.player_name,
        rank: idx + 1,
        per_evaluator: { absolute: t.absolute_score ?? 0 },
        transcript: t.turns,
      })),
      evaluators: PARTNER_EVALUATORS.map((s) => ({
        key: s.key,
        label: s.label,
        criteria: s.criteria,
        ranking: [],
        ok: false,
      })),
      diagnostics: [
        "All evaluators failed — fell back to absolute scores",
        ...(missing.length ? [`Missing transcripts for: ${missing.join(", ")}`] : []),
      ],
    };
  }

  return {
    level_id: primary.id,
    level_name: primary.name,
    level_type: primary.type,
    participants: participantTranscripts.length,
    method: "llm_batch",
    rankings: ranked.rankings,
    evaluators: ranked.evaluators,
    diagnostics: [
      ...ranked.diagnostics,
      ...(missing.length ? [`Missing transcripts for: ${missing.join(", ")}`] : []),
    ],
  };
}

// ----- Runbook (structured) -----------------------------------------------

// L3 doesn't produce a score. Each completed run yields three per-VC
// valuations; the leaderboard just surfaces those numbers as columns, sorted
// by the sum so the top line on the table is "best combined offers".
async function rankRunbookLevel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  level: LevelRow
): Promise<LevelRanking> {
  const { data, error } = await supabase
    .from("runbook_runs")
    .select("player_id, outcome, created_at, players(name)")
    .eq("level_id", level.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`runbook_runs load: ${error.message}`);

  type RunRow = {
    player_id: string;
    outcome: {
      vcs?: Array<{
        persona_id?: string;
        valuation_m?: number;
      }>;
    } | null;
    created_at: string;
    players: { name: string } | { name: string }[] | null;
  };

  // Most-recent completed run per player.
  const latest = new Map<
    string,
    { player_name: string; valuations: Record<string, number> }
  >();
  for (const row of (data ?? []) as RunRow[]) {
    if (latest.has(row.player_id)) continue;
    const name = Array.isArray(row.players)
      ? row.players[0]?.name
      : row.players?.name;
    const valuations: Record<string, number> = {};
    for (const v of row.outcome?.vcs ?? []) {
      if (typeof v.persona_id === "string" && typeof v.valuation_m === "number") {
        valuations[v.persona_id] = v.valuation_m;
      }
    }
    latest.set(row.player_id, {
      player_name: name ?? row.player_id.slice(0, 6),
      valuations,
    });
  }

  const entries = [...latest.entries()]
    .map(([pid, v]) => {
      const sum = Object.values(v.valuations).reduce((a, b) => a + b, 0);
      return { player_id: pid, ...v, sum };
    })
    .sort((a, b) => b.sum - a.sum);
  const n = entries.length;

  return {
    level_id: level.id,
    level_name: level.name,
    level_type: level.type,
    participants: n,
    method: n > 0 ? "structured_score" : "insufficient_players",
    rankings: entries.map((e, idx) => ({
      player_id: e.player_id,
      player_name: e.player_name,
      rank: idx + 1,
      per_evaluator: e.valuations, // { priya: 12, teddy: 15, kenji: 8 }
    })),
    evaluators: [],
    diagnostics: [
      "No score for L3 — surfacing each VC's returned post-money valuation.",
    ],
  };
}

// ----- Top-level orchestrator ---------------------------------------------

export async function finalizeLeaderboard(
  opts: FinalizeOptions = {}
): Promise<FinalLeaderboard> {
  const supabase = await createClient();
  const levels = await loadLevels(supabase);
  const bestScores = await loadBestScores(supabase, opts.sinceMs);

  const levelFilter =
    opts.levelIds && opts.levelIds.length > 0
      ? new Set(opts.levelIds)
      : null;

  // Partner levels (voice + text fallback) are scored as one group.
  const partnerLevels = levels.filter((l) => isPartnerLevel(l.name));
  const partnerIds = new Set(partnerLevels.map((l) => l.id));
  const partnerPrimaryId =
    (partnerLevels.find((l) => l.type === "voice") ?? partnerLevels[0])?.id;
  const partnerRequested =
    !levelFilter ||
    partnerLevels.some((l) => levelFilter.has(l.id));

  const levelRankings: LevelRanking[] = [];
  let partnerEmitted = false;

  for (const level of levels) {
    if (partnerIds.has(level.id)) {
      // Collapse all partner routes into one ranking, emitted once on the
      // primary partner level's turn in the loop.
      if (!partnerRequested || partnerEmitted) continue;
      if (level.id !== partnerPrimaryId) continue;
      const lr = await rankPartnerGroup(supabase, partnerLevels, bestScores);
      levelRankings.push(lr);
      partnerEmitted = true;
      continue;
    }
    if (levelFilter && !levelFilter.has(level.id)) continue;
    if (level.type === "negotiation") {
      const lr = await rankRunbookLevel(supabase, level);
      levelRankings.push(lr);
      continue;
    }

    const scored = bestScores.get(level.id) ?? [];
    if (scored.length < 2) {
      levelRankings.push({
        level_id: level.id,
        level_name: level.name,
        level_type: level.type,
        participants: scored.length,
        method: "insufficient_players",
        rankings: scored.map((s, idx) => ({
          player_id: s.player_id,
          player_name: s.player_name,
          rank: idx + 1,
          per_evaluator: { absolute: s.score },
        })),
        evaluators: [],
        diagnostics: [`Only ${scored.length} scored players — skipped LLM ranking`],
      });
      continue;
    }

    // Gather transcripts per player for this level.
    let transcriptsByPlayer: Map<string, unknown>;
    if (level.type === "chat") {
      transcriptsByPlayer = await loadChatTranscripts(supabase, level.id);
    } else {
      transcriptsByPlayer = await loadVoiceTranscripts(supabase, level.id);
    }

    const participantTranscripts: PlayerTranscript[] = [];
    const missing: string[] = [];
    for (const s of scored) {
      const raw = transcriptsByPlayer.get(s.player_id);
      const turns =
        level.type === "chat"
          ? turnsFromChatMessages(raw)
          : turnsFromVoiceTranscript(raw);
      if (turns.length === 0) {
        missing.push(s.player_name);
        continue;
      }
      participantTranscripts.push({
        player_id: s.player_id,
        player_name: s.player_name,
        turns,
        absolute_score: s.score,
      });
    }

    if (participantTranscripts.length < 2) {
      levelRankings.push({
        level_id: level.id,
        level_name: level.name,
        level_type: level.type,
        participants: participantTranscripts.length,
        method: "insufficient_players",
        rankings: participantTranscripts.map((t, idx) => ({
          player_id: t.player_id,
          player_name: t.player_name,
          rank: idx + 1,
          per_evaluator: { absolute: t.absolute_score ?? 0 },
          transcript: t.turns,
        })),
        evaluators: [],
        diagnostics: missing.length
          ? [`Missing transcripts for: ${missing.join(", ")}`]
          : [],
      });
      continue;
    }

    const specs = evaluatorsForLevel(level.name);
    const ranked = await runEvaluators(specs, participantTranscripts);
    if (!ranked) {
      // Hard fallback: rank by absolute score.
      const sorted = [...participantTranscripts].sort(
        (a, b) => (b.absolute_score ?? 0) - (a.absolute_score ?? 0)
      );
      levelRankings.push({
        level_id: level.id,
        level_name: level.name,
        level_type: level.type,
        participants: sorted.length,
        method: "structured_score",
        rankings: sorted.map((t, idx) => ({
          player_id: t.player_id,
          player_name: t.player_name,
          rank: idx + 1,
          per_evaluator: { absolute: t.absolute_score ?? 0 },
          transcript: t.turns,
        })),
        evaluators: specs.map((s) => ({
          key: s.key,
          label: s.label,
          criteria: s.criteria,
          ranking: [],
          ok: false,
        })),
        diagnostics: [
          "All evaluators failed — fell back to absolute scores",
          ...(missing.length ? [`Missing transcripts for: ${missing.join(", ")}`] : []),
        ],
      });
      continue;
    }

    levelRankings.push({
      level_id: level.id,
      level_name: level.name,
      level_type: level.type,
      participants: participantTranscripts.length,
      method: "llm_batch",
      rankings: ranked.rankings,
      evaluators: ranked.evaluators,
      diagnostics: [
        ...ranked.diagnostics,
        ...(missing.length ? [`Missing transcripts for: ${missing.join(", ")}`] : []),
      ],
    });
  }

  return {
    computed_at: new Date().toISOString(),
    levels: levelRankings,
  };
}
