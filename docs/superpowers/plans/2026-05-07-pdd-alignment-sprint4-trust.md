# PDD Alignment — Sprint 4: AI Reasoning + Trust Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `advisorEngine.ts` into a deterministic `scoringService` and a single-call `reasoningService`. Introduce an explicit numeric `trustScore` (0–100), a `trustTier` (`block | warn | pass`), and a `terminated` flag that short-circuits persistence below threshold 25. Recommendations gain `phase[]` per the §3 contract. The `retrieval` package from Sprint 3 becomes a first-class field on `AnalysisResult`.

**Architecture:**
- `scoringService.ts` — pure deterministic per-tool scoring per category, reusing the current weighted budget/skill/platform/timeLimit/art rules from `advisorEngine.ts`. Operates only on `TOOL_CATALOG` (Sprint 1) and `RetrievedContextPackage.candidateTools` (Sprint 3).
- `reasoningService.ts` — one `gpt-4o-mini` structured-output call. Input: `ProjectInput` + `RetrievedContextPackage` + the scoring table. Output: per-category `Recommendation` (primary + ≤2 alternatives) and a `trustScore` 0–100. Output validated against the catalog; fabricated `toolId` references are dropped and each subtracts 10 from `trustScore`.
- `routes/advisor.ts` orchestrates inline: validate → retrieve (Sprint 3) → score → reason → trust gate → persist only when `terminated === false`. Sprint 5 extracts this orchestrator into its own module.

**Tech Stack:** TypeScript, OpenAI SDK structured output, Zod v4, Drizzle MySQL.

**Source spec:** [docs/superpowers/specs/2026-05-07-pdd-sections-2-3-4-5-alignment-design.md §4.4, §4.5.5](../specs/2026-05-07-pdd-sections-2-3-4-5-alignment-design.md)

**Project conventions:**
- No tests. Verification = `pnpm run typecheck` + dev-server smoke (low-quality idea must terminate; healthy idea must persist a session).
- Single PR; multiple commits.
- All commands in PowerShell.
- Sprint 3 must be merged first.

**Anti-overengineering boundary:**
- One LLM call for reasoning, not many (no per-category sub-call).
- No retry, timeout wrapper, or cancellation token. Native errors bubble.
- No `IScoringService` / `IReasoningService` interface — direct exports.
- No env-driven prompt-template registry; the prompt lives in the file as a string.
- `pinnedToolIds` (§3 explicit-preference rule) is implemented as a simple optional field in `ProjectInput`, threaded into the reasoning prompt. No new override engine.
- Deletion of the obsolete `heuristicIdeaScore` / `tierFromScore` codepath happens here so two trust models don't coexist.
- Frontend changes are out of scope (separate spec).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `artifacts/api-server/src/types/recommendation.ts` | Create | `TrustTier`, `Recommendation`, `AnalysisResult` types + Zod schemas for the reasoning LLM response |
| `artifacts/api-server/src/services/scoringService.ts` | Create | Per-category deterministic scoring + weighted-average; constants for weights and `TRUST_SCORE_BLOCK_THRESHOLD` |
| `artifacts/api-server/src/services/reasoningService.ts` | Create | Single `gpt-4o-mini` call producing per-category recommendations + trust score |
| `artifacts/api-server/src/lib/advisorEngine.ts` | Trim | Strip out everything that scoringService and reasoningService now own; keep only the retrieval adapter from Sprint 3 (deleted in Sprint 5) |
| `artifacts/api-server/src/routes/advisor.ts` | Modify | New pipeline order: validate → retrieve → score → reason → trust gate → persist (only when not terminated) |
| `lib/api-spec/openapi.yaml` | Modify | Replace `AnalysisResult`, `CategoryResults`, `CategoryRecommendation`, `ToolRecommendation` with the §3 shapes; add `Retrieval`, `Recommendation`, `Phase` schemas; extend `ProjectInput` with `pinnedToolIds[]` |
| `CLAUDE.md` | Modify | Document trust gate and the new pipeline order |

---

## Task 1: Define recommendation + trust types

**Files:**
- Create: `artifacts/api-server/src/types/recommendation.ts`

