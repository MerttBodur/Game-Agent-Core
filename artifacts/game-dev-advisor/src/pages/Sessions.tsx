import { useListSessions } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function Sessions() {
  const { data: sessions, isLoading } = useListSessions();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
            <p className="text-muted-foreground">No analyses yet.</p>
            <Link href="/" className="text-primary text-sm hover:underline mt-2 inline-block">
              Run your first analysis
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const confidence = Math.round(session.overallConfidence);
              const confColor = confidence >= 75 ? "text-green-400" : confidence >= 55 ? "text-yellow-400" : "text-red-400";
              return (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <Card className="p-4 border-border bg-card hover:border-primary/40 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {session.detectedProjectType}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground truncate">{session.projectIdea}</p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{session.stackOverview}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-2xl font-black ${confColor}`}>{confidence}</div>
                        <div className="text-xs text-muted-foreground">Fit</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {new Date(session.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
