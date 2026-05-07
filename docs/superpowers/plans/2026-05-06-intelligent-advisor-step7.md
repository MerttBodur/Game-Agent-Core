# Intelligent Advisor — Step 7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render decimal scores with a hover breakdown. Add **editable Mode** (`projectMode`) and **Archetype scope** (`achievableScope`) dropdowns next to the feasibility header. On change, the frontend re-runs hard-filter + scoring + jitter **client-side** against the data already in the response — no API round-trip. The narrative does NOT regenerate; show a disclaimer banner.

**Architecture:** A new `lib/scoring.ts` in the frontend duplicates the backend's hard filter + `scoreTool` + jitter math (spec §9.1 explicitly authorizes this duplication for hackathon timeline). The page holds two override states (`modeOverride`, `scopeOverride`). When either is set, the page recomputes `categoryResults` from the **full** candidate pool that the backend now ships in every response (a small wire-format addition: `result.candidatePool` keyed by category). Card scores re-render; narrative + Final Analysis paragraphs are not touched but a disclaimer renders above them.

**Tech Stack:** React 18 + TypeScript, Tailwind v4 + shadcn/ui (existing `Badge`/`Card`).

**Source spec:** [docs/superpowers/specs/2026-05-06-intelligent-advisor-design.md §6.4 + §9.1](../specs/2026-05-06-intelligent-advisor-design.md)
**Source plan:** [plans/2026-05-06-intelligent-advisor-refactor.md Step 7](../../../plans/2026-05-06-intelligent-advisor-refactor.md)
**Depends on:** Steps 2 + 4 + 6 (backend math). Step 5 (FeasibilityHeader is the host for the dropdowns). Step 3 (StackSections + LockedCategoryCard).

**Project conventions (read first):**
- All commands run in PowerShell.
- Backend wire shape gets one new field: `categoryResults.candidatePool: Record<categoryId, GameDevTool[]>`. The pool is the full `GAME_DEV_TOOLS` slice for each non-hidden category — the client re-runs the hard filter locally as the engine pick can change with archetype.
- The numerical math in `lib/scoring.ts` MUST match the backend's `scoreTool` byte-for-byte, including the jitter seed (`projectIdea.slice(0, 64)`). Any drift is a known risk (spec §8) — Step 8 verifies with manual smoke checks.
- Decimal display: `score.toFixed(1)`. Bar width: `${score}%` (no rounding).
- `score-bar-fill` color thresholds in CSS already gate at 75 / 55 — those compare against the unrounded float. No CSS changes.

**Anti-overengineering boundary:**
- No shared workspace package for math. Spec §9.1 authorizes duplication; comply.
- No backend "compact pool" optimization (e.g. send only metadata fields needed for scoring). Send the full `GameDevTool` shape — payload is ~30 tools × few KB; trivial.
- The override dropdowns are plain `<select>` elements styled with Tailwind. No combobox.
- Narrative regeneration is **out of scope**. The disclaimer is one short string.
- The hover-breakdown tooltip lists all eight delta components in one column — no "advanced" toggle.
- No URL state for overrides. Overrides reset on navigation; that's fine.

---

## File Structure

This step modifies four files and adds one.

- `lib/api-spec/openapi.yaml` — extend `CategoryResults` with optional `candidatePool` (a tool dictionary).
- `artifacts/api-server/src/routes/advisor.ts` — populate `candidatePool` in `buildCategoryResultsResponse`.
- `artifacts/api-server/src/lib/advisorEngine.ts` — export `LOCKED_CATEGORIES` and `hiddenCategoriesForMode`.
- `artifacts/game-dev-advisor/src/lib/scoring.ts` — **new** ~150-line file. Copies of weights, per-axis deltas, `scoreTool`, `injectJitter`, hard filter. Exports `recomputeCategoryResults(args)`.
- `artifacts/game-dev-advisor/src/components/FeasibilityHeader.tsx` — render the two dropdowns + emit `onChangeMode` / `onChangeScope`.
- `artifacts/game-dev-advisor/src/pages/Analyzer.tsx` and `pages/SessionDetail.tsx` — own override state, call `recomputeCategoryResults`, render the disclaimer + decimal scores + hover breakdown.

---

## Task 1: Wire-Format Extension — `candidatePool`

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Modify: `artifacts/api-server/src/lib/advisorEngine.ts` (export the constants)
- Modify: `artifacts/api-server/src/routes/advisor.ts` (populate the pool)