- [ ] **Step 1.1: Write the file**

```ts
import { z } from "zod/v4";
import { PDD_CATEGORIES, PHASES, type PddCategory, type Phase } from "./pdd.js";
import type { RetrievedContextPackage } from "./tree.js";

export const TRUST_TIERS = ["block", "warn", "pass"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

export interface Recommendation {
  category: PddCategory;
  primary: RecommendationItem;
  alternatives: RecommendationItem[]; // length 0–2
}

export interface RecommendationItem {
  toolId: string;
  score: number;          // 0–100, from scoringService
  reasoning: string;
  pros: string[];
  cons: string[];
  compatibility: string;
  useCaseJustification: string;
  phase: Phase[];
}

export interface AnalysisResult {
  sessionId: string;            // empty on terminated responses
  projectSummary: string;
  trustScore: number;           // 0–100
  trustTier: TrustTier;
  terminated: boolean;
  retrieval: RetrievedContextPackage;
  recommendations: Recommendation[]; // empty when terminated === true
  finalSummary: string;         // markdown
}

// ── LLM response schema ─────────────────────────────────────

export const ReasoningRecommendationItemSchema = z.object({
  toolId: z.string(),
  reasoning: z.string().min(1),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  compatibility: z.string().min(1),
  useCaseJustification: z.string().min(1),
});
export type ReasoningRecommendationItem = z.infer<typeof ReasoningRecommendationItemSchema>;

export const ReasoningResponseSchema = z.object({
  projectSummary: z.string().min(1),
  recommendations: z.array(
    z.object({
      category: z.enum(PDD_CATEGORIES),
      primary: ReasoningRecommendationItemSchema,
      alternatives: z.array(ReasoningRecommendationItemSchema).max(2),
    }),
  ),
  trustScore: z.number().int().min(0).max(100),
  trustRationale: z.string().min(1),
  finalSummary: z.string().min(1),
});
export type ReasoningResponse = z.infer<typeof ReasoningResponseSchema>;

function itemJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      toolId: { type: "string" },
      reasoning: { type: "string" },
      pros: { type: "array", items: { type: "string" }, minItems: 1 },
      cons: { type: "array", items: { type: "string" }, minItems: 1 },
      compatibility: { type: "string" },
      useCaseJustification: { type: "string" },
    },
    required: ["toolId", "reasoning", "pros", "cons", "compatibility", "useCaseJustification"],
  } as const;
}

export const REASONING_JSON_SCHEMA = {
  name: "advisor_reasoning_response",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      projectSummary: { type: "string" },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string", enum: [...PDD_CATEGORIES] },
            primary: itemJsonSchema(),
            alternatives: { type: "array", maxItems: 2, items: itemJsonSchema() },
          },
          required: ["category", "primary", "alternatives"],
        },
      },
      trustScore: { type: "integer", minimum: 0, maximum: 100 },
      trustRationale: { type: "string" },
      finalSummary: { type: "string" },
    },
    required: ["projectSummary", "recommendations", "trustScore", "trustRationale", "finalSummary"],
  },
  strict: true,
} as const;

// Phase mapping is read from TOOL_CATALOG and copied onto RecommendationItem
// post-LLM (LLM never invents phases).
export const PHASE_VALUES: readonly Phase[] = PHASES;
```

- [ ] **Step 1.2: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 1.3: Commit**

```powershell
git add artifacts/api-server/src/types/recommendation.ts
git commit -m "feat(api): add Recommendation + TrustTier types and reasoning JSON schema"
```

---

## Task 2: Implement `scoringService.ts`

**Files:**
- Create: `artifacts/api-server/src/services/scoringService.ts`

The current weighted scoring lives inside `advisorEngine.ts`. Move it into a clean service that operates on the new `ToolEntry` shape and the `RetrievedContextPackage`.

- [ ] **Step 2.1: Write the file**

