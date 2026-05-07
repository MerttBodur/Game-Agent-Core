import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CategoryRecommendation } from "@workspace/api-client-react";

const ECOSYSTEM_TOOLTIPS: Record<string, string> = {
  Unity: "Unity ecosystem uses C#. C++, Blueprint, GDScript are incompatible.",
  "Unreal Engine": "Unreal uses C++ and Blueprint. C#, GDScript are incompatible.",
  Godot: "Godot uses GDScript (or C# via mono build). C++, Blueprint are not standard.",
  GameMaker: "GameMaker uses GML. Other languages are not native to its toolchain.",
  Bevy: "Bevy is a Rust-native engine. Other languages do not target it.",
};

function tooltipFor(engineName: string | undefined): string {
  if (!engineName) return "Locked by your engine pick. Alternatives in this category are incompatible.";
  return (
    ECOSYSTEM_TOOLTIPS[engineName] ??
    `${engineName} ecosystem narrows this category. Alternatives shown elsewhere are not compatible.`
  );
}

export function LockedCategoryCard({
  cat,
  engineName,
}: {
  cat: CategoryRecommendation;
  engineName: string | undefined;
}) {
  return (
    <Card className="border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-semibold uppercase tracking-widest">
          🔒 {cat.categoryLabel}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground cursor-help text-xs underline decoration-dotted underline-offset-2">
                why locked?
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {tooltipFor(engineName)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-foreground text-base font-bold">{cat.topPick.toolName}</span>
        <span className="text-primary text-xs font-mono">{cat.topPick.score.toFixed(1)}</span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{cat.topPick.reasoning}</p>
    </Card>
  );
}
