# Intelligent Advisor — Step 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `scoreTool` with the archetype-weighted version (spec §5.2). Add a popularity-by-archetype term, a paid-priority delta, optional `archetypeBias`, and deterministic per-tool jitter (spec §5.3). Stop rounding the score — keep it as a float through the response. Engine ranking should differ between AAA-framed and jam-framed versions of the same project.

**Architecture:** Single-file change in `advisorEngine.ts`. The new `scoreTool` takes a richer `ScoringContext` (`achievableScope`, `paidPriorityCategories`, `projectIdSeed`). Its public type stays `{ total: number; breakdown: ScoreBreakdown }` — the breakdown gains a `popularity`, `paidPriority`, and `jitter` field. `injectJitter` uses a djb2 hash of `${tool.name}::${seed}` mod 1000, normalized to `±0.5`. The seed is the project idea's first 64 chars (deterministic per request, but varied across projects).

**Tech Stack:** TypeScript, no test framework.

**Source spec:** [docs/superpowers/specs/2026-05-06-intelligent-advisor-design.md §5.2 + §5.3](../specs/2026-05-06-intelligent-advisor-design.md)
**Source plan:** [plans/2026-05-06-intelligent-advisor-refactor.md Step 6](../../../plans/2026-05-06-intelligent-advisor-refactor.md)
**Depends on:** Steps 2 + 4 (`buildCategoryResults` already calls `scoreTool` per tool; `metadata.achievableScope` is already plumbed).

**Project conventions (read first):**
- All edits in one file: `artifacts/api-server/src/lib/advisorEngine.ts`. One secondary edit in `routes/advisor.ts` to thread the seed.
- All commands run in PowerShell.