```ts
import { TOOL_CATALOG, TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import type { ToolEntry, PddCategory } from "../types/pdd.js";
import type { RetrievedContextPackage } from "../types/tree.js";

export const TRUST_SCORE_BLOCK_THRESHOLD = Number(
  process.env.TRUST_SCORE_BLOCK_THRESHOLD ?? "25",
);

// Sum to 1.0; tuned from the existing advisorEngine baseline.
export const SCORING_WEIGHTS = {
  budget: 0.25,
  skill: 0.20,
  platform: 0.20,
  timeLimit: 0.15,
  artCapability: 0.10,
  teamSize: 0.10,
} as const;

export interface ScoringInputs {
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: string;
  platformTarget: string[];
  artCapability: string;
}

export interface ScoredTool {
  tool: ToolEntry;
  score: number;             // 0–100
  breakdown: Record<keyof typeof SCORING_WEIGHTS, number>;
}

export interface ScoredCategory {
  category: PddCategory;
  ranked: ScoredTool[];      // sorted desc, length ≤ candidates in category
}

const BUDGET_PRICING_FIT: Record<string, ToolEntry["pricing"][]> = {
  zero:       ["free", "open_source"],
  low:        ["free", "open_source", "freemium"],
  medium:     ["free", "open_source", "freemium", "subscription"],
  high:       ["free", "open_source", "freemium", "paid", "subscription", "revenue_share"],
  enterprise: ["free", "open_source", "freemium", "paid", "subscription", "revenue_share", "enterprise"],
};

const SKILL_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;

function scoreBudget(t: ToolEntry, budget: string): number {
  const allowed = BUDGET_PRICING_FIT[budget] ?? BUDGET_PRICING_FIT.medium;
  return allowed.includes(t.pricing) ? 100 : 0;
}

function scoreSkill(t: ToolEntry, skillLevel: string): number {
  const userRank = SKILL_RANK[skillLevel as keyof typeof SKILL_RANK] ?? 1;
  const toolRank = SKILL_RANK[t.difficultyLevel];
  if (userRank >= toolRank) return 100;
  const gap = toolRank - userRank;
  return Math.max(0, 100 - gap * 50);
}

function scorePlatform(t: ToolEntry, platforms: string[]): number {
  if (platforms.length === 0) return 50;
  const matched = platforms.filter((p) =>
    (t.supportedPlatforms as readonly string[]).includes(p),
  ).length;
  return Math.round((matched / platforms.length) * 100);
}

function scoreTimeLimit(t: ToolEntry, timeLimit: string): number {
  const tightWeight = { jam: 1, month: 0.7, quarter: 0.4, year: 0.2, longterm: 0.0 }[timeLimit] ?? 0.4;
  return Math.round(t.beginnerSuitability * tightWeight + 100 * (1 - tightWeight));
}

function scoreArt(t: ToolEntry, artCapability: string): number {
  if (t.category !== "art_asset_creation") return 100;
  const map: Record<string, number> = { none: 30, basic: 50, intermediate: 75, advanced: 90, professional: 100 };
  const userLevel = map[artCapability] ?? 50;
  if (t.difficultyLevel === "advanced" && userLevel < 75) return Math.max(0, userLevel - 30);
  return userLevel;
}

function scoreTeamSize(t: ToolEntry, teamSize: string): number {
  return (t.teamSizeFit as readonly string[]).includes(teamSize) ? 100 : 50;
}

export function scoreTool(tool: ToolEntry, inputs: ScoringInputs): ScoredTool {
  const breakdown = {
    budget: scoreBudget(tool, inputs.budget),
    skill: scoreSkill(tool, inputs.skillLevel),
    platform: scorePlatform(tool, inputs.platformTarget),
    timeLimit: scoreTimeLimit(tool, inputs.timeLimit),
    artCapability: scoreArt(tool, inputs.artCapability),
    teamSize: scoreTeamSize(tool, inputs.teamSize),
  };
  const score = Math.round(
    (Object.keys(SCORING_WEIGHTS) as (keyof typeof SCORING_WEIGHTS)[]).reduce(
      (sum, key) => sum + SCORING_WEIGHTS[key] * breakdown[key],
      0,
    ),
  );
  return { tool, score, breakdown };
}

export function scoreByCategory(
  inputs: ScoringInputs,
  retrieval: RetrievedContextPackage,
): ScoredCategory[] {
  const candidateIds = new Set(retrieval.candidateTools.map((c) => c.toolId));

  return TOOL_CATEGORIES.map((cat) => {
    const tools = TOOL_CATALOG.filter(
      (t) => t.category === cat.id && candidateIds.has(t.id),
    );
    const ranked = tools
      .map((t) => scoreTool(t, inputs))
      .sort((a, b) => b.score - a.score);
    return { category: cat.id, ranked };
  });
}

export function trustTierFor(score: number): "block" | "warn" | "pass" {
  if (score < TRUST_SCORE_BLOCK_THRESHOLD) return "block";
  if (score < 50) return "warn";
  return "pass";
}
```