- [ ] **Step 1.1: Extend OpenAPI**

In `lib/api-spec/openapi.yaml`, add to the `CategoryResults` schema (already present from Step 1):

```yaml
        candidatePool:
          type: object
          additionalProperties:
            type: array
            items:
              type: object
          description: "Per-category full candidate pool (pre-hard-filter), keyed by category id. Used by client-side recompute on Mode/Archetype edit."
```

Run codegen:

```powershell
pnpm --filter @workspace/api-spec run codegen
```

- [ ] **Step 1.2: Export `LOCKED_CATEGORIES` + `hiddenCategoriesForMode`**

In `artifacts/api-server/src/lib/advisorEngine.ts`, change the existing `LOCKED_CATEGORIES` declaration so it's exported, and add `export` to `hiddenCategoriesForMode`:

```ts
export const LOCKED_CATEGORIES = ["programming", "ui", "vfx", "build_ci"] as const;

export function hiddenCategoriesForMode(mode: ProjectMode): string[] {
  if (mode === "single_player") return ["networking", "backend_services"];
  if (mode === "co_op_local") return ["backend_services"];
  return [];
}
```

- [ ] **Step 1.3: Populate `candidatePool` in the response**

In `artifacts/api-server/src/routes/advisor.ts`, update `buildCategoryResultsResponse`:

```ts
function buildCategoryResultsResponse(
  categoryResults: CategoryResults,
  ragChunks: Array<{ text: string; source: string; score?: number | null }>,
  toolIdMap: Record<string, number>,
  projectMode: ProjectMode,
): {
  locked: CategoryRecommendationDTO[];
  flexible: CategoryRecommendationDTO[];
  hidden: string[];
  candidatePool: Record<string, GameDevTool[]>;
} {
  const hidden = new Set(hiddenCategoriesForMode(projectMode));
  const candidatePool: Record<string, GameDevTool[]> = {};
  for (const cat of TOOL_CATEGORIES) {
    if (hidden.has(cat.id)) continue;
    candidatePool[cat.id] = GAME_DEV_TOOLS.filter((t) => t.category === cat.id);
  }
  return {
    locked: categoryResults.locked.map((e) => toRecommendationDTO(e, ragChunks, toolIdMap)),
    flexible: categoryResults.flexible.map((e) => toRecommendationDTO(e, ragChunks, toolIdMap)),
    hidden: categoryResults.hidden,
    candidatePool,
  };
}
```

Add to the route's imports:

```ts
import { GAME_DEV_TOOLS, TOOL_CATEGORIES, type GameDevTool } from "../lib/gameDevTools.js";
import { hiddenCategoriesForMode, type ProjectMode } from "../lib/advisorEngine.js";
```

Update the two call sites (provisional + final) to pass projectMode:

```ts
buildCategoryResultsResponse(provisionalCategoryResults, [], toolIdMap, "single_player");
// ...
buildCategoryResultsResponse(categoryResults, ragChunks, toolIdMap, metadata.projectMode);
```

- [ ] **Step 1.4: Typecheck**

```powershell
pnpm run typecheck
```

Expected: clean.

---

## Task 2: New `lib/scoring.ts` (Frontend Duplicate of Math)

**Files:**
- Create: `artifacts/game-dev-advisor/src/lib/scoring.ts`

- [ ] **Step 2.1: Create the file**

Write the full content of `artifacts/game-dev-advisor/src/lib/scoring.ts`:

