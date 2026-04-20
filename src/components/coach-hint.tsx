"use client";

import { useEffect, useState } from "react";

export function CoachHint({
  hint,
  color,
  label = "COACH",
}: {
  hint: string | null;
  color: string;
  label?: string;
}) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!hint) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 450);
    return () => clearTimeout(t);
  }, [hint]);

  const display = hint ?? "GOOD LUCK";

  return (
    <div
      className="mx-auto w-full max-w-sm border-2 px-4 py-3 text-center transition-shadow duration-300"
      style={{
        borderColor: pulse ? color : color + "60",
        boxShadow: pulse ? `0 0 18px 0 ${color}80` : "none",
      }}
    >
      <div className="font-pixel text-[9px] text-zinc-500 tracking-widest mb-1">
        {label}
      </div>
      <div
        className="font-pixel text-base sm:text-lg tracking-wider"
        style={{ color }}
      >
        {display}
      </div>
    </div>
  );
}
