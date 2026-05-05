import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardContent className="pt-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">Not found.</h1>
          <p className="mt-3 text-sm text-muted-foreground">The page you're looking for does not exist.</p>
          <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
            Back to Analyzer
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
