import { Button } from "@/components/ui/button";
import type { AnalysisResult, ArchetypeScope } from "@workspace/api-client-react";

const INDUSTRY_BASELINES: Record<
  ArchetypeScope,
  { budget: string; team: string; time: string; examples: [string, string, string] }
> = {
  AAA: {
    budget: "$50M - $300M",
    team: "100 - 500 people",
    time: "3 - 7 years",
    examples: [
      "Cyberpunk 2077 ($174M, 500 ppl, 8 y)",
      "Hogwarts Legacy ($150M, 300 ppl, 6 y)",
      "Black Myth: Wukong (~$70M, 140 ppl, 6 y)",
    ],
  },
  AA: {
    budget: "$500K - $50M",
    team: "20 - 100 people",
    time: "2 - 4 years",
    examples: [
      "Hellblade: Senua's Sacrifice (~$10M, 20 ppl, 3.5 y)",
      "A Plague Tale: Innocence (~$15M, 35 ppl, 3 y)",
      "Vampire Survivors clones at studio scale",
    ],
  },
  indie: {
    budget: "$1K - $500K",
    team: "1 - 10 people",
    time: "6 - 24 months",
    examples: [
      "Stardew Valley ($0, solo, 4.5 y)",
      "Hollow Knight (~$57K, 3 ppl, 2.5 y)",
      "Celeste (~$0, 2 ppl, 2 y)",
    ],
  },
  prototype: {
    budget: "~$0",
    team: "1 - 2 people",
    time: "1 - 3 months",
    examples: ["Ludum Dare entries that grew", "Internal R&D demos", "Polished gameplay slices"],
  },
  jam: {
    budget: "~$0",
    team: "1 person",
    time: "hours - days",
    examples: ["Ludum Dare", "Global Game Jam", "GMTK Game Jam"],
  },
};

type HeaderResult = Pick<
  AnalysisResult,
  "ideaScore" | "ideaScoreTier" | "mismatchReasons" | "archetype" | "projectMode" | "feasibilityOverridden"
>;

type Tier = AnalysisResult["ideaScoreTier"];

export function FeasibilityHeader({
  result,
  onAdviseAnyway,
  isOverriding = false,
}: {
  result: HeaderResult;
  onAdviseAnyway?: () => void;
  isOverriding?: boolean;
}) {
  const tier: Tier = result.ideaScoreTier;
  const score = result.ideaScore.toFixed(1);
  const implied = result.archetype.implied.scope;
  const achievable = result.archetype.achievable.scope;
  const reasons = result.mismatchReasons;
  const projectMode = result.projectMode;

  if (result.feasibilityOverridden) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          You proceeded despite feasibility concerns. Recommendations are best-effort but your project may not be
          deliverable.
        </div>
        <PassPill score={score} implied={implied} projectMode={projectMode} variant="warn" />
      </div>
    );
  }

  if (tier === "pass") {
    return <PassPill score={score} implied={implied} projectMode={projectMode} variant="pass" />;
  }

  if (tier === "warn") {
    return (
      <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4">
        <p className="text-sm font-semibold text-yellow-300">Idea Score: {score} / 100 - Tight Fit</p>
        {reasons.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-yellow-200/90">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Recommendations may stretch your resources.</p>
      </div>
    );
  }

  const baseline = INDUSTRY_BASELINES[implied] ?? INDUSTRY_BASELINES.indie;
  return (
    <div className="space-y-4 rounded-xl border border-red-500/40 bg-red-500/10 p-6">
      <p className="text-base font-semibold text-red-300">Idea Score: {score} / 100 - Not Feasible</p>

      {reasons.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-red-200/90">Concerns</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-red-200/90">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Industry baseline ({implied})</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>Budget</dt>
          <dd className="font-mono">{baseline.budget}</dd>
          <dt>Team</dt>
          <dd className="font-mono">{baseline.team}</dd>
          <dt>Time</dt>
          <dd className="font-mono">{baseline.time}</dd>
        </dl>
        <div>
          <p className="mt-2 font-semibold text-foreground">Examples</p>
          <ul className="space-y-0.5 text-[11px]">
            {baseline.examples.map((example) => (
              <li key={example}>- {example}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Suggested adjustments: scope down to <span className="font-mono">{achievable}</span> or extend timeline /
        team.
      </p>

      {onAdviseAnyway && (
        <Button
          type="button"
          variant="outline"
          className="border-red-500/40 text-red-200 hover:bg-red-500/10 hover:text-red-100"
          onClick={onAdviseAnyway}
          disabled={isOverriding}
        >
          {isOverriding ? "Re-running..." : "Advise Anyway"}
        </Button>
      )}
    </div>
  );
}

function PassPill({
  score,
  implied,
  projectMode,
  variant,
}: {
  score: string;
  implied: ArchetypeScope;
  projectMode: AnalysisResult["projectMode"];
  variant: "pass" | "warn";
}) {
  const colorClass =
    variant === "pass"
      ? "border-green-500/30 bg-green-500/10 text-green-300"
      : "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-4 py-2 text-xs ${colorClass}`}
    >
      <span className="font-semibold">Idea Score: {score} / 100 - {variant === "pass" ? "Realistic" : "Override"}</span>
      <span className="opacity-80">
        Implied: <span className="font-mono">{implied}</span>
      </span>
      <span className="opacity-80">
        Mode: <span className="font-mono">{projectMode}</span>
      </span>
    </div>
  );
}