- [ ] **Step 2.2: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 2.3: Commit**

```powershell
git add artifacts/api-server/src/services/scoringService.ts
git commit -m "feat(api): add deterministic per-category scoringService with PDD trust threshold"
```

---

## Task 3: Implement `reasoningService.ts`

**Files:**
- Create: `artifacts/api-server/src/services/reasoningService.ts`

- [ ] **Step 3.1: Write the file**

```ts
import OpenAI from "openai";
import { TOOL_CATALOG } from "../lib/gameDevTools.js";
import type { Phase, PddCategory } from "../types/pdd.js";
import {
  REASONING_JSON_SCHEMA,
  ReasoningResponseSchema,
  type AnalysisResult,
  type Recommendation,
  type RecommendationItem,
  type ReasoningResponse,
} from "../types/recommendation.js";
import type { RetrievedContextPackage } from "../types/tree.js";
import {
  scoreByCategory,
  trustTierFor,
  type ScoringInputs,
  type ScoredCategory,
} from "./scoringService.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ReasoningInputs extends ScoringInputs {
  projectIdea: string;
  otherConstraints?: string | null;
  pinnedToolIds?: string[];
}

export async function reason(
  inputs: ReasoningInputs,
  retrieval: RetrievedContextPackage,
): Promise<Omit<AnalysisResult, "sessionId" | "terminated">> {
  const scored = scoreByCategory(inputs, retrieval);

  const messages = buildPrompt(inputs, retrieval, scored);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages,
    response_format: { type: "json_schema", json_schema: REASONING_JSON_SCHEMA },
  });

  const raw = response.choices[0]?.message.content ?? "{}";
  const parsed = ReasoningResponseSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return degraded(retrieval);
  }

  return assemble(parsed.data, retrieval, scored);
}

function buildPrompt(
  inputs: ReasoningInputs,
  retrieval: RetrievedContextPackage,
  scored: ScoredCategory[],
) {
  const candidateBlock = scored
    .map((c) => {
      const lines = c.ranked
        .slice(0, 6)
        .map((s) => `    - ${s.tool.id} (${s.score}) — ${s.tool.name}: ${s.tool.bestUseCase}`)
        .join("\n");
      return `[${c.category}]\n${lines || "    (no candidates)"}`;
    })
    .join("\n\n");

  const pinned = (inputs.pinnedToolIds ?? []).join(", ");
  const retrievalNote = `Retrieval status: ${retrieval.fallbackStatus} (confidence ${retrieval.retrievalConfidence}).`;

  const system = `You are a senior game-development consultant.
Recommend ONE primary tool and up to 2 alternatives per relevant category.
Only use toolId values present in the candidate list. Do not invent new ones.
Do not assess project feasibility — that is captured separately.
Compute a trustScore 0–100 reflecting your confidence in the overall recommendation; this is YOUR confidence, not project feasibility.
If the user pinned tools, you MUST keep them as the primary in their category and explain how the rest of the stack adapts around the pin.
Output a markdown finalSummary (max ~250 words) addressed to the user.`;

  const user = `Project idea: ${inputs.projectIdea}
Project inputs: budget=${inputs.budget}, timeLimit=${inputs.timeLimit}, skillLevel=${inputs.skillLevel}, teamSize=${inputs.teamSize}, platformTarget=${inputs.platformTarget.join("|") || "any"}, artCapability=${inputs.artCapability}
Other constraints: ${inputs.otherConstraints ?? "none"}
Pinned toolIds: ${pinned || "none"}

