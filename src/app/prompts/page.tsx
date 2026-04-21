import { ANALYST_EVALUATORS, PARTNER_EVALUATORS } from "@/lib/finalize";

const L1_COLOR = "#6fdb6f";
const L2_COLOR = "#db6fdb";

export const dynamic = "force-static";

const L1_TOPICS = [
  {
    title: "The Numbers",
    blurb:
      "Concrete traction — users, retention, revenue, growth rate, engagement. Expect to be pushed for specifics.",
  },
  {
    title: "Market Size",
    blurb:
      "How big is this really? Who are the users, how many are there, and how much of the pie can you credibly capture? Bottom-up logic wins; Statista quotes don't.",
  },
];

const L2_TOPICS = [
  {
    title: "The Big Vision",
    blurb:
      "Five to ten years out — is this a category-defining business or a nice feature? Marcus wants conviction and a real outcome, not 'a bigger version of today's product.'",
  },
  {
    title: "Long-term Defensibility",
    blurb:
      "What stops Instagram, TikTok, Strava, or a well-funded YC team from shipping this as a feature? What mechanism actually compounds over time (data, graph, brand, switching cost)?",
  },
  {
    title: "Why This Team Wins",
    blurb:
      "Of every team on Earth that could build this, why is it these two? Unfair insight, obsession, scar tissue, distribution — something the next ten founders don't have.",
  },
];

export default function PromptsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="font-pixel text-xl mb-2 text-white">
          HOW YOU&apos;LL BE EVALUATED
        </h1>
        <p className="text-zinc-500 text-xs mb-10 leading-relaxed">
          At the end of the event, every team&apos;s full transcripts are sent
          to an LLM judge (Opus 4.7 with 1M-context) that ranks all of you
          relative to each other. No in-chat scoring, no hidden criteria.
          These are the topics the VCs will probe and the exact prompts the
          judge will read.
        </p>

        <LevelSection
          title="LEVEL 1 · THE ANALYST"
          color={L1_COLOR}
          topics={L1_TOPICS}
          evaluatorIntro="One evaluator ranks all teams from best to worst on a single dimension."
          evaluators={ANALYST_EVALUATORS}
        />

        <LevelSection
          title="LEVEL 2 · THE PARTNER"
          color={L2_COLOR}
          topics={L2_TOPICS}
          evaluatorIntro="Three independent evaluators — one per topic. Each sorts all teams. Your final Level-2 points are the sum of your ranks across all three."
          evaluators={PARTNER_EVALUATORS}
        />

        <section className="mb-8">
          <h2 className="font-pixel text-sm text-zinc-400 mb-3">
            JSON INSTRUCTION APPENDED TO EACH PROMPT
          </h2>
          <pre className="text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 p-4 whitespace-pre-wrap leading-relaxed">
{`You will receive N anonymized founder transcripts labeled [A], [B], [C], etc. Output ONLY the following JSON (no prose, no markdown):
{"ranking": [{"label": "[A]", "rank": 1}, ...]}

Every label must appear exactly once. Ranks must be the integers 1 through N with no gaps or ties.`}
          </pre>
        </section>

        <section>
          <h2 className="font-pixel text-sm text-zinc-400 mb-3">SCORING</h2>
          <ul className="text-zinc-400 text-xs space-y-2 leading-relaxed">
            <li>
              <span className="text-white">Borda-style.</span> If there are N
              teams, the top team earns N points from an evaluator, second
              earns N-1, down to the last-place team earning 1.
            </li>
            <li>
              <span className="text-white">Team names are anonymized</span>{" "}
              before the LLM sees them.
            </li>
            <li>
              <span className="text-white">No in-chat scoring.</span> Sarah and
              Marcus don&apos;t grade you in the moment.
            </li>
            <li>
              <span className="text-white">Final ranking</span> is the sum of
              points across Level 1 (1 evaluator) + Level 2 (3 evaluators).
              Highest total wins.
            </li>
          </ul>
        </section>

        <div className="mt-12 pt-6 border-t border-zinc-900 text-center">
          <a
            href="/"
            className="font-pixel text-[10px] text-zinc-500 hover:text-white transition-colors"
          >
            [ BACK ]
          </a>
        </div>
      </div>
    </div>
  );
}

function LevelSection({
  title,
  color,
  topics,
  evaluatorIntro,
  evaluators,
}: {
  title: string;
  color: string;
  topics: Array<{ title: string; blurb: string }>;
  evaluatorIntro: string;
  evaluators: Array<{ key: string; label: string; criteria: string }>;
}) {
  return (
    <section className="mb-14">
      <h2 className="font-pixel text-lg mb-6" style={{ color }}>
        {title}
      </h2>

      <div className="mb-8">
        <div className="font-pixel text-[11px] text-zinc-500 mb-3 tracking-wider">
          1. TOPICS YOU&apos;LL BE ASKED ABOUT
        </div>
        <ol className="space-y-3">
          {topics.map((t, i) => (
            <li
              key={t.title}
              className="border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="flex items-baseline gap-3 mb-1">
                <span
                  className="font-pixel text-xs"
                  style={{ color }}
                >
                  {i + 1}.
                </span>
                <span className="font-pixel text-xs text-white tracking-wider">
                  {t.title.toUpperCase()}
                </span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed pl-6">
                {t.blurb}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <div className="font-pixel text-[11px] text-zinc-500 mb-3 tracking-wider">
          2. EVALUATOR PROMPT{evaluators.length > 1 ? "S" : ""}
        </div>
        <p className="text-zinc-500 text-xs mb-4">{evaluatorIntro}</p>
        {evaluators.map((e) => (
          <div
            key={e.key}
            className="mb-4 border border-zinc-800 bg-zinc-950 p-4"
          >
            <div
              className="font-pixel text-xs mb-2 tracking-wider"
              style={{ color }}
            >
              {e.label.toUpperCase()}
            </div>
            <p className="text-zinc-300 text-sm leading-relaxed">
              {e.criteria}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
