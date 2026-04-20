"use client";

import { useEffect, useState } from "react";

export function LiveScore({
  score,
  color,
}: {
  score: number | null;
  color: string;
}) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (score === null) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 450);
    return () => clearTimeout(t);
  }, [score]);

  if (score === null) return null;

  return (
    <div
      className="font-pixel text-[10px] px-3 py-1 border-2 transition-shadow duration-300 leading-none"
      style={{
        borderColor: pulse ? color : color + "60",
        color,
        boxShadow: pulse ? `0 0 12px 0 ${color}80` : "none",
      }}
    >
      {score}/10
    </div>
  );
}