${retrievalNote}

Candidate pool by category (id, fit-score 0–100, name, bestUseCase):
${candidateBlock}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

function assemble(
  llm: ReasoningResponse,
  retrieval: RetrievedContextPackage,
  scored: ScoredCategory[],
): Omit<AnalysisResult, "sessionId" | "terminated"> {
  const allCatalogIds = new Set(TOOL_CATALOG.map((t) => t.id));
  const phaseById = new Map(TOOL_CATALOG.map((t) => [t.id, t.phase as Phase[]]));
  const scoreById = new Map<string, number>();
  for (const c of scored) for (const s of c.ranked) scoreById.set(s.tool.id, s.score);

  let droppedReferences = 0;

  const lifted = (item: { toolId: string } & Omit<RecommendationItem, "toolId" | "phase" | "score">) => {
    if (!allCatalogIds.has(item.toolId)) {
      droppedReferences++;
      return null;
    }
    return {
      toolId: item.toolId,
      score: scoreById.get(item.toolId) ?? 0,
      reasoning: item.reasoning,
      pros: item.pros,
      cons: item.cons,
      compatibility: item.compatibility,
      useCaseJustification: item.useCaseJustification,
      phase: phaseById.get(item.toolId) ?? [],
    } satisfies RecommendationItem;
  };

  const recommendations: Recommendation[] = [];
  for (const rec of llm.recommendations) {
    const primary = lifted(rec.primary);
    if (!primary) continue;
    const alternatives = rec.alternatives
      .map((alt) => lifted(alt))
      .filter((x): x is RecommendationItem => x !== null);
    recommendations.push({
      category: rec.category as PddCategory,
      primary,
      alternatives,
    });
  }

  const trustScore = Math.max(0, llm.trustScore - droppedReferences * 10);

  return {
    projectSummary: llm.projectSummary,
    trustScore,
    trustTier: trustTierFor(trustScore),
    retrieval,
    recommendations,
    finalSummary: llm.finalSummary,
  };
}

