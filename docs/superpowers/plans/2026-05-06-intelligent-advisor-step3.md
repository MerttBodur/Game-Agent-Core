# Intelligent Advisor — Step 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend (`Analyzer.tsx` + `SessionDetail.tsx`) consume the new `categoryResults: { locked, flexible, hidden }` shape from Steps 1–2. Add the `paidPriorityCategories` chip selector to the form. Render a 🔒 **Locked** section (compact rows, no alternatives toggle except for the engine card) above an ✎ **Flexible** section (existing card UI). Engine card stays in Locked but keeps its alternatives. Each locked card carries a hardcoded ecosystem tooltip.

**Architecture:** No new pages, no new state machines. The form gains one new field (`paidPriorityCategories: string[]`) wired straight into the existing `streamAnalysis` POST body. The result-rendering surface splits into two ordered groups derived from `result.categoryResults.{locked,flexible}`. The compact `LockedCategoryCard` is a small new component sitting alongside the existing `CategoryCard`. All ecosystem tooltip strings live in a single 5-entry constant — no per-tool data, no API plumbing.

**Tech Stack:** React 18 + TypeScript, Tailwind v4 + shadcn/ui (already installed: `Badge`, `Card`, `Separator`, `Collapsible`, `Tooltip`, `ToggleGroup`, `Button`). Vite dev server. No test framework.

**Source spec:** [docs/superpowers/specs/2026-05-06-intelligent-advisor-design.md §6.2](../specs/2026-05-06-intelligent-advisor-design.md)
**Source plan:** [plans/2026-05-06-intelligent-advisor-refactor.md Step 3](../../../plans/2026-05-06-intelligent-advisor-refactor.md)
**Depends on:** Steps 1 + 2 must be merged first (codegen types must already carry `categoryResults`, `paidPriorityCategories`).

**Project conventions (read first):**
- Single commit at the end. Direct-to-`main`.
- All commands run in PowerShell.
- Follow existing styling — Tailwind v4 utility classes, shadcn primitives. No new color tokens.
- The result UI is rendered in two places: the live streaming view (`Analyzer.tsx` lines 590–637, derived from `partialCategories` + `metadata`) and the post-`done` view (`AnalysisView` component, lines 216–265). Both must be updated.
- `SessionDetail.tsx` reads the legacy `result.categories` array. Update it to the new shape; legacy session rows already in the DB will read as `categoryResults: undefined` — handle that with a one-line empty fallback, no migration logic.

**Anti-overengineering boundary:**
- No new route, no new hook, no new shared workspace package. The 5-entry ecosystem-tooltip lookup is a local `const` inside the locked card component.
- No `paidPriorityCategories` validation on the client — categories are a closed enum on the form, the backend trusts the value, the OpenAPI Zod schema (Step 1) handles malformed input.
- Do **not** introduce a feature flag for the new layout. The old shape doesn't exist on the wire anymore (Step 2 replaced it).
- Polish (decimals, hover breakdown, editable badges, advise-anyway) is Step 5 + Step 7. Do **not** start it here even if "while I'm here" tempts you.
- Empty-state, loading-spinner, and error-message strings stay verbatim from the existing copy.

---

## File Structure

This step modifies two existing files and adds one small component.

- `artifacts/game-dev-advisor/src/pages/Analyzer.tsx` — add `paidPriorityCategories` state + chips UI; rewrite `applySseEvent` for the new `scoring_complete` payload shape; rewrite `AnalysisView` + the streaming preview block to render Locked/Flexible sections.
- `artifacts/game-dev-advisor/src/pages/SessionDetail.tsx` — replace the inline `result.categories` reader with the new bucketed shape (with a defensive read of legacy rows).
- `artifacts/game-dev-advisor/src/components/LockedCategoryCard.tsx` — **new** ~50-line file. Compact card variant for non-engine locked categories. Contains the 5-entry ecosystem-tooltip lookup as a local `const`.

---

## Task 1: Form — `paidPriorityCategories` Chips

**Files:**
- Modify: `artifacts/game-dev-advisor/src/pages/Analyzer.tsx` (add a constant near line 80, add state on line 337, render block before the submit button on line 568, include the field in the POST body on line 488)

