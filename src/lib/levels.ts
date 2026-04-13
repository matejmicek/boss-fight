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