function degraded(retrieval: RetrievedContextPackage): Omit<AnalysisResult, "sessionId" | "terminated"> {
  return {
    projectSummary: "Unable to parse reasoning model output.",
    trustScore: 0,
    trustTier: "block",
    retrieval,
    recommendations: [],
    finalSummary: "We could not produce a confident recommendation. Please refine your project description and try again.",
  };
}
```

- [ ] **Step 3.2: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 3.3: Commit**

```powershell
git add artifacts/api-server/src/services/reasoningService.ts
git commit -m "feat(api): add reasoningService — single-call structured recommendation + trustScore"
```

---

## Task 4: Rewrite `routes/advisor.ts` for the new pipeline

**Files:**
- Modify: `artifacts/api-server/src/routes/advisor.ts`
- Modify: `artifacts/api-server/src/lib/advisorEngine.ts`

The route now does: `validate → retrieve → score → reason → trust gate → persist (only when not terminated)`.

- [ ] **Step 4.1: Trim `advisorEngine.ts` to just the retrieval adapter**

Delete every export except `retrieveAdvisorKnowledge` (Sprint 3 adapter) and `ProjectInput` (the input type other modules import). Specifically remove:
- `buildCategoryResults`, `generateMetadataWithAI`, `hiddenCategoriesForMode`, `heuristicIdeaScore`, `streamFinalSummaryWithAI`, `tierFromScore`
- `CategoryResults`, `ProjectMode`, `CategoryEntry` types
- All RAG fan-out helpers

If `ProjectInput` lives elsewhere already, remove the duplicate; otherwise keep its definition here. The file should shrink to <80 lines.

- [ ] **Step 4.2: Replace the analyze handler**

Replace the analyze handler (current `router.post("/advisor/analyze", ...)`) with:

```ts
router.post("/advisor/analyze", rateLimit, async (req, res): Promise<void> => {
  const parsed = AnalyzeProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data as ProjectInput;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { retrieval } = await retrieveAdvisorKnowledge(input);
    send("retrieval_complete", { retrieval });

    const reasoning = await reason(
      {
        projectIdea: input.projectIdea,
        budget: input.budget,
        timeLimit: input.timeLimit,
        skillLevel: input.skillLevel,
        teamSize: input.teamSize,
        platformTarget: input.platformTarget,
        artCapability: input.artCapability,
        otherConstraints: input.otherConstraints,
        pinnedToolIds: input.pinnedToolIds ?? [],
      },
      retrieval,
    );

    const terminated = reasoning.trustTier === "block";
    const sessionId = terminated ? "" : randomUUID();

    const result: AnalysisResult = {
      ...reasoning,
      sessionId,
      terminated,
    };

    if (!terminated) {
      await db.insert(sessionsTable).values({
        id: sessionId,
        inputs: input as Record<string, unknown>,
        result: result as unknown as Record<string, unknown>,
        trustScore: result.trustScore,
        trustTier: result.trustTier,
      });
    }

    send("done", result);
    res.end();
  } catch (error) {
    console.error("Advisor pipeline failed", error);
    send("error", { message: "Analysis failed." });
    res.end();
  }
});
```

Adjust imports at the top:

```ts
import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, sessionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { AnalyzeProjectBody } from "@workspace/api-zod";
import { retrieveAdvisorKnowledge, type ProjectInput } from "../lib/advisorEngine.js";
import { reason } from "../services/reasoningService.js";
import type { AnalysisResult } from "../types/recommendation.js";
import { rateLimit } from "../middleware/rateLimit.js";
```

Drop the old `toRecommendationDTO` / `buildCategoryResultsResponse` helpers entirely.

- [ ] **Step 4.3: Update `/advisor/sessions`**

Replace the list handler:

```ts
router.get("/advisor/sessions", async (_req, res) => {
  const rows = await db
    .select({
      id: sessionsTable.id,
      inputs: sessionsTable.inputs,
      trustScore: sessionsTable.trustScore,
      trustTier: sessionsTable.trustTier,
      createdAt: sessionsTable.createdAt,
    })
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.createdAt))
    .limit(50);
  res.json(rows.map((s) => ({
    id: s.id,
    projectIdea: (s.inputs as { projectIdea?: string }).projectIdea ?? "",
    trustScore: s.trustScore,
    trustTier: s.trustTier,
    createdAt: s.createdAt,
  })));
});
```

The detail handler (`GET /advisor/sessions/:id`) needs no behavior change beyond what Sprint 2 left; it returns the persisted `result` blob, which is now an `AnalysisResult`.

- [ ] **Step 4.4: Update `/advisor/stats`**

The aggregator must read from the new `result` shape. Replace the loop body:

```ts
const result = s.result as AnalysisResult;
const recs = result.recommendations ?? [];
for (const rec of recs) {
  const tn = rec.primary.toolId;
  toolCounts[tn] = (toolCounts[tn] ?? 0) + 1;
  catCounts[rec.category] = (catCounts[rec.category] ?? 0) + 1;
}
totalConfidence += result.trustScore ?? 0;
```

The rest of the handler is unchanged. The `avgConfidenceScore` field name is kept for client compatibility; rename is a separate spec.

- [ ] **Step 4.5: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 4.6: Smoke test the trust gate**

```powershell
docker compose up -d mysql
pnpm --filter @workspace/api-server run dev
```

Test 1 — healthy idea (expect persistence + `trustTier: "pass"` or `"warn"`):

```json
{ "projectIdea": "A cozy 2D farming game with multiplayer co-op for PC and Switch.", "budget": "low", "timeLimit": "year", "skillLevel": "intermediate", "teamSize": "small", "platformTarget": ["pc","console"], "artCapability": "intermediate" }
```

Confirm:

```powershell
docker exec -i toolrecommender-mysql mysql -uroot -proot toolrecommender -e "SELECT id, trust_score, trust_tier FROM advisor_sessions ORDER BY created_at DESC LIMIT 1;"
```

Expected: one row with non-empty UUID and the `trustTier` from the response.

Test 2 — terminated path (low-trust input):

```json
{ "projectIdea": "yes", "budget": "zero", "timeLimit": "jam", "skillLevel": "beginner", "teamSize": "solo", "platformTarget": [], "artCapability": "none" }
```

Expected: response includes `terminated: true`, `trustTier: "block"`, `recommendations: []`. Then verify the session was **not** persisted:

```powershell
docker exec -i toolrecommender-mysql mysql -uroot -proot toolrecommender -e "SELECT COUNT(*) FROM advisor_sessions WHERE trust_tier = 'block';"
```

Expected: 0.

- [ ] **Step 4.7: Commit**

```powershell
git add artifacts/api-server/src/routes/advisor.ts artifacts/api-server/src/lib/advisorEngine.ts
git commit -m "feat(api): new advisor pipeline (retrieve → score → reason → trust gate → persist)"
```

---

## Task 5: Update OpenAPI for the §3/§5 response shape

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

The schema rewrite is large but mechanical: drop the `CategoryResults`/`CategoryRecommendation`/`ToolRecommendation`/`ScoreBreakdown`/`Evidence`/`RagChunk`/`Archetype` schemas; add `Recommendation`, `RecommendationItem`, `Phase`, `Retrieval`. Replace `AnalysisResult` shape.

- [ ] **Step 5.1: Add new component schemas**

Inside `components.schemas`, add:

```yaml
    Phase:
      type: string
      enum: [planning, programming, version_control, art_assets, audio, deployment_publishing]

    RecommendationItem:
      type: object
      properties:
        toolId:        { type: string }
        score:         { type: number, minimum: 0, maximum: 100 }
        reasoning:     { type: string }
        pros:          { type: array, items: { type: string } }
        cons:          { type: array, items: { type: string } }
        compatibility: { type: string }
        useCaseJustification: { type: string }
        phase:
          type: array
          items: { $ref: "#/components/schemas/Phase" }
      required:
        - toolId
        - score
        - reasoning
        - pros
        - cons
        - compatibility
        - useCaseJustification
        - phase

    Recommendation:
      type: object
      properties:
        category:
          type: string
          enum: [game_engine, ide, version_control, art_asset_creation, audio, ai_coding_assistant, deployment_publishing]
        primary:
          $ref: "#/components/schemas/RecommendationItem"
        alternatives:
          type: array
          maxItems: 2
          items: { $ref: "#/components/schemas/RecommendationItem" }
      required: [category, primary, alternatives]

    Retrieval:
      type: object
      properties:
        relevantCategories:
          type: array
          items:
            type: string
            enum: [game_engine, ide, version_control, art_asset_creation, audio, ai_coding_assistant, deployment_publishing]
        candidateTools:
          type: array
          items:
            type: object
            properties:
              toolId:    { type: string }
              nodePath:  { type: string }
              fitNote:   { type: string }
            required: [toolId, nodePath, fitNote]
        rejectedTools:
          type: array
          items:
            type: object
            properties:
              toolId: { type: string }
              reason: { type: string }
            required: [toolId, reason]
        missingInformationNotes:
          type: array
          items: { type: string }
        retrievalConfidence:
          type: number
          minimum: 0
          maximum: 100
        fallbackStatus:
          type: string
          enum: [ok, weak_coverage, ambiguous_input, missing_domain]
      required:
        - relevantCategories
        - candidateTools
        - rejectedTools
        - missingInformationNotes
        - retrievalConfidence
        - fallbackStatus