```ts
import type { ProjectInput, CategoryRecommendation, Evidence } from "@workspace/api-client-react";

export type Scope = "jam" | "prototype" | "indie" | "AA" | "AAA";
export type ProjectMode = "single_player" | "co_op_local" | "multiplayer_online" | "live_service";

export interface ClientGameDevTool {
  name: string;
  category: string;
  pricing: string;
  minSkillLevel: string;
  platforms: string[];
  tags: string[];
  ecosystem: string[];
  popularityByArchetype: Record<Scope, number> | null;
  archetypeBias?: Partial<Record<Scope, number>>;
  description?: string;
  strengths?: string[];
  weaknesses?: string[];
}

const WEIGHTS_BY_ARCHETYPE: Record<Scope, Record<string, number>> = {
  jam:       { budget: 0.6, skill: 1.2, platform: 0.8, time: 1.5, art: 1.0 },
  prototype: { budget: 0.7, skill: 1.1, platform: 0.9, time: 1.3, art: 1.0 },
  indie:     { budget: 1.0, skill: 1.0, platform: 1.0, time: 1.0, art: 1.0 },
  AA:        { budget: 0.9, skill: 0.9, platform: 1.1, time: 0.8, art: 1.1 },
  AAA:       { budget: 0.7, skill: 0.7, platform: 1.3, time: 0.6, art: 1.3 },
};

const LOCKED_CATEGORIES = new Set(["programming", "ui", "vfx", "build_ci"]);

function hiddenCategoriesForMode(mode: ProjectMode): string[] {
  if (mode === "single_player") return ["networking", "backend_services"];
  if (mode === "co_op_local") return ["backend_services"];
  return [];
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function injectJitter(score: number, toolName: string, seed: string): number {
  const j = (djb2(`${toolName}::${seed}`) % 1000) / 1000 - 0.5;
  return Math.max(0, Math.min(100, score + j));
}

function budgetDelta(t: ClientGameDevTool, input: ProjectInput): number {
  const m: Record<string, string[]> = {
    zero: ["open_source", "free"],
    low: ["open_source", "free", "freemium"],
    medium: ["open_source", "free", "freemium", "paid"],
    high: ["open_source", "free", "freemium", "paid", "subscription"],
    enterprise: ["open_source", "free", "freemium", "paid", "subscription"],
  };
  return (m[input.budget] ?? []).includes(t.pricing) ? 15 : -20;
}
function skillDelta(t: ClientGameDevTool, input: ProjectInput): number {
  const lv = ["beginner", "intermediate", "advanced", "expert"];
  const u = lv.indexOf(input.skillLevel);
  const r = lv.indexOf(t.minSkillLevel);
  if (u >= r) return u - r >= 2 ? 15 : 10;
  return -15 * (r - u);
}
function platformDelta(t: ClientGameDevTool, input: ProjectInput): number {
  if (input.platformTarget.length === 0) return 0;
  const u = input.platformTarget.map((p) => p.toLowerCase());
  const tp = t.platforms.map((p) => p.toLowerCase());
  const o = u.filter((p) => tp.includes(p));
  return o.length > 0 ? 10 + (o.length - 1) * 3 : -25;
}
function timeDelta(t: ClientGameDevTool, input: ProjectInput): number {
  if (input.timeLimit !== "jam") return 0;
  let d = 0;
  if (t.tags.includes("beginner-friendly") || t.tags.includes("game-jam")) d += 15;
  if (t.minSkillLevel === "expert" || t.minSkillLevel === "advanced") d -= 10;
  return d;
}
function artDelta(t: ClientGameDevTool, input: ProjectInput): number {
  if (t.category !== "art" && t.category !== "animation") return 0;
  const m: Record<string, string[]> = {
    none: ["ai_tooling"],
    basic: ["ai_tooling", "beginner"],
    intermediate: ["ai_tooling", "beginner", "intermediate"],
    advanced: ["ai_tooling", "beginner", "intermediate", "advanced"],
    professional: ["ai_tooling", "beginner", "intermediate", "advanced", "expert"],
  };
  const a = m[input.artCapability] ?? [];
  return a.includes(t.minSkillLevel) || a.includes("ai_tooling") ? 10 : -15;
}

export interface ScoringContext {
  input: ProjectInput;
  achievableScope: Scope;
  projectIdSeed: string;
  datasetIsThin: boolean;
}

export interface ClientScoreBreakdown {
  budget: number;
  skill: number;
  platform: number;
  timeLimit: number;
  artCapability: number;
  popularity: number;
  paidPriority: number;
  jitter: number;
  total: number;
}

export function scoreTool(
  tool: ClientGameDevTool,
  ctx: ScoringContext,
): { total: number; breakdown: ClientScoreBreakdown } {
  const w = WEIGHTS_BY_ARCHETYPE[ctx.achievableScope];
  const budget = budgetDelta(tool, ctx.input) * w.budget;
  const skill = skillDelta(tool, ctx.input) * w.skill;
  const platform = platformDelta(tool, ctx.input) * w.platform;
  const time = timeDelta(tool, ctx.input) * w.time;
  const art = artDelta(tool, ctx.input) * w.art;

  let popularity = 0;
  if (tool.popularityByArchetype) {
    const p = tool.popularityByArchetype[ctx.achievableScope] ?? 0.5;
    popularity = (p - 0.5) * (ctx.datasetIsThin ? 12.5 : 25);
  }

  const isPaid = ["paid", "subscription", "freemium"].includes(tool.pricing);
  const flagged = ctx.input.paidPriorityCategories?.includes(tool.category) ?? false;
  let paidPriority = 0;
  if (isPaid && flagged) paidPriority = 8;
  else if (isPaid && !flagged) paidPriority = -6;
  else if (!isPaid && !flagged) paidPriority = 4;

  const archetypeBiasDelta = tool.archetypeBias?.[ctx.achievableScope] ?? 0;

  const pre = 50 + budget + skill + platform + time + art + popularity + paidPriority + archetypeBiasDelta;
  const total = injectJitter(pre, tool.name, ctx.projectIdSeed);
  const jitter = total - Math.max(0, Math.min(100, pre));

  return {
    total,
    breakdown: { budget, skill, platform, timeLimit: time, artCapability: art, popularity, paidPriority, jitter, total },
  };
}

export interface RecomputeArgs {
  input: ProjectInput;
  modeOverride: ProjectMode;
  scopeOverride: Scope;
  candidatePool: Record<string, ClientGameDevTool[]>;
  ragChunks: Evidence["ragChunks"];
}

export interface RecomputedResults {
  locked: CategoryRecommendation[];
  flexible: CategoryRecommendation[];
  hidden: string[];
}

export function recomputeCategoryResults(args: RecomputeArgs): RecomputedResults {
  const ctx: ScoringContext = {
    input: args.input,
    achievableScope: args.scopeOverride,
    projectIdSeed: args.input.projectIdea.slice(0, 64),
    datasetIsThin: true,
  };
  const hidden = hiddenCategoriesForMode(args.modeOverride);

  const enginePool = args.candidatePool["engine"] ?? [];
  const engineScored = enginePool
    .map((tool) => ({ tool, ...scoreTool(tool, ctx) }))
    .sort((a, b) => b.total - a.total);
  const engineTop = engineScored[0];
  if (!engineTop) return { locked: [], flexible: [], hidden };

  const ecosystem = engineTop.tool.ecosystem.find((e) => e !== "engine_agnostic") ?? "engine_agnostic";

  const locked: CategoryRecommendation[] = [toRec("engine", engineScored)];
  const flexible: CategoryRecommendation[] = [];

  for (const [cat, pool] of Object.entries(args.candidatePool)) {
    if (cat === "engine") continue;
    if (hidden.includes(cat)) continue;
    const isLocked = LOCKED_CATEGORIES.has(cat);
    const filtered = isLocked
      ? pool.filter((t) => t.ecosystem.includes(ecosystem) || t.ecosystem.includes("engine_agnostic"))
      : pool;
    if (filtered.length === 0) continue;
    const scored = filtered
      .map((tool) => ({ tool, ...scoreTool(tool, ctx) }))
      .sort((a, b) => b.total - a.total);
    (isLocked ? locked : flexible).push(toRec(cat, scored));
  }

  return { locked, flexible, hidden };

  function toRec(
    cat: string,
    scored: { tool: ClientGameDevTool; total: number; breakdown: ClientScoreBreakdown }[],
  ): CategoryRecommendation {
    const top = scored[0];
    const alts = scored.slice(1, 3);
    const ev = (b: ClientScoreBreakdown): Evidence => ({ scoreBreakdown: b as never, ragChunks: args.ragChunks });
    const baseTool = (t: ClientGameDevTool) => ({
      toolId: 0,
      strengths: t.strengths ?? [],
      weaknesses: t.weaknesses ?? [],
      tradeoffs: (t.weaknesses ?? [])[0] ?? "",
    });
    return {
      category: cat,
      categoryLabel: cat,
      topPick: {
        ...baseTool(top.tool),
        toolName: top.tool.name,
        score: top.total,
        reasoning: top.tool.description ?? "",
        evidence: ev(top.breakdown),
        isTopPick: true,
      },
      alternatives: alts.map((a) => ({
        ...baseTool(a.tool),
        toolName: a.tool.name,
        score: a.total,
        reasoning: a.tool.description ?? "",
        evidence: ev(a.breakdown),
        isTopPick: false,
      })),
      categoryReasoning: top.tool.description ?? "",
    };
  }
}
```

