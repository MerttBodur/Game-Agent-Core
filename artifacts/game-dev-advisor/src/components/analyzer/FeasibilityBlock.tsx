import { Button } from "@/components/ui/button";

export function FeasibilityBlock({ reason, onRestart }: { reason: string; onRestart: () => void }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
        <h2 className="text-lg font-bold text-red-300 mb-2">This project is not feasible as described</h2>
        <p className="text-sm text-red-200/90 leading-relaxed">{reason}</p>
      </div>
      <Button onClick={onRestart} className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
        Adjust your answers
      </Button>
    </div>
  );
}
