export const LEVEL_TYPE_COLORS: Record<string, string> = {
  chat: "#6fdb6f",
  voice: "#db6fdb",
  negotiation: "#db6f6f",
};

export function getLevelColor(level: { type: string; config: { color?: string } }): string {
  return level.config.color || LEVEL_TYPE_COLORS[level.type] || "#888";
}

export const LEVEL_TYPE_LABELS: Record<string, string> = {
  chat: "TEXT",
  voice: "VOICE",
  negotiation: "DEAL",
};

// The partner boss has two routes (voice and text fallback). For scoring,
// attempts, and retrospective ranking they are treated as one — a player
// does one or the other.
export const PARTNER_LEVEL_NAMES: ReadonlySet<string> = new Set([
  "The Partner",
  "The Partner (Text)",
]);

export function isPartnerLevel(name: string): boolean {
  return PARTNER_LEVEL_NAMES.has(name);
}
