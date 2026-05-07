# Intelligent Advisor — Step 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat category map in `advisorEngine.ts` with the three-bucket `{ locked, flexible, hidden }` result, applying ecosystem cascade after the engine pick. Wire the route to emit the new shape so typecheck goes green again.

**Architecture:** Engine category is scored first to determine the dominant ecosystem (Unity/Unreal/Godot/etc.). The four `LOCKED_CATEGORIES` (`programming, ui, vfx, build_ci`) are then narrowed to tools whose `ecosystem[]` intersects the picked engine's ecosystem (or carries `engine_agnostic`). All other categories go to `flexible`. `projectMode` defaults to `"single_player"` until Step 4 — `hidden` is derived from it.

**Tech Stack:** TypeScript, Express, Zod v4 (`zod/v4`), pnpm monorepo. Project has no test framework — verification = typecheck + curl smoke + visual SSE inspection.

**Source spec:** [docs/superpowers/specs/2026-05-06-intelligent-advisor-design.md §5.1](../specs/2026-05-06-intelligent-advisor-design.md)
**Source plan:** [plans/2026-05-06-intelligent-advisor-refactor.md Step 2](../../../plans/2026-05-06-intelligent-advisor-refactor.md)

**Project conventions (read first):**
- Single commit at the end. Direct-to-`main` mode (hackathon).
- All commands run in PowerShell.
- Imports must use `zod/v4`, never bare `zod`.
- `gameDevTools.ts` is already tagged with `ecosystem` from Step 1. Do **not** retag.
- The default `projectMode` is `"single_player"` here. Step 4 replaces this with the LLM-derived value — leave a `// TODO Step 4` marker, no plumbing for the editable case yet.

**Anti-overengineering boundary:**
- No new files. All edits go into `advisorEngine.ts` + `routes/advisor.ts`.
- No standalone `applyHardFilter` module — inline inside `buildCategoryResults`. Spec §5.1 shows it as a separate function for documentation; for a 30-LOC change, an inline pass + a `const LOCKED_CATEGORIES` is enough.
- No defensive validation of `tool.ecosystem` (Step 1 made it required).
- No "graceful fallback" if the engine category yields zero tools post-filter — the catalog guarantees ≥10 engines, all `engine_agnostic`-free.
- The legacy `CategoryResults` type alias is **replaced**, not aliased + deprecated. Nothing has shipped.

---

## File Structure

This step modifies two existing files. No new files.

- `artifacts/api-server/src/lib/advisorEngine.ts` — replace the `CategoryResults` type and `buildCategoryResults` function. Keep `scoreTool` / `generateReasoning` / RAG helpers untouched (Step 6 rewrites `scoreTool`).
- `artifacts/api-server/src/routes/advisor.ts` — replace the response builder + the SSE `done` payload to emit `categoryResults: { locked, flexible, hidden }` instead of the flat `categories` array. Also adapt the `scoring_complete` event and the `/advisor/stats` reader for the new session-row shape.

---

## Task 1: Hard Filter + Locked/Flexible Split in `advisorEngine.ts`

**Files:**
- Modify: `artifacts/api-server/src/lib/advisorEngine.ts` (replace the `CategoryResults` type at line 63, replace `buildCategoryResults` at lines 243–272, replace `buildTopStackSummary` at lines 274–278, update the return shape inside `analyzeProjectWithAI` at lines 440–462)

- [ ] **Step 1.1: Add `LOCKED_CATEGORIES` constant + `ProjectMode` type**

Open `artifacts/api-server/src/lib/advisorEngine.ts`. Just below the `import` block (after line 8), insert:

```ts
const LOCKED_CATEGORIES = ["programming", "ui", "vfx", "build_ci"] as const;

export type ProjectMode = "single_player" | "co_op_local" | "multiplayer_online" | "live_service";

function hiddenCategoriesForMode(mode: ProjectMode): string[] {
  if (mode === "single_player") return ["networking", "backend_services"];
  if (mode === "co_op_local") return ["backend_services"];
  return [];
}
```

