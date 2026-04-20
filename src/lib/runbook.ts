import { deck } from "@/lib/deck";

export type PersonaId = "priya" | "teddy" | "kenji";

export interface Runbook {
  vision: string;
  arguments: [string, string, string];
  floor_m: number;
}

export interface Persona {
  id: PersonaId;
  name: string;
  firm: string;
  oneLiner: string;
  bio: string;
  ceilingM: number;
  floorM: number;
  openingAnchorM: number;
  portraitChar: string;
  tintColor: string;
}

export const PERSONAS: Record<PersonaId, Persona> = {
  priya: {
    id: "priya",
    name: "Priya Shah",
    firm: "Ironbridge Capital",
    oneLiner: "The Quant Vulture",
    bio: "Ex-hedge-fund PM at Citadel. Now solo-GP at Ironbridge. Only numbers move her.",
    ceilingM: 10,
    floorM: 4,
    openingAnchorM: 6,
    portraitChar: "P",
    tintColor: "#6fdbbf",
  },
  teddy: {
    id: "teddy",
    name: "Teddy Whitlock III",
    firm: "Whitlock Partners",
    oneLiner: "The Name-Dropper",
    bio: "Third-generation VC. Stanford GSB '04. Pattern-matches everything to his portfolio.",
    ceilingM: 18,
    floorM: 8,
    openingAnchorM: 12,
    portraitChar: "T",
    tintColor: "#dbb46f",
  },
  kenji: {
    id: "kenji",
    name: "Kenji Ohara",
    firm: "Ohara Ventures",
    oneLiner: "The FOMO Machine",
    bio: "Solo GP who moves on heat signals. Binary: he jumps or he ghosts.",
    ceilingM: 22,
    floorM: 0,
    openingAnchorM: 20,
    portraitChar: "K",
    tintColor: "#db6fbf",
  },
};

export const PERSONA_ORDER: PersonaId[] = ["priya", "teddy", "kenji"];

const ROUND_SIZE_M = 2;

// ----- Associate (Jamie) ---------------------------------------------------

const ASSOCIATE_CHARACTER = `You are Jamie Park, a junior associate at ${deck.company}. Mid-twenties. MBA-fresh, eager, literal. Your founder had a family emergency and pulled you into this call five minutes ago. You have exactly one thing: the runbook they texted you. You will follow it to the letter because you do not have the authority to improvise.`;

const ASSOCIATE_RULES = `RULES:
- Only valuation (pre-money, in $M) is negotiable. The round size is fixed at $${ROUND_SIZE_M}M.
- Open the call, lead with the runbook's first argument, then weave in the others as the VC probes.
- Quote numbers from the runbook verbatim when relevant. Do not invent figures the runbook does not contain.
- Keep replies short: 1–3 sentences, plain-spoken. This is a real partner call, not a pitch deck.
- Hard cap: 6 exchanges. On turn 6, close with DEAL or WALK.
- Close rules:
  - If the VC's latest offer is at or above the runbook floor, accept: "DEAL at $<number>M pre."
  - If the offer is below floor after the VC has had a chance to improve, walk: "WALK — below our floor."
  - If the VC has not yet put a number on the table by turn 6, ask for one; if still none, "WALK — no offer on the table."
- Never break character. Never mention a runbook, AI, simulation, or training.`;

const ASSOCIATE_CONTEXT = `COMPANY SNAPSHOT (facts you can state if asked — do not embellish):
- Company: ${deck.company}, "${deck.tagline}".
- Stage: pre-seed → seed.
- Traction: ${deck.traction.map((t) => `${t.value} ${t.label}`).join(", ")}.
- Team: ${deck.team.map((m) => `${m.name} (${m.role})`).join("; ")}.
- Raising: $${ROUND_SIZE_M}M (fixed).`;

export function renderAssociateSystemPrompt(
  runbook: Runbook,
  persona: Persona
): string {
  return [
    ASSOCIATE_CHARACTER,
    "",
    ASSOCIATE_CONTEXT,
    "",
    "FOUNDER RUNBOOK (your only instructions):",
    `- Vision: ${runbook.vision || "(left blank — improvise briefly)"}`,
    `- Arguments to lead with (in order):`,
    `  1. ${runbook.arguments[0] || "(blank)"}`,
    `  2. ${runbook.arguments[1] || "(blank)"}`,
    `  3. ${runbook.arguments[2] || "(blank)"}`,
    `- Valuation floor: $${runbook.floor_m}M pre-money. Below this, walk.`,
    "",
    ASSOCIATE_RULES,
    "",
    `You are on a call with ${persona.name} of ${persona.firm}. Open the meeting. Brief, confident, literal.`,
  ].join("\n");
}

// ----- VC persona prompts --------------------------------------------------