- [ ] **Step 1.1: Add the `PAID_PRIORITY_OPTIONS` constant**

In `artifacts/game-dev-advisor/src/pages/Analyzer.tsx`, just below the existing `CATEGORY_LABELS` constant (after line 80), insert:

```ts
const PAID_PRIORITY_OPTIONS = [
  { value: "ai_tooling", label: "AI Tooling" },
  { value: "art", label: "Art & Assets" },
  { value: "audio", label: "Audio & Music" },
  { value: "vfx", label: "VFX" },
  { value: "networking", label: "Networking" },
  { value: "backend_services", label: "Backend Services" },
  { value: "analytics", label: "Analytics" },
  { value: "monetization", label: "Monetization" },
];
```

(Eight items per spec §6.2 step 3 form list. Same string ids the backend uses in `tool.category` — see `gameDevTools.ts`.)

- [ ] **Step 1.2: Add the state hook**

Inside the `Analyzer` component, just below the `otherConstraints` state declaration (currently line 337), add:

```ts
  const [paidPriorityCategories, setPaidPriorityCategories] = useState<string[]>([]);
```

- [ ] **Step 1.3: Render the chip selector before the submit button**

In `artifacts/game-dev-advisor/src/pages/Analyzer.tsx`, locate the existing `Other Constraints` `<div>` block (currently lines 558–568). Just **after** that block and **before** the `<Button type="submit"` block (line 570), insert:

```tsx
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Paid-Priority Categories <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Categories where you accept paid tools. Empty = the advisor prefers free.
            </p>
            <div className="flex flex-wrap gap-2">
              {PAID_PRIORITY_OPTIONS.map((opt) => {
                const active = paidPriorityCategories.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setPaidPriorityCategories(
                        active
                          ? paidPriorityCategories.filter((c) => c !== opt.value)
                          : [...paidPriorityCategories, opt.value],
                      )
                    }
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
```

