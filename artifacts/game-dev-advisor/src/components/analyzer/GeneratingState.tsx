import { useEffect, useState } from "react";

const DOTS_INTERVAL_MS = 400;

export const GENERATING_STAGE_COUNT = 4;

function stageLabels(): string[] {
  return [
    "Checking feasibility.",
    "Choosing the right engine.",
    "Finding tools for each category.",
    "Scoring and finalizing.",
  ];
}

function GearIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function GeneratingState({ stage }: { stage: number; toolCount?: number }) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const id = setInterval(
      () => setDots((d) => (d.length >= 3 ? "" : `${d}.`)),
      DOTS_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, []);

  const labels = stageLabels();
  const currentStage = Math.min(stage, labels.length - 1);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-7">
      <div className="flex items-center gap-3.5">
        <span className="inline-flex text-primary animate-[spin_1.6s_linear_infinite]">
          <GearIcon />
        </span>
        <div className="flex flex-col">
          <span className="text-base font-bold text-foreground">Generating analysis{dots}</span>
          <span className="mt-0.5 text-[13px] text-muted-foreground">{labels[currentStage]}</span>
        </div>
      </div>
      <div className="flex gap-1.5">
        {labels.map((_, i) => (
          <div
            key={i}
            className={`h-[3px] flex-1 rounded-sm transition-colors duration-500 ${
              i <= currentStage ? "bg-primary" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