const VC_RULES_SHARED = `RULES:
- You are in a live call with Jamie Park, a junior associate at ${deck.company}. Jamie is sitting in for the founder, who had an emergency.
- Only pre-money valuation (in $M) is negotiable. Round size is fixed at $${ROUND_SIZE_M}M.
- Keep replies short: 1–3 sentences. Natural speech, not a memo.
- Put specific numbers on the table. Say things like "I can do $8M pre" not "somewhere in the single digits."
- Hard cap: 6 exchanges. By then, either "DEAL at $<number>M pre" or "WALK — <one-sentence reason>".
- Never break character. Never mention a game, AI, simulation, or training.`;

function priyaPrompt(): string {
  const p = PERSONAS.priya;
  return [
    `You are ${p.name}, solo GP at ${p.firm}. Ex-Citadel PM. You invest like a quant: unit economics, retention cohorts, CAC/LTV, TAM math. Anything else is noise.`,
    "",
    VC_RULES_SHARED,
    "",
    `BEHAVIOR:
- Open by anchoring LOW: around $${p.openingAnchorM}M pre. Justify with cold math (market, retention, CAC).
- Move UP ONLY when the associate gives you SPECIFIC NUMBERS. Each concrete metric buys you ~$1M of upward movement. Max ceiling $${p.ceilingM}M pre.
- If the associate hedges, hand-waves, or deflects numeric questions TWICE, your interest collapses: offer $${p.floorM}M or walk.
- You HATE: vision-speak, "huge market," "category-defining," urgency talk, references to other term sheets (you think FOMO is for idiots).
- You LOVE: cohort retention numbers, CAC/payback, net revenue retention, concrete TAM math.
- If the associate leans on vision / storytelling / competitive pressure, call it out dryly: "That's not a number."
- Close with DEAL (if you have at least two concrete metrics you like) or WALK.`,
    "",
    `You go second; Jamie will open the call. Respond in character.`,
  ].join("\n");
}

function teddyPrompt(): string {
  const p = PERSONAS.teddy;
  return [
    `You are ${p.name}, general partner at ${p.firm}. Third-generation VC, Stanford GSB '04. You pattern-match every pitch against your portfolio. You want to feel like the smartest person in the room.`,
    "",
    VC_RULES_SHARED,
    "",
    `BEHAVIOR:
- Open by anchoring around $${p.openingAnchorM}M pre. Mid-range, warmly.
- Sprinkle portfolio name-drops (Strava, Notion, Figma, Peloton) into your own talk. Compare ${deck.company} to them out loud.
- Move UP when the associate flatters your pattern-matching or frames ${deck.company} as "the next <famous company> for <adjacent market>". Each good comparison buys ~$2M of upward movement. Max ceiling $${p.ceilingM}M pre.
- Move DOWN when the associate contradicts you, says you "don't get it", insists the company is unprecedented, or trashes one of the companies you name-dropped. Floor $${p.floorM}M.
- You HATE: being told your comparisons are wrong; "this is nothing like X"; any whiff of condescension; dry unit-economics talk (that's for analysts).
- You LOVE: "we're the Strava of..."; "this is where Notion was in 2017"; founders who know your portfolio.
- Close with DEAL (if flattered and pattern-matched to a success) or WALK (if the associate fought your comparisons).`,
    "",
    `You go second; Jamie will open the call. Respond in character.`,
  ].join("\n");
}

function kenjiPrompt(): string {
  const p = PERSONAS.kenji;
  return [
    `You are ${p.name}, solo GP at ${p.firm}. You are a momentum investor. You are addicted to heat. You do not do slow due diligence. You jump when a deal is hot and you vanish when it is not.`,
    "",
    VC_RULES_SHARED,
    "",
    `BEHAVIOR:
- Binary outcomes. You either offer a BIG number (up to $${p.ceilingM}M pre) fast, or you walk by turn 3.
- Listen for HEAT SIGNALS in the first two associate turns: competing term sheets, closing this week, other VCs circling, "we're oversubscribed", named-VC interest, fast timeline.
- IF heat is present and credible in the first two associate messages: jump straight to an aggressive offer ($${p.openingAnchorM}M pre) and push for a 48-hour close. You do not negotiate down from there; you only go UP (to $${p.ceilingM}M) if the associate reveals more heat.
- IF no heat signal by turn 2: lose interest fast. By turn 3 say something like "I'll pass — doesn't feel like the right moment" and WALK. Do not soften. Do not offer a lowball consolation.
- You HATE: dry numeric talk, slow pacing, associates who "need to check with the founder", anything that smells like weakness or shopping-from-desperation.
- You LOVE: urgency, named competitors chasing, a founder who is moving fast, "we're closing Friday", scarcity language.
- Never give a mid offer. Either big or gone.`,
    "",
    `You go second; Jamie will open the call. Respond in character.`,
  ].join("\n");
}

export function renderVcSystemPrompt(persona: Persona): string {
  switch (persona.id) {
    case "priya":
      return priyaPrompt();
    case "teddy":
      return teddyPrompt();
    case "kenji":
      return kenjiPrompt();
  }
}

