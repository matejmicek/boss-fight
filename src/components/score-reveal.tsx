"use client";

export function ScoreReveal({
  score,
  onContinue,
  continueLabel = "CONTINUE",
}: {
  score: number;
  onContinue: () => void;
  continueLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-6 border-t border-zinc-800">
      <div className="font-pixel text-xl mb-2" style={{ color: "#ffd700" }}>
        LEVEL COMPLETE
      </div>
      <div className="text-4xl font-bold" style={{ color: "#ffd700" }}>
        {score}/10
      </div>
      <button
        onClick={onContinue}
        className="mt-6 px-6 py-3 border-2 border-zinc-700 hover:border-zinc-500 transition-colors text-xs pixel-btn"
      >
        {continueLabel}
      </button>
    </div>
  );
}