**Anti-overengineering boundary:**
- No new module for the weights table — it's a `const` block beside `scoreTool`.
- No injectable hash function. djb2 is 6 lines inlined.
- No "calibration mode" toggle for popularity weights. The dataset-thin halving rule is one `if` based on a known-at-startup boolean (set by Task 8's loader; until Task 8 lands the boolean stays `true`).
- No telemetry hook for score breakdowns. `ScoreBreakdown` already carries the values; the route reads them.
- The `archetypeBias` field is optional in the data; the score function reads it with `??` defaults — no defensive checks.
- Do not refactor `generateReasoning` to mention popularity / archetype unless the spec explicitly requires it. (It doesn't.)

---

## File Structure

This step modifies one file (and threads one new argument from another).

- `artifacts/api-server/src/lib/advisorEngine.ts` — replace `scoreTool` body, replace `ScoreBreakdown` interface, add `WEIGHTS_BY_ARCHETYPE` + `injectJitter` + a `ScoringContext` type, add `DATASET_IS_THIN` boolean (defaults to `true`; Task 8 flips to `false` when popularity data is loaded). Update `buildCategoryResults` to thread context through.
- `artifacts/api-server/src/routes/advisor.ts` — pass `metadata.achievableScope` and a project-idea-derived seed to `buildCategoryResults`.

---

## Task 1: Weights Table + `injectJitter` + `ScoringContext`

**Files:**
- Modify: `artifacts/api-server/src/lib/advisorEngine.ts` (additions near the top, after `BUDGET_USD` from Step 4)

- [ ] **Step 1.1: Add weights, jitter, scoring-context types, and the dataset-thin guard**

In `artifacts/api-server/src/lib/advisorEngine.ts`, just below the `TEAM_MIN_BY_SCOPE` block from Step 4, insert:

```ts
type ScoringAxis = "budget" | "skill" | "platform" | "time" | "art";

const WEIGHTS_BY_ARCHETYPE: Record<Scope, Record<ScoringAxis, number>> = {
  jam:       { budget: 0.6, skill: 1.2, platform: 0.8, time: 1.5, art: 1.0 },
  prototype: { budget: 0.7, skill: 1.1, platform: 0.9, time: 1.3, art: 1.0 },
  indie:     { budget: 1.0, skill: 1.0, platform: 1.0, time: 1.0, art: 1.0 },
  AA:        { budget: 0.9, skill: 0.9, platform: 1.1, time: 0.8, art: 1.1 },
  AAA:       { budget: 0.7, skill: 0.7, platform: 1.3, time: 0.6, art: 1.3 },
};

// Flipped to `false` once the popularity dataset is loaded in Task 8.
// While true, the popularity term is halved (spec §6 dataset-thin guard).
export let DATASET_IS_THIN = true;
export function setDatasetThin(value: boolean): void {
  DATASET_IS_THIN = value;
}

export interface ScoringContext {
  input: ProjectInput;
  achievableScope: Scope;
  projectIdSeed: string;
}

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function injectJitter(score: number, toolName: string, projectIdSeed: string): number {
  const jitter = (djb2(`${toolName}::${projectIdSeed}`) % 1000) / 1000 - 0.5; // -0.5 .. +0.5
  return Math.max(0, Math.min(100, score + jitter));
}
```

`DATASET_IS_THIN` is a module-level mutable export. Anti-overengineering: no DI, no factory. The setter exists only so Task 8's loader can flip it once at startup.

- [ ] **Step 1.2: Replace `ScoreBreakdown`**

Replace the existing `ScoreBreakdown` interface (currently lines 28–35) with:

```ts
export interface ScoreBreakdown {
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
```

(Three new keys: `popularity`, `paidPriority`, `jitter`. Step 7's hover tooltip on the frontend reads these.)

---

## Task 2: Replace `scoreTool`

**Files:**
- Modify: `artifacts/api-server/src/lib/advisorEngine.ts` (replace the existing `scoreTool` at lines 72–151)

- [ ] **Step 2.1: Extract per-axis delta helpers**

Just above the new `scoreTool`, add the per-axis helper functions (each returns the **unweighted** delta — the existing per-axis logic minus rounding/clamping):

```ts
function budgetDelta(tool: GameDevTool, input: ProjectInput): number {
  const budgetMap: Record<string, string[]> = {
    zero: ["open_source", "free"],
    low: ["open_source", "free", "freemium"],
    medium: ["open_source", "free", "freemium", "paid"],
    high: ["open_source", "free", "freemium", "paid", "subscription"],
    enterprise: ["open_source", "free", "freemium", "paid", "subscription"],
  };
  return (budgetMap[input.budget] ?? []).includes(tool.pricing) ? 15 : -20;
}

function skillDelta(tool: GameDevTool, input: ProjectInput): number {
  const levels = ["beginner", "intermediate", "advanced", "expert"];
  const userIdx = levels.indexOf(input.skillLevel);
  const toolIdx = levels.indexOf(tool.minSkillLevel);
  if (userIdx >= toolIdx) return userIdx - toolIdx >= 2 ? 15 : 10;
  return -15 * (toolIdx - userIdx);
}

function platformDelta(tool: GameDevTool, input: ProjectInput): number {
  if (input.platformTarget.length === 0) return 0;
  const userPlatforms = input.platformTarget.map((p) => p.toLowerCase());
  const toolPlatforms = tool.platforms.map((p) => p.toLowerCase());
  const overlap = userPlatforms.filter((p) => toolPlatforms.includes(p));
  if (overlap.length > 0) return 10 + (overlap.length - 1) * 3;
  return -25;
}

function timeDelta(tool: GameDevTool, input: ProjectInput): number {
  if (input.timeLimit !== "jam") return 0;
  let d = 0;
  if (tool.tags.includes("beginner-friendly") || tool.tags.includes("game-jam")) d += 15;
  if (tool.minSkillLevel === "expert" || tool.minSkillLevel === "advanced") d -= 10;
  return d;
}

function artDelta(tool: GameDevTool, input: ProjectInput): number {
  if (tool.category !== "art" && tool.category !== "animation") return 0;
  const artMap: Record<string, string[]> = {
    none: ["ai_tooling"],
    basic: ["ai_tooling", "beginner"],
    intermediate: ["ai_tooling", "beginner", "intermediate"],
    advanced: ["ai_tooling", "beginner", "intermediate", "advanced"],
    professional: ["ai_tooling", "beginner", "intermediate", "advanced", "expert"],
  };
  const allowed = artMap[input.artCapability] ?? [];
  return allowed.includes(tool.minSkillLevel) || allowed.includes("ai_tooling") ? 10 : -15;
}
```

- [ ] **Step 2.2: Replace `scoreTool` with the weighted version**

Delete the old `scoreTool` body and replace with:

```ts
export function scoreTool(
  tool: GameDevTool,
  ctx: ScoringContext,
): { total: number; breakdown: ScoreBreakdown } {
  const w = WEIGHTS_BY_ARCHETYPE[ctx.achievableScope];

  const budget = budgetDelta(tool, ctx.input) * w.budget;
  const skill = skillDelta(tool, ctx.input) * w.skill;
  const platform = platformDelta(tool, ctx.input) * w.platform;
  const time = timeDelta(tool, ctx.input) * w.time;
  const art = artDelta(tool, ctx.input) * w.art;

  // Popularity-by-archetype signal
  let popularity = 0;
  if (tool.popularityByArchetype) {
    const p = tool.popularityByArchetype[ctx.achievableScope] ?? 0.5;
    const range = DATASET_IS_THIN ? 12.5 : 25;
    popularity = (p - 0.5) * range;
  }

  // Paid-priority signal
  const isPaid = ["paid", "subscription", "freemium"].includes(tool.pricing);
  const flagged = ctx.input.paidPriorityCategories?.includes(tool.category) ?? false;
  let paidPriority = 0;
  if (isPaid && flagged) paidPriority = 8;
  else if (isPaid && !flagged) paidPriority = -6;
  else if (!isPaid && !flagged) paidPriority = 4;
  // (!isPaid && flagged) → 0

  // Tool-specific archetype bias
  const archetypeBiasDelta = tool.archetypeBias?.[ctx.achievableScope] ?? 0;

  const preJitter = 50 + budget + skill + platform + time + art + popularity + paidPriority + archetypeBiasDelta;
  const total = injectJitter(preJitter, tool.name, ctx.projectIdSeed);
  const jitter = total - Math.max(0, Math.min(100, preJitter));

  return {
    total,
    breakdown: {
      budget,
      skill,
      platform,
      timeLimit: time,
      artCapability: art,
      popularity,
      paidPriority,
      jitter,
      total,
    },
  };
}
```

Note: `total` is **not rounded**. Frontend (Step 7) renders `score.toFixed(1)`. The `jitter` field is the actual nudge applied — useful for the hover tooltip in Step 7.

The `ScoreBreakdown.timeLimit` / `artCapability` keys are kept for backward visual compatibility with the existing breakdown UI; do not rename to `time` / `art`.

- [ ] **Step 2.3: Thread `ScoringContext` through `buildCategoryResults`**

Update `buildCategoryResults` (and the local helpers from Step 2 of the source plan) to take the new context:

```ts
export function buildCategoryResults(
  input: ProjectInput,
  projectMode: ProjectMode = "single_player",
  achievableScope: Scope = "indie",
  projectIdSeed: string = input.projectIdea.slice(0, 64),
): CategoryResults {
  const ctx: ScoringContext = { input, achievableScope, projectIdSeed };
  // ... rest of the function structure unchanged — pass `ctx` instead of `input`
  //     into `scoreCategory` / `scoreCategoryFromPool`.
}
```

Update the helpers:

```ts
function scoreCategory(cat: string, ctx: ScoringContext): CategoryEntry | null {
  return scoreCategoryFromPool(cat, GAME_DEV_TOOLS.filter((t) => t.category === cat), ctx);
}

function scoreCategoryFromPool(
  cat: string,
  pool: GameDevTool[],
  ctx: ScoringContext,
): CategoryEntry | null {
  if (pool.length === 0) return null;
  const scored: ToolScore[] = pool.map((tool) => {
    const scoredTool = scoreTool(tool, ctx);
    return {
      tool,
      score: scoredTool.total,
      scoreBreakdown: scoredTool.breakdown,
      reasoning: generateReasoning(tool, ctx.input, scoredTool.total),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const alts = scored.slice(1, 3);
  return {
    category: cat,
    topTool: { ...top.tool, score: top.score, scoreBreakdown: top.scoreBreakdown, reasoning: top.reasoning },
    alternatives: alts.map((a) => ({ ...a.tool, score: a.score, scoreBreakdown: a.scoreBreakdown, reasoning: a.reasoning })),
  };
}
```

- [ ] **Step 2.4: Typecheck the api-server package**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: `routes/advisor.ts` errors (the new `buildCategoryResults` arity). `advisorEngine.ts` is clean.

---

## Task 3: Thread Context from `routes/advisor.ts`

**Files:**
- Modify: `artifacts/api-server/src/routes/advisor.ts`

- [ ] **Step 3.1: Update both `buildCategoryResults` call sites**

In `routes/advisor.ts`, replace the provisional call (Step 4 plan, "Phase 1"):

```ts
const provisionalCategoryResults = buildCategoryResults(input, "single_player");
```

with:

```ts
const provisionalCategoryResults = buildCategoryResults(
  input,
  "single_player",
  // achievableScope unknown until metadata returns — use a neutral baseline so the
  // provisional ranking can feed the metadata prompt. Re-scored below with the real scope.
  "indie",
  input.projectIdea.slice(0, 64),
);
```

And replace the post-metadata call:

```ts
const categoryResults =
  metadata.projectMode === "single_player"
    ? provisionalCategoryResults
    : buildCategoryResults(input, metadata.projectMode);
```

with:

```ts
const categoryResults = buildCategoryResults(
  input,
  metadata.projectMode,
  metadata.achievableScope,
  input.projectIdea.slice(0, 64),
);
```

(We always re-score post-metadata now: the achievable scope is the real one and may differ from the provisional `"indie"`. Provisional was just for the prompt's `topStackSummary`. Cost: ~30 tools × N categories × O(1) → trivial.)

- [ ] **Step 3.2: Typecheck**

```powershell
pnpm run typecheck
```

Expected: clean.

---

## Task 4: Verification + Commit

- [ ] **Step 4.1: Build + start the server**

```powershell
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run dev
```

- [ ] **Step 4.2: Same idea, AAA framing vs jam framing**

```powershell
$aaa = @{
  projectIdea     = "Photoreal AAA action-adventure with motion-capture cinematics, 100h story, full voice cast"
  budget          = "enterprise"
  timeLimit       = "longterm"
  skillLevel      = "advanced"
  teamSize        = "large"
  platformTarget  = @("pc", "console")
  artCapability   = "professional"
  otherConstraints = $null
} | ConvertTo-Json
# (parse SSE same way as Step 4 plan, capture $result)

$jam = @{
  projectIdea     = "48h Ludum Dare entry: simple action-adventure"
  budget          = "low"
  timeLimit       = "jam"
  skillLevel      = "intermediate"
  teamSize        = "solo"
  platformTarget  = @("pc")
  artCapability   = "basic"
  otherConstraints = $null
} | ConvertTo-Json
# (parse SSE)
```

Expected:
- AAA run: `engine.locked.topPick.toolName` is **Unreal Engine** (or **Unity**), with a decimal score (e.g. `82.4`, not `80`).
- Jam run: `engine.locked.topPick.toolName` is **Godot** (or another lightweight engine), with a different rank order from the AAA run.
- Both results include `scoreBreakdown.popularity`, `scoreBreakdown.paidPriority`, `scoreBreakdown.jitter` fields (non-null numbers).
- Scores are decimals — search the JSON for any `\.\d` pattern in score fields.

- [ ] **Step 4.3: Determinism check**

Run the AAA scenario three times with **identical** body. Expected: every score is **bit-identical** across runs. (The seed `projectIdea.slice(0, 64)` is identical, so jitter is identical.)

- [ ] **Step 4.4: Paid-priority delta sanity**

Re-run any pass-tier scenario twice — once with `paidPriorityCategories: []`, once with `paidPriorityCategories: ["ai_tooling"]`. Expected: a paid `ai_tooling` tool's score is +14 higher in the second run (`+8` for flagged-paid vs `-6` for unflagged-paid). Free tools are unaffected by the flag.

- [ ] **Step 4.5: Stop the server + commit**

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force

git add artifacts/api-server/src/lib/advisorEngine.ts artifacts/api-server/src/routes/advisor.ts
git commit -m "feat: archetype-weighted scoring with popularity + jitter"
git log -1 --stat
```

---

## Self-Review Checklist

**1. Spec coverage**
- `WEIGHTS_BY_ARCHETYPE` table → Task 1.1 (matches spec §5.2 verbatim).
- Popularity term `(p - 0.5) * 25` (or *12.5 when dataset thin) → Task 2.2 + Task 1.1 (`DATASET_IS_THIN`).
- Paid-priority delta (+8 / -6 / +4 / 0) → Task 2.2.
- `archetypeBias` per-tool override → Task 2.2 (`tool.archetypeBias?.[scope] ?? 0`).
- djb2 jitter, mod 1000, normalized to ±0.5, clamped to [0, 100] → Task 1.1 (`djb2`, `injectJitter`).
- No rounding through to response → Task 2.2 (`total = injectJitter(...)` returned float).
- Decimal scores visible at API → Task 4.2.
- Different rank order between AAA and jam framings → Task 4.2.

**2. Placeholder scan** — All numbers are spec literals. No "TBD".

**3. Type consistency**
- `Scope` (`jam | prototype | indie | AA | AAA`) is the same `Scope` from Step 4.
- `WEIGHTS_BY_ARCHETYPE` keys exhaust `Scope`.
- `ScoreBreakdown` keeps `timeLimit` / `artCapability` field names so the existing frontend evidence panel does not break.

**4. Anti-overengineering check**
- One file is the primary edit; the route change is a single arg-list update at two call sites.
- `DATASET_IS_THIN` is a module-level boolean. No DI container.
- djb2 is 6 lines inline, not a `crypto`-grade hash.
- Per-axis delta helpers are extracted only because the new `scoreTool` is more readable that way — small DRY win, not a layering change.
- `generateReasoning` is unchanged — the spec doesn't require it to mention popularity.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-intelligent-advisor-step6.md`.

**Two execution options:**

1. **Subagent-Driven** — Four tasks. The math + types in Task 1+2 deserve one focused subagent.
2. **Inline Execution** — Faster end-to-end if you want to fiddle with weights interactively against curl runs.

**Which approach?**