- [ ] **Step 1.2: Replace the `CategoryResults` type**

In `artifacts/api-server/src/lib/advisorEngine.ts`, replace line 63:

```ts
export type CategoryResults = Record<string, { topTool: CategoryResultTool; alternatives: CategoryResultTool[] }>;
```

with the new bucketed shape:

```ts
export interface CategoryEntry {
  category: string;
  topTool: CategoryResultTool;
  alternatives: CategoryResultTool[];
}

export interface CategoryResults {
  locked: CategoryEntry[];
  flexible: CategoryEntry[];
  hidden: string[];
}
```

Note: the old shape's per-category map is replaced by an array per bucket. Each entry now carries its own `category` id (previously it was the map key). The route layer reads `category` directly off the entry.

- [ ] **Step 1.3: Replace `buildCategoryResults` with the bucketed implementation**

In `artifacts/api-server/src/lib/advisorEngine.ts`, replace the entire `buildCategoryResults` function (currently lines 243–272) with:

```ts
export function buildCategoryResults(
  input: ProjectInput,
  projectMode: ProjectMode = "single_player", // TODO Step 4: pass LLM-derived projectMode
): CategoryResults {
  const hidden = hiddenCategoriesForMode(projectMode);
  const allCategoryIds = TOOL_CATEGORIES.map((c) => c.id);

  // 1. Score engine first to discover the ecosystem
  const engineEntry = scoreCategory("engine", input);
  if (!engineEntry) {
    return { locked: [], flexible: [], hidden };
  }
  const ecosystem = pickEcosystem(engineEntry.topTool);

  // 2. Walk every other category; apply hard filter to LOCKED_CATEGORIES
  const locked: CategoryEntry[] = [engineEntry]; // engine always sits in locked
  const flexible: CategoryEntry[] = [];

  for (const cat of allCategoryIds) {
    if (cat === "engine") continue;
    if (hidden.includes(cat)) continue;

    const isLocked = (LOCKED_CATEGORIES as readonly string[]).includes(cat);
    const candidatePool = isLocked
      ? GAME_DEV_TOOLS.filter(
          (t) =>
            t.category === cat &&
            (t.ecosystem.includes(ecosystem as never) || t.ecosystem.includes("engine_agnostic")),
        )
      : GAME_DEV_TOOLS.filter((t) => t.category === cat);

    const entry = scoreCategoryFromPool(cat, candidatePool, input);
    if (!entry) continue;

    (isLocked ? locked : flexible).push(entry);
  }

  return { locked, flexible, hidden };
}

function pickEcosystem(engineTool: CategoryResultTool): string {
  const specific = engineTool.ecosystem.find((e) => e !== "engine_agnostic");
  return specific ?? "engine_agnostic";
}

function scoreCategory(cat: string, input: ProjectInput): CategoryEntry | null {
  return scoreCategoryFromPool(cat, GAME_DEV_TOOLS.filter((t) => t.category === cat), input);
}

function scoreCategoryFromPool(
  cat: string,
  pool: GameDevTool[],
  input: ProjectInput,
): CategoryEntry | null {
  if (pool.length === 0) return null;

  const scored: ToolScore[] = pool.map((tool) => {
    const scoredTool = scoreTool(tool, input);
    return {
      tool,
      score: scoredTool.total,
      scoreBreakdown: scoredTool.breakdown,
      reasoning: generateReasoning(tool, input, scoredTool.total),
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

Note on the `as never` cast in the ecosystem filter: `tool.ecosystem` is `Ecosystem[]` (a string-literal union from Step 1.6), and `ecosystem` here is a generic `string` returned by `pickEcosystem`. The cast is the minimal-disruption way to satisfy `Array.includes` without widening the `Ecosystem` type. If you prefer, change `pickEcosystem`'s return type to `Ecosystem` and drop the cast — both work.

- [ ] **Step 1.4: Replace `buildTopStackSummary`**

In `artifacts/api-server/src/lib/advisorEngine.ts`, replace `buildTopStackSummary` (currently lines 274–278) with:

```ts
export function buildTopStackSummary(categoryResults: CategoryResults): string {
  return [...categoryResults.locked, ...categoryResults.flexible]
    .map((entry) => `${entry.category}: ${entry.topTool.name} (score: ${entry.topTool.score})`)
    .join(", ");
}
```

- [ ] **Step 1.5: Confirm `analyzeProjectWithAI` return shape still typechecks**

The return-type annotation of `analyzeProjectWithAI` (lines 440–448) names `CategoryResults` by name — no edit is required here, the new interface drops in. Confirm the function body still reads. No other downstream calls in this file touch `categoryResults` as a `Record`.

- [ ] **Step 1.6: Typecheck the api-server package**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: errors in `routes/advisor.ts` only (the route still iterates the old `Record<string, ...>` shape). `advisorEngine.ts` itself must be clean. If errors land inside `advisorEngine.ts`, re-check Steps 1.2–1.4.

---

## Task 2: Wire `routes/advisor.ts` to the New Shape

**Files:**
- Modify: `artifacts/api-server/src/routes/advisor.ts` (replace `buildResponseCategories` lines 18–58, replace the request/response handler body lines 60–143, replace the `/advisor/stats` reader lines 187–228, fix imports lines 1–14)

- [ ] **Step 2.1: Replace `buildResponseCategories` with `buildCategoryResultsResponse`**

In `artifacts/api-server/src/routes/advisor.ts`, replace the entire `buildResponseCategories` function (currently lines 18–58) with:

```ts
function toRecommendationDTO(
  entry: import("../lib/advisorEngine.js").CategoryEntry,
  ragChunks: Array<{ text: string; source: string; score?: number | null }>,
  toolIdMap: Record<string, number>,
) {
  const label = TOOL_CATEGORIES.find((c) => c.id === entry.category)?.label ?? entry.category;
  return {
    category: entry.category,
    categoryLabel: label,
    topPick: {
      toolId: toolIdMap[entry.topTool.name] ?? 0,
      toolName: entry.topTool.name,
      score: entry.topTool.score,
      reasoning: entry.topTool.reasoning,
      evidence: { scoreBreakdown: entry.topTool.scoreBreakdown, ragChunks },
      strengths: entry.topTool.strengths,
      weaknesses: entry.topTool.weaknesses,
      tradeoffs: entry.topTool.weaknesses[0] ?? "",
      isTopPick: true,
    },
    alternatives: entry.alternatives.map((alt) => ({
      toolId: toolIdMap[alt.name] ?? 0,
      toolName: alt.name,
      score: alt.score,
      reasoning: alt.reasoning,
      evidence: { scoreBreakdown: alt.scoreBreakdown, ragChunks },
      strengths: alt.strengths,
      weaknesses: alt.weaknesses,
      tradeoffs: alt.weaknesses[0] ?? "",
      isTopPick: false,
    })),
    categoryReasoning: entry.topTool.reasoning,
  };
}

