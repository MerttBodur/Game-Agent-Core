import { useState } from "react";
import { useListTools, useGetToolCategories } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const PRICING_COLORS: Record<string, string> = {
  free: "text-green-400 bg-green-400/10 border-green-400/20",
  open_source: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  freemium: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  paid: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  subscription: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

const SKILL_COLORS: Record<string, string> = {
  beginner: "text-green-400",
  intermediate: "text-yellow-400",
  advanced: "text-orange-400",
  expert: "text-red-400",
};

function getFriendlyErrorMessage(error: unknown): string {
  const e = error as { status?: number; response?: { status?: number } };
  const status = e?.status ?? e?.response?.status;
  if (status === 429) return "You're sending requests too quickly. Please wait a minute.";
  if (status === 404) return "Not found.";
  return "Something went wrong. Please try again.";
}

export default function Tools() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: categories } = useGetToolCategories();
  const { data: tools, isLoading, isError, error } = useListTools(
    activeCategory ? { category: activeCategory } : undefined
  );

  const filtered = (tools ?? []).filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-foreground tracking-tight mb-1">Tool Catalog</h1>
          <p className="text-muted-foreground text-sm">All game development tools in the knowledge base.</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              !activeCategory ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"
            }`}
          >
            All
          </button>
          {(categories ?? []).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id === activeCategory ? null : cat.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                cat.id === activeCategory ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {cat.label} <span className="opacity-60">({cat.toolCount})</span>
            </button>
          ))}
        </div>

        <div className="mb-6">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools"
            className="bg-card border-border text-foreground placeholder:text-muted-foreground max-w-sm"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, index) => (
              <Card key={index} className="p-4 border-border bg-card h-full">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-4 w-14" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-16 text-sm text-muted-foreground">{getFriendlyErrorMessage(error)}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((tool) => (
              <Link key={tool.id} href={`/tools/${tool.id}`}>
                <Card className="p-4 border-border bg-card hover:border-primary/40 transition-colors cursor-pointer h-full flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-base font-bold text-foreground">{tool.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium shrink-0 ${PRICING_COLORS[tool.pricing] ?? ""}`}>
                      {tool.pricing.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-3">{tool.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {tool.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">{tag}</Badge>
                      ))}
                    </div>
                    <span className={`text-xs font-medium ${SKILL_COLORS[tool.minSkillLevel] ?? ""}`}>
                      {tool.minSkillLevel}+
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-3 text-center py-16 text-muted-foreground text-sm">
                No tools found for this filter.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