Notes:
- `ClientGameDevTool` is loosely typed so wire payloads with extra fields don't break it.
- `categoryLabel` is set to the raw category id; the consumer maps it to the human label via the existing `CATEGORY_LABELS` constant.
- `datasetIsThin: true` mirrors the backend's default. Step 8 will flip both.
- `as never` casts are explicit because `Evidence.scoreBreakdown` from codegen may not yet include the new keys; the runtime shape matches.

- [ ] **Step 2.2: Typecheck**

```powershell
pnpm --filter @workspace/game-dev-advisor run typecheck
```

Expected: clean.

---

## Task 3: Add Mode/Scope Dropdowns to `FeasibilityHeader`

**Files:**
- Modify: `artifacts/game-dev-advisor/src/components/FeasibilityHeader.tsx`

- [ ] **Step 3.1: Extend props**

```tsx
type Mode = "single_player" | "co_op_local" | "multiplayer_online" | "live_service";
type ScopeValue = "jam" | "prototype" | "indie" | "AA" | "AAA";

export function FeasibilityHeader({
  result,
  onAdviseAnyway,
  isOverriding,
  modeOverride,
  scopeOverride,
  onChangeMode,
  onChangeScope,
}: {
  result: /* unchanged */;
  onAdviseAnyway?: () => void;
  isOverriding?: boolean;
  modeOverride?: Mode;
  scopeOverride?: ScopeValue;
  onChangeMode?: (m: Mode) => void;
  onChangeScope?: (s: ScopeValue) => void;
}) {
  // ...existing body...
}
```

