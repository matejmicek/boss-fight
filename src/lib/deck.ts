export type TeamMember = { name: string; role: string; bio: string };

export const deck = {
  company: "Mise",
  tagline: "Strava for home cooks",
  round: "Seed Round - 2026",

  problem: [
    "Home cooking is lonely. You put real effort in and nobody sees it.",
    "Progress is invisible. There is no record of the 400 meals you cooked last year.",
    "Instagram and TikTok reward food performance, not practice. The home cook has no home.",
    "Calorie trackers treat food as a number. Cooking is a craft, not a macro.",
  ],

  product: {
    paragraph:
      "Mise is a social iOS app for home cooks. You snap a photo of your plate, our vision model auto-tags the cuisine, technique, and cook time, and your friends see what you cooked today. That's the MVP. It's live and shipping.",
    features: [
      "One-tap photo log. Vision model auto-tags cuisine, technique, difficulty.",
      "Friend feed of what people are cooking today.",
      "Weekly segments (e.g. \"best pasta this week in your city\"), streaks, kudos.",
      "iOS only. 3,100 on the Android waitlist.",
    ],
  },

  traction: [
    { value: "$4.2K", label: "MRR" },
    { value: "2,800", label: "Weekly active cooks" },
    { value: "41%", label: "D30 retention" },
    { value: "14,200", label: "Meals logged to date" },
  ],

  team: [
    {
      name: "Maya Chen",
      role: "CEO & Co-founder",
      bio: "Stanford CS '24. Ex-Strava PM (activity feed team, 2023). Obsessive home cook — 600+ meals logged in a private prototype before starting Mise.",
    },
    {
      name: "Sam Okafor",
      role: "CTO & Co-founder",
      bio: "UC Berkeley EECS '22. Ex-Google (Lens / Photos, 2022-2025) — shipped the food-identification model now used in Google Photos search. Built Mise's vision pipeline from scratch.",
    },
  ] as TeamMember[],

  market: [
    "3.9B people cook at home weekly. 380M already post food content somewhere online.",
    "Consumer food & beverage apps: $24B by 2028 (Statista).",
    "Vision models can now identify a plated dish from one photo. Eighteen months ago this was not true.",
  ],
} as const;

export function renderAnalystPreread(): string {
  const d = deck;
  const lines: string[] = [];
  lines.push("[Pre-read — this is all you had time to skim before the call.]");
  lines.push("");
  d.team.forEach((m) => {
    lines.push(`LinkedIn — ${m.name}`);
    lines.push(`  Title: ${m.role}, ${d.company}`);
    lines.push(`  ${m.bio}`);
    lines.push("");
  });
  lines.push(`From ${d.company.toLowerCase()}.app (website blurb):`);
  lines.push(`  "${d.company} — ${d.tagline}. ${d.product.paragraph.split(".")[0]}."`);
  lines.push("");
  lines.push(
    "You have not seen a deck. You do not know their traction numbers, market sizing, pricing, wedge, or vision. Ask."
  );
  return lines.join("\n");
}
