# Intelligent Advisor — Step 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tier decision real. Add deterministic `heuristicIdeaScore(ctx)` that produces `ideaScore` + `ideaScoreTier` + a list of mismatch reasons. Extend the existing metadata LLM call to also return `impliedArchetype`, `achievableArchetype`, `mismatchReasons[]`, `projectMode` (LLM provides text reasons; heuristic still owns the tier decision). Wire an early return in the route for `tier === "block"` when `adviseAnyway` is false: skip filter / scoring / LLM #2 and return `categoryResults: null`.

**Architecture:** The tier decision is heuristic-only (spec §5.4) — deterministic, demo-stable, immune to LLM jitter. The LLM contributes human-readable explanations and the archetype labels; heuristic and LLM mismatch reasons are merged and deduplicated. The block-tier early return short-circuits scoring + the second LLM call to save cost and to render the Reality Check panel without confusing recommendations underneath. `projectMode` is now LLM-derived but defaults to `"single_player"` when the LLM omits it.

**Tech Stack:** TypeScript, Express, Zod v4, OpenAI SDK (`gpt-4o-mini`). No test framework.

**Source spec:** [docs/superpowers/specs/2026-05-06-intelligent-advisor-design.md §5.4](../specs/2026-05-06-intelligent-advisor-design.md)
**Source plan:** [plans/2026-05-06-intelligent-advisor-refactor.md Step 4](../../../plans/2026-05-06-intelligent-advisor-refactor.md)
**Depends on:** Steps 1 + 2 must be merged. Step 3 is independent and can run in parallel.

**Project conventions (read first):**
- All edits live in two files: `advisorEngine.ts` (heuristic + extended metadata fn) and `routes/advisor.ts` (early-return + adviseAnyway plumbing).
- The metadata LLM call already exists in `advisorEngine.ts` as `generateMetadataWithAI`. Extend its prompt + JSON schema; do not create a third LLM call.
- `gpt-4o-mini` with `response_format: { type: "json_object" }` is already wired — keep using it.
- All commands run in PowerShell.
- Zod imports use `zod/v4` (not bare `zod`).

**Anti-overengineering boundary:**
- No retries, timeouts, abort signals, or model fallbacks for the LLM call. The existing `try { JSON.parse } catch { fallback }` pattern in `generateMetadataWithAI` already handles malformed output. Extend it; don't replace it with a fancier framework.
- No new file for the heuristic. It's ~30 lines and lives next to `scoreTool` in `advisorEngine.ts`.
- No `Record<Scope, number>` lookup table extracted into JSON. Hardcoded numeric tables — they are spec literals, not user-editable config.
- No telemetry hook for tier decisions ("for analytics later"). YAGNI.
- No "warn-tier conservative mode" toggle. The thresholds are spec literals; ship them.
- The block-tier early return does **not** skip the metadata LLM call — that call is **how** we get `mismatchReasons[]` for the Reality Check panel. Only the second LLM call (final summary) and the heavy scoring path are skipped.

---

## File Structure

This step modifies two existing files. No new files.

- `artifacts/api-server/src/lib/advisorEngine.ts` — add `Scope` type alias, `heuristicIdeaScore`, `tierFromScore`; extend the `AnalysisMetadata` interface + `generateMetadataWithAI` JSON-object prompt to include archetype + mismatch + projectMode fields.
- `artifacts/api-server/src/routes/advisor.ts` — call heuristic + decide tier before scoring; on `block` + no `adviseAnyway`, send minimal `done` payload with `categoryResults: null` and return; otherwise run the existing flow with the heuristic-derived feasibility fields populating the response.

---

## Task 1: Heuristic Idea Score in `advisorEngine.ts`

**Files:**
- Modify: `artifacts/api-server/src/lib/advisorEngine.ts` (add scope/heuristic types after line 8, extend `AnalysisMetadata` near line 65, extend `generateMetadataWithAI` near lines 297–325 + 361–398)