- [ ] **Step 3.2: Render the dropdowns inline below the score line**

Add to every variant (Pass / Warn / Override / Block) just below the score sentence:

```tsx
{onChangeMode && onChangeScope && (
  <div className="flex flex-wrap items-center gap-3 mt-1">
    <label className="text-[11px] opacity-70">
      Mode:
      <select
        value={modeOverride}
        onChange={(e) => onChangeMode(e.target.value as Mode)}
        className="ml-1 bg-transparent border border-current/30 rounded px-1 py-0.5 text-[11px]"
      >
        <option value="single_player">single_player</option>
        <option value="co_op_local">co_op_local</option>
        <option value="multiplayer_online">multiplayer_online</option>
        <option value="live_service">live_service</option>
      </select>
    </label>
    <label className="text-[11px] opacity-70">
      Scope:
      <select
        value={scopeOverride}
        onChange={(e) => onChangeScope(e.target.value as ScopeValue)}
        className="ml-1 bg-transparent border border-current/30 rounded px-1 py-0.5 text-[11px]"
      >
        <option value="jam">jam</option>
        <option value="prototype">prototype</option>
        <option value="indie">indie</option>
        <option value="AA">AA</option>
        <option value="AAA">AAA</option>
      </select>
    </label>
  </div>
)}
```

Anti-overengineering: do not extract these into a separate component yet.

- [ ] **Step 3.3: Typecheck**

```powershell
pnpm --filter @workspace/game-dev-advisor run typecheck
```

Expected: clean.

---

## Task 4: Decimal Score + Hover Breakdown

**Files:**
- Modify: `artifacts/game-dev-advisor/src/pages/Analyzer.tsx` (`CategoryCard`, `EvidencePanel`)
- Modify: `artifacts/game-dev-advisor/src/pages/SessionDetail.tsx` (same components, duplicated)
- Modify: `artifacts/game-dev-advisor/src/components/LockedCategoryCard.tsx`

- [ ] **Step 4.1: Replace `Math.round(score)` with decimal display**

In each file, change every `{Math.round(cat.topPick.score)}` and `{Math.round(alt.score)}` to:

```tsx
{cat.topPick.score.toFixed(1)}
```

Search for occurrences:

```powershell
Select-String -Path artifacts/game-dev-advisor/src -Pattern "Math\.round\(.*score" | Select-Object Path, LineNumber, Line
```

Update each match in `Analyzer.tsx`, `SessionDetail.tsx`, `LockedCategoryCard.tsx`. `ScoreBar` already uses `style={{ width: \`${score}%\` }}` — no change.

- [ ] **Step 4.2: Extend `EvidencePanel` with the new breakdown rows**

In `Analyzer.tsx`'s `EvidencePanel`, update the `<dl>` block:

