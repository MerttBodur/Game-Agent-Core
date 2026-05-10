import { useMemo, useState } from "react";
import {
  ProjectInputBudget,
  ProjectInputTimeLimit,
  ProjectInputSkillLevel,
  ProjectInputTeamSize,
  ProjectInputArtCapability,
  useListTools,
} from "@workspace/api-client-react";
import type { ProjectInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

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
  { value: "team", label: "Team", desc: "2+ people" },
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

const PAID_PRIORITY_OPTIONS = [
  { value: "ai_tooling", label: "AI Tooling" },
  { value: "art", label: "Art & Assets" },
  { value: "audio", label: "Audio & Music" },
  { value: "vfx", label: "VFX" },
  { value: "networking", label: "Networking" },
  { value: "backend_services", label: "Backend Services" },
];

const CATEGORY_LABELS: Record<string, string> = {
  game_engine: "Game Engine",
  ide: "IDE",
  version_control: "Version Control",
  art_asset_creation: "Art & Asset Creation",
  audio: "Audio",
  ai_coding_assistant: "AI Coding Assistant",
  deployment_publishing: "Deployment & Publishing",
};

// Backend's actual response shape. The OpenAPI spec advertises a richer
// AnalysisResult with feasibility/archetype/categoryResults, but those
// pipelines are not implemented yet — we render only what the backend emits.
interface BackendRecommendationItem {
  toolId: string;
  score: number;
  reasoning: string;
  pros: string[];
  cons: string[];
  compatibility: string;
  useCaseJustification: string;
  phase: string[];
}

interface BackendRecommendation {
  category: string;
  primary: BackendRecommendationItem;
  alternatives: BackendRecommendationItem[];
}

interface BackendAnalysisResult {
  sessionId: string;
  projectSummary: string;
  trustScore: number;
  trustTier: "block" | "warn" | "pass";
  terminated: boolean;
  recommendations: BackendRecommendation[];
  finalSummary: string;
}

function ScoreBar({ score }: { score: number }) {
  const cls = score >= 75 ? "" : score >= 55 ? " score-bar-fill-medium" : " score-bar-fill-low";
  return (
    <div className="score-bar w-full">
      <div className={`score-bar-fill${cls}`} style={{ width: `${score}%` }} />
    </div>
  );
}

function ItemBlock({
  item,
  toolName,
  isPrimary,
}: {
  item: BackendRecommendationItem;
  toolName: string;
  isPrimary: boolean;
}) {
  return (
    <div className={isPrimary ? "" : "rounded-md bg-muted/40 border border-border p-3"}>
      <div className="flex items-center justify-between mb-1">
        <span className={isPrimary ? "text-lg font-bold text-foreground" : "text-sm font-semibold text-foreground"}>
          {toolName}
        </span>
        <span className="text-sm font-mono text-primary">{item.score.toFixed(1)}</span>
      </div>
      <ScoreBar score={item.score} />
      <p className="text-sm text-muted-foreground my-2 leading-relaxed">{item.reasoning}</p>
      {isPrimary && (
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <p className="text-xs font-semibold text-green-400 mb-1">Strengths</p>
            <ul className="space-y-0.5">
              {item.pros.slice(0, 3).map((s, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                  <span className="text-green-500 mt-0.5 shrink-0">+</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-red-400 mb-1">Weaknesses</p>
            <ul className="space-y-0.5">
              {item.cons.slice(0, 3).map((c, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                  <span className="text-red-500 mt-0.5 shrink-0">-</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {isPrimary && item.compatibility && (
        <p className="text-xs text-muted-foreground/80 mt-2">
          <span className="font-semibold text-foreground">Compatibility:</span> {item.compatibility}
        </p>
      )}
    </div>
  );
}

function RecommendationCard({
  rec,
  toolNames,
}: {
  rec: BackendRecommendation;
  toolNames: Record<string, string>;
}) {
  const [showAlts, setShowAlts] = useState(false);
  const primaryName = toolNames[rec.primary.toolId] ?? rec.primary.toolId;

  return (
    <Card className="p-5 border-border bg-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {CATEGORY_LABELS[rec.category] ?? rec.category}
        </span>
        <Badge variant="secondary" className="text-xs">Top Pick</Badge>
      </div>

      <ItemBlock item={rec.primary} toolName={primaryName} isPrimary />

      {rec.alternatives.length > 0 && (
        <>
          <button
            onClick={() => setShowAlts(!showAlts)}
            className="text-xs text-primary hover:underline mt-3"
          >
            {showAlts ? "Hide" : "Show"} {rec.alternatives.length} alternative
            {rec.alternatives.length > 1 ? "s" : ""}
          </button>
          {showAlts && (
            <div className="mt-3 space-y-2">
              {rec.alternatives.map((alt, i) => (
                <ItemBlock
                  key={`${alt.toolId}-${i}`}
                  item={alt}
                  toolName={toolNames[alt.toolId] ?? alt.toolId}
                  isPrimary={false}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function AnalysisView({
  result,
  toolNames,
}: {
  result: BackendAnalysisResult;
  toolNames: Record<string, string>;
}) {
  const trustColor =
    result.trustTier === "pass"
      ? "text-green-400"
      : result.trustTier === "warn"
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="space-y-8">
      <div className="p-6 rounded-xl border border-primary/30 bg-primary/5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-muted-foreground leading-relaxed flex-1">
            {result.projectSummary}
          </p>
          <div className="text-right shrink-0">
            <div className={`text-4xl font-black ${trustColor}`}>{result.trustScore}</div>
            <div className="text-xs text-muted-foreground">Trust Score</div>
          </div>
        </div>
      </div>

      {result.terminated ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Trust score is below the safety threshold. Refine your project description and try again.
        </div>
      ) : result.recommendations.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          No recommendations were produced for this input.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {result.recommendations.map((rec) => (
            <RecommendationCard key={rec.category} rec={rec} toolNames={toolNames} />
          ))}
        </div>
      )}

      {result.finalSummary && (
        <div className="p-5 rounded-xl border border-border bg-card">
          <h3 className="text-sm font-semibold text-foreground mb-2">Final Analysis</h3>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {result.finalSummary}
          </p>
        </div>
      )}
    </div>
  );
}

type AnalyzerPhase = "idle" | "running" | "done" | "error";

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
  const [artCapability, setArtCapability] = useState<ProjectInput["artCapability"]>(
    ProjectInputArtCapability.basic,
  );
  const [multiplayer, setMultiplayer] = useState(false);
  const [otherConstraints, setOtherConstraints] = useState("");
  const [paidPriorityCategories, setPaidPriorityCategories] = useState<string[]>([]);

  const [phase, setPhase] = useState<AnalyzerPhase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<BackendAnalysisResult | null>(null);

  const isBusy = phase === "running";

  const { data: tools } = useListTools();
  const toolNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tools ?? []) map[t.id] = t.name;
    return map;
  }, [tools]);

  const applySseEvent = (eventName: string, rawData: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      setPhase("error");
      setErrorMsg("Something went wrong. Please try again.");
      return;
    }

    if (eventName === "done") {
      setResult(parsed as BackendAnalysisResult);
      setPhase("done");
      return;
    }

    if (eventName === "error") {
      const payload = parsed as { message?: string };
      setPhase("error");
      setErrorMsg(payload.message || "Something went wrong. Please try again.");
    }
    // Other progress events (analyze_complete, engine_picked, retrieval_*)
    // are ignored — we render once on `done`.
  };

  const streamAnalysis = async (input: ProjectInput): Promise<void> => {
    setPhase("running");
    setErrorMsg("");
    setResult(null);

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
      multiplayer,
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
            <SelectCards
              options={BUDGET_OPTIONS}
              value={budget}
              onChange={(v) => setBudget(v as ProjectInput["budget"])}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Time Limit</label>
            <SelectCards
              options={TIME_OPTIONS}
              value={timeLimit}
              onChange={(v) => setTimeLimit(v as ProjectInput["timeLimit"])}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Skill Level</label>
            <SelectCards
              options={SKILL_OPTIONS}
              value={skillLevel}
              onChange={(v) => setSkillLevel(v as ProjectInput["skillLevel"])}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Team Size</label>
            <SelectCards
              options={TEAM_OPTIONS}
              value={teamSize}
              onChange={(v) => setTeamSize(v as ProjectInput["teamSize"])}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Target Platforms <span className="text-red-400">*</span>
            </label>
            <PlatformChips value={platformTarget} onChange={setPlatformTarget} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Art & Design Capability</label>
            <SelectCards
              options={ART_OPTIONS}
              value={artCapability}
              onChange={(v) => setArtCapability(v as ProjectInput["artCapability"])}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Multiplayer</p>
              <p className="text-xs text-muted-foreground">Enable if your game requires multiplayer features.</p>
            </div>
            <Switch checked={multiplayer} onCheckedChange={setMultiplayer} />
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

        {phase === "running" && (
          <div className="flex items-center gap-3 p-6 rounded-xl border border-border bg-card text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Analyzing your project — this can take 10–30 seconds.</span>
          </div>
        )}

        {result && phase === "done" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Separator className="mb-8 bg-border" />
            <AnalysisView result={result} toolNames={toolNames} />
          </div>
        )}
      </div>
    </div>
  );
}