```

- [ ] **Step 5.2: Replace `AnalysisResult` whole-cloth**

```yaml
    AnalysisResult:
      type: object
      properties:
        sessionId:
          type: string
          description: Empty string when terminated is true
        projectSummary:
          type: string
        trustScore:
          type: integer
          minimum: 0
          maximum: 100
        trustTier:
          type: string
          enum: [block, warn, pass]
        terminated:
          type: boolean
        retrieval:
          $ref: "#/components/schemas/Retrieval"
        recommendations:
          type: array
          items: { $ref: "#/components/schemas/Recommendation" }
        finalSummary:
          type: string
      required:
        - sessionId
        - projectSummary
        - trustScore
        - trustTier
        - terminated
        - retrieval
        - recommendations
        - finalSummary
```

- [ ] **Step 5.3: Delete obsolete schemas**

Remove the following schema blocks entirely from `openapi.yaml`:
- `Archetype`
- `CategoryResults`
- `CategoryRecommendation`
- `ToolRecommendation`
- `ScoreBreakdown`
- `Evidence`
- `RagChunk`

Search the rest of the file for any `$ref` to those names; remove or repoint as needed (most should be gone with `AnalysisResult`'s rewrite).

- [ ] **Step 5.4: Extend `ProjectInput` with `pinnedToolIds`**

Inside the `ProjectInput` schema, add (alongside `paidPriorityCategories`):

```yaml
        pinnedToolIds:
          type: array
          items: { type: string }
          description: "Tool ids the user explicitly wants kept; reasoning will adapt around them."
