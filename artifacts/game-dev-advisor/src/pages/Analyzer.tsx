import { useMemo, useRef, useState } from "react";
import { useListTools } from "@workspace/api-client-react";
import type {
  AnalysisResult,
  ProjectInput,
  Recommendation,
  RecommendationItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AnswerSummary } from "@/components/analyzer/AnswerSummary";
import { FeasibilityBlock } from "@/components/analyzer/FeasibilityBlock";
import { GeneratingState } from "@/components/analyzer/GeneratingState";
import { QuestionCard } from "@/components/analyzer/QuestionCard";
import {
  QUESTIONS,
  buildProjectInput,
  initialAnswers,
  type Answers,
} from "@/components/analyzer/questions";

const CATEGORY_LABELS: Record<string, string> = {
  game_engine: "Game Engine",
  art_asset: "Art & Asset",
  vfx: "VFX",
  animation: "Animation",
  audio: "Audio",
  ai_coding: "AI Coding Tool",
};

function ScoreBar({ score }: { score: number }) {
  const width = Math.max(0, Math.min(100, score * 10));
  const cls = score >= 8 ? "" : score >= 6 ? " score-bar-fill-medium" : " score-bar-fill-low";
  return (
    <div className="score-bar w-full">
      <div className={`score-bar-fill${cls}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function ItemBlock({
  item,
  toolName,
  isPrimary,
}: {
  item: RecommendationItem;
  toolName: string;
  isPrimary: boolean;
}) {
  return (
    <div className={isPrimary ? "" : "rounded-md bg-muted/40 border border-border p-3"}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className={isPrimary ? "text-lg font-bold text-foreground" : "text-sm font-semibold text-foreground"}>
          {toolName}
        </span>
        <span className="text-sm font-mono text-primary">{item.score.toFixed(1)}/10</span>
      </div>
      <ScoreBar score={item.score} />
      {item.scoreReason && (
        <p className="text-xs text-primary/90 mt-2 leading-relaxed">{item.scoreReason}</p>
      )}
      <p className="text-sm text-muted-foreground my-2 leading-relaxed">{item.reasoning}</p>
      {isPrimary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
          <div>
            <p className="text-xs font-semibold text-green-400 mb-1">Strengths</p>
            <ul className="space-y-0.5">
              {item.pros.slice(0, 3).map((s) => (
                <li key={s} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                  <span className="text-green-500 mt-0.5 shrink-0">+</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-red-400 mb-1">Tradeoffs</p>
            <ul className="space-y-0.5">
              {item.cons.slice(0, 3).map((c) => (
                <li key={c} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                  <span className="text-red-500 mt-0.5 shrink-0">-</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendationCard({
  rec,
  toolNames,
}: {
  rec: Recommendation;
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
        <Badge variant="secondary" className="text-xs">
          Top Pick
        </Badge>
      </div>

      {rec.reasoning && (
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{rec.reasoning}</p>
      )}
      <ItemBlock item={rec.primary} toolName={primaryName} isPrimary />

      {rec.alternatives.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAlts(!showAlts)}
            className="text-xs text-primary hover:underline mt-3"
          >
            {showAlts ? "Hide" : "Show"} {rec.alternatives.length} alternative
            {rec.alternatives.length > 1 ? "s" : ""}
          </button>
          {showAlts && (
            <div className="mt-3 space-y-2">
              {rec.alternatives.map((alt) => (
                <ItemBlock
                  key={alt.toolId}
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
  onRestart,
}: {
  result: AnalysisResult;
  toolNames: Record<string, string>;
  onRestart: () => void;
}) {
  const challenged = result.engineDecision?.agreement === "challenged";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 rounded-xl border border-primary/30 bg-primary/5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {result.projectSummary || result.reason}
        </p>
        {result.engineDecision && (
          <div className="mt-4 rounded-lg border border-border bg-card/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Engine Pick
            </p>
            <p className="text-sm text-foreground">
              <span className="font-semibold">{result.engineDecision.picked}</span>
              {challenged && result.engineDecision.userPreferred
                ? ` instead of ${result.engineDecision.userPreferred}`
                : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {challenged && result.engineDecision.userPreferred
                ? `We recommended ${result.engineDecision.picked} instead of your ${result.engineDecision.userPreferred}: ${result.engineDecision.reasoning}`
                : result.engineDecision.reasoning}
            </p>
          </div>
        )}
      </div>

      {result.recommendations.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          No recommendations were produced for this input.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <Button
        type="button"
        onClick={onRestart}
        className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
      >
        Run another analysis
      </Button>
    </div>
  );
}

type AnalyzerPhase = "asking" | "generating" | "done" | "error";

export default function Analyzer() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [phase, setPhase] = useState<AnalyzerPhase>("asking");
  const [genStage, setGenStage] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const lastInputRef = useRef<ProjectInput | null>(null);

  const question = QUESTIONS[step];

  const { data: tools } = useListTools();
  const toolNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tools ?? []) map[t.id] = t.name;
    return map;
  }, [tools]);

  const setAnswer = (value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  };

  const next = () => {
    if (step < QUESTIONS.length - 1) {
      setStep((s) => s + 1);
    } else {
      void submit(buildProjectInput(answers));
    }
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  const restart = () => {
    setAnswers(initialAnswers());
    setStep(0);
    setResult(null);
    setErrorMsg("");
    setPhase("asking");
  };

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
      setResult(parsed as AnalysisResult);
      setPhase("done");
      return;
    }

    if (eventName === "error") {
      const payload = parsed as { message?: string };
      setPhase("error");
      setErrorMsg(payload.message || "Something went wrong. Please try again.");
      return;
    }

    if (eventName === "feasibility_blocked") {
      const payload = parsed as { reason?: string };
      setResult({
        sessionId: "",
        feasible: false,
        reason: payload.reason || "This project is not feasible as described.",
        terminated: true,
        projectSummary: "",
        recommendations: [],
        finalSummary: "",
      });
      setPhase("done");
      return;
    }

    if (eventName === "feasibility_complete") setGenStage(1);
    else if (eventName === "engine_picked") setGenStage(2);
    else if (eventName === "category_recommended") setGenStage(3);
  };

  const submit = async (input: ProjectInput): Promise<void> => {
    lastInputRef.current = input;
    setPhase("generating");
    setGenStage(0);
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
          setErrorMsg("You are sending requests too quickly. Please wait a minute.");
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

      const processBlock = (block: string) => {
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

        if (!eventName || dataLines.length === 0) return;
        applySseEvent(eventName, dataLines.join("\n"));
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) processBlock(block);
      }

      const trailing = buffer.trim();
      if (trailing) processBlock(trailing);
    } catch {
      setPhase("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[880px] mx-auto px-6 py-14 space-y-8">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight mb-2">
            Game Dev Stack Advisor
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Answer a few quick questions and get an AI-powered tool stack recommendation, with the
            rationale for every pick.
          </p>
        </div>

        {phase === "asking" && (
          <div className="space-y-4">
            <QuestionCard
              question={question}
              value={answers[question.id]}
              onChange={setAnswer}
              onNext={next}
              onBack={back}
              isFirst={step === 0}
              isLast={step === QUESTIONS.length - 1}
              current={step}
              total={QUESTIONS.length}
            />
            <AnswerSummary answers={answers} upTo={step} compact />
          </div>
        )}

        {phase === "generating" && (
          <div className="space-y-6">
            <GeneratingState stage={genStage} toolCount={tools?.length} />
            <AnswerSummary answers={answers} />
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {errorMsg || "Something went wrong. Please try again."}
            </div>
            <div className="flex gap-3">
              {lastInputRef.current && (
                <Button
                  type="button"
                  onClick={() => void submit(lastInputRef.current as ProjectInput)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                >
                  Try again
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setPhase("asking")}>
                Edit answers
              </Button>
            </div>
          </div>
        )}

        {phase === "done" &&
          result &&
          (result.terminated ? (
            <FeasibilityBlock reason={result.reason} onRestart={restart} />
          ) : (
            <AnalysisView result={result} toolNames={toolNames} onRestart={restart} />
          ))}
      </div>
    </div>
  );
}
