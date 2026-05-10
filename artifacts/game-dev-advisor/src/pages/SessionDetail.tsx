import { useGetSession, getGetSessionQueryKey, useListTools } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useEffect, useMemo, useState } from "react";

const CATEGORY_LABELS: Record<string, string> = {
  game_engine: "Game Engine",
  ide: "IDE",
  version_control: "Version Control",
  art_asset_creation: "Art & Asset Creation",
  audio: "Audio",
  ai_coding_assistant: "AI Coding Assistant",
  deployment_publishing: "Deployment & Publishing",
};

// Backend's actual saved-session result shape (same as the SSE `done` payload
// from /advisor/analyze). The codegen type advertises feasibility/archetype
// fields that the runtime backend does not produce yet.
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

interface BackendSessionDetail {
  id: string;
  projectInput: { projectIdea?: string; [key: string]: unknown };
  result: BackendAnalysisResult;
  createdAt: string;
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

function getFriendlyErrorMessage(error: unknown): string {
  const e = error as { status?: number; response?: { status?: number } };
  const status = e?.status ?? e?.response?.status;
  if (status === 429) return "You're sending requests too quickly. Please wait a minute.";
  if (status === 404) return "Not found.";
  return "Something went wrong. Please try again.";
}

export default function SessionDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const { data: rawSession, isLoading, isError, error } = useGetSession(id, {
    query: { enabled: !!id, queryKey: getGetSessionQueryKey(id) },
  });
  const session = rawSession as unknown as BackendSessionDetail | undefined;
  const [copied, setCopied] = useState(false);

  const { data: tools } = useListTools();
  const toolNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tools ?? []) map[t.id] = t.name;
    return map;
  }, [tools]);

  useEffect(() => {
    if (session?.result?.projectSummary) {
      const truncated = session.result.projectSummary.slice(0, 60);
      document.title = `${truncated} - Game Dev Stack Advisor`;
    }

    return () => {
      document.title = "Game Dev Stack Advisor";
    };
  }, [session?.result?.projectSummary]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setCopied(false);
    }, 2000);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [copied]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-muted-foreground">{getFriendlyErrorMessage(error)}</p>
          <Link href="/sessions" className="mt-2 inline-block text-sm text-primary hover:underline">
            Back to History
          </Link>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Not found.</p>
          <Link href="/sessions" className="mt-2 inline-block text-sm text-primary hover:underline">
            Back to History
          </Link>
        </div>
      </div>
    );
  }

  const result = session.result;
  const projectIdea = (session.projectInput.projectIdea as string | undefined) ?? "";
  const trustColor =
    result.trustTier === "pass"
      ? "text-green-400"
      : result.trustTier === "warn"
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-6">
          <Link href="/sessions" className="text-xs text-muted-foreground hover:text-primary">
            Back to History
          </Link>
        </div>

        <div className="mb-8">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl font-black text-foreground">{projectIdea}</h1>
            </div>
            <div className="shrink-0 text-right">
              <div className={`text-4xl font-black ${trustColor}`}>{result.trustScore}</div>
              <div className="text-xs text-muted-foreground">Trust Score</div>
            </div>
          </div>
          <div className="mb-3">
            <Button type="button" variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? "Link copied!" : "Copy Link"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{result.projectSummary}</p>
          <p className="mt-1 text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleString()}</p>
        </div>

        <Separator className="mb-8 bg-border" />

        {result.terminated ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            This session was blocked by the trust gate. Recommendations are not available.
          </div>
        ) : result.recommendations.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            No recommendations were saved for this session.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 mb-8">
            {result.recommendations.map((rec) => (
              <RecommendationCard key={rec.category} rec={rec} toolNames={toolNames} />
            ))}
          </div>
        )}

        {result.finalSummary && !result.terminated && (
          <Card className="border-border bg-card p-5">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Final Analysis</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {result.finalSummary}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