```

(Not `required`.)

- [ ] **Step 5.5: Update `SessionSummary`**

```yaml
    SessionSummary:
      type: object
      properties:
        id:           { type: string }
        projectIdea:  { type: string }
        trustScore:   { type: integer }
        trustTier:
          type: string
          enum: [block, warn, pass]
        createdAt:
          type: string
          format: date-time
      required: [id, projectIdea, trustScore, trustTier, createdAt]
```

- [ ] **Step 5.6: Codegen**

```powershell
pnpm --filter @workspace/api-spec run codegen
```

Expected: regenerates `lib/api-zod` and `lib/api-client-react`. Frontend will not typecheck against the new shapes (out of scope).

- [ ] **Step 5.7: Typecheck the api-server**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 5.8: Commit**

```powershell
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api-spec): rewrite AnalysisResult for §3 (trust + recommendations + retrieval)"
```

---

## Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 6.1: Document the new pipeline**

Replace the data-flow paragraph in the Architecture section with:

```markdown
**Data flow for an analysis request:**
1. Frontend posts `POST /api/advisor/analyze` (Zod-validated body)
2. `routes/advisor.ts` calls `treeNavigator.retrieveContext` (Sprint 3) → `RetrievedContextPackage`
3. `services/scoringService.ts` ranks each category's candidate tools deterministically
4. `services/reasoningService.ts` makes ONE `gpt-4o-mini` structured-output call to produce per-category recommendations + a trust score 0–100
5. The trust gate: `trustTier = trustTierFor(trustScore)`. Below `TRUST_SCORE_BLOCK_THRESHOLD` (default 25, env-overridable) the response is `terminated: true` and the session is **not** persisted.
6. Otherwise the session is persisted to MySQL and the full `AnalysisResult` is returned.
```

- [ ] **Step 6.2: Commit**

```powershell
git add CLAUDE.md
git commit -m "docs(claude-md): document trust gate and new advisor pipeline"
```

---

## Task 7: Sprint exit checklist

- [ ] **Step 7.1: Verify acceptance**

```powershell
# 1. AnalysisResult contains trustScore, trustTier, terminated, retrieval.fallbackStatus, phase per recommendation
Select-String -Path lib/api-spec/openapi.yaml -Pattern 'trustScore|trustTier|terminated|fallbackStatus|RecommendationItem'
# expected: matches in the AnalysisResult and Retrieval schemas

# 2. Type-check passes
pnpm run typecheck

# 3. Block-tier behavior verified (no row written)
docker exec -i toolrecommender-mysql mysql -uroot -proot toolrecommender -e "SELECT COUNT(*) FROM advisor_sessions WHERE trust_tier = 'block';"
# expected: 0
```

- [ ] **Step 7.2: Push branch and open PR**

```powershell
git push -u origin <branch>
gh pr create --title "Sprint 4: trust score + reasoning service" --body "<reference spec §6 sprint 4>"
```

---

## Out of scope for Sprint 4

- Folder restructure into `controllers/orchestrators/middleware/utils` — Sprint 5.
- Adding `validate.ts` and `errorHandler.ts` middleware — Sprint 5.
- Removing the legacy `GAME_DEV_TOOLS` adapter from `gameDevTools.ts` — Sprint 5.
- Frontend changes to consume the new `AnalysisResult` shape — separate spec (§1).
- LLM-call observability/metrics — not in PDD scope.