// ----- Outcome extraction --------------------------------------------------

export interface NegotiationResult {
  persona_id: PersonaId;
  messages: { role: "associate" | "vc"; text: string }[];
  offer_m: number | null;
  walked: boolean;
  end_reason: "deal" | "associate_walk" | "vc_walk" | "turn_cap";
}

// Parse "$8M", "$8M pre", "8 million pre-money", "$8.5M" etc.
function extractFirstValuation(text: string): number | null {
  const patterns: RegExp[] = [
    /\$?\s*(\d{1,3}(?:\.\d+)?)\s*[Mm](?:illion)?\s*(?:pre|pre-money)?/,
    /(\d{1,3}(?:\.\d+)?)\s*[Mm](?:illion)?\s*(?:pre|pre-money)?/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n) && n > 0 && n < 500) return Math.round(n * 10) / 10;
    }
  }
  return null;
}

function hasWalk(text: string): boolean {
  return /\bWALK\b/.test(text) || /\bpass\b/i.test(text);
}

function hasDeal(text: string): boolean {
  return /\bDEAL\b/.test(text);
}

export function detectOutcome(
  messages: { role: "associate" | "vc"; text: string }[]
): Pick<NegotiationResult, "offer_m" | "walked" | "end_reason"> {
  const last = messages[messages.length - 1];
  const associateText = messages
    .filter((m) => m.role === "associate")
    .map((m) => m.text)
    .join("\n");
  const vcText = messages
    .filter((m) => m.role === "vc")
    .map((m) => m.text)
    .join("\n");

  // Associate closed with DEAL → parse valuation from associate's closing line
  if (last?.role === "associate" && hasDeal(last.text)) {
    const offer = extractFirstValuation(last.text);
    return { offer_m: offer, walked: offer === null, end_reason: "deal" };
  }

  // Associate walked
  if (last?.role === "associate" && hasWalk(last.text)) {
    return { offer_m: null, walked: true, end_reason: "associate_walk" };
  }

  // VC walked
  if (last?.role === "vc" && hasWalk(last.text) && !hasDeal(last.text)) {
    return { offer_m: null, walked: true, end_reason: "vc_walk" };
  }

  // VC closed
  if (last?.role === "vc" && hasDeal(last.text)) {
    const offer = extractFirstValuation(last.text);
    return { offer_m: offer, walked: offer === null, end_reason: "deal" };
  }

  // Turn cap hit — take last VC offer if present, else walk
  const lastVcOffer = extractFirstValuation(vcText.split("\n").reverse().join("\n"));
  if (lastVcOffer !== null) {
    return { offer_m: lastVcOffer, walked: false, end_reason: "turn_cap" };
  }
  // Unknown state — default to walk to avoid giving undeserved points
  return { offer_m: null, walked: true, end_reason: "turn_cap" };
}

// ----- Scoring -------------------------------------------------------------

export interface VcScore {
  persona_id: PersonaId;
  persona_name: string;
  offer_m: number | null;
  walked: boolean;
  points: number;
  reason: string;
}

export interface RunOutcome {
  vcs: VcScore[];
  aggregate_score: number;
}

function scoreOneVc(
  persona: Persona,
  result: NegotiationResult,
  floorM: number
): VcScore {
  const { offer_m, walked, end_reason } = result;

  if (walked || offer_m === null) {
    return {
      persona_id: persona.id,
      persona_name: persona.name,
      offer_m: null,
      walked: true,
      points: 0,
      reason:
        end_reason === "vc_walk"
          ? `${persona.name} walked.`
          : end_reason === "associate_walk"
            ? `Jamie walked — offer below your floor.`
            : `No offer on the table.`,
    };
  }

  if (offer_m < floorM) {
    return {
      persona_id: persona.id,
      persona_name: persona.name,
      offer_m,
      walked: false,
      points: 1,
      reason: `Closed at $${offer_m}M — below your $${floorM}M floor. Jamie should have walked.`,
    };
  }

  const raw = (offer_m / persona.ceilingM) * 4;
  const points = Math.max(0, Math.min(4, Math.round(raw * 10) / 10));
  return {
    persona_id: persona.id,
    persona_name: persona.name,
    offer_m,
    walked: false,
    points,
    reason: `Closed at $${offer_m}M pre (${persona.name}'s ceiling is ~$${persona.ceilingM}M).`,
  };
}

export function computeOutcome(
  results: NegotiationResult[],
  floorM: number
): RunOutcome {
  const vcs = results.map((r) => scoreOneVc(PERSONAS[r.persona_id], r, floorM));
  const total = vcs.reduce((s, v) => s + v.points, 0); // max 12
  const aggregate_score = Math.max(0, Math.min(10, Math.round((total * 10) / 12)));
  return { vcs, aggregate_score };
}

// ----- Constants exported --------------------------------------------------

export const MAX_TURNS = 6; // 6 associate messages, 6 VC messages = 12 model calls/neg max
export { ROUND_SIZE_M };