- [ ] **Step 1.1: Add `Scope`, `IdeaScoreTier`, scope baselines, and the heuristic function**

In `artifacts/api-server/src/lib/advisorEngine.ts`, just below the `LOCKED_CATEGORIES` block from Step 2 (or just below the `import` block if Step 2 didn't land yet), insert:

```ts
export type Scope = "jam" | "prototype" | "indie" | "AA" | "AAA";
export type IdeaScoreTier = "pass" | "warn" | "block";

const SCOPE_ORDER: Scope[] = ["jam", "prototype", "indie", "AA", "AAA"];

const BUDGET_USD: Record<string, number> = {
  zero: 0,
  low: 1_000,
  medium: 25_000,
  high: 500_000,
  enterprise: 5_000_000,
};

const TEAM_COUNT: Record<string, number> = {
  solo: 1,
  small: 3,
  medium: 8,
  large: 30,
};

const BUDGET_MIN_BY_SCOPE: Record<Scope, number> = {
  jam: 0,
  prototype: 0,
  indie: 1_000,
  AA: 500_000,
  AAA: 5_000_000,
};

const TEAM_MIN_BY_SCOPE: Record<Scope, number> = {
  jam: 1,
  prototype: 1,
  indie: 1,
  AA: 20,
  AAA: 100,
};

export interface IdeaScoreContext {
  input: ProjectInput;
  impliedScope: Scope;
  achievableScope: Scope;
}

export function heuristicIdeaScore(ctx: IdeaScoreContext): { score: number; reasons: string[] } {
  let s = 100;
  const reasons: string[] = [];

  const gap = SCOPE_ORDER.indexOf(ctx.impliedScope) - SCOPE_ORDER.indexOf(ctx.achievableScope);
  if (gap >= 3) {
    s -= 50;
    reasons.push(
      `Implied scope (${ctx.impliedScope}) is far above what your resources support (${ctx.achievableScope}).`,
    );
  } else if (gap === 2) {
    s -= 30;
    reasons.push(
      `Implied scope (${ctx.impliedScope}) is two tiers above what your resources support (${ctx.achievableScope}).`,
    );
  } else if (gap === 1) {
    s -= 15;
    reasons.push(
      `Implied scope (${ctx.impliedScope}) is one tier above what your resources support (${ctx.achievableScope}).`,
    );
  }

  const budgetUsd = BUDGET_USD[ctx.input.budget] ?? 0;
  const budgetFloor = BUDGET_MIN_BY_SCOPE[ctx.impliedScope];
  if (budgetUsd < budgetFloor) {
    s -= 20;
    reasons.push(
      `Your budget (${ctx.input.budget}) is below the typical floor for ${ctx.impliedScope} projects.`,
    );
  }

  const teamCount = TEAM_COUNT[ctx.input.teamSize] ?? 1;
  const teamFloor = TEAM_MIN_BY_SCOPE[ctx.impliedScope];
  if (teamCount < teamFloor) {
    s -= 20;
    reasons.push(
      `Your team size (${ctx.input.teamSize}) is below the typical headcount for ${ctx.impliedScope} projects.`,
    );
  }

  return { score: Math.max(0, Math.min(100, s)), reasons };
}

export function tierFromScore(score: number): IdeaScoreTier {
  if (score < 30) return "block";
  if (score < 60) return "warn";
  return "pass";
}
```

Notes on key alignment with the current Zod schema (verified against `lib/api-spec/openapi.yaml` lines 198–222 and `ProjectInput` in `advisorEngine.ts`):
- `budget` enum: `zero | low | medium | high | enterprise` — five keys present in `BUDGET_USD`.
- `teamSize` enum: `solo | small | medium | large` — four keys present in `TEAM_COUNT`. The spec mentions `studio` but the project's Zod has no such value; do **not** add it.
- The `?? 0` and `?? 1` defaults guard against future enum changes; safer than throwing for an "impossible" value.

- [ ] **Step 1.2: Extend `AnalysisMetadata`**

In `artifacts/api-server/src/lib/advisorEngine.ts`, replace the `AnalysisMetadata` interface (currently lines 65–70) with:

```ts
export type ProjectMode = "single_player" | "co_op_local" | "multiplayer_online" | "live_service";

export interface AnalysisMetadata {
  projectSummary: string;
  detectedProjectType: string;
  stackOverview: string;
  overallConfidence: number;
  impliedScope: Scope;
  achievableScope: Scope;
  mismatchReasons: string[];
  projectMode: ProjectMode;
}
```

If Step 2 already declared `ProjectMode`, delete the duplicate from Step 2's location (or this one) — keep one. Either location is fine; pick the file's natural top.

- [ ] **Step 1.3: Extend the metadata prompt**

In `artifacts/api-server/src/lib/advisorEngine.ts`, replace `getMetadataPrompt` (currently lines 297–325) with:

```ts
function getMetadataPrompt(input: ProjectInput, topStackSummary: string, retrievedKnowledgeContext: string): string {
  return `You are a senior game development consultant. Analyze this game project and provide concise, expert analysis.

PROJECT DETAILS:
- Idea: ${input.projectIdea}
- Budget: ${input.budget}
- Timeline: ${input.timeLimit}
- Skill Level: ${input.skillLevel}
- Team: ${input.teamSize}
- Target Platforms: ${input.platformTarget.join(", ")}
- Art Capability: ${input.artCapability}
- Constraints: ${input.otherConstraints || "None"}

PRE-SCORED TOOL STACK:
${topStackSummary}

RETRIEVED KNOWLEDGE CONTEXT:
${retrievedKnowledgeContext}

SCOPE BASELINES (industry typical, USD):
- jam:       budget ~ $0,         team 1,         time hours-days
- prototype: budget ~ $0,         team 1-2,       time 1-3 months
- indie:     budget $1K - $500K,  team 1-10,      time 6-24 months
- AA:        budget $500K - $50M, team 20-100,    time 2-4 years
- AAA:       budget $50M+,        team 100-500+,  time 3-7 years

PROJECT MODE GUIDE:
- single_player: no networked play
- co_op_local: shared-screen / LAN-only multiplayer
- multiplayer_online: matchmaking, dedicated servers, cross-region play
- live_service: persistent online world with seasonal content

Use the pre-scored tool stack as the base ranking. When retrieved knowledge context is available, ground explanations in it and use source metadata to understand where each fact came from. Do not invent unsupported details about tools, pricing, capabilities, performance, or platform support.

Respond with a JSON object with these EXACT keys:
{
  "projectSummary": "2-3 sentence summary",
  "detectedProjectType": "Brief label like '2D Platformer', 'Mobile Puzzle Game'",
  "stackOverview": "One crisp sentence listing core recommended tools",
  "overallConfidence": <0-100>,
  "impliedScope": "<one of: jam | prototype | indie | AA | AAA — what scope the project IDEA suggests>",
  "achievableScope": "<one of: jam | prototype | indie | AA | AAA — what scope the budget+team+time actually supports>",
  "mismatchReasons": ["short bullet strings describing concrete scope/budget/team/time gaps"],
  "projectMode": "<one of: single_player | co_op_local | multiplayer_online | live_service>"
}`;
}
```

- [ ] **Step 1.4: Extend `generateMetadataWithAI` parser + fallback**

In `artifacts/api-server/src/lib/advisorEngine.ts`, replace the body of `generateMetadataWithAI` (currently lines 361–398) with:

```ts
export async function generateMetadataWithAI(
  input: ProjectInput,
  categoryResults: CategoryResults,
  retrievedKnowledgeContext: string,
): Promise<AnalysisMetadata> {
  const prompt = getMetadataPrompt(input, buildTopStackSummary(categoryResults), retrievedKnowledgeContext);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const fallbackAchievable = deriveAchievableScopeFromInput(input);
  let parsed: Partial<AnalysisMetadata> = {};

  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  const impliedScope = isScope(parsed.impliedScope) ? parsed.impliedScope : fallbackAchievable;
  const achievableScope = isScope(parsed.achievableScope) ? parsed.achievableScope : fallbackAchievable;
  const projectMode = isProjectMode(parsed.projectMode) ? parsed.projectMode : "single_player";

  return {
    projectSummary:
      parsed.projectSummary ?? "A game development project with specific constraints and goals.",
    detectedProjectType: parsed.detectedProjectType ?? "Indie Game",
    stackOverview:
      parsed.stackOverview ??
      [...categoryResults.locked, ...categoryResults.flexible]
        .map((e) => e.topTool.name)
        .slice(0, 4)
        .join(" + "),
    overallConfidence: typeof parsed.overallConfidence === "number" ? parsed.overallConfidence : 72,
    impliedScope,
    achievableScope,
    mismatchReasons: Array.isArray(parsed.mismatchReasons)
      ? parsed.mismatchReasons.filter((r): r is string => typeof r === "string")
      : [],
    projectMode,
  };
}

function isScope(v: unknown): v is Scope {
  return typeof v === "string" && (SCOPE_ORDER as string[]).includes(v);
}

function isProjectMode(v: unknown): v is ProjectMode {
  return v === "single_player" || v === "co_op_local" || v === "multiplayer_online" || v === "live_service";
}

function deriveAchievableScopeFromInput(input: ProjectInput): Scope {
  const budget = BUDGET_USD[input.budget] ?? 0;
  const team = TEAM_COUNT[input.teamSize] ?? 1;
  if (budget >= BUDGET_MIN_BY_SCOPE.AAA && team >= TEAM_MIN_BY_SCOPE.AAA) return "AAA";
  if (budget >= BUDGET_MIN_BY_SCOPE.AA && team >= TEAM_MIN_BY_SCOPE.AA) return "AA";
  if (budget >= BUDGET_MIN_BY_SCOPE.indie || team >= 2) return "indie";
  if (input.timeLimit === "jam") return "jam";
  return "prototype";
}
```

The `deriveAchievableScopeFromInput` fallback is the spec's "derive achievable scope from form fields" path (Step 4 task list). It runs only when LLM JSON is missing/malformed — the heuristic still has something defensible to score against.

- [ ] **Step 1.5: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: `routes/advisor.ts` errors (the route doesn't yet plumb the new metadata fields). `advisorEngine.ts` is clean.

---

## Task 2: Wire Heuristic + Block Early-Return in `routes/advisor.ts`

**Files:**
- Modify: `artifacts/api-server/src/routes/advisor.ts` (add imports, restructure the handler body around the existing `try { ... }`)

- [ ] **Step 2.1: Update imports**

Replace the `advisorEngine` imports in `artifacts/api-server/src/routes/advisor.ts` with:

```ts
import {
  buildCategoryResults,
  generateMetadataWithAI,
  heuristicIdeaScore,
  retrieveAdvisorKnowledge,
  streamFinalSummaryWithAI,
  tierFromScore,
  type CategoryResults,
  type ProjectInput,
} from "../lib/advisorEngine.js";
```

- [ ] **Step 2.2: Restructure the handler body**

In `artifacts/api-server/src/routes/advisor.ts`, replace the `try { ... } catch` block of `POST /advisor/analyze` (the body installed in Step 2 of the source plan):

```ts
  try {
    // Phase 1: knowledge + metadata first — we need the LLM-derived archetype/mode before scoring.
    const { ragChunks, retrievedKnowledgeContext } = await retrieveAdvisorKnowledge(input);

    // Score with default projectMode just to give the metadata prompt a stack summary;
    // we re-score below once projectMode is known if needed.
    const provisionalCategoryResults = buildCategoryResults(input, "single_player");

    const metadata = await generateMetadataWithAI(input, provisionalCategoryResults, retrievedKnowledgeContext);

    // Phase 2: heuristic tier decision.
    const heuristic = heuristicIdeaScore({
      input,
      impliedScope: metadata.impliedScope,
      achievableScope: metadata.achievableScope,
    });
    const ideaScore = heuristic.score;
    const ideaScoreTier = tierFromScore(ideaScore);
    const mismatchReasons = dedup([...heuristic.reasons, ...metadata.mismatchReasons]);

    send("metadata_complete", {
      projectSummary: metadata.projectSummary,
      detectedProjectType: metadata.detectedProjectType,
      stackOverview: metadata.stackOverview,
      overallConfidence: metadata.overallConfidence,
      ideaScore,
      ideaScoreTier,
      mismatchReasons,
      archetype: {
        implied: { scope: metadata.impliedScope },
        achievable: { scope: metadata.achievableScope },
      },
      projectMode: metadata.projectMode,
    });

    // Phase 3: block-tier early return.
    if (ideaScoreTier === "block" && !input.adviseAnyway) {
      const blockedResult = {
        sessionId: 0,
        projectSummary: metadata.projectSummary,
        detectedProjectType: metadata.detectedProjectType,
        categoryResults: null,
        overallConfidence: metadata.overallConfidence,
        finalSummary: null,
        stackOverview: null,
        ideaScore,
        ideaScoreTier,
        mismatchReasons,
        archetype: {
          implied: { scope: metadata.impliedScope },
          achievable: { scope: metadata.achievableScope },
        },
        projectMode: metadata.projectMode,
        feasibilityOverridden: false,
      };
      const [session] = await db
        .insert(sessionsTable)
        .values({
          projectIdea: input.projectIdea,
          projectInput: input as object,
          detectedProjectType: metadata.detectedProjectType,
          stackOverview: null,
          overallConfidence: metadata.overallConfidence,
          result: blockedResult as object,
        })
        .returning();
      blockedResult.sessionId = session.id;
      send("done", blockedResult);
      res.end();
      return;
    }

    // Phase 4: normal path. Re-score using the LLM-derived projectMode if it differs.
    const categoryResults =
      metadata.projectMode === "single_player"
        ? provisionalCategoryResults
        : buildCategoryResults(input, metadata.projectMode);

    const dbTools = await db.select().from(toolsTable);
    const toolIdMap: Record<string, number> = {};
    for (const t of dbTools) toolIdMap[t.name] = t.id;

    send("scoring_complete", {
      categoryResults: buildCategoryResultsResponse(categoryResults, [], toolIdMap),
    });

    const finalSummary = await streamFinalSummaryWithAI(
      input,
      metadata,
      categoryResults,
      retrievedKnowledgeContext,
      (token) => send("narrative_chunk", { token }),
    );

    const finalResults = buildCategoryResultsResponse(categoryResults, ragChunks, toolIdMap);

    const resultObj = {
      sessionId: 0,
      projectSummary: metadata.projectSummary,
      detectedProjectType: metadata.detectedProjectType,
      categoryResults: finalResults,
      overallConfidence: metadata.overallConfidence,
      finalSummary:
        finalSummary ||
        "This stack has been selected based on your budget, skill level, and platform targets.",
      stackOverview: metadata.stackOverview,
      ideaScore,
      ideaScoreTier,
      mismatchReasons,
      archetype: {
        implied: { scope: metadata.impliedScope },
        achievable: { scope: metadata.achievableScope },
      },
      projectMode: metadata.projectMode,
      feasibilityOverridden: input.adviseAnyway === true && ideaScoreTier === "block",
    };

    const [session] = await db
      .insert(sessionsTable)
      .values({
        projectIdea: input.projectIdea,
        projectInput: input as object,
        detectedProjectType: metadata.detectedProjectType,
        stackOverview: metadata.stackOverview,
        overallConfidence: metadata.overallConfidence,
        result: resultObj as object,
      })
      .returning();

    resultObj.sessionId = session.id;

    send("done", resultObj);
    res.end();
  } catch (error) {
    console.error("Advisor streaming failed", error);
    send("error", { message: "Analysis failed." });
    res.end();
  }
```

- [ ] **Step 2.3: Add the `dedup` helper**

At the top of `artifacts/api-server/src/routes/advisor.ts` (just below imports), add:

```ts
function dedup<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
```

(One-liner. Do not extract to a util module.)

- [ ] **Step 2.4: Note on event ordering**

The original SSE order was `scoring_complete → metadata_complete → narrative_chunk* → done`. The new order is `metadata_complete → [block-done?] → scoring_complete → narrative_chunk* → done`. The frontend (Step 3 + Step 5) handles `metadata_complete` before `scoring_complete` is fine — `metadata_ready` is already a phase between `scoring` and `streaming`. The reordering is intentional: the block-tier panel needs metadata before deciding whether to render any recommendations.

- [ ] **Step 2.5: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: clean. If `metadata.impliedScope` etc. type-error, double-check that Step 1.2 actually edited the `AnalysisMetadata` interface (not a duplicate copy elsewhere).

---

## Task 3: Verification + Commit

- [ ] **Step 3.1: Build + start the server**

```powershell
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run dev
```

- [ ] **Step 3.2: Curl smoke — clearly-block project (AAA implied, $1K, solo)**

```powershell
$body = @{
  projectIdea     = "Photoreal AAA open-world action RPG with 100+ hours of cinematic story, full voice acting, motion-capture animation, and persistent online MMO features."
  budget          = "low"      # ~ $1K
  timeLimit       = "month"
  skillLevel      = "intermediate"
  teamSize        = "solo"
  platformTarget  = @("pc", "console")
  artCapability   = "basic"
  otherConstraints = $null
} | ConvertTo-Json

$raw  = Invoke-WebRequest -Uri http://localhost:3000/api/advisor/analyze -Method Post -ContentType "application/json" -Body $body -UseBasicParsing
$done = ($raw.Content -split "event: done`r?`ndata: ")[-1] -split "`r?`n`r?`n" | Select-Object -First 1
$result = $done | ConvertFrom-Json

$result | Select-Object ideaScore, ideaScoreTier, mismatchReasons
$result.categoryResults  # must be $null
$result.finalSummary     # must be $null
```

Expected:
- `ideaScoreTier`: `"block"`.
- `ideaScore`: < 30.
- `mismatchReasons`: at least 2 entries, mixing heuristic-style ("Implied scope (AAA) is far above…") and LLM-style ("AAA budget typically $50M+, you have $1K").
- `categoryResults`: `null`.
- `finalSummary`: `null`.

- [ ] **Step 3.3: Curl smoke — same project with `adviseAnyway: true`**

Re-send the same body with `adviseAnyway = $true` added. Expected: `ideaScoreTier` still `"block"`, but `categoryResults` is populated and `finalSummary` is non-null. `feasibilityOverridden: true` in the result.

- [ ] **Step 3.4: Curl smoke — clearly-pass project (indie 2D platformer, solo, year)**

```powershell
$body = @{
  projectIdea     = "2D pixel-art platformer with hand-drawn animations, 8 levels, simple inventory."
  budget          = "low"
  timeLimit       = "year"
  skillLevel      = "intermediate"
  teamSize        = "solo"
  platformTarget  = @("pc")
  artCapability   = "intermediate"
  otherConstraints = $null
} | ConvertTo-Json
# (parse same as Step 3.2)
```

Expected: `ideaScoreTier`: `"pass"`. `categoryResults` populated.

- [ ] **Step 3.5: Curl smoke — warn-tier project (3D RPG, $25K, 3 months, solo)**

```powershell
$body = @{
  projectIdea     = "3D action RPG with full combat system, dialog branching, and a 20-hour campaign."
  budget          = "medium"   # ~$25K
  timeLimit       = "quarter"  # 3 months
  skillLevel      = "intermediate"
  teamSize        = "solo"
  platformTarget  = @("pc")
  artCapability   = "basic"
  otherConstraints = $null
} | ConvertTo-Json
# (parse same as Step 3.2)
```

Expected: `ideaScoreTier`: `"warn"`. `mismatchReasons` non-empty. `categoryResults` populated.

- [ ] **Step 3.6: Determinism check**

Re-run Step 3.2 three times. Expected: `ideaScore` and `ideaScoreTier` are **identical** across runs (the heuristic is deterministic — only `mismatchReasons` text may vary because half of it comes from the LLM).

- [ ] **Step 3.7: Stop the server + final typecheck**

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force
pnpm run typecheck
```

Expected: clean across all packages.

- [ ] **Step 3.8: Commit**

```powershell
git add artifacts/api-server/src/lib/advisorEngine.ts artifacts/api-server/src/routes/advisor.ts
git commit -m "feat: heuristic idea score + block-tier early return"
git log -1 --stat
```

---

## Self-Review Checklist

**1. Spec coverage** — Step 4 of the source plan and spec §5.4 map cleanly:
- Heuristic tier decision (deterministic) → Task 1.1 (`heuristicIdeaScore`, `tierFromScore`).
- LLM provides `mismatchReasons[]` → Task 1.3 (extended JSON schema in prompt).
- Heuristic + LLM reasons merged + deduped → Task 2.2 (`dedup([...heuristic.reasons, ...metadata.mismatchReasons])`).
- Block-tier early return: `categoryResults: null`, `finalSummary: null`, skip second LLM call → Task 2.2 (Phase 3 branch).
- LLM JSON malformed fallback → Task 1.4 (`isScope` / `isProjectMode` guards + `deriveAchievableScopeFromInput`).
- `projectMode` derivation from LLM → Task 1.4.
- Scope baselines injected into prompt → Task 1.3.
- Heuristic key alignment with current Zod (no `studio` team size) → Task 1.1 note.

**2. Placeholder scan** — No "TBD". All thresholds are spec literals. The LLM JSON schema is concrete.

**3. Type consistency**
- `Scope` (`jam | prototype | indie | AA | AAA`) matches the OpenAPI `Archetype` enum from Step 1.
- `ProjectMode` (`single_player | co_op_local | multiplayer_online | live_service`) matches Step 1.
- `IdeaScoreTier` (`pass | warn | block`) matches Step 1.
- `BUDGET_USD` keys match the OpenAPI `ProjectInput.budget` enum.
- `TEAM_COUNT` keys match the OpenAPI `ProjectInput.teamSize` enum (no `studio`).
- `feasibilityOverridden` flips `true` only when `adviseAnyway === true` **and** the heuristic decided block.

**4. Anti-overengineering check**
- No retry/timeout/abort framework around the LLM call.
- No JSON config file for scope baselines.
- No telemetry hook.
- No new module — heuristic + scope tables sit beside `scoreTool` in `advisorEngine.ts`.
- The `dedup` helper is one line in `routes/advisor.ts`. Not extracted.
- The provisional-then-rescore pattern (`buildCategoryResults` called twice when `projectMode !== "single_player"`) is acceptable: scoring is in-memory and cheap (~30 tools).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-intelligent-advisor-step4.md`.

**Two execution options:**

1. **Subagent-Driven** — Three tasks (heuristic, route wiring, verification). One subagent per task. Task 3's curl smokes give natural review gates.
2. **Inline Execution** — Best when you want to feel out tier thresholds in real time and re-tune.

**Which approach?**