(Reuses the same chip styling as `PlatformChips`. Anti-overengineering: do not extract a shared `MultiChipSelect` component yet — three uses would justify it; two doesn't.)

- [ ] **Step 1.4: Include the field in the POST body**

In `handleSubmit` (currently lines 484–500), update the `input` object literal:

```ts
    const input: ProjectInput = {
      projectIdea,
      budget,
      timeLimit,
      skillLevel,
      teamSize,
      platformTarget,
      artCapability,
      otherConstraints: otherConstraints || null,
      paidPriorityCategories: paidPriorityCategories.length > 0 ? paidPriorityCategories : undefined,
    };
```

Sending `undefined` (instead of an empty array) keeps the request body smaller and matches the OpenAPI spec where the field is optional.

- [ ] **Step 1.5: Vite dev server smoke**

```powershell
pnpm --filter @workspace/game-dev-advisor run dev
```

Open `http://localhost:5173/`. Click 2–3 chips on the Paid-Priority section, confirm they toggle visually, then open browser devtools → Network tab → submit a project. Verify the POST body includes `paidPriorityCategories: ["..."]` (or omits it when nothing is selected). Stop the dev server (`Ctrl+C`).

---

## Task 2: New `LockedCategoryCard` Component

**Files:**
- Create: `artifacts/game-dev-advisor/src/components/LockedCategoryCard.tsx`

- [ ] **Step 2.1: Create the file**

Write the full content of `artifacts/game-dev-advisor/src/components/LockedCategoryCard.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CategoryRecommendation } from "@workspace/api-client-react";

const ECOSYSTEM_TOOLTIPS: Record<string, string> = {
  Unity: "Unity ecosystem uses C#. C++, Blueprint, GDScript are incompatible.",
  "Unreal Engine": "Unreal uses C++ and Blueprint. C#, GDScript are incompatible.",
  Godot: "Godot uses GDScript (or C# via mono build). C++, Blueprint are not standard.",
  GameMaker: "GameMaker uses GML. Other languages are not native to its toolchain.",
  Bevy: "Bevy is a Rust-native engine. Other languages do not target it.",
};

function tooltipFor(engineName: string | undefined): string {
  if (!engineName) return "Locked by your engine pick. Alternatives in this category are incompatible.";
  return (
    ECOSYSTEM_TOOLTIPS[engineName] ??
    `${engineName} ecosystem narrows this category. Alternatives shown elsewhere are not compatible.`
  );
}

export function LockedCategoryCard({
  cat,
  engineName,
}: {
  cat: CategoryRecommendation;
  engineName: string | undefined;
}) {
  return (
    <Card className="p-4 border-border bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          🔒 {cat.categoryLabel}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground cursor-help underline-offset-2 underline decoration-dotted">
                why locked?
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {tooltipFor(engineName)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-base font-bold text-foreground">{cat.topPick.toolName}</span>
        <span className="text-xs font-mono text-primary">{Math.round(cat.topPick.score)}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{cat.topPick.reasoning}</p>
    </Card>
  );
}
```

Notes:
- Five hardcoded engine tooltips matches the engines whose locked-category cascade actually fires in the current catalog (per Step 1's tagging table). Other engines fall through to the generic-fallback string — that is acceptable for v1.
- `engineName` is the prop; the parent (Analyzer / SessionDetail) walks `categoryResults.locked` and passes the engine entry's `topPick.toolName` down.
- This component is intentionally **not** placed under `components/ui/` — those are shadcn primitives, this is a feature component.

- [ ] **Step 2.2: Verify the import resolves**

```powershell
pnpm --filter @workspace/game-dev-advisor run typecheck
```

The typecheck for game-dev-advisor still has the legacy errors from Step 1; this just confirms the new file itself doesn't introduce *new* errors. If the `Tooltip` import path is wrong, fix it by reading `artifacts/game-dev-advisor/src/components/ui/tooltip.tsx`.

---

## Task 3: Rewrite `Analyzer.tsx` — Locked + Flexible Sections

**Files:**
- Modify: `artifacts/game-dev-advisor/src/pages/Analyzer.tsx` (replace `applySseEvent` `scoring_complete` branch lines 362–367, replace `partialCategories` state line 339, replace the streaming render block lines 615–628, replace the `AnalysisView` component lines 216–265)

- [ ] **Step 3.1: Update imports**

Add to the import block at the top of `Analyzer.tsx`:

```ts
import { LockedCategoryCard } from "@/components/LockedCategoryCard";
```

The existing `CategoryRecommendation` type from `@workspace/api-client-react` is reused.

- [ ] **Step 3.2: Replace `partialCategories` state with bucketed shape**

In `Analyzer.tsx`, replace the existing `partialCategories` state declaration (line 339):

```ts
  const [partialCategories, setPartialCategories] = useState<CategoryRecommendation[]>([]);
```

with:

```ts
  const [partialCategoryResults, setPartialCategoryResults] = useState<{
    locked: CategoryRecommendation[];
    flexible: CategoryRecommendation[];
    hidden: string[];
  }>({ locked: [], flexible: [], hidden: [] });
```

Find and update the reset call inside `streamAnalysis` (currently `setPartialCategories([]);` near line 411):

```ts
    setPartialCategoryResults({ locked: [], flexible: [], hidden: [] });
```

- [ ] **Step 3.3: Update the `scoring_complete` SSE branch**

In `applySseEvent`, replace lines 362–367:

```ts
    if (eventName === "scoring_complete") {
      const payload = parsed as { categories?: CategoryRecommendation[] };
      setPartialCategories(payload.categories ?? []);
      setPhase("metadata_ready");
      return;
    }
```

with:

```ts
    if (eventName === "scoring_complete") {
      const payload = parsed as {
        categoryResults?: { locked?: CategoryRecommendation[]; flexible?: CategoryRecommendation[]; hidden?: string[] };
      };
      setPartialCategoryResults({
        locked: payload.categoryResults?.locked ?? [],
        flexible: payload.categoryResults?.flexible ?? [],
        hidden: payload.categoryResults?.hidden ?? [],
      });
      setPhase("metadata_ready");
      return;
    }
```

- [ ] **Step 3.4: Add a `StackSections` helper component**

Just above the `AnalysisView` function (currently line 216), insert:

```tsx
function StackSections({
  locked,
  flexible,
  hidden,
}: {
  locked: CategoryRecommendation[];
  flexible: CategoryRecommendation[];
  hidden: string[];
}) {
  const engineEntry = locked.find((c) => c.category === "engine");
  const engineName = engineEntry?.topPick.toolName;
  const lockedNonEngine = locked.filter((c) => c.category !== "engine");

  return (
    <div className="space-y-8">
      {engineEntry && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            🔒 Locked
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <CategoryCard cat={engineEntry} />
            {lockedNonEngine.map((cat) => (
              <LockedCategoryCard key={cat.category} cat={cat} engineName={engineName} />
            ))}
          </div>
        </div>
      )}

      {flexible.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            ✎ Flexible
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {flexible.map((cat) => (
              <CategoryCard key={cat.category} cat={cat} />
            ))}
          </div>
        </div>
      )}

      {hidden.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Hidden by project mode: {hidden.join(", ")}.
        </p>
      )}

      {locked.length === 0 && flexible.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          No recommendations available for this category yet.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3.5: Replace the streaming preview block**

In `Analyzer.tsx`, replace the streaming render block (currently lines 615–628 — the `<h3>Stack Breakdown</h3>` div containing `partialCategories.map`):

```tsx
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Stack Breakdown</h3>
              {partialCategories.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                  No recommendations available for this category yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {partialCategories.map((cat, i) => (
                    <CategoryCard key={i} cat={cat} />
                  ))}
                </div>
              )}
            </div>
```

with:

```tsx
            <StackSections
              locked={partialCategoryResults.locked}
              flexible={partialCategoryResults.flexible}
              hidden={partialCategoryResults.hidden}
            />
```

- [ ] **Step 3.6: Replace the `AnalysisView` component body**

In `Analyzer.tsx`, replace `AnalysisView` (lines 216–265):

```tsx
function AnalysisView({ result }: { result: AnalysisResult }) {
  const confidenceColor = result.overallConfidence >= 75
    ? "text-green-400"
    : result.overallConfidence >= 55
    ? "text-yellow-400"
    : "text-red-400";

  const buckets = result.categoryResults ?? { locked: [], flexible: [], hidden: [] };

  return (
    <div className="space-y-8">
      <div className="p-6 rounded-xl border border-primary/30 bg-primary/5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                {result.detectedProjectType}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.projectSummary}</p>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-4xl font-black ${confidenceColor}`}>{Math.round(result.overallConfidence)}</div>
            <div className="text-xs text-muted-foreground">Fit Score</div>
          </div>
        </div>
        <Separator className="my-4 bg-border" />
        <p className="text-sm font-semibold text-primary">{result.stackOverview}</p>
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
    </div>
  );
}
```

The `result.categoryResults ?? { ... }` fallback handles a malformed wire response without crashing the page. If the OpenAPI types from Step 1 mark `categoryResults` as `null`-able, the optional chain is satisfied. No additional guards required.

- [ ] **Step 3.7: Typecheck the frontend package**

```powershell
pnpm --filter @workspace/game-dev-advisor run typecheck
```

Expected: `Analyzer.tsx` is now clean. `SessionDetail.tsx` still errors (next task). If `Analyzer.tsx` reports errors, they're most likely:
- the `useState` initial value type doesn't match `CategoryRecommendation[]` — re-check the import,
- the codegen `AnalysisResult` type names the field something other than `categoryResults` (e.g. `category_results`) — read `lib/api-client-react/src/...generated...ts` for the canonical name.

---

## Task 4: Rewrite `SessionDetail.tsx`

**Files:**
- Modify: `artifacts/game-dev-advisor/src/pages/SessionDetail.tsx` (replace the inline `result` type at lines 237–244, replace the category-grid render at lines 281–285)

- [ ] **Step 4.1: Update imports**

Add to the top of `SessionDetail.tsx`:

```ts
import { LockedCategoryCard } from "@/components/LockedCategoryCard";
```

- [ ] **Step 4.2: Replace the inline `result` type cast**

In `SessionDetail.tsx`, replace lines 237–244:

```ts
  const result = session.result as {
    projectSummary: string;
    detectedProjectType: string;
    categories: CategoryRecommendation[];
    overallConfidence: number;
    finalSummary: string;
    stackOverview: string;
  };
```

with:

```ts
  const result = session.result as {
    projectSummary: string;
    detectedProjectType: string;
    categoryResults?: {
      locked?: CategoryRecommendation[];
      flexible?: CategoryRecommendation[];
      hidden?: string[];
    };
    categories?: CategoryRecommendation[]; // legacy session rows pre-Step-2
    overallConfidence: number;
    finalSummary: string;
    stackOverview: string;
  };

  const locked = result.categoryResults?.locked ?? [];
  const flexible = result.categoryResults?.flexible ?? [];
  const hidden = result.categoryResults?.hidden ?? [];
  // Legacy: if no categoryResults but a flat categories array exists, dump everything into flexible.
  const legacyFlat = !result.categoryResults && result.categories ? result.categories : [];
  const legacyFlexible = [...flexible, ...legacyFlat];

  const engineEntry = locked.find((c) => c.category === "engine");
  const engineName = engineEntry?.topPick.toolName;
  const lockedNonEngine = locked.filter((c) => c.category !== "engine");
```

- [ ] **Step 4.3: Replace the category grid**

In `SessionDetail.tsx`, replace lines 281–285:

```tsx
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {result.categories.map((cat, i) => (
            <CategoryCard key={i} cat={cat} />
          ))}
        </div>
```

with:

```tsx
        {locked.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              🔒 Locked
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {engineEntry && <CategoryCard cat={engineEntry} />}
              {lockedNonEngine.map((cat) => (
                <LockedCategoryCard key={cat.category} cat={cat} engineName={engineName} />
              ))}
            </div>
          </div>
        )}

        {legacyFlexible.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              {result.categoryResults ? "✎ Flexible" : "Stack Breakdown"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {legacyFlexible.map((cat) => (
                <CategoryCard key={cat.category} cat={cat} />
              ))}
            </div>
          </div>
        )}

        {hidden.length > 0 && (
          <p className="text-xs text-muted-foreground mb-8">
            Hidden by project mode: {hidden.join(", ")}.
          </p>
        )}
