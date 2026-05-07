# Intelligent Advisor — Step 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the three feasibility tiers (Pass / Warn / Block) on the Analyzer + SessionDetail pages. Block tier hides recommendations and shows a Reality Check panel. Add the **Advise Anyway** button that re-POSTs the same body with `adviseAnyway: true`. When override happens, render with a persistent red banner; the public session URL surfaces the same banner via `feasibilityOverridden`.

**Architecture:** No new pages. One new component (`FeasibilityHeader`) renders all three tier variants by reading `result.ideaScore` / `result.ideaScoreTier` / `result.mismatchReasons` / `result.archetype` from Step 4's wire format. The Reality Check panel pulls industry baselines from a static frontend constant (no API field — the dataset summary numbers are stable; spec §6.2). Three example-game rows are hardcoded for v1. Override button re-runs the existing `streamAnalysis` with a flag.

**Tech Stack:** React 18 + TypeScript, Tailwind v4 + shadcn/ui (`Badge`, `Button`, `Separator`, `Card`). No test framework.

**Source spec:** [docs/superpowers/specs/2026-05-06-intelligent-advisor-design.md §6.2](../specs/2026-05-06-intelligent-advisor-design.md)
**Source plan:** [plans/2026-05-06-intelligent-advisor-refactor.md Step 5](../../../plans/2026-05-06-intelligent-advisor-refactor.md)
**Depends on:** Steps 1 + 2 + 4 (wire format). Step 3 is required for the Locked/Flexible UI to already exist.

**Project conventions (read first):**
- Single commit. Direct-to-`main`.
- All commands run in PowerShell.
- Tier copy is verbatim from spec §6.2; do not paraphrase.
- The `feasibilityOverridden` flag is set by the backend (Step 4); frontend reads it but does not compute it.
- `Advise Anyway` re-runs the **same** request body with `adviseAnyway: true` — do not show a second confirmation modal.

