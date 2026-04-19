import { useState } from "react";
import {
  useAnalyzeProject,
  ProjectInputBudget,
  ProjectInputTimeLimit,
  ProjectInputSkillLevel,
  ProjectInputTeamSize,
  ProjectInputArtCapability,
} from "@workspace/api-client-react";
import type { AnalysisResult, ProjectInput, CategoryRecommendation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
  ui: "UI / HUD",
  vfx: "VFX & Particles",
  version_control: "Version Control",
  deployment: "Deployment",
  ai_tooling: "AI Tooling",
};

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
          <span className="text-sm font-mono text-primary">{Math.round(cat.topPick.score)}</span>
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
                    <span className="text-xs font-mono text-muted-foreground">{Math.round(alt.score)}</span>
                  </div>
                  <ScoreBar score={alt.score} />
                  <p className="text-xs text-muted-foreground mt-2">{alt.reasoning}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function AnalysisView({ result }: { result: AnalysisResult }) {
  const confidenceColor = result.overallConfidence >= 75
    ? "text-green-400"
    : result.overallConfidence >= 55
    ? "text-yellow-400"
    : "text-red-400";

  return (
    <div className="space-y-8">
      <div className="p-6 rounded-xl border border-primary/30 bg-primary/5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                {result.detectedProjectType}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.projectSummary}</p>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-4xl font-black ${confidenceColor}`}>{Math.round(result.overallConfidence)}</div>
            <div className="text-xs text-muted-foreground">Fit Score</div>
          </div>
        </div>
        <Separator className="my-4 bg-border" />
        <p className="text-sm font-semibold text-primary">{result.stackOverview}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Stack Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {result.categories.map((cat, i) => (
            <CategoryCard key={i} cat={cat} />
          ))}
        </div>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card">
        <h3 className="text-sm font-semibold text-foreground mb-2">Final Analysis</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{result.finalSummary}</p>
      </div>
    </div>
  );
}

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
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const mutation = useAnalyzeProject();

  const handleSubmit = (e: React.FormEvent) => {
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
    };

    mutation.mutate({ data: input }, {
      onSuccess: (data) => setResult(data),
    });
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
              placeholder="Describe your game concept — genre, mechanics, what makes it unique..."
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
              placeholder="Any other requirements, preferences, or constraints..."
              className="bg-card border-border text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>

          <Button
            type="submit"
            disabled={mutation.isPending || !projectIdea.trim() || platformTarget.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 h-11"
          >
            {mutation.isPending ? "Analyzing..." : "Analyze Project"}
          </Button>

          {mutation.isError && (
            <p className="text-sm text-destructive">Analysis failed. Please try again.</p>
          )}
        </form>

        {mutation.isPending && (
          <div className="flex items-center gap-3 p-6 rounded-xl border border-border bg-card text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Running AI-powered analysis across all tool categories...</span>
          </div>
        )}

        {result && !mutation.isPending && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Separator className="mb-8 bg-border" />
            <AnalysisView result={result} />
          </div>
        )}
      </div>
    </div>
  );
}