```

The `legacyFlexible` fallback means session rows created before Step 2 still render (under the heading "Stack Breakdown") rather than showing an empty page. Anti-overengineering: this is one extra `const` and one ternary — far cheaper than a backfill migration.

- [ ] **Step 4.4: Typecheck the full monorepo**

```powershell
pnpm run typecheck
```

Expected: clean across all packages. If anything still errors, the most likely culprit is the inline `CategoryRecommendation` type at the top of `SessionDetail.tsx` — it shadows the codegen import. If the codegen import works, you can delete the local type alias entirely. If not, leave the alias and use it.

---

## Task 5: Manual Verification + Commit

- [ ] **Step 5.1: Start both servers**

In one terminal:
```powershell
pnpm --filter @workspace/api-server run dev
```
In a second terminal:
```powershell
pnpm --filter @workspace/game-dev-advisor run dev
```

- [ ] **Step 5.2: Walkthrough — Unity-locking project**

Open `http://localhost:5173/`. Fill the form:
- Project idea: `3D mobile action RPG with stylized art, AR mode, IAP store. Unity-style component architecture.`
- Budget: Medium / Time: 1 Year / Skill: Intermediate / Team: Small
- Platforms: PC, Mobile / Art: Intermediate
- Paid-Priority: tick **AI Tooling** + **Art**.

