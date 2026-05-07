import { useGetSession, getGetSessionQueryKey } from "@workspace/api-client-react";
import type { CategoryRecommendation, Evidence } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LockedCategoryCard } from "@/components/LockedCategoryCard";
import { FeasibilityHeader } from "@/components/FeasibilityHeader";

function EvidencePanel({ evidence }: { evidence: Evidence }) {
  const chunks = evidence.ragChunks.slice(0, 3);
  return (
    <div className="mt-3 space-y-4 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
      <div>
        <p className="mb-2 font-semibold text-foreground">Score Breakdown</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>Budget</dt>
          <dd className="text-right font-mono">{evidence.scoreBreakdown.budget}</dd>
          <dt>Skill</dt>
          <dd className="text-right font-mono">{evidence.scoreBreakdown.skill}</dd>
          <dt>Platform</dt>
          <dd className="text-right font-mono">{evidence.scoreBreakdown.platform}</dd>
          <dt>Time</dt>
          <dd className="text-right font-mono">{evidence.scoreBreakdown.timeLimit}</dd>
          <dt>Art</dt>
          <dd className="text-right font-mono">{evidence.scoreBreakdown.artCapability}</dd>
        </dl>
        <p className="mt-2 text-[11px] text-muted-foreground/80">
          Total: <span className="font-mono">{evidence.scoreBreakdown.total}</span>
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

function ScoreBar({ score }: { score: number }) {
  const cls = score >= 75 ? "" : score >= 55 ? " score-bar-fill-medium" : " score-bar-fill-low";
  return (
    <div className="score-bar w-full">
      <div className={`score-bar-fill${cls}`} style={{ width: `${score}%` }} />
    </div>
  );
}

function CategoryCard({ cat }: { cat: CategoryRecommendation }) {
  const [showAlts, setShowAlts] = useState(false);
  return (
    <Card className="p-5 border-border bg-card">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {cat.categoryLabel}
        </span>
      </div>
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-lg font-bold text-foreground">{cat.topPick.toolName}</span>
          <span className="text-sm font-mono text-primary">{Math.round(cat.topPick.score)}</span>
        </div>
        <ScoreBar score={cat.topPick.score} />
      </div>
      <p className="mb-3 text-sm text-muted-foreground">{cat.topPick.reasoning}</p>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold text-green-400">Strengths</p>
          {cat.topPick.strengths.slice(0, 3).map((s, i) => (
            <p key={i} className="flex gap-1.5 text-xs text-muted-foreground">
              <span className="text-green-500">+</span>
              {s}
            </p>
          ))}
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-red-400">Weaknesses</p>
          {cat.topPick.weaknesses.slice(0, 3).map((w, i) => (
            <p key={i} className="flex gap-1.5 text-xs text-muted-foreground">
              <span className="text-red-500">-</span>
              {w}
            </p>
          ))}
        </div>
      </div>
      {cat.alternatives.length > 0 && (
        <>
          <button onClick={() => setShowAlts(!showAlts)} className="text-xs text-primary hover:underline">
            {showAlts ? "Hide" : "Show"} alternatives
          </button>
          {showAlts && (
            <div className="mt-3 space-y-2">
              {cat.alternatives.map((alt, i) => (
                <div key={i} className="rounded-md border border-border bg-muted/40 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-semibold">{alt.toolName}</span>
                    <span className="text-xs font-mono text-muted-foreground">{Math.round(alt.score)}</span>
                  </div>
                  <ScoreBar score={alt.score} />
                  <p className="mt-2 text-xs text-muted-foreground">{alt.reasoning}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {cat.topPick.evidence && (
        <Collapsible className="mt-3">
          <CollapsibleTrigger className="text-xs text-primary hover:underline">Why this recommendation?</CollapsibleTrigger>
          <CollapsibleContent>
            <EvidencePanel evidence={cat.topPick.evidence} />
          </CollapsibleContent>
        </Collapsible>
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
  const id = parseInt(params.id ?? "0", 10);
  const { data: session, isLoading, isError, error } = useGetSession(id, { query: { enabled: !!id, queryKey: getGetSessionQueryKey(id) } });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (session?.result?.stackOverview) {
      document.title = `${session.result.stackOverview} - Game Dev Stack Advisor`;
    }

    return () => {
      document.title = "Game Dev Stack Advisor";
    };
  }, [session?.result?.stackOverview]);

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

  const result = session.result as {
    projectSummary: string;
    detectedProjectType: string;
    categoryResults?: {
      locked?: CategoryRecommendation[];
      flexible?: CategoryRecommendation[];
      hidden?: string[];
    };
    categories?: CategoryRecommendation[];
    overallConfidence: number;
    finalSummary: string | null;
    stackOverview: string | null;
    ideaScore?: number;
    ideaScoreTier?: "pass" | "warn" | "block";
    mismatchReasons?: string[];
    archetype?: { implied?: { scope?: string }; achievable?: { scope?: string } };
    projectMode?: string;
    feasibilityOverridden?: boolean;
  };
  const locked = result.categoryResults?.locked ?? [];
  const flexible = result.categoryResults?.flexible ?? [];
  const hidden = result.categoryResults?.hidden ?? [];
  const legacyFlat = !result.categoryResults && result.categories ? result.categories : [];
  const legacyFlexible = [...flexible, ...legacyFlat];
  const engineEntry = locked.find((c) => c.category === "engine");
  const engineName = engineEntry?.topPick.toolName;
  const lockedNonEngine = locked.filter((c) => c.category !== "engine");

  const input = session.projectInput as unknown as Record<string, unknown>;
  const confColor = result.overallConfidence >= 75 ? "text-green-400" : result.overallConfidence >= 55 ? "text-yellow-400" : "text-red-400";
  const blocked = result.ideaScoreTier === "block" && !result.feasibilityOverridden;

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
            <div>
              <Badge variant="secondary" className="mb-2">
                {result.detectedProjectType}
              </Badge>
              <h1 className="text-xl font-black text-foreground">{(input.projectIdea as string) ?? ""}</h1>
            </div>
            <div className="shrink-0 text-right">
              <div className={`text-4xl font-black ${confColor}`}>{Math.round(result.overallConfidence)}</div>
              <div className="text-xs text-muted-foreground">Fit Score</div>
            </div>
          </div>
          <div className="mb-3">
            <Button type="button" variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? "Link copied!" : "Copy Link"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{result.projectSummary}</p>
          <p className="mt-3 text-sm font-semibold text-primary">{result.stackOverview}</p>
          <p className="mt-1 text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleString()}</p>
        </div>

        <Separator className="mb-8 bg-border" />

        <div className="mb-8">
          <FeasibilityHeader result={result as never} />
        </div>

        {!blocked && (
          <>
            {locked.length > 0 && (
              <div className="mb-8">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Locked</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {engineEntry && <CategoryCard cat={engineEntry} />}
                  {lockedNonEngine.map((cat) => (
                    <LockedCategoryCard key={cat.category} cat={cat} engineName={engineName} />
                  ))}
                </div>
              </div>
            )}

            {legacyFlexible.length > 0 && (
              <div className="mb-8">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  {result.categoryResults ? "Flexible" : "Stack Breakdown"}
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {legacyFlexible.map((cat) => (
                    <CategoryCard key={cat.category} cat={cat} />
                  ))}
                </div>
              </div>
            )}

            {hidden.length > 0 && (
              <p className="mb-8 text-xs text-muted-foreground">Hidden by project mode: {hidden.join(", ")}.</p>
            )}

            <Card className="border-border bg-card p-5">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Final Analysis</h3>
              <p className="text-sm text-muted-foreground">{result.finalSummary}</p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
