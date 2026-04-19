import { Link, useLocation } from "wouter";
import { useGetAdvisorStats } from "@workspace/api-client-react";

const NAV = [
  { path: "/", label: "Analyzer" },
  { path: "/sessions", label: "History" },
  { path: "/tools", label: "Tool Catalog" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: stats } = useGetAdvisorStats();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-black text-foreground tracking-tight">
              GameStack
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map(({ path, label }) => (
                <Link
                  key={path}
                  href={path}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    location === path
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          {stats && (
            <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
              <span><span className="text-foreground font-semibold">{stats.totalAnalyses}</span> analyses run</span>
              <span><span className="text-primary font-semibold">{Math.round(stats.avgConfidenceScore)}</span> avg fit</span>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Game Dev Stack Advisor — RAG-powered tool recommendations for indie developers
      </footer>
    </div>
  );
}