```tsx
<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
  <dt>Budget</dt>      <dd className="text-right font-mono">{evidence.scoreBreakdown.budget?.toFixed(1)}</dd>
  <dt>Skill</dt>       <dd className="text-right font-mono">{evidence.scoreBreakdown.skill?.toFixed(1)}</dd>
  <dt>Platform</dt>    <dd className="text-right font-mono">{evidence.scoreBreakdown.platform?.toFixed(1)}</dd>
  <dt>Time</dt>        <dd className="text-right font-mono">{evidence.scoreBreakdown.timeLimit?.toFixed(1)}</dd>
  <dt>Art</dt>         <dd className="text-right font-mono">{evidence.scoreBreakdown.artCapability?.toFixed(1)}</dd>
  <dt>Popularity</dt>  <dd className="text-right font-mono">{(evidence.scoreBreakdown as { popularity?: number }).popularity?.toFixed(1) ?? "—"}</dd>
  <dt>Paid Priority</dt><dd className="text-right font-mono">{(evidence.scoreBreakdown as { paidPriority?: number }).paidPriority?.toFixed(1) ?? "—"}</dd>
  <dt>Jitter</dt>      <dd className="text-right font-mono">{(evidence.scoreBreakdown as { jitter?: number }).jitter?.toFixed(2) ?? "—"}</dd>
</dl>
<p className="mt-2 text-[11px] text-muted-foreground/80">
  Total: <span className="font-mono">{evidence.scoreBreakdown.total?.toFixed(1)}</span>
</p>
```

Apply the same change to `SessionDetail.tsx`'s `EvidencePanel`.

- [ ] **Step 4.3: Typecheck**

```powershell
pnpm --filter @workspace/game-dev-advisor run typecheck
```

Expected: clean.

---

## Task 5: Override State + Recompute on Change

**Files:**
- Modify: `artifacts/game-dev-advisor/src/pages/Analyzer.tsx` (`AnalysisView`)
- Modify: `artifacts/game-dev-advisor/src/pages/SessionDetail.tsx`

- [ ] **Step 5.1: Add override state to `AnalysisView`**

Replace the body of `AnalysisView` with:

```tsx
function AnalysisView({
  result,
  onAdviseAnyway,
  isOverriding,
  projectInput,
}: {
  result: AnalysisResult;
  onAdviseAnyway: () => void;
  isOverriding: boolean;
  projectInput: ProjectInput | null;
}) {
  const buckets = result.categoryResults ?? { locked: [], flexible: [], hidden: [], candidatePool: {} };
  const tier = (result.ideaScoreTier ?? "pass") as "pass" | "warn" | "block";
  const blocked = tier === "block" && !result.feasibilityOverridden;

  const baseMode = (result.projectMode ?? "single_player") as Mode;
  const baseScope = (result.archetype?.achievable?.scope ?? "indie") as ScopeValue;
  const [modeOverride, setModeOverride] = useState<Mode>(baseMode);
  const [scopeOverride, setScopeOverride] = useState<ScopeValue>(baseScope);
  const isOverridden = modeOverride !== baseMode || scopeOverride !== baseScope;

  const recomputed = isOverridden && projectInput
    ? recomputeCategoryResults({
        input: projectInput,
        modeOverride,
        scopeOverride,
        candidatePool: (buckets.candidatePool ?? {}) as never,
        ragChunks: buckets.locked?.[0]?.topPick.evidence?.ragChunks ?? [],
      })
    : null;

  const renderLocked = recomputed ? recomputed.locked : (buckets.locked ?? []);
  const renderFlexible = recomputed ? recomputed.flexible : (buckets.flexible ?? []);
  const renderHidden = recomputed ? recomputed.hidden : (buckets.hidden ?? []);

  return (
    <div className="space-y-8">
      <FeasibilityHeader
        result={result}
        onAdviseAnyway={blocked ? onAdviseAnyway : undefined}
        isOverriding={isOverriding}
        modeOverride={modeOverride}
        scopeOverride={scopeOverride}
        onChangeMode={setModeOverride}
        onChangeScope={setScopeOverride}
      />

      {isOverridden && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
          Adjusted client-side. Submit the form again to regenerate the narrative.
        </div>
      )}

      {!blocked && (
        <>
          {/* ...existing metadata header card unchanged... */}
          <StackSections locked={renderLocked} flexible={renderFlexible} hidden={renderHidden} />
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

Update the call site to pass `lastInput`:

```tsx
<AnalysisView
  result={result}
  onAdviseAnyway={handleAdviseAnyway}
  isOverriding={isOverriding}
  projectInput={lastInput}
