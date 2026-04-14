export type Blank = { blank: true; label: string; hint: string };

const blank = (label: string, hint: string): Blank => ({
  blank: true,
  label,
  hint,
});

export type Slide =
  | { kind: "cover"; company: string; tagline: string; round: string }
  | { kind: "bullets"; title: string; bullets: string[] }
  | { kind: "paragraph"; title: string; paragraph: string; features?: string[] }
  | { kind: "grid"; title: string; items: { value: string; label: string }[] }
  | { kind: "team"; title: string; members: (TeamMember | Blank)[] }
  | { kind: "blank"; title: string; blank: Blank };

export type TeamMember = { name: string; role: string; bio: string };

export const deck = {
  company: "Mise",
  tagline: "Strava for home cooks",
  round: "Seed Round - 2026",

  problem: [
    "Home cooking is lonely. You put real effort in and nobody sees it.",
    "Progress is invisible. There is no record of the 400 meals you cooked this year.",
    "Instagram and TikTok reward performance, not practice. The home cook has no home.",
    "Calorie trackers treat food as a number. Cooking is a craft, not a macro.",
  ],

  solution: {
    paragraph:
      "Open the app. Snap your plate. We auto-tag the cuisine, technique, and difficulty. Your feed shows what your friends cooked today. Weekly segments, streaks, kudos — all the primitives that made Strava a habit, applied to the kitchen.",
    features: [
      "One-tap photo log. AI does the rest.",
      "Friend feed, weekly segments, streaks, kudos.",
      "Private by default. You choose what you share.",
    ],
  },

  whyNow: [
    "Home-cooking habits locked in post-2020 and did not unwind.",
    "Gen Z cooks more at home than boomers for the first time ever.",
    "Vision AI can now identify a plated dish from one photo. This was not true 18 months ago.",
  ],

  market: [
    "3.9B people cook at home weekly. 380M post food content somewhere online.",
    "Consumer food + beverage apps: $24B by 2028 (Statista).",
    "Commerce adjacencies — groceries, cookware, classes, booking — are each >$50B markets our social graph eventually touches.",
  ],

  team: [
    {
      name: "Maya Chen",
      role: "CEO",
      bio: "Stanford CS '24. Ex-Strava PM (activity feed team). Obsessive home cook, 600+ meals logged in her own prototype over 14 months.",
    },
    blank(
      "Co-founder",
      "Your CTO / second founder. Name, background, domain edge, why the two of you."
    ),
  ],

  vision:
    "Mise starts as a tracker. It becomes the social graph for taste. It ends as the identity layer for food — your passport across groceries, cookware, classes, and restaurants.",

  tractionBlank: blank(
    "Traction",
    "Your MRR, weekly active cooks, D30 retention, waitlist. Pick numbers you can defend."
  ),

  wedgeBlank: blank(
    "Wedge",
    "Your initial niche and the insight that only you have. BBQ subreddit? NYC pasta TikTok? Eastern-European home chefs? Something else?"
  ),

  gtmBlank: blank(
    "Go-to-market",
    "How the first 10k cooks arrive. Community-led? Creator-led? Paid? Partnerships? Be specific."
  ),

  businessModelBlank: blank(
    "Business model",
    "Your pricing tiers and eventual commerce take rate. Where does $1 of value become $1 of revenue?"
  ),

  askBlank: blank(
    "The ask",
    "Your round size, valuation posture, and allocation (eng / GTM / ops). Be ready to defend each bucket."
  ),
} as const;

export function renderDeckForPrompt(): string {
  const d = deck;
  const lines: string[] = [];
  lines.push(`COMPANY: ${d.company}`);
  lines.push(`TAGLINE: ${d.tagline}`);
  lines.push("");
  lines.push("PROBLEM:");
  d.problem.forEach((p) => lines.push(`- ${p}`));
  lines.push("");
  lines.push("SOLUTION:");
  lines.push(d.solution.paragraph);
  d.solution.features.forEach((f) => lines.push(`- ${f}`));
  lines.push("");
  lines.push("WHY NOW:");
  d.whyNow.forEach((w) => lines.push(`- ${w}`));
  lines.push("");
  lines.push("MARKET:");
  d.market.forEach((m) => lines.push(`- ${m}`));
  lines.push("");
  lines.push("VISION:");
  lines.push(d.vision);
  lines.push("");
  lines.push("TEAM:");
  d.team.forEach((member) => {
    if ("blank" in member) {
      lines.push(`- [FOUNDER FILLS IN LIVE — ${member.label}: ${member.hint}]`);
    } else {
      lines.push(`- ${member.name} (${member.role}): ${member.bio}`);
    }
  });
  lines.push("");
  lines.push("TEAM-SPECIFIC VARIABLES (the founder fills these in live during the call — do not assume, probe):");
  [
    d.tractionBlank,
    d.wedgeBlank,
    d.gtmBlank,
    d.businessModelBlank,
    d.askBlank,
  ].forEach((b) => lines.push(`- ${b.label}: ${b.hint}`));
  return lines.join("\n");
}