type CategoryRecommendationDTO = ReturnType<typeof toRecommendationDTO>;

function buildCategoryResultsResponse(
  categoryResults: CategoryResults,
  ragChunks: Array<{ text: string; source: string; score?: number | null }>,
  toolIdMap: Record<string, number>,
): { locked: CategoryRecommendationDTO[]; flexible: CategoryRecommendationDTO[]; hidden: string[] } {
  return {
    locked: categoryResults.locked.map((e) => toRecommendationDTO(e, ragChunks, toolIdMap)),
    flexible: categoryResults.flexible.map((e) => toRecommendationDTO(e, ragChunks, toolIdMap)),
    hidden: categoryResults.hidden,
  };
}
```

- [ ] **Step 2.2: Update imports**

In `artifacts/api-server/src/routes/advisor.ts`, replace the existing import block (lines 1–14) with:

```ts
import { Router, type IRouter } from "express";
import { db, sessionsTable, toolsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { AnalyzeProjectBody, GetSessionParams } from "@workspace/api-zod";
import {
  buildCategoryResults,
  generateMetadataWithAI,
  retrieveAdvisorKnowledge,
  streamFinalSummaryWithAI,
  type CategoryResults,
  type ProjectInput,
} from "../lib/advisorEngine.js";
import { TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import { rateLimit } from "../middleware/rateLimit.js";
```

(`CategoryResults` is now used as a parameter type in `buildCategoryResultsResponse`. Everything else is unchanged.)

- [ ] **Step 2.3: Replace the `POST /advisor/analyze` handler body**

In `artifacts/api-server/src/routes/advisor.ts`, replace the body of the `router.post("/advisor/analyze", ...)` handler (currently the `try { ... } catch` block at lines 77–142). Keep the route signature, Zod parse, and SSE setup unchanged; replace from `try {` onward:

```ts
  try {
    const categoryResults = buildCategoryResults(input); // projectMode default = single_player
    const dbTools = await db.select().from(toolsTable);
    const toolIdMap: Record<string, number> = {};
    for (const t of dbTools) toolIdMap[t.name] = t.id;

    const earlyResults = buildCategoryResultsResponse(categoryResults, [], toolIdMap);
    send("scoring_complete", { categoryResults: earlyResults });

    const { ragChunks, retrievedKnowledgeContext } = await retrieveAdvisorKnowledge(input);
    const metadata = await generateMetadataWithAI(input, categoryResults, retrievedKnowledgeContext);
    send("metadata_complete", metadata);

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
      // Step 4 will populate the feasibility fields with real heuristic output. Stubbed
      // pass-through values keep the OpenAPI-required fields satisfied without changing
      // tier behavior — score 100 / tier "pass" means nothing gets blocked yet.
      ideaScore: 100,
      ideaScoreTier: "pass",
      mismatchReasons: [] as string[],
      archetype: {
        implied: { scope: "indie" },
        achievable: { scope: "indie" },
      },
      projectMode: "single_player",
      feasibilityOverridden: false,
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

Note the stubbed feasibility fields (`ideaScore: 100`, `ideaScoreTier: "pass"`, etc.). Step 1's OpenAPI made these required on the wire — Step 4 replaces the stubs with real heuristic output. The values chosen here mean **no** project gets blocked between Step 2 and Step 4 landing.

- [ ] **Step 2.4: Update the `/advisor/stats` reader**

The stats endpoint reads `result.categories` from old session rows. New rows will carry `result.categoryResults.locked + flexible`. Replace the `for (const s of sessions)` loop body (currently lines 198–210) with:

```ts
  for (const s of sessions) {
    const result = s.result as {
      categories?: { category: string; topPick: { toolName: string } }[]; // legacy rows
      categoryResults?: {
        locked?: { category: string; topPick: { toolName: string } }[];
        flexible?: { category: string; topPick: { toolName: string } }[];
      };
      overallConfidence?: number;
    };
    if (result?.overallConfidence) totalConfidence += result.overallConfidence;

    const cats = [
      ...(result?.categories ?? []),
      ...(result?.categoryResults?.locked ?? []),
      ...(result?.categoryResults?.flexible ?? []),
    ];
    for (const cat of cats) {
      const toolName = cat.topPick?.toolName;
      if (toolName) toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
      catCounts[cat.category] = (catCounts[cat.category] ?? 0) + 1;
    }
  }
```

This keeps legacy rows readable without a DB migration. Anti-overengineering: a real schema migration would be overkill for a hackathon-stage table.

- [ ] **Step 2.5: Typecheck the api-server package**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: api-server package types clean. The frontend (`artifacts/game-dev-advisor`) still has the old errors from Step 1 — those land in Step 3, not here.

If api-server still has errors, the most likely culprits are:
- `entry.category` typo (must be the property added in Task 1.2),
- forgot to add `CategoryResults` to the imports in Step 2.2,
- the stubbed feasibility object in Step 2.3 fights with the codegen `AnalysisResult` type — if so, the route's `resultObj` is an in-memory shape, not directly typed against the OpenAPI response, so no cast should be needed. If the linter still complains, add `satisfies AnalysisResultLike` with a local interface rather than a wide `as any`.

---

## Task 3: Verification + Commit

**Files:** None modified. This task is verification only.

- [ ] **Step 3.1: Build the api-server**

```powershell
pnpm --filter @workspace/api-server run build
```

Expected: build succeeds.

- [ ] **Step 3.2: Start the api-server in a second terminal**

```powershell
pnpm --filter @workspace/api-server run dev
```

Wait for the server to log a listening message on `http://localhost:3000`.

- [ ] **Step 3.3: Curl smoke — Unity-forced project, expect locked C# only**

In a new PowerShell window, send a project description that pushes the engine ranking toward Unity (mobile + 3D + intermediate skill leans Unity over UE5 and Godot):

```powershell
$body = @{
  projectIdea     = "3D mobile action RPG with mid-poly stylized art, AR mode, and IAP store. Unity-style component architecture preferred."
  budget          = "medium"
  timeLimit       = "year"
  skillLevel      = "intermediate"
  teamSize        = "small"
  platformTarget  = @("mobile", "pc")
  artCapability   = "intermediate"
  otherConstraints = "Targeting Unity ecosystem"
} | ConvertTo-Json

# The endpoint streams Server-Sent Events. Capture the raw response and pull the final `done` event:
$raw  = Invoke-WebRequest -Uri http://localhost:3000/api/advisor/analyze -Method Post -ContentType "application/json" -Body $body -UseBasicParsing
$done = ($raw.Content -split "event: done`r?`ndata: ")[-1] -split "`r?`n`r?`n" | Select-Object -First 1
$result = $done | ConvertFrom-Json

$result.categoryResults.locked   | Where-Object { $_.category -eq "programming" } | Select-Object -ExpandProperty topPick | Select-Object toolName, score
$result.categoryResults.locked   | Where-Object { $_.category -eq "engine" }      | Select-Object -ExpandProperty topPick | Select-Object toolName, score
$result.categoryResults.hidden
```

Expected output:
- `programming` topPick: the Unity-side C# entry (`C# with .NET` or whatever it's named in `gameDevTools.ts`).
- `engine` topPick: `Unity`.
- `hidden`: `["networking", "backend_services"]` (default `single_player` mode).
- `locked` array also contains entries for `ui`, `vfx`, `build_ci` (each filtered by Unity ecosystem or `engine_agnostic`).
- `flexible` array contains everything else not in `hidden`.

If the engine pick is **not** Unity, that's not a Step 2 failure — the existing `scoreTool` is still running. Re-frame the project description (e.g. swap "AR mode" for "Unity Asset Store integration") and re-run. Engine ranking improves in Step 6.

If `programming.locked` includes C++ when engine is Unity → the cascade is broken. Re-check that the C# entry has `ecosystem: ["unity"]` (Step 1.8) and that `pickEcosystem` returns `"unity"` (debug-print `engineEntry.topTool.ecosystem` if needed).

- [ ] **Step 3.4: Curl smoke — Unreal-forced project, expect Blueprint/C++ but no GDScript**

```powershell
$body = @{
  projectIdea     = "Photoreal third-person action game with cinematic cutscenes and Lumen lighting. AAA visual fidelity."
  budget          = "high"
  timeLimit       = "longterm"
  skillLevel      = "advanced"
  teamSize        = "medium"
  platformTarget  = @("pc", "console")
  artCapability   = "professional"
  otherConstraints = "Built around Unreal Engine 5 toolchain"
} | ConvertTo-Json

# Reuse the same SSE-parsing pattern from Step 3.3.
```

Expected: `engine` topPick `Unreal Engine`; `programming.locked` contains `C++` and/or `Blueprint`, **not** `GDScript` or the Unity-side C# entry.

- [ ] **Step 3.5: Stop the dev server**

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force
```

- [ ] **Step 3.6: Final typecheck across the whole monorepo**

```powershell
pnpm run typecheck
```

Expected: only the frontend errors from Step 1 remain (in `Analyzer.tsx` + `SessionDetail.tsx`). No errors in `lib/*` or in api-server. If api-server picked up an error, return to Task 2.

- [ ] **Step 3.7: Commit**

```powershell
git add artifacts/api-server/src/lib/advisorEngine.ts artifacts/api-server/src/routes/advisor.ts
git commit -m "feat: hard filter + locked/flexible split in advisor engine"
git log -1 --stat
```

Expected: two files touched.

---

## Self-Review Checklist

**1. Spec coverage** — Step 2 of the source plan and spec §5.1 map cleanly:
- Engine-first scoring → Step 1.3 (`scoreCategory("engine", input)` runs before the category loop).
- Ecosystem cascade for `LOCKED_CATEGORIES` → Step 1.3 (`isLocked` branch filters `candidatePool`).
- `engine_agnostic` bypass → Step 1.3 (`||` clause in the filter).
- `projectMode` derives `hidden` → Steps 1.1 (`hiddenCategoriesForMode`) + 1.3 (skipped categories never get a `CategoryEntry`).
- Engine itself stays in locked bucket but keeps alternatives → Step 1.3 (`locked: CategoryEntry[] = [engineEntry]`, and the engine entry was scored against the full pool, so `alternatives` is populated).
- Networking split between engine-side (cascaded) and service-tier (flexible) → handled by Step 1's per-tool `ecosystem` tagging (Mirror/Netcode → `["unity"]` etc.). Step 2 adds **no** special case here — the data is already correctly tagged, so the generic filter does the right thing for whichever side of the split a tool sits on.
- `categoryResults: { locked, flexible, hidden }` returned → Step 1.3 final return.
- Wire format matches the OpenAPI rewrite from Step 1 → Step 2.3 (response object) + Step 2.4 (stats reader).

**2. Placeholder scan** — No "TBD" or "implement later". The `ideaScore: 100` / `ideaScoreTier: "pass"` stubs in Step 2.3 are deliberate Step-4 hooks, documented inline as `// Step 4 will populate ...`. They are not placeholders — they are committed values for the intermediate state, chosen so no project is blocked between Step 2 and Step 4.

**3. Type consistency**
- `CategoryEntry` is the single shape used in both buckets. `category` is a `string` (matches `cat.id` from `TOOL_CATEGORIES`).
- `ProjectMode` enum here is identical to the OpenAPI enum from Step 1.2 (`single_player | co_op_local | multiplayer_online | live_service`).
- `ideaScoreTier: "pass"` matches the OpenAPI enum `[pass, warn, block]` from Step 1.2.
- `archetype.implied.scope: "indie"` and `archetype.achievable.scope: "indie"` are valid `ArchetypeScope` values from Step 1.6.
- `pickEcosystem` returns `string` (not `Ecosystem`) deliberately — `tool.ecosystem.includes(value)` on an `Ecosystem[]` requires either a cast or a return-type narrowing. The `as never` cast in Step 1.3 is the minimal-disruption choice.

**4. Anti-overengineering check**
- No standalone `applyHardFilter` module — inline.
- No new types beyond what spec §5.1 implies (`CategoryEntry`, `ProjectMode`, `CategoryResults`).
- No DB migration for the changed `result` JSON shape — the `/advisor/stats` reader (Step 2.4) handles legacy rows.
- No client-shape duplication into `lib/api-zod` — the OpenAPI codegen from Step 1 already covers the wire shape.
- Stubbed feasibility fields are not "fallbacks for robustness" — they are the exact values Step 4 explicitly replaces.
- No new test files. Project has no test framework; verification is typecheck + curl smoke, matching the rest of the codebase.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-intelligent-advisor-step2.md`.

**Two execution options:**

1. **Subagent-Driven** — Dispatch a fresh subagent per task. Three tasks total, each ~10–20 minutes. Best when you want a clean handoff and a review between Task 1 (engine) and Task 2 (route).

2. **Inline Execution** — Execute steps in this session using executing-plans. Faster for a single self-contained refactor; the curl verifications in Task 3 give you a natural checkpoint before commit.

**Which approach?**