/>
```

- [ ] **Step 5.2: SessionDetail uses `session.projectInput`**

In `SessionDetail.tsx`, mirror the override pattern. The persisted `session.projectInput` provides the form state. Same `useState`, same `recomputeCategoryResults` call, same disclaimer banner, same conditional render. Reuse the `Mode` / `ScopeValue` literals from `lib/scoring.ts`.

- [ ] **Step 5.3: Add the imports**

To both pages:

```ts
import { recomputeCategoryResults } from "@/lib/scoring";
```

- [ ] **Step 5.4: Typecheck**

```powershell
pnpm run typecheck
```

Expected: clean.

---

## Task 6: Manual Verification + Commit

- [ ] **Step 6.1: Start both servers + browser walkthrough**

```powershell
pnpm --filter @workspace/api-server run dev
# in another terminal:
pnpm --filter @workspace/game-dev-advisor run dev
```

- [ ] **Step 6.2: Verify decimal scores**

Submit any form. Expected: card scores show one decimal (e.g. `82.4`), bar widths smooth.

- [ ] **Step 6.3: Verify hover breakdown**

Hover the "Why this recommendation?" trigger. Expected: 8 rows + total. `Popularity` and `Paid Priority` show `—` if missing (acceptable until Step 8).

- [ ] **Step 6.4: Verify Mode/Scope override**

Change Scope dropdown from `indie` to `AAA`. Expected:
- Yellow disclaimer banner appears.
- Engine card top pick may flip (e.g. Godot → Unreal Engine).
- Card scores recompute with new weights and decimal precision.
- Final Analysis paragraph unchanged.

Toggle back. Banner disappears, scores return to server values.

- [ ] **Step 6.5: Verify backend ↔ frontend math match**

Note the engine card score on first render (server-computed). Toggle Mode away and back. Score after toggle-back must match the original within `±0.1`.

- [ ] **Step 6.6: Stop dev servers + commit**

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force
Get-Process -Id (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force

git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react `
        artifacts/api-server/src/lib/advisorEngine.ts `
        artifacts/api-server/src/routes/advisor.ts `
        artifacts/game-dev-advisor/src/lib/scoring.ts `
        artifacts/game-dev-advisor/src/components/FeasibilityHeader.tsx `
        artifacts/game-dev-advisor/src/components/LockedCategoryCard.tsx `
        artifacts/game-dev-advisor/src/pages/Analyzer.tsx `
        artifacts/game-dev-advisor/src/pages/SessionDetail.tsx
git commit -m "feat: decimal scores + editable mode/scope client recompute"
git log -1 --stat
```

---

## Self-Review Checklist

**1. Spec coverage**
- Decimal display (`toFixed(1)`) → Task 4.1.
- Bar width without rounding → existing CSS, no change.
- Hover breakdown (8 components + total) → Task 4.2.
- Editable Mode + Archetype dropdowns → Task 3.
- Client-side recompute → Task 5.1 (`recomputeCategoryResults`).
- Disclaimer banner → Task 5.1 ("Adjusted client-side. Submit the form again to regenerate the narrative.").
- No narrative regeneration → Task 5.1 (Final Analysis paragraph reads `result.finalSummary` always).
- Math duplicated to client (spec §9.1) → Task 2.1 (`lib/scoring.ts`).

**2. Placeholder scan** — No "TBD". Wire-format `candidatePool` description is concrete prose.

**3. Type consistency**
- `Scope` and `ProjectMode` in `lib/scoring.ts` mirror Step 4's backend types exactly.
- `WEIGHTS_BY_ARCHETYPE` is byte-identical to Step 6's backend table.
- `ClientScoreBreakdown` keys mirror backend `ScoreBreakdown` (with `timeLimit` / `artCapability` retained).

**4. Anti-overengineering check**
- Single duplication file (`lib/scoring.ts`); no shared workspace package.
- Plain `<select>` instead of shadcn combobox.
- No URL state for overrides.
- No memoization (the recompute is cheap).
- The wire-format `candidatePool` field is the minimum data needed. No "compute deltas server-side" optimization.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-intelligent-advisor-step7.md`.

**Two execution options:**

1. **Subagent-Driven** — Six tasks. Tasks 1 (wire) + 2 (math) deserve a single careful subagent each; Task 4 (decimal display) is mechanical.
2. **Inline Execution** — The browser smoke in Task 6 catches math drift fast; inline is preferable.

**Which approach?**
