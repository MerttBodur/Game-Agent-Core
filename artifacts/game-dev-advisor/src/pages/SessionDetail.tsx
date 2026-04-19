import { useGetSession, getGetSessionQueryKey } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

type CategoryRecommendation = {
  category: string;
  categoryLabel: string;
  topPick: {
    toolName: string;
    score: number;
    reasoning: string;
    strengths: string[];
    weaknesses: string[];
    isTopPick: boolean;
  };
  alternatives: Array<{
    toolName: string;
    score: number;
    reasoning: string;
    strengths: string[];
    weaknesses: string[];
  }>;
  categoryReasoning: string;
};

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
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {cat.categoryLabel}
        </span>
      </div>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-lg font-bold text-foreground">{cat.topPick.toolName}</span>
          <span className="text-sm font-mono text-primary">{Math.round(cat.topPick.score)}</span>
        </div>
        <ScoreBar score={cat.topPick.score} />
      </div>
      <p className="text-sm text-muted-foreground mb-3">{cat.topPick.reasoning}</p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold text-green-400 mb-1">Strengths</p>
          {cat.topPick.strengths.slice(0, 3).map((s, i) => (
            <p key={i} className="text-xs text-muted-foreground flex gap-1.5"><span className="text-green-500">+</span>{s}</p>
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold text-red-400 mb-1">Weaknesses</p>
          {cat.topPick.weaknesses.slice(0, 3).map((w, i) => (
            <p key={i} className="text-xs text-muted-foreground flex gap-1.5"><span className="text-red-500">-</span>{w}</p>
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
                <div key={i} className="p-3 rounded-md bg-muted/40 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">{alt.toolName}</span>
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

export default function SessionDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const { data: session, isLoading } = useGetSession(id, { query: { enabled: !!id, queryKey: getGetSessionQueryKey(id) } });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Session not found.</p>
          <Link href="/sessions" className="text-primary hover:underline text-sm mt-2 inline-block">Back to history</Link>
        </div>
      </div>
    );
  }

  const result = session.result as {
    projectSummary: string;
    detectedProjectType: string;
    categories: CategoryRecommendation[];
    overallConfidence: number;
    finalSummary: string;
    stackOverview: string;
  };

  const input = session.projectInput as unknown as Record<string, unknown>;
  const confColor = result.overallConfidence >= 75 ? "text-green-400" : result.overallConfidence >= 55 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="mb-6">
          <Link href="/sessions" className="text-xs text-muted-foreground hover:text-primary">← Back to history</Link>
        </div>

        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <Badge variant="secondary" className="mb-2">{result.detectedProjectType}</Badge>
              <h1 className="text-xl font-black text-foreground">{(input.projectIdea as string) ?? ""}</h1>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-4xl font-black ${confColor}`}>{Math.round(result.overallConfidence)}</div>
              <div className="text-xs text-muted-foreground">Fit Score</div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{result.projectSummary}</p>
          <p className="text-sm font-semibold text-primary mt-3">{result.stackOverview}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(session.createdAt).toLocaleString()}
          </p>
        </div>

        <Separator className="mb-8 bg-border" />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {result.categories.map((cat, i) => (
            <CategoryCard key={i} cat={cat} />
          ))}
        </div>

        <Card className="p-5 border-border bg-card">
          <h3 className="text-sm font-semibold text-foreground mb-2">Final Analysis</h3>
          <p className="text-sm text-muted-foreground">{result.finalSummary}</p>
        </Card>
      </div>
    </div>
  );
}
