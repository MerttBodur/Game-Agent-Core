import { useListSessions } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Backend's actual list row shape (advisorController.listSessions). The
// codegen type advertises richer fields (overallConfidence, stackOverview,
// detectedProjectType) that the runtime backend does not produce yet.
interface BackendSessionRow {
  id: string;
  projectIdea: string;
  trustScore: number;
  trustTier: "block" | "warn" | "pass";
  createdAt: string;
}

const TRUST_COLOR: Record<BackendSessionRow["trustTier"], string> = {
  pass: "text-green-400",
  warn: "text-yellow-400",
  block: "text-red-400",
};

const TRUST_LABEL: Record<BackendSessionRow["trustTier"], string> = {
  pass: "Pass",
  warn: "Warn",
  block: "Blocked",
};

function getFriendlyErrorMessage(error: unknown): string {
  const e = error as { status?: number; response?: { status?: number } };
  const status = e?.status ?? e?.response?.status;
  if (status === 429) return "You're sending requests too quickly. Please wait a minute.";
  if (status === 404) return "Not found.";
  return "Something went wrong. Please try again.";
}

export default function Sessions() {
  const { data: rawSessions, isLoading, isError, error } = useListSessions();
  const sessions = rawSessions as unknown as BackendSessionRow[] | undefined;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="p-4 border-border bg-card">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <p className="text-sm text-muted-foreground text-center">{getFriendlyErrorMessage(error)}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-foreground tracking-tight mb-1">Analysis History</h1>
          <p className="text-muted-foreground text-sm">Previous project analyses and their recommended stacks.</p>
        </div>

        {!sessions || sessions.length === 0 ? (
          <div className="p-10 text-center border border-border rounded-xl bg-card">
            <p className="text-muted-foreground">No analyses yet. Start by describing your game project above.</p>
            <Link href="/" className="text-primary text-sm hover:underline mt-2 inline-block">
              Run your first analysis
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const tier = session.trustTier;
              const trustColor = TRUST_COLOR[tier];
              return (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <Card className="p-4 border-border bg-card hover:border-primary/40 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {TRUST_LABEL[tier]}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground truncate">{session.projectIdea}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-2xl font-black ${trustColor}`}>{session.trustScore}</div>
                        <div className="text-xs text-muted-foreground">Trust</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        {new Date(session.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <Button type="button" size="sm" variant="outline">
                        View Session
                      </Button>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