**Anti-overengineering boundary:**
- No new wire field for the dataset baselines. They live as a `const INDUSTRY_BASELINES` in the new component.
- No localization scaffolding for tier copy.
- No animation / transition framework. Use Tailwind `animate-in` already in use elsewhere.
- No "Adjust Inputs" button — the form is right above the result, scrolling up is the affordance. (Spec mentions it; implementing it would require re-rendering the form pre-filled, which is Step 7's editable-badge territory.)
- The override re-POST does not need a separate backend route — the existing `/advisor/analyze` already accepts `adviseAnyway` from Step 1's OpenAPI.

---

## File Structure

This step modifies two existing files and adds one component.

- `artifacts/game-dev-advisor/src/components/FeasibilityHeader.tsx` — **new** ~120-line component. Renders all three tiers + holds `INDUSTRY_BASELINES` constant + the Advise Anyway button.
- `artifacts/game-dev-advisor/src/pages/Analyzer.tsx` — render `<FeasibilityHeader>` above the stack sections; gate the stack sections + final-summary on `tier !== "block" || adviseAnyway`; thread an override callback that re-POSTs.
- `artifacts/game-dev-advisor/src/pages/SessionDetail.tsx` — render `<FeasibilityHeader>` for the persisted session; if `feasibilityOverridden === true` show a persistent red banner above everything; if block + not overridden, hide the recommendation grids.

---

## Task 1: New `FeasibilityHeader` Component

**Files:**
- Create: `artifacts/game-dev-advisor/src/components/FeasibilityHeader.tsx`

- [ ] **Step 1.1: Create the file**

Write the full content of `artifacts/game-dev-advisor/src/components/FeasibilityHeader.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import type { AnalysisResult } from "@workspace/api-client-react";

const INDUSTRY_BASELINES: Record<string, { budget: string; team: string; time: string; examples: string[] }> = {
  AAA: {
    budget: "$50M – $300M",
    team: "100 – 500 people",
    time: "3 – 7 years",
    examples: [
      "Cyberpunk 2077 ($174M, 500 ppl, 8 y)",
      "Hogwarts Legacy ($150M, 300 ppl, 6 y)",
      "Black Myth Wukong (~$70M, 140 ppl, 6 y)",
    ],
  },
  AA: {
    budget: "$500K – $50M",
    team: "20 – 100 people",
    time: "2 – 4 years",
    examples: [
      "Hellblade: Senua's Sacrifice (~$10M, 20 ppl, 3.5 y)",
      "A Plague Tale: Innocence (~$15M, 35 ppl, 3 y)",
      "Vampire Survivors clones at studio scale",
    ],
  },
  indie: {
    budget: "$1K – $500K",
    team: "1 – 10 people",
    time: "6 – 24 months",
    examples: [
      "Stardew Valley ($0, solo, 4.5 y)",
      "Hollow Knight (~$57K, 3 ppl, 2.5 y)",
      "Celeste (~$0, 2 ppl, 2 y)",
    ],
  },
  prototype: {
    budget: "~ $0",
    team: "1 – 2 people",
    time: "1 – 3 months",
    examples: [
      "Ludum Dare entries that grew",
      "Internal R&D demos",
      "Polished gameplay slices",
    ],
  },
  jam: {
    budget: "~ $0",
    team: "1 person",
    time: "hours – days",
    examples: ["Ludum Dare", "Global Game Jam", "GMTK Game Jam"],
  },
};

type Tier = "pass" | "warn" | "block";

export function FeasibilityHeader({
  result,
  onAdviseAnyway,
  isOverriding,
}: {
  result: Pick<
    AnalysisResult,
    "ideaScore" | "ideaScoreTier" | "mismatchReasons" | "archetype" | "projectMode" | "feasibilityOverridden"
  >;
  onAdviseAnyway?: () => void;
  isOverriding?: boolean;
}) {
  const tier = (result.ideaScoreTier ?? "pass") as Tier;
  const score = (result.ideaScore ?? 100).toFixed(1);
  const implied = result.archetype?.implied?.scope ?? "indie";
  const achievable = result.archetype?.achievable?.scope ?? "indie";
  const reasons = result.mismatchReasons ?? [];
  const projectMode = result.projectMode ?? "single_player";

  if (result.feasibilityOverridden) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          You proceeded despite feasibility concerns. Recommendations are best-effort but your project may not be deliverable.
        </div>
        <PassPill score={score} implied={implied} projectMode={projectMode} variant="warn" />
      </div>
    );
  }

  if (tier === "pass") {
    return <PassPill score={score} implied={implied} projectMode={projectMode} variant="pass" />;
  }

  if (tier === "warn") {
    return (
      <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4">
        <p className="text-sm font-semibold text-yellow-300">
          ⚠ Idea Score: {score} / 100 — Tight Fit
        </p>
        {reasons.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-yellow-200/90 list-disc pl-4">
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Recommendations may stretch your resources.
        </p>
      </div>
    );
  }

  // tier === "block"
  const baseline = INDUSTRY_BASELINES[implied] ?? INDUSTRY_BASELINES.indie;
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 space-y-4">
      <p className="text-base font-semibold text-red-300">
        ✕ Idea Score: {score} / 100 — Not Feasible
      </p>

      {reasons.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-200/90 mb-1">Concerns</p>
          <ul className="space-y-1 text-xs text-red-200/90 list-disc pl-4">
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">Industry baseline ({implied})</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>Budget</dt><dd className="font-mono">{baseline.budget}</dd>
          <dt>Team</dt><dd className="font-mono">{baseline.team}</dd>
          <dt>Time</dt><dd className="font-mono">{baseline.time}</dd>
        </dl>
        <div>
          <p className="font-semibold text-foreground mt-2">Examples</p>
          <ul className="space-y-0.5 text-[11px]">
            {baseline.examples.map((ex, i) => <li key={i}>• {ex}</li>)}
          </ul>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Suggested adjustments: scope down to <span className="font-mono">{achievable}</span> or extend timeline / team.
      </p>

      {onAdviseAnyway && (
        <Button
          type="button"
          variant="outline"
          className="border-red-500/40 text-red-200 hover:bg-red-500/10"
          onClick={onAdviseAnyway}
          disabled={isOverriding}
        >
          {isOverriding ? "Re-running…" : "⚠ Advise Anyway"}
        </Button>
      )}
    </div>
  );
}

function PassPill({
  score,
  implied,
  projectMode,
  variant,
}: {
  score: string;
  implied: string;
  projectMode: string;
  variant: "pass" | "warn";
}) {
  const color = variant === "pass"
    ? "border-green-500/30 bg-green-500/10 text-green-300"
    : "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  return (
    <div className={`rounded-lg border ${color} px-4 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1`}>
      <span className="font-semibold">
        ✓ Idea Score: {score} / 100 — {variant === "pass" ? "Realistic" : "Override"}
      </span>
      <span className="opacity-80">Implied: <span className="font-mono">{implied}</span></span>
      <span className="opacity-80">Mode: <span className="font-mono">{projectMode}</span></span>
    </div>
  );
}
```

Notes:
- Five archetype rows are baked in. If `implied` is some value not in the table (shouldn't happen post-Step 4), the fallback is the `indie` row.
- Industry baselines are static prose, not numbers requiring computation.
- `feasibilityOverridden` short-circuits to render the persistent red banner regardless of the tier value persisted in the row. This is the spec's "public session URL surfaces the same banner" rule.

- [ ] **Step 1.2: Verify the import resolves**

```powershell
pnpm --filter @workspace/game-dev-advisor run typecheck
```

Errors should still be confined to the `Analyzer` / `SessionDetail` pages (the next two tasks). The new component itself must be clean.

---

## Task 2: Wire `FeasibilityHeader` + Override Button into `Analyzer.tsx`

**Files:**
- Modify: `artifacts/game-dev-advisor/src/pages/Analyzer.tsx`

- [ ] **Step 2.1: Update imports**

Add to the top of `Analyzer.tsx`:

```ts
import { FeasibilityHeader } from "@/components/FeasibilityHeader";
```

- [ ] **Step 2.2: Track the last submitted input + override state**

Inside the `Analyzer` component, just below the existing `result` state (around line 342), add:

```ts
  const [lastInput, setLastInput] = useState<ProjectInput | null>(null);
  const [isOverriding, setIsOverriding] = useState(false);
```

In `streamAnalysis` (around line 405), set the new state. Right after `setPhase("scoring")`:

```ts
    setLastInput(input);
```

- [ ] **Step 2.3: Add the `handleAdviseAnyway` handler**

Inside the component, just above `handleSubmit` (around line 484), insert:

```ts
  const handleAdviseAnyway = async () => {
    if (!lastInput || isOverriding) return;
    setIsOverriding(true);
    try {
      await streamAnalysis({ ...lastInput, adviseAnyway: true });
    } finally {
      setIsOverriding(false);
    }
  };
```

- [ ] **Step 2.4: Update the streaming render block (no header here)**

The streaming preview block from Step 3 keeps its existing shape — `metadata` card + `<StackSections>` + streaming Final Analysis paragraph. The FeasibilityHeader is only rendered post-`done`, because the tier decision arrives with `metadata_complete` (from Step 4 routing) but the score values, archetype, and final tier are part of the persisted `result` object. Leave the streaming block untouched **except** to keep its existing hide-on-block behavior consistent — if your `metadata_complete` SSE branch from Step 3 already drops `partialCategoryResults` to empty for block-tier (it does, because the route doesn't emit `scoring_complete` on the block path), no change is needed here. Verify by reading the `applySseEvent` body.

- [ ] **Step 2.5: Replace the post-`done` `AnalysisView` body**

In `Analyzer.tsx`, replace the `AnalysisView` function body installed in Step 3 with:

```tsx
function AnalysisView({
  result,
  onAdviseAnyway,
  isOverriding,
}: {
  result: AnalysisResult;
  onAdviseAnyway: () => void;
  isOverriding: boolean;
}) {
  const buckets = result.categoryResults ?? { locked: [], flexible: [], hidden: [] };
  const tier = (result.ideaScoreTier ?? "pass") as "pass" | "warn" | "block";
  const blocked = tier === "block" && !result.feasibilityOverridden;

  return (
    <div className="space-y-8">
      <FeasibilityHeader
        result={result}
        onAdviseAnyway={blocked ? onAdviseAnyway : undefined}
        isOverriding={isOverriding}
      />

      {!blocked && (
        <>
          <div className="p-6 rounded-xl border border-primary/30 bg-primary/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                  {result.detectedProjectType}
                </Badge>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2">{result.projectSummary}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-4xl font-black text-primary">{Math.round(result.overallConfidence)}</div>
                <div className="text-xs text-muted-foreground">Fit Score</div>
              </div>
            </div>
            <Separator className="my-4 bg-border" />
            <p className="text-sm font-semibold text-primary">{result.stackOverview ?? ""}</p>
          </div>

          <StackSections
            locked={buckets.locked ?? []}
            flexible={buckets.flexible ?? []}
            hidden={buckets.hidden ?? []}
          />

          <div className="p-5 rounded-xl border border-border bg-card">
            <h3 className="text-sm font-semibold text-foreground mb-2">Final Analysis</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.finalSummary}</p>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2.6: Pass the override props at the call site**

Update the call site:

```tsx
        {result && phase === "done" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Separator className="mb-8 bg-border" />
            <AnalysisView
              result={result}
              onAdviseAnyway={handleAdviseAnyway}
              isOverriding={isOverriding}
            />
          </div>
        )}
```

- [ ] **Step 2.7: Typecheck**

```powershell
pnpm --filter @workspace/game-dev-advisor run typecheck
```

Expected: clean. If `result.archetype.implied.scope` reports a type error, the codegen `AnalysisResult` type marks `archetype` as optional — the access already uses `?.` chains in `FeasibilityHeader`.

---

## Task 3: Render Header on `SessionDetail.tsx`

**Files:**
- Modify: `artifacts/game-dev-advisor/src/pages/SessionDetail.tsx`

- [ ] **Step 3.1: Update imports**

Add to `SessionDetail.tsx`:

```ts
import { FeasibilityHeader } from "@/components/FeasibilityHeader";
```

- [ ] **Step 3.2: Extend the inline `result` cast**

Replace the existing inline cast (the one installed in Step 3 of the source plan) with one that includes the new feasibility fields:

```ts
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
```

- [ ] **Step 3.3: Render the header + gate the grids**

In the JSX, just below the `<Separator className="mb-8 bg-border" />` line (around line 279), insert:

```tsx
        <div className="mb-8">
          <FeasibilityHeader result={result as never /* persisted shape includes the same feasibility fields */} />
        </div>
```

Wrap the existing Locked + Flexible blocks (installed in Step 3) with a gate:

```tsx
        {!(result.ideaScoreTier === "block" && !result.feasibilityOverridden) && (
          <>
            {/* ...existing Locked + Flexible blocks from Step 3... */}
          </>
        )}
```

The `as never` cast is intentional: the persisted-row shape (`session.result`) is wider than `AnalysisResult` (it carries fields the OpenAPI doesn't enumerate, such as legacy `categories`). The cast lets `FeasibilityHeader` consume only the fields it Picks. If the typecheck goes red on the cast, switch to `result as Parameters<typeof FeasibilityHeader>[0]["result"]` — same intent, less aggressive.

- [ ] **Step 3.4: Typecheck**

```powershell
pnpm run typecheck
```

Expected: clean across all packages.

---

## Task 4: Manual Verification + Commit

- [ ] **Step 4.1: Start both servers**

```powershell
pnpm --filter @workspace/api-server run dev
# in another terminal:
pnpm --filter @workspace/game-dev-advisor run dev
```

- [ ] **Step 4.2: Walkthrough — Pass scenario**

Form: 2D pixel platformer, Low budget, Year, Intermediate, Solo, PC, Intermediate art. Submit. Expected: green pill at top with score and "Realistic". Stack sections render normally.

- [ ] **Step 4.3: Walkthrough — Warn scenario**

Form: 3D RPG, Medium budget, Quarter, Intermediate, Solo, PC, Basic art. Submit. Expected: yellow banner with bullet-listed concerns. Stack sections still render. Final summary still streams.

- [ ] **Step 4.4: Walkthrough — Block scenario**

Form: AAA open-world MMO RPG, Low budget, Month, Intermediate, Solo, PC + Console, Basic art. Submit. Expected:
- Red Reality Check panel renders.
- Industry baseline rows visible (AAA defaults).
- Three example games listed.
- Stack sections + final summary are NOT visible.
- "⚠ Advise Anyway" button is visible at bottom of the panel.

- [ ] **Step 4.5: Walkthrough — Advise Anyway**

Click the button. Expected:
- Button shows "Re-running…" while the override request is in flight.
- A persistent red banner appears at the top: "You proceeded despite feasibility concerns. …"
- Stack sections + final summary now render below.
- A small yellow "Override" pill replaces the green pass pill.

- [ ] **Step 4.6: Walkthrough — Public session URL**

Open `/sessions`, click into the override session. Expected: same red banner persists at the top, same recommendations below.

- [ ] **Step 4.7: Stop dev servers + commit**

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force
Get-Process -Id (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force

git add artifacts/game-dev-advisor/src/components/FeasibilityHeader.tsx artifacts/game-dev-advisor/src/pages/Analyzer.tsx artifacts/game-dev-advisor/src/pages/SessionDetail.tsx
git commit -m "feat: three-tier feasibility UI + advise anyway"
git log -1 --stat
```

---

## Self-Review Checklist

**1. Spec coverage**
- Pass / Warn / Block visual variants → Task 1.1.
- Reality Check panel with industry baselines + 3 example games → Task 1.1 (`INDUSTRY_BASELINES`).
- "Advise Anyway" button re-POSTs same body with `adviseAnyway: true` → Task 2.3 (`handleAdviseAnyway`).
- Persistent red banner on override path → Task 1.1 (`feasibilityOverridden` short-circuit).
- Public session URL surfaces same banner → Task 3.3 (`SessionDetail` renders the same header).
- Block tier hides recommendations → Task 2.5 + Task 3.3 (`!blocked && (...)` gate).

**2. Placeholder scan** — All copy is concrete. No "TBD".

**3. Type consistency**
- `Tier` literal `pass | warn | block` matches Step 1's OpenAPI.
- `INDUSTRY_BASELINES` keys are the five `Scope` values from Step 4.
- `FeasibilityHeader` accepts a `Pick<AnalysisResult, ...>` so it works equally for live results and persisted session rows.

**4. Anti-overengineering check**
- No new wire field for baselines.
- No localization scaffolding.
- No transition library — just Tailwind utilities.
- Override re-uses existing `streamAnalysis`; no new endpoint.
- `INDUSTRY_BASELINES` is hardcoded prose; computing examples from the dataset would belong to Step 8.
- No "Adjust Inputs" button — the form sits above the result already.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-intelligent-advisor-step5.md`.

**Two execution options:**

1. **Subagent-Driven** — Four tasks. One subagent for the new component (Task 1), one for both page integrations (Tasks 2+3 share the import), one for verification.
2. **Inline Execution** — The browser walkthrough in Task 4 reveals copy issues fast; inline is the better choice.

**Which approach?**
