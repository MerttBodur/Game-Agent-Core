import { useState } from "react";
import {
  ProjectInputBudget,
  ProjectInputTimeLimit,
  ProjectInputSkillLevel,
  ProjectInputTeamSize,
  ProjectInputArtCapability,
} from "@workspace/api-client-react";
import type { AnalysisResult, ProjectInput, CategoryRecommendation, Evidence } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LockedCategoryCard } from "@/components/LockedCategoryCard";
import { FeasibilityHeader } from "@/components/FeasibilityHeader";
import {
  recomputeCategoryResults,
  type ProjectMode as Mode,
  type Scope as ScopeValue,
} from "@/lib/scoring";

const BUDGET_OPTIONS = [
  { value: "zero", label: "Zero", desc: "No money at all" },
  { value: "low", label: "Low", desc: "< $500" },
  { value: "medium", label: "Medium", desc: "$500 - $5k" },
  { value: "high", label: "High", desc: "$5k - $50k" },
  { value: "enterprise", label: "Enterprise", desc: "$50k+" },
];

const TIME_OPTIONS = [
  { value: "jam", label: "Game Jam", desc: "48-72h" },
  { value: "month", label: "1 Month", desc: "30 days" },
  { value: "quarter", label: "Quarter", desc: "3 months" },
  { value: "year", label: "1 Year", desc: "12 months" },
  { value: "longterm", label: "Long-term", desc: "1+ years" },
];

const SKILL_OPTIONS = [
  { value: "beginner", label: "Beginner", desc: "New to game dev" },
  { value: "intermediate", label: "Intermediate", desc: "Some experience" },
  { value: "advanced", label: "Advanced", desc: "Experienced dev" },
  { value: "expert", label: "Expert", desc: "Industry veteran" },
];

const TEAM_OPTIONS = [
  { value: "solo", label: "Solo", desc: "Just me" },
  { value: "small", label: "Small", desc: "2-5 people" },
  { value: "medium", label: "Medium", desc: "6-20 people" },
  { value: "large", label: "Large", desc: "20+ people" },
];

const PLATFORM_OPTIONS = [
  { value: "pc", label: "PC / Desktop" },
  { value: "mobile", label: "Mobile" },
  { value: "web", label: "Web / Browser" },
  { value: "console", label: "Console" },
  { value: "vr", label: "VR / AR" },
];

const ART_OPTIONS = [
  { value: "none", label: "None", desc: "No art skills" },
  { value: "basic", label: "Basic", desc: "Simple graphics" },
  { value: "intermediate", label: "Intermediate", desc: "Decent visuals" },
  { value: "advanced", label: "Advanced", desc: "Strong art skills" },
  { value: "professional", label: "Professional", desc: "Expert artist" },
];

const CATEGORY_LABELS: Record<string, string> = {
  engine: "Game Engine",
  programming: "Programming Language",
  art: "Art & Assets",
  animation: "Animation",
  vfx: "VFX & Particles",
  version_control: "Version Control",
  deployment: "Deployment",
  ai_tooling: "AI Tooling",
  audio: "Audio & Music",
  networking: "Networking",
  backend_services: "Backend Services",
};

const PAID_PRIORITY_OPTIONS = [
  { value: "ai_tooling", label: "AI Tooling" },
  { value: "art", label: "Art & Assets" },
  { value: "audio", label: "Audio & Music" },
  { value: "vfx", label: "VFX" },
  { value: "networking", label: "Networking" },
  { value: "backend_services", label: "Backend Services" },
];

