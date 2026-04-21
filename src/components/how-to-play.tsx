"use client";

export function HowToPlay({
  playerName,
  onContinue,
}: {
  playerName: string;
  onContinue: () => void;
}) {
  return (
    <div className="min-h-screen p-6 scanlines flex flex-col">
      <div className="max-w-xl mx-auto w-full flex-1 flex flex-col py-8">
        <div className="text-zinc-500 text-xs font-pixel mb-2 tracking-wider">
          WELCOME, {playerName.toUpperCase()}
        </div>
        <h1 className="font-pixel text-2xl text-white mb-8">HOW TO PLAY</h1>

        <Section title="YOU ARE THE FOUNDER">
          <p>
            You are pitching{" "}
            <span className="text-white font-semibold">Mise</span>, an iOS app
            for home cooks — the founders, the product, the traction, and the
            market are all in the deck.
          </p>
          <p className="mt-3">
            <span className="text-white font-semibold">
              Read the deck before you start.
            </span>{" "}
            What&apos;s in the deck is fixed truth — do not contradict it.
            Everything the deck leaves open (your vision, wedge, moat, GTM,
            business model, the ask) is yours to invent. Make it compelling.
          </p>
          <a
            href="/deck"
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-4 px-4 py-2 border-2 border-zinc-700 text-white hover:border-white transition-colors text-xs font-pixel pixel-btn"
          >
            [ READ THE DECK ]
          </a>
        </Section>

        <Section title="THE LEVELS">
          <ul className="space-y-3">
            <li>
              <span className="text-white font-semibold">Level 1 — Analyst.</span>{" "}
              Short LinkedIn pre-screen with Sarah Chen. She&apos;ll probe three
              things and decide. Get her to forward you to Marcus.
            </li>
            <li>
              <span className="text-white font-semibold">Level 2 — Partner.</span>{" "}
              Voice call with Marcus Reeves. He&apos;s driving, he&apos;s late,
              Sarah already briefed him. Make him want to walk this to IC.
            </li>
            <li className="text-zinc-500">
              <span className="text-zinc-400 font-semibold">
                Level 3 — Valuation.
              </span>{" "}
              Negotiate the term sheet. Coming soon.
            </li>
            <li className="text-zinc-500">More levels coming.</li>
          </ul>
        </Section>

        <Section title="SCORING">
          <ul className="space-y-2">
            <li>
              <span className="text-white font-semibold">One shot per level.</span>{" "}
              No retries — make it count.
            </li>
            <li>
              <span className="text-white font-semibold">No in-chat scoring.</span>{" "}
              The VCs don&apos;t grade you in the moment. All scoring happens
              at the end, across every team&apos;s full transcripts.
            </li>
            <li>
              A silent{" "}
              <span className="text-white font-semibold">coach</span> watches
              each conversation and drops a short hint above the chat.
              Listen to them.
            </li>
            <li>
              All plays are saved. At the end of the event we reveal the
              <span className="text-white font-semibold"> final ranking</span>{" "}
              by judging every team&apos;s transcripts relative to each other.
              See{" "}
              <a
                href="/prompts"
                target="_blank"
                rel="noreferrer"
                className="text-white underline underline-offset-2"
              >
                /prompts
              </a>{" "}
              for the exact criteria.
            </li>
          </ul>
        </Section>

        <button
          onClick={onContinue}
          className="mt-auto w-full py-3 bg-white text-black font-pixel text-xs pixel-btn"
        >
          LET&apos;S GO
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="font-pixel text-xs text-zinc-400 mb-3 tracking-wider">
        {title}
      </h2>
      <div className="text-zinc-300 text-sm leading-relaxed space-y-1">
        {children}
      </div>
    </div>
  );
}
