import { deck } from "@/lib/deck";

const BRAND = "#6fdb6f";

function SlideFrame({
  title,
  children,
  isFirst,
  isLast,
}: {
  title?: string;
  children: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <section className="min-h-screen flex flex-col justify-center px-6 py-12 max-w-lg mx-auto border-b border-zinc-900 last:border-b-0">
      {title && (
        <h2 className="text-2xl font-bold mb-8" style={{ color: BRAND }}>
          {title}
        </h2>
      )}
      {children}
      {isFirst && (
        <div className="text-zinc-600 text-xs text-center mt-12 animate-pulse">
          scroll ↓
        </div>
      )}
      {isLast && (
        <div className="text-zinc-700 text-xs text-center mt-12">end</div>
      )}
    </section>
  );
}

export default function DeckPage() {
  const d = deck;

  const slides: { title?: string; body: React.ReactNode }[] = [
    {
      body: (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="text-5xl font-bold mb-4" style={{ color: BRAND }}>
            {d.company}
          </div>
          <div className="text-zinc-400 text-lg">{d.tagline}</div>
          <div className="text-zinc-600 text-sm mt-8">{d.round}</div>
        </div>
      ),
    },
    {
      title: "The Problem",
      body: (
        <ul className="space-y-4 text-zinc-300 text-base leading-relaxed">
          {d.problem.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ),
    },
    {
      title: "The Product (today)",
      body: (
        <div className="space-y-4 text-zinc-300 text-base leading-relaxed">
          <p>{d.product.paragraph}</p>
          <ul className="space-y-2 mt-4">
            {d.product.features.map((f, i) => (
              <li key={i} className="text-zinc-400">
                <span style={{ color: BRAND }}>▸ </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      title: "Traction",
      body: (
        <div className="grid grid-cols-2 gap-6">
          {d.traction.map((stat) => (
            <div
              key={stat.label}
              className="text-center p-4 border border-zinc-800 rounded"
            >
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-zinc-500 text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Team",
      body: (
        <div className="space-y-6">
          {d.team.map((m) => (
            <div key={m.name} className="border border-zinc-800 rounded p-4">
              <div className="text-white font-semibold text-lg">
                {m.name}{" "}
                <span className="text-zinc-500 text-sm font-normal">
                  {m.role}
                </span>
              </div>
              <div className="text-zinc-400 text-sm mt-1">{m.bio}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Market",
      body: (
        <ul className="space-y-4 text-zinc-300 text-base leading-relaxed">
          {d.market.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      ),
    },
    {
      title: "The Ask",
      body: (
        <div className="space-y-6 text-zinc-300 text-base leading-relaxed">
          <div className="text-center p-6 border border-zinc-800 rounded">
            <div className="text-4xl font-bold" style={{ color: BRAND }}>
              $2M
            </div>
            <div className="text-zinc-500 text-sm mt-2">
              seed round
            </div>
          </div>
          <p className="text-zinc-400 text-sm">
            18 months of runway to get to 50K weekly active cooks, ship Android,
            and prove the feed loop compounds beyond founding-user cohorts.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {slides.map((s, i) => (
        <SlideFrame
          key={i}
          title={s.title}
          isFirst={i === 0}
          isLast={i === slides.length - 1}
        >
          {s.body}
        </SlideFrame>
      ))}
    </div>
  );
}