function ScoreBar({ score }: { score: number }) {
  const cls = score >= 75 ? "" : score >= 55 ? " score-bar-fill-medium" : " score-bar-fill-low";
  return (
    <div className="score-bar w-full">
      <div
        className={`score-bar-fill${cls}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function EvidencePanel({ evidence }: { evidence: Evidence }) {
  const chunks = evidence.ragChunks.slice(0, 3);
  return (
    <div className="mt-3 space-y-4 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
      <div>
        <p className="mb-2 font-semibold text-foreground">Score Breakdown</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>Budget</dt>
          <dd className="text-right font-mono">{evidence.scoreBreakdown.budget?.toFixed(1)}</dd>
          <dt>Skill</dt>
          <dd className="text-right font-mono">{evidence.scoreBreakdown.skill?.toFixed(1)}</dd>
          <dt>Platform</dt>
          <dd className="text-right font-mono">{evidence.scoreBreakdown.platform?.toFixed(1)}</dd>
          <dt>Time</dt>
          <dd className="text-right font-mono">{evidence.scoreBreakdown.timeLimit?.toFixed(1)}</dd>
          <dt>Art</dt>
          <dd className="text-right font-mono">{evidence.scoreBreakdown.artCapability?.toFixed(1)}</dd>
          <dt>Popularity</dt>
          <dd className="text-right font-mono">
            {(evidence.scoreBreakdown as { popularity?: number }).popularity?.toFixed(1) ?? "—"}
          </dd>
          <dt>Paid Priority</dt>
          <dd className="text-right font-mono">
            {(evidence.scoreBreakdown as { paidPriority?: number }).paidPriority?.toFixed(1) ?? "—"}
          </dd>
          <dt>Jitter</dt>
          <dd className="text-right font-mono">
            {(evidence.scoreBreakdown as { jitter?: number }).jitter?.toFixed(2) ?? "—"}
          </dd>
        </dl>
        <p className="mt-2 text-[11px] text-muted-foreground/80">
          Total: <span className="font-mono">{evidence.scoreBreakdown.total?.toFixed(1)}</span>
        </p>
      </div>

      {chunks.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold text-foreground">Knowledge Sources</p>
          {chunks.map((chunk, index) => (
            <blockquote key={`${chunk.source}-${index}`} className="border-l-2 border-border pl-2 italic">
              {chunk.text}
              <footer className="mt-1 not-italic text-[11px] text-muted-foreground/70">{chunk.source}</footer>
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryCard({ cat }: { cat: CategoryRecommendation }) {
  const [showAlts, setShowAlts] = useState(false);

  return (
    <Card className="p-5 border-border bg-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {CATEGORY_LABELS[cat.category] ?? cat.category}
        </span>
        <Badge variant="secondary" className="text-xs">Top Pick</Badge>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-lg font-bold text-foreground">{cat.topPick.toolName}</span>
          <span className="text-sm font-mono text-primary">{cat.topPick.score.toFixed(1)}</span>
        </div>
        <ScoreBar score={cat.topPick.score} />
      </div>

      <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{cat.topPick.reasoning}</p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold text-green-400 mb-1">Strengths</p>
          <ul className="space-y-0.5">
            {cat.topPick.strengths.slice(0, 3).map((s, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                <span className="text-green-500 mt-0.5 shrink-0">+</span>{s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-red-400 mb-1">Weaknesses</p>
          <ul className="space-y-0.5">
            {cat.topPick.weaknesses.slice(0, 3).map((w, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                <span className="text-red-500 mt-0.5 shrink-0">-</span>{w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {cat.alternatives.length > 0 && (
        <>
          <button
            onClick={() => setShowAlts(!showAlts)}
            className="text-xs text-primary hover:underline"
          >
            {showAlts ? "Hide" : "Show"} {cat.alternatives.length} alternative{cat.alternatives.length > 1 ? "s" : ""}
          </button>
          {showAlts && (
            <div className="mt-3 space-y-2">
              {cat.alternatives.map((alt, i) => (
                <div key={i} className="p-3 rounded-md bg-muted/40 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-foreground">{alt.toolName}</span>
                    <span className="text-xs font-mono text-muted-foreground">{alt.score.toFixed(1)}</span>
                  </div>
                  <ScoreBar score={alt.score} />
                  <p className="text-xs text-muted-foreground mt-2">{alt.reasoning}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {cat.topPick.evidence && (
        <Collapsible className="mt-3">
          <CollapsibleTrigger className="text-xs text-primary hover:underline">
            Why this recommendation?
          </CollapsibleTrigger>
          <CollapsibleContent>
            <EvidencePanel evidence={cat.topPick.evidence} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}

function StackSections({
  locked,
  flexible,
  hidden,
}: {
  locked: CategoryRecommendation[];
  flexible: CategoryRecommendation[];
  hidden: string[];
}) {
  const engineEntry = locked.find((c) => c.category === "engine");
  const engineName = engineEntry?.topPick.toolName;
  const lockedNonEngine = locked.filter((c) => c.category !== "engine");

  return (
    <div className="space-y-8">
      {engineEntry && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            🔒 Locked
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <CategoryCard cat={engineEntry} />
            {lockedNonEngine.map((cat) => (
              <LockedCategoryCard key={cat.category} cat={cat} engineName={engineName} />
            ))}
          </div>
        </div>
      )}

      {flexible.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            ✎ Flexible
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {flexible.map((cat) => (
              <CategoryCard key={cat.category} cat={cat} />
            ))}
          </div>
        </div>
      )}

      {hidden.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Hidden by project mode: {hidden.join(", ")}.
        </p>
      )}

      {locked.length === 0 && flexible.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          No recommendations available for this category yet.
        </div>
      )}
    </div>
  );
}

function AnalysisView({
  result,
  onAdviseAnyway,
  isOverriding,
  projectInput,
}: {
  result: AnalysisResult;
  onAdviseAnyway: () => void;
  isOverriding: boolean;
  projectInput: ProjectInput | null;
}) {
  const buckets = result.categoryResults ?? { locked: [], flexible: [], hidden: [], candidatePool: {} };
  const tier = (result.ideaScoreTier ?? "pass") as "pass" | "warn" | "block";
  const blocked = tier === "block" && !result.feasibilityOverridden;
  const baseMode = (result.projectMode ?? "single_player") as Mode;
  const baseScope = (result.archetype?.achievable?.scope ?? "indie") as ScopeValue;
  const [modeOverride, setModeOverride] = useState<Mode>(baseMode);
  const [scopeOverride, setScopeOverride] = useState<ScopeValue>(baseScope);
  const isOverridden = modeOverride !== baseMode || scopeOverride !== baseScope;

  const recomputed = isOverridden && projectInput
    ? recomputeCategoryResults({
      input: projectInput,
      modeOverride,
      scopeOverride,
      candidatePool: (buckets.candidatePool ?? {}) as never,
      ragChunks: buckets.locked?.[0]?.topPick.evidence?.ragChunks ?? [],
    })
    : null;

  const renderLocked = recomputed ? recomputed.locked : (buckets.locked ?? []);
  const renderFlexible = recomputed ? recomputed.flexible : (buckets.flexible ?? []);
  const renderHidden = recomputed ? recomputed.hidden : (buckets.hidden ?? []);

  return (
    <div className="space-y-8">
      <FeasibilityHeader
        result={result}
        onAdviseAnyway={blocked ? onAdviseAnyway : undefined}
        isOverriding={isOverriding}
        modeOverride={modeOverride}
        scopeOverride={scopeOverride}
        onChangeMode={setModeOverride}
        onChangeScope={setScopeOverride}
      />

      {isOverridden && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
          Adjusted client-side. Submit the form again to regenerate the narrative.
        </div>
      )}

      {!blocked && (
        <>
          <div className="p-6 rounded-xl border border-primary/30 bg-primary/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                  {result.detectedProjectType}
                </Badge>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2">{result.projectSummary}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-4xl font-black text-primary">{Math.round(result.overallConfidence)}</div>
                <div className="text-xs text-muted-foreground">Fit Score</div>
              </div>
            </div>
            <Separator className="my-4 bg-border" />
            <p className="text-sm font-semibold text-primary">{result.stackOverview ?? ""}</p>
          </div>

          <StackSections
            locked={renderLocked}
            flexible={renderFlexible}
            hidden={renderHidden}
          />

          <div className="p-5 rounded-xl border border-border bg-card">
            <h3 className="text-sm font-semibold text-foreground mb-2">Final Analysis</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.finalSummary}</p>
          </div>
        </>
      )}
    </div>
  );
}

type AnalyzerPhase = "idle" | "scoring" | "metadata_ready" | "streaming" | "done" | "error";

function SelectCards({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; desc?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
            value === opt.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground"
          }`}
        >
          <span className="font-medium">{opt.label}</span>
          {opt.desc && <span className="ml-1 text-xs opacity-70">/ {opt.desc}</span>}
        </button>
      ))}
    </div>
  );
}

function PlatformChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {PLATFORM_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
            value.includes(opt.value)
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function Analyzer() {
  const [projectIdea, setProjectIdea] = useState("");
  const [budget, setBudget] = useState<ProjectInput["budget"]>(ProjectInputBudget.low);
  const [timeLimit, setTimeLimit] = useState<ProjectInput["timeLimit"]>(ProjectInputTimeLimit.quarter);
  const [skillLevel, setSkillLevel] = useState<ProjectInput["skillLevel"]>(ProjectInputSkillLevel.intermediate);
  const [teamSize, setTeamSize] = useState<ProjectInput["teamSize"]>(ProjectInputTeamSize.solo);
  const [platformTarget, setPlatformTarget] = useState<string[]>(["pc"]);
  const [artCapability, setArtCapability] = useState<ProjectInput["artCapability"]>(ProjectInputArtCapability.basic);
  const [otherConstraints, setOtherConstraints] = useState("");
  const [paidPriorityCategories, setPaidPriorityCategories] = useState<string[]>([]);
  const [phase, setPhase] = useState<AnalyzerPhase>("idle");
  const [partialCategoryResults, setPartialCategoryResults] = useState<{
    locked: CategoryRecommendation[];
    flexible: CategoryRecommendation[];
    hidden: string[];
  }>({ locked: [], flexible: [], hidden: [] });
  const [narrativeTokens, setNarrativeTokens] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [lastInput, setLastInput] = useState<ProjectInput | null>(null);
  const [isOverriding, setIsOverriding] = useState(false);
  const [metadata, setMetadata] = useState<{
    projectSummary: string;
    detectedProjectType: string;
    stackOverview: string;
    overallConfidence: number;
  } | null>(null);

  const isBusy = phase === "scoring" || phase === "metadata_ready" || phase === "streaming";

  const applySseEvent = (eventName: string, rawData: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      setPhase("error");
      setErrorMsg("Something went wrong. Please try again.");
      return;
    }

    if (eventName === "scoring_complete") {
      const payload = parsed as {
        categoryResults?: { locked?: CategoryRecommendation[]; flexible?: CategoryRecommendation[]; hidden?: string[] };
      };
      setPartialCategoryResults({
        locked: payload.categoryResults?.locked ?? [],
        flexible: payload.categoryResults?.flexible ?? [],
        hidden: payload.categoryResults?.hidden ?? [],
      });
      setPhase("metadata_ready");
      return;
    }

    if (eventName === "metadata_complete") {
      const payload = parsed as {
        projectSummary: string;
        detectedProjectType: string;
        stackOverview: string;
        overallConfidence: number;
      };
      setMetadata(payload);
      setPhase("streaming");
      return;
    }

    if (eventName === "narrative_chunk") {
      const payload = parsed as { token?: string };
      if (payload.token) {
        setNarrativeTokens((prev) => prev + payload.token);
      }
      if (phase !== "done") {
        setPhase("streaming");
      }
      return;
    }

    if (eventName === "done") {
      setResult(parsed as AnalysisResult);
      setPhase("done");
      return;
    }

    if (eventName === "error") {
      const payload = parsed as { message?: string };
      setPhase("error");
      setErrorMsg(payload.message || "Something went wrong. Please try again.");
    }
  };

  const streamAnalysis = async (input: ProjectInput): Promise<void> => {
    setPhase("scoring");
    setLastInput(input);
    setErrorMsg("");
    setResult(null);
    setMetadata(null);
    setNarrativeTokens("");
    setPartialCategoryResults({ locked: [], flexible: [], hidden: [] });

    try {
      const res = await fetch("/api/advisor/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok || !res.body) {
        if (res.status === 429) {
          setErrorMsg("You're sending requests too quickly. Please wait a minute.");
        } else if (res.status === 404) {
          setErrorMsg("Not found.");
        } else {
          setErrorMsg("Something went wrong. Please try again.");
        }
        setPhase("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const lines = block.split(/\r?\n/);
          let eventName = "";
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            }
          }

          if (!eventName || dataLines.length === 0) continue;
          applySseEvent(eventName, dataLines.join("\n"));
        }
      }

      const trailing = buffer.trim();
      if (trailing) {
        const lines = trailing.split(/\r?\n/);
        let eventName = "";
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }
        if (eventName && dataLines.length > 0) {
          applySseEvent(eventName, dataLines.join("\n"));
        }
      }
    } catch {
      setPhase("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  };

  const handleAdviseAnyway = async () => {
    if (!lastInput || isOverriding) return;
    setIsOverriding(true);
    try {
      await streamAnalysis({ ...lastInput, adviseAnyway: true });
    } finally {
      setIsOverriding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectIdea.trim() || platformTarget.length === 0) return;

    const input: ProjectInput = {
      projectIdea,
      budget,
      timeLimit,
      skillLevel,
      teamSize,
      platformTarget,
      artCapability,
      otherConstraints: otherConstraints || null,
      paidPriorityCategories: paidPriorityCategories.length > 0 ? paidPriorityCategories : undefined,
    };

    await streamAnalysis(input);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-black text-foreground tracking-tight mb-2">Game Dev Stack Advisor</h1>
          <p className="text-muted-foreground">
            Describe your game project and get an AI-powered tool stack recommendation with detailed rationale.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 mb-12">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Project Idea <span className="text-red-400">*</span>
            </label>
            <Textarea
              value={projectIdea}
              onChange={(e) => setProjectIdea(e.target.value)}
              placeholder="Describe your game concept and key mechanics"
              className="min-h-[100px] bg-card border-border text-foreground placeholder:text-muted-foreground resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Budget</label>
            <SelectCards options={BUDGET_OPTIONS} value={budget} onChange={(v) => setBudget(v as ProjectInput["budget"])} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Time Limit</label>
            <SelectCards options={TIME_OPTIONS} value={timeLimit} onChange={(v) => setTimeLimit(v as ProjectInput["timeLimit"])} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Skill Level</label>
            <SelectCards options={SKILL_OPTIONS} value={skillLevel} onChange={(v) => setSkillLevel(v as ProjectInput["skillLevel"])} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Team Size</label>
            <SelectCards options={TEAM_OPTIONS} value={teamSize} onChange={(v) => setTeamSize(v as ProjectInput["teamSize"])} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Target Platforms <span className="text-red-400">*</span>
            </label>
            <PlatformChips value={platformTarget} onChange={setPlatformTarget} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Art & Design Capability</label>
            <SelectCards options={ART_OPTIONS} value={artCapability} onChange={(v) => setArtCapability(v as ProjectInput["artCapability"])} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Other Constraints <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </label>
            <Textarea
              value={otherConstraints}
              onChange={(e) => setOtherConstraints(e.target.value)}
              placeholder="Any other requirements, preferences, or constraints"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Paid-Priority Categories <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Categories where you accept paid tools. Empty = the advisor prefers free.
            </p>
            <div className="flex flex-wrap gap-2">
              {PAID_PRIORITY_OPTIONS.map((opt) => {
                const active = paidPriorityCategories.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setPaidPriorityCategories(
                        active
                          ? paidPriorityCategories.filter((c) => c !== opt.value)
                          : [...paidPriorityCategories, opt.value],
                      )
                    }
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            type="submit"
            disabled={isBusy || !projectIdea.trim() || platformTarget.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 h-11"
          >
            {isBusy ? "Analyzing" : "Analyze Project"}
          </Button>

          {phase === "error" && (
            <p className="text-sm text-destructive">{errorMsg || "Something went wrong. Please try again."}</p>
          )}
        </form>

        {phase === "scoring" && (
          <div className="flex items-center gap-3 p-6 rounded-xl border border-border bg-card text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Scoring 116 tools across all categories.</span>
          </div>
        )}

        {(phase === "metadata_ready" || phase === "streaming") && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <Separator className="bg-border" />

            {metadata && (
              <div className="p-6 rounded-xl border border-primary/30 bg-primary/5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                        {metadata.detectedProjectType}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{metadata.projectSummary}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-4xl font-black text-yellow-400">{Math.round(metadata.overallConfidence)}</div>
                    <div className="text-xs text-muted-foreground">Fit Score</div>
                  </div>
                </div>
                <Separator className="my-4 bg-border" />
                <p className="text-sm font-semibold text-primary">{metadata.stackOverview}</p>
              </div>
            )}

            <StackSections
              locked={partialCategoryResults.locked}
              flexible={partialCategoryResults.flexible}
              hidden={partialCategoryResults.hidden}
            />

            <div className="p-5 rounded-xl border border-border bg-card">
              <h3 className="text-sm font-semibold text-foreground mb-2">Final Analysis</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap min-h-16">
                {narrativeTokens || (phase === "metadata_ready" ? "Generating AI narrative." : "Streaming narrative.")}
              </p>
            </div>
          </div>
        )}

        {result && phase === "done" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Separator className="mb-8 bg-border" />
            <AnalysisView
              result={result}
              onAdviseAnyway={handleAdviseAnyway}
              isOverriding={isOverriding}
              projectInput={lastInput}
            />
          </div>
        )}
      </div>
    </div>
  );
}