Submit. Expected:
- During streaming: a **🔒 Locked** section renders first (engine card with alternatives toggle, plus compact `programming` / `ui` / `vfx` / `build_ci` cards). An **✎ Flexible** section follows.
- The compact `programming` card shows a single tool name (e.g. `C# with .NET`) with a "why locked?" tooltip stating "Unity ecosystem uses C#. C++, Blueprint, GDScript are incompatible." (assuming engine pick is Unity).
- Final analysis paragraph renders below.
- A small "Hidden by project mode: networking, backend_services" line appears (default `single_player` mode from Step 2).

If the engine pick is **not** Unity, that's not a Step 3 failure — it's still the pre-Step-6 scoring engine. The structural rendering is what we're verifying here.

- [ ] **Step 5.3: Walkthrough — session-detail page for the same run**

Click into the session via `http://localhost:5173/sessions`, open the most recent session. Expected: same Locked / Flexible split, same compact locked cards, same tooltip behavior.

- [ ] **Step 5.4: Walkthrough — legacy session row**

If your local DB still has session rows from before Step 2 (those carry `result.categories` instead of `result.categoryResults`), open one. Expected: the page still renders — under a single "Stack Breakdown" heading, no Locked section. No empty-page crash. If you have no legacy rows in the local DB, skip this step.

