export default function DeckPage() {
  const slides: { title?: string; content: React.ReactNode }[] = [
    {
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="text-5xl font-bold mb-4" style={{ color: "#6fdb6f" }}>
            conduit
          </div>
          <div className="text-zinc-400 text-lg">
            Data pipelines in pure Python
          </div>
          <div className="text-zinc-600 text-sm mt-8">Seed Round - 2026</div>
        </div>
      ),
    },
    {
      title: "The Problem",
      content: (
        <ul className="space-y-4 text-zinc-300 text-base leading-relaxed">
          <li>
            Data engineers spend <span className="text-white font-semibold">60% of their time</span> on
            infrastructure, not data
          </li>
          <li>
            Airflow requires complex DAG configs, Spark needs JVM clusters,
            dbt only handles transforms
          </li>
          <li>
            Average time to deploy a new pipeline at a Series B startup:{" "}
            <span className="text-white font-semibold">2-3 weeks</span>
          </li>
          <li>
            Teams hire dedicated platform engineers just to keep pipelines
            running
          </li>
        </ul>
      ),
    },
    {
      title: "The Solution",
      content: (
        <div className="space-y-4 text-zinc-300 text-base leading-relaxed">
          <p>
            Write data pipelines as{" "}
            <span className="text-white font-semibold">plain Python functions</span>.
            No YAML. No JVM. No infrastructure management.
          </p>
          <div
            className="bg-zinc-900 border border-zinc-700 rounded p-4 font-mono text-sm overflow-x-auto"
            style={{ color: "#6fdb6f" }}
          >
            <div className="text-zinc-500">{"# That's it. This is a pipeline."}</div>
            <div>
              <span className="text-zinc-400">@</span>pipeline(schedule=
              <span className="text-yellow-300">&quot;hourly&quot;</span>)
            </div>
            <div>
              <span className="text-blue-400">def</span>{" "}
              <span className="text-white">sync_customers</span>(db, warehouse):
            </div>
            <div className="pl-4">
              customers = db.query(<span className="text-yellow-300">&quot;SELECT * FROM users&quot;</span>)
            </div>
            <div className="pl-4">
              warehouse.upsert(customers, key=<span className="text-yellow-300">&quot;id&quot;</span>)
            </div>
          </div>
          <p>
            Deploy with one command. Conduit handles orchestration, retries,
            monitoring, and scaling automatically.
          </p>
        </div>
      ),
    },
    {
      title: "Traction",
      content: (
        <div className="grid grid-cols-2 gap-6">
          {[
            { value: "$8K", label: "MRR" },
            { value: "3", label: "Paying design partners" },
            { value: "1,200+", label: "GitHub stars" },
            { value: "40+", label: "Teams on waitlist" },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-4 border border-zinc-800 rounded">
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-zinc-500 text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Market",
      content: (
        <div className="space-y-4 text-zinc-300 text-base leading-relaxed">
          <p>
            Data integration & pipeline tools:{" "}
            <span className="text-white font-semibold">$15.6B by 2027</span>{" "}
            (Gartner)
          </p>
          <p>
            Python is now the #1 language for data work. Yet every pipeline
            tool forces you into YAML, SQL-only, or JVM ecosystems.
          </p>
          <p>
            <span className="text-white font-semibold">540,000+</span> data
            engineers globally. Growing 35% YoY as every company becomes a
            data company.
          </p>
        </div>
      ),
    },
    {
      title: "Team",
      content: (
        <div className="space-y-6">
          <div className="border border-zinc-800 rounded p-4">
            <div className="text-white font-semibold text-lg">
              Alex Park{" "}
              <span className="text-zinc-500 text-sm font-normal">
                CEO
              </span>
            </div>
            <div className="text-zinc-400 text-sm mt-1">
              Stanford CS &apos;23. Previously PM intern at Stripe (Connect
              team). Built internal data tooling used by 200+ engineers.
              Dropped out of Stanford MS to start Conduit.
            </div>
          </div>
          <div className="border border-zinc-800 rounded p-4">
            <div className="text-white font-semibold text-lg">
              Jakub Novak{" "}
              <span className="text-zinc-500 text-sm font-normal">
                CTO
              </span>
            </div>
            <div className="text-zinc-400 text-sm mt-1">
              CTU Prague CS &apos;22. Previously ML infrastructure engineer at
              Hugging Face. Core contributor to Apache Arrow (Python
              bindings). Built Conduit&apos;s runtime engine from scratch.
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Business Model",
      content: (
        <div className="space-y-4 text-zinc-300 text-base leading-relaxed">
          <p>
            <span className="text-white font-semibold">Open core.</span> The
            pipeline SDK is open source. Cloud platform is paid.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between border-b border-zinc-800 pb-2">
              <span>Free tier</span>
              <span className="text-zinc-500">3 pipelines, community support</span>
            </div>
            <div className="flex justify-between border-b border-zinc-800 pb-2">
              <span>Team</span>
              <span className="text-zinc-500">$500/mo - unlimited pipelines</span>
            </div>
            <div className="flex justify-between">
              <span>Enterprise</span>
              <span className="text-zinc-500">Custom - SSO, SLAs, dedicated support</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "The Ask",
      content: (
        <div className="space-y-4 text-zinc-300 text-base leading-relaxed">
          <p>
            Raising{" "}
            <span className="text-white font-semibold">$2M seed round</span>
          </p>
          <div className="space-y-2 mt-4">
            <div className="flex justify-between">
              <span>Engineering (3 hires)</span>
              <span className="text-zinc-400">50%</span>
            </div>
            <div className="flex justify-between">
              <span>Go-to-market</span>
              <span className="text-zinc-400">30%</span>
            </div>
            <div className="flex justify-between">
              <span>Infrastructure & ops</span>
              <span className="text-zinc-400">20%</span>
            </div>
          </div>
          <div className="border border-zinc-700 rounded p-4 mt-6 text-center">
            <div className="text-zinc-500 text-sm">Contact</div>
            <div className="text-white">alex@conduit.dev</div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {slides.map((slide, i) => (
        <section
          key={i}
          className="min-h-screen flex flex-col justify-center px-6 py-12 max-w-lg mx-auto"
        >
          {slide.title && (
            <h2
              className="text-2xl font-bold mb-8"
              style={{ color: "#6fdb6f" }}
            >
              {slide.title}
            </h2>
          )}
          {slide.content}
          <div className="text-zinc-700 text-xs text-center mt-12">
            {i + 1} / {slides.length}
          </div>
        </section>
      ))}
    </div>
  );
}
