import { useGetTool, getGetToolQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const PRICING_COLORS: Record<string, string> = {
  free: "text-green-400 bg-green-400/10 border-green-400/20",
  open_source: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  freemium: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  paid: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  subscription: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

export default function ToolDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const { data: tool, isLoading } = useGetTool(id, { query: { enabled: !!id, queryKey: getGetToolQueryKey(id) } });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Tool not found.</p>
          <Link href="/tools" className="text-primary hover:underline text-sm mt-2 inline-block">Back to catalog</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-6">
          <Link href="/tools" className="text-xs text-muted-foreground hover:text-primary">← Back to catalog</Link>
        </div>

        <div className="mb-8">
          <div className="flex items-start gap-3 mb-3">
            <h1 className="text-3xl font-black text-foreground tracking-tight flex-1">{tool.name}</h1>
            <span className={`text-sm px-3 py-1 rounded border font-medium shrink-0 ${PRICING_COLORS[tool.pricing] ?? ""}`}>
              {tool.pricing.replace("_", " ")}
            </span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <Badge variant="secondary">{tool.category.replace("_", " ")}</Badge>
            <span className="text-xs text-muted-foreground">Min skill: <span className="text-foreground">{tool.minSkillLevel}</span></span>
          </div>
          <p className="text-muted-foreground leading-relaxed">{tool.description}</p>
          {tool.website && (
            <a href={tool.website} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline mt-2 inline-block">
              {tool.website} →
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="p-4 border-border bg-card">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-green-400 mb-3">Strengths</h3>
            <ul className="space-y-2">
              {tool.strengths.map((s, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-green-500 shrink-0">+</span>{s}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4 border-border bg-card">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-3">Weaknesses</h3>
            <ul className="space-y-2">
              {tool.weaknesses.map((w, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-red-500 shrink-0">-</span>{w}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="p-4 border-border bg-card mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Best For</h3>
          <div className="flex flex-wrap gap-2">
            {tool.bestFor.map((b, i) => (
              <Badge key={i} variant="outline" className="text-xs">{b}</Badge>
            ))}
          </div>
        </Card>

        <Card className="p-4 border-border bg-card mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Platforms</h3>
          <div className="flex flex-wrap gap-2">
            {tool.platforms.map((p, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
            ))}
          </div>
        </Card>

        <Card className="p-4 border-border bg-card">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {tool.tags.map((t, i) => (
              <Badge key={i} variant="outline" className="text-xs text-muted-foreground">{t}</Badge>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