- [ ] **Step 5.5: Stop both dev servers**

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force
Get-Process -Id (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force
```

- [ ] **Step 5.6: Commit**

```powershell
git add artifacts/game-dev-advisor/src/pages/Analyzer.tsx artifacts/game-dev-advisor/src/pages/SessionDetail.tsx artifacts/game-dev-advisor/src/components/LockedCategoryCard.tsx
git commit -m "feat: paid-priority chips + locked/flexible result sections"
git log -1 --stat
```

Expected: three files touched.

---

## Self-Review Checklist

**1. Spec coverage** — Step 3 of the source plan and spec §6.2 map cleanly:
- Paid-Priority chips (8 categories, default empty) → Task 1.
- Two result sections (🔒 Locked, ✎ Flexible) → Tasks 3.4 + 4.3 (`StackSections` and the SessionDetail bucketed render).
- Engine card stays in Locked but keeps alternatives toggle → Task 3.4 (`<CategoryCard cat={engineEntry} />` inside the Locked grid; the rest use `<LockedCategoryCard>`).
- Compact locked rows with hardcoded ecosystem-tooltip text per engine pick → Task 2.
- 5 strings, derived at render → `ECOSYSTEM_TOOLTIPS` lookup in `LockedCategoryCard.tsx`.
- `paidPriorityCategories` flows in the POST body → Step 1.4.
- Hidden-categories info line → `StackSections` and `SessionDetail` both render `Hidden by project mode: ...`.

**2. Placeholder scan** — No "TBD", "implement later", "handle edge cases". Empty buckets render the existing copy verbatim. Tooltip fallback string is concrete prose, not a placeholder.

**3. Type consistency**
- `CategoryRecommendation` is the same type imported from `@workspace/api-client-react` in all three files (`Analyzer`, `SessionDetail`, `LockedCategoryCard`). The legacy local type alias in `SessionDetail` is left intact; it shadows the import without conflict — drop it only if typecheck flags an inconsistency.
- `partialCategoryResults` shape (`{ locked, flexible, hidden }`) matches the SSE `scoring_complete` payload from Step 2.3 of the Step 2 plan.
- The fallback `categoryResults ?? { locked: [], flexible: [], hidden: [] }` matches the OpenAPI nullability from Step 1 (the field can be `null` when block-tier early-return fires in Step 4).

**4. Anti-overengineering check**
- No new shared `MultiChipSelect` component — duplicated 10 lines with `PlatformChips` accepted.
- No backfill migration for legacy session rows — defensive read in `SessionDetail` is one ternary.
- No client-side validation of `paidPriorityCategories` values — the OpenAPI Zod schema is the source of truth.
- No advise-anyway button, no decimal scores, no editable badges — those are Step 5 + Step 7. Resisted the temptation to "while I'm here."
- Tooltip text is 5 hardcoded strings + a generic fallback. No per-tool data, no API plumbing, no localization scaffolding.
- The `LockedCategoryCard` lives at `components/`, not `components/ui/` — distinguishing feature components from shadcn primitives. No `index.ts` barrel file.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-intelligent-advisor-step3.md`.

**Two execution options:**

1. **Subagent-Driven** — Dispatch a fresh subagent per task. Five tasks total; Task 3 + Task 4 share the new component from Task 2 so consider a single subagent for Tasks 2–4 to avoid handoff cost.
2. **Inline Execution** — Execute steps in this session using executing-plans. The browser walkthrough in Task 5 gives a natural stop-and-look checkpoint before commit.

**Which approach?**
