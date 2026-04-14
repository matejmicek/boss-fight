import { deck, type Blank } from "@/lib/deck";

const BRAND = "#6fdb6f";
const BLANK_COLOR = "#f5c542";

function BlankSlide({ blank }: { blank: Blank }) {
  return (
    <div
      className="border-2 border-dashed rounded p-6 space-y-3"
      style={{ borderColor: BLANK_COLOR }}
    >
      <div
        className="text-xs tracking-widest uppercase"
        style={{ color: BLANK_COLOR }}
      >
        Your turn — team fills this in
      </div>
      <div className="text-white text-lg font-semibold">{blank.label}</div>
      <div className="text-zinc-400 text-sm leading-relaxed">{blank.hint}</div>
    </div>
  );
}

function SlideFrame({
  title,
  children,
  index,
  total,
}: {
  title?: string;
  children: React.ReactNode;
  index: number;
  total: number;
}) {
  return (
    <section className="min-h-screen flex flex-col justify-center px-6 py-12 max-w-lg mx-auto">
      {title && (
        <h2 className="text-2xl font-bold mb-8" style={{ color: BRAND }}>
          {title}
        </h2>
      )}
      {children}
      <div className="text-zinc-700 text-xs text-center mt-12">
        {index + 1} / {total}
      </div>
    </section>
  );
}

export default function DeckPage() {
  const d = deck;

  const slides: React.ReactNode[] = [];

  slides.push(
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="text-5xl font-bold mb-4" style={{ color: BRAND }}>
        {d.company}
      </div>
      <div className="text-zinc-400 text-lg">{d.tagline}</div>
      <div className="text-zinc-600 text-sm mt-8">{d.round}</div>
    </div>
  );

  slides.push(
    <ul className="space-y-4 text-zinc-300 text-base leading-relaxed">
      {d.problem.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ul>
  );

  slides.push(
    <div className="space-y-4 text-zinc-300 text-base leading-relaxed">
      <p>{d.solution.paragraph}</p>
      <ul className="space-y-2 mt-4">
        {d.solution.features.map((f, i) => (
          <li key={i} className="text-zinc-400">
            <span style={{ color: BRAND }}>▸ </span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );

  slides.push(
    <ul className="space-y-4 text-zinc-300 text-base leading-relaxed">
      {d.whyNow.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  );

  slides.push(<BlankSlide blank={d.tractionBlank} />);

  slides.push(
    <ul className="space-y-4 text-zinc-300 text-base leading-relaxed">
      {d.market.map((m, i) => (
        <li key={i}>{m}</li>
      ))}
    </ul>
  );

  slides.push(<BlankSlide blank={d.wedgeBlank} />);

  slides.push(
    <div className="space-y-6">
      {d.team.map((member, i) =>
        "blank" in member ? (
          <BlankSlide key={i} blank={member} />
        ) : (
          <div key={i} className="border border-zinc-800 rounded p-4">
            <div className="text-white font-semibold text-lg">
              {member.name}{" "}
              <span className="text-zinc-500 text-sm font-normal">
                {member.role}
              </span>
            </div>
            <div className="text-zinc-400 text-sm mt-1">{member.bio}</div>
          </div>
        )
      )}
    </div>
  );

  slides.push(<BlankSlide blank={d.gtmBlank} />);

  slides.push(<BlankSlide blank={d.businessModelBlank} />);

  slides.push(
    <p className="text-zinc-300 text-base leading-relaxed">{d.vision}</p>
  );

  slides.push(<BlankSlide blank={d.askBlank} />);

  const titles: (string | undefined)[] = [
    undefined,
    "The Problem",
    "The Solution",
    "Why Now",
    "Traction",
    "Market",
    "Wedge",
    "Team",
    "Go-to-market",
    "Business Model",
    "Vision",
    "The Ask",
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {slides.map((slide, i) => (
        <SlideFrame key={i} title={titles[i]} index={i} total={slides.length}>
          {slide}
        </SlideFrame>
      ))}
    </div>
  );
}
