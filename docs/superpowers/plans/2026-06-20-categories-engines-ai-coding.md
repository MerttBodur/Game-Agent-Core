# Category Coverage, Full Engine Support & Budget-Aware AI Coding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the advisor always recommend a tool for all five non-engine categories, support all catalog game engines (adding Three.js), and give AI-coding tools realistic budget/token data.

**Architecture:** Three independent-but-ordered changes. (1) Catalog data: add Three.js + ChatGPT Codex + Gemini, update 4 AI-coding tools. (2) Engine model: `EngineName` becomes the catalog tool **id**, derived from the catalog; remove the 3-engine hardcode and the engine-compatibility retrieval filter. (3) Category model: drop LLM category pruning (Layer 3 `answerPossible`) and the Layer 2 skip — `recommendCategory` always returns a primary, logging low-confidence instead of skipping. Reindex Chroma at the end.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Zod v4 (`zod/v4`), LangChain.js structured output, Chroma vector store, `node:test` for unit tests, pnpm workspaces.

## Global Constraints

- Zod imports use `zod/v4` — never the default `zod` import.
- TypeScript ESM: all relative imports end in `.js` even though sources are `.ts`.
- Catalog ids are lowercase snake_case matching `/^[a-z0-9_]+$/` (enforced by `ToolEntrySchema`).
- Canonical categories: `game_engine`, `art_asset`, `vfx`, `animation`, `audio`, `ai_coding`.
- Do not remove `minimumReleaseAge: 1440` from `pnpm-workspace.yaml`.
- After editing the catalog or guidance docs, the Chroma index MUST be rebuilt: `pnpm --filter @workspace/api-server run rag:index`.
- Run all unit tests with: `pnpm --filter @workspace/api-server run test`.
- Type-check with: `pnpm run typecheck`.
- Commit messages: conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`). No attribution footer (disabled globally).

---

## Task 1: Add Three.js, ChatGPT Codex, and Gemini to the catalog; update 4 AI-coding tools

**Files:**
- Modify: `artifacts/api-server/src/data/toolCatalog.json`
- Test: `artifacts/api-server/src/lib/catalog.test.ts` (existing — add cases)

**Interfaces:**
- Consumes: `ToolCatalogSchema`, `TOOL_CATALOG`, `TOOL_BY_ID` from `lib/catalog.ts` (already exist).
- Produces: new tool ids `threejs` (game_engine), `chatgpt_codex` (ai_coding), `gemini_code_assist` (ai_coding). Updated pricing on `claude_code`, `cursor`. These ids are consumed by Task 2 (`ENGINES` derivation) and Task 8 (integration).

- [ ] **Step 1: Find the exact ids of the four AI-coding tools to update**

Run: `node -e "const c=require('./artifacts/api-server/src/data/toolCatalog.json'); for(const t of c) if(t.categories.includes('ai_coding')) console.log(t.id, '|', t.name, '|', t.pricing)"`
Expected output includes lines for Claude Code, Cursor, GitHub Copilot, etc. Note the exact `id` values (likely `claude_code`, `cursor`, `github_copilot`, `codeium`, `windsurf`, `cline`, `aider`).

- [ ] **Step 2: Write a failing test asserting the new tools exist with correct shape**

Add to `artifacts/api-server/src/lib/catalog.test.ts`:

```typescript
import { TOOL_BY_ID, toolsInCategory } from "./catalog.js";

test("Three.js is in the catalog as a web 3D game engine", () => {
  const t = TOOL_BY_ID.get("threejs");
  assert.ok(t, "threejs must exist");
  assert.ok(t!.categories.includes("game_engine"));
  assert.deepEqual(t!.supportedPlatforms, ["web"]);
  assert.equal(t!.pricing, "open_source");
  assert.equal(t!.learningCurve, "high");
  assert.match(t!.description, /3D/);
});

test("ChatGPT Codex and Gemini are AI coding tools", () => {
  const ids = toolsInCategory("ai_coding").map((t) => t.id);
  assert.ok(ids.includes("chatgpt_codex"));
  assert.ok(ids.includes("gemini_code_assist"));
});

test("Claude Code pricing reflects token-usage cost", () => {
  const claude = TOOL_BY_ID.get("claude_code");
  assert.ok(claude);
  assert.equal(claude!.pricing, "subscription");
  // token-cost caution surfaced in cons text
  assert.ok(claude!.cons.some((c) => /token|expensive|cost/i.test(c)));
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — `threejs must exist` (tools not yet in catalog).

- [ ] **Step 4: Add the three new tool entries to `toolCatalog.json`**

Insert the Three.js entry alongside the other `game_engine` tools (after the `love2d` / Phaser block):

```json
{
  "id": "threejs",
  "name": "Three.js",
  "categories": ["game_engine"],
  "description": "Open-source JavaScript 3D library built on WebGL for rendering animated 3D graphics in the browser. A rendering library, not a full game engine: it provides scene, camera, lights, and meshes, but you build the game loop, physics, and tooling yourself.",
  "bestUseCase": "Custom 3D games and interactive 3D experiences that run in a web browser.",
  "toolNature": "traditional",
  "learningCurve": "high",
  "engineCompatibility": ["any"],
  "pricing": "open_source",
  "difficultyLevel": "advanced",
  "beginnerSuitability": 35,
  "supportedPlatforms": ["web"],
  "pros": [
    "Free and open source (MIT license)",
    "Industry-standard WebGL 3D rendering in the browser",
    "Huge community and ecosystem of examples",
    "No install required for end users"
  ],
  "cons": [
    "Rendering library only — no built-in game loop, physics, or editor",
    "Steep learning curve; you assemble engine features yourself",
    "3D-focused — overkill for 2D games",
    "Web/browser output only"
  ],
  "website": "https://threejs.org"
}
```

Insert the two AI-coding entries alongside the other `ai_coding` tools:

```json
{
  "id": "chatgpt_codex",
  "name": "ChatGPT Codex",
  "categories": ["ai_coding"],
  "description": "OpenAI's agentic coding tool available inside ChatGPT (Free, Go, Plus, and Pro tiers) and via the Codex CLI. Generates and edits code, runs cloud tasks, and reviews changes within message/task quotas.",
  "bestUseCase": "Affordable agentic AI coding for game scripting, with a free tier and low-cost entry plans.",
  "toolNature": "ai",
  "learningCurve": "low",
  "engineCompatibility": ["any"],
  "pricing": "freemium",
  "difficultyLevel": "beginner",
  "beginnerSuitability": 80,
  "supportedPlatforms": ["pc", "web"],
  "pros": [
    "Free tier plus low-cost Go ($8/mo) and Plus ($20/mo) plans",
    "Message/task quotas instead of per-token billing keep costs predictable",
    "Strong multi-step code generation and review",
    "Available in ChatGPT and via the Codex CLI"
  ],
  "cons": [
    "Quota-limited per 5-hour window on lower tiers",
    "Generated code still needs careful review",
    "Cloud-based — code is sent to OpenAI"
  ],
  "website": "https://developers.openai.com/codex"
},
{
  "id": "gemini_code_assist",
  "name": "Gemini CLI / Code Assist",
  "categories": ["ai_coding"],
  "description": "Google's AI coding assistant via the Gemini CLI and IDE extensions, running on the free Gemini Code Assist for Individuals tier with generous daily quotas, plus paid Standard and Enterprise subscriptions.",
  "bestUseCase": "Low-budget AI-assisted game scripting with a generous free tier in the terminal or IDE.",
  "toolNature": "ai",
  "learningCurve": "low",
  "engineCompatibility": ["any"],
  "pricing": "freemium",
  "difficultyLevel": "beginner",
  "beginnerSuitability": 82,
  "supportedPlatforms": ["pc", "web"],
  "pros": [
    "Generous free tier (~60 requests/min, ~1,000 requests/day)",
    "Ideal for low-budget solo developers",
    "Works in the terminal (Gemini CLI) and major IDEs",
    "Flat paid tiers available when you outgrow free"
  ],
  "cons": [
    "Free-tier quotas can throttle heavy sessions",
    "Generated code still needs review",
    "Cloud-based — code is sent to Google"
  ],
  "website": "https://google-gemini.github.io/gemini-cli"
}
```

- [ ] **Step 5: Update the four existing AI-coding tools' pricing and cost notes**

In `toolCatalog.json`, for the existing AI-coding entries (use the exact ids found in Step 1):

- `claude_code`: keep `"pricing": "subscription"`. Add to its `cons` array (do not remove existing cons): `"Token-heavy agentic use is expensive; Max plans run $100–200/mo"`.
- `cursor`: keep `"pricing": "freemium"`. Add to its `pros` array: `"Flat $20/mo with an included credit pool — predictable monthly cost"`.
- (Codeium, Windsurf, Cline, Aider already have appropriate `freemium`/`open_source` pricing — leave them unchanged.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS — all three new catalog tests pass, existing catalog tests still pass (`ToolCatalogSchema` validates the new entries at module load).

- [ ] **Step 7: Verify the catalog still validates and has no duplicate ids**

Run: `node -e "require('./artifacts/api-server/src/lib/catalog.ts')" 2>/dev/null || pnpm --filter @workspace/api-server exec tsx -e "import('./src/lib/catalog.ts').then(m=>console.log('tools:', m.TOOL_CATALOG.length))"`
Expected: prints a tool count (no `duplicate tool id` or `catalog failed validation` throw).

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/data/toolCatalog.json artifacts/api-server/src/lib/catalog.test.ts
git commit -m "feat: add Three.js engine and Codex/Gemini AI coding tools to catalog"
```

---

## Task 2: Make `ENGINES` / `EngineName` catalog-id-derived

**Files:**
- Modify: `artifacts/api-server/src/types/catalog.ts:9-10`
- Create: `artifacts/api-server/src/lib/engines.ts`
- Test: `artifacts/api-server/src/lib/engines.test.ts`

**Interfaces:**
- Consumes: `TOOL_CATALOG` from `lib/catalog.ts`; `Category` from `types/catalog.ts`.
- Produces:
  - `ENGINE_IDS: readonly string[]` — ids of all `game_engine` tools, from the catalog.
  - `isEngineId(id: string): boolean`.
  - `EngineName = string` (now a catalog tool id, e.g. `unity`, `unreal_engine`, `threejs`).
  - Task 3 (prompts) and Task 5 (detection) and Task 6 (scoring) consume `ENGINE_IDS` / `EngineName`.

Note: `types/catalog.ts` must not import `lib/catalog.ts` (the latter imports the former — circular). So the runtime list lives in a new `lib/engines.ts`; `EngineName` stays a type alias in `types/catalog.ts`.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/src/lib/engines.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { ENGINE_IDS, isEngineId } from "./engines.js";

test("ENGINE_IDS contains every game_engine catalog id", () => {
  assert.ok(ENGINE_IDS.includes("unity"));
  assert.ok(ENGINE_IDS.includes("unreal_engine"));
  assert.ok(ENGINE_IDS.includes("godot"));
  assert.ok(ENGINE_IDS.includes("phaser"));
  assert.ok(ENGINE_IDS.includes("threejs"));
});

test("ENGINE_IDS excludes non-engine tools", () => {
  assert.ok(!ENGINE_IDS.includes("blender"));
  assert.ok(!ENGINE_IDS.includes("claude_code"));
});

test("isEngineId recognizes catalog engines and rejects others", () => {
  assert.equal(isEngineId("godot"), true);
  assert.equal(isEngineId("cryengine"), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — `Cannot find module './engines.js'`.

- [ ] **Step 3: Change `EngineName` in `types/catalog.ts`**

Replace lines 9-10 of `artifacts/api-server/src/types/catalog.ts`:

```typescript
export const ENGINES = ["Unity", "Unreal", "Godot"] as const;
export type EngineName = (typeof ENGINES)[number];
```

with:

```typescript
// EngineName is a catalog tool id (e.g. "unity", "unreal_engine", "threejs").
// The runtime list of valid ids lives in lib/engines.ts (derived from the catalog)
// to avoid a circular import between types/ and lib/.
export type EngineName = string;
```

(Leave `ENGINE_COMPAT` on line 12 untouched — that is the `engineCompatibility` value set `["Unity","Unreal","Godot","any"]` used by tool entries, a separate concept.)

- [ ] **Step 4: Create `lib/engines.ts`**

```typescript
import { TOOL_CATALOG } from "./catalog.js";
import type { EngineName } from "../types/catalog.js";

// Engine ids derived from the catalog: every tool tagged game_engine.
export const ENGINE_IDS: readonly EngineName[] = TOOL_CATALOG.filter((t) =>
  t.categories.includes("game_engine"),
).map((t) => t.id);

const ENGINE_ID_SET = new Set(ENGINE_IDS);

export function isEngineId(id: string): boolean {
  return ENGINE_ID_SET.has(id);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 6: Type-check (the `ENGINES` removal will surface broken references — expected, fixed in later tasks)**

Run: `pnpm run typecheck 2>&1 | head -40`
Expected: errors only in files that still import `ENGINES` (advisorPrompts.ts, ragEval.ts). Note them — they are fixed in Tasks 3 and 7. Do NOT fix them here.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/types/catalog.ts artifacts/api-server/src/lib/engines.ts artifacts/api-server/src/lib/engines.test.ts
git commit -m "refactor: derive engine ids from catalog, make EngineName a tool id"
```

---

## Task 3: Generalize the engine + feasibility + category prompts

**Files:**
- Modify: `artifacts/api-server/src/agent/prompts/advisorPrompts.ts`
- Test: `artifacts/api-server/src/agent/steps/recommendCategory.test.ts` (existing — update the prompt assertion)

**Interfaces:**
- Consumes: `ENGINE_IDS` from `lib/engines.ts`; `NON_ENGINE_CATEGORIES` from `types/catalog.ts`.
- Produces: updated `EngineDecisionSchema` (`picked`/`userPreferred` are `z.enum(ENGINE_IDS)`), `FeasibilitySchema` without `targetCategories`, `buildCategorySchema` without `answerPossible`, generalized prompt strings. Consumed by Tasks 4, 5, 6.

- [ ] **Step 1: Update the existing prompt test that asserts `answerPossible`**

In `artifacts/api-server/src/agent/steps/recommendCategory.test.ts`, the test `categorySystemPrompt forbids fabricating attributes` asserts `assert.match(p, /answerPossible=false/)`. Replace that single assertion line with an assertion of the new engine-specific guard:

```typescript
test("categorySystemPrompt forbids fabricating attributes and guards engine-specific tools", () => {
  const p = categorySystemPrompt("art_asset");
  assert.match(p, /only/i);
  assert.match(p, /not invent|do not invent|don't invent/i);
  assert.match(p, /engine|specific/i);
  assert.doesNotMatch(p, /answerPossible/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — prompt still contains `answerPossible` and lacks the engine guard.

- [ ] **Step 3: Update imports and `FeasibilitySchema` in `advisorPrompts.ts`**

Change the import on line 2 from:

```typescript
import { ENGINES, NON_ENGINE_CATEGORIES } from "../../types/catalog.js";
```

to:

```typescript
import { NON_ENGINE_CATEGORIES } from "../../types/catalog.js";
import { ENGINE_IDS } from "../../lib/engines.js";
```

Replace the `FeasibilitySchema` (lines 4-8) — drop `targetCategories`:

```typescript
export const FeasibilitySchema = z.object({
  feasible: z.boolean(),
  reason: z.string().min(1),
});
export type FeasibilityShape = z.infer<typeof FeasibilitySchema>;
```

- [ ] **Step 4: Remove category-selection instructions from `feasibilitySystemPrompt`**

In `feasibilitySystemPrompt()`, delete the last three array lines that tell the model to pick/skip categories:

```typescript
    "If feasible, pick the non-engine categories this project actually needs from:",
    NON_ENGINE_CATEGORIES.join(", ") + ".",
    "Skip categories the project does not need (e.g. a text-only game needs no animation or vfx).",
```

Replace them with a single line clarifying the model only judges feasibility:

```typescript
    "You only decide feasibility — category selection is handled downstream.",
```

(The `NON_ENGINE_CATEGORIES` import is still used by Task 4's orchestrator, but is now unused in this file. Remove it from this file's import if the linter flags it — Task 4 imports it where needed.)

- [ ] **Step 5: Generalize `EngineDecisionSchema` and `engineSystemPrompt`**

Replace `z.enum(ENGINES)` with `z.enum(ENGINE_IDS as [string, ...string[]])` in all three places in `EngineDecisionSchema` (`picked`, `userPreferred`, and the `alternativesConsidered[].engine`):

```typescript
export const EngineDecisionSchema = z.object({
  picked: z.enum(ENGINE_IDS as [string, ...string[]]),
  userPreferred: z.enum(ENGINE_IDS as [string, ...string[]]).nullable(),
  agreement: z.enum(["agreed", "challenged", "user_silent"]),
  reasoning: z.string().min(1),
  alternativesConsidered: z.array(
    z.object({
      engine: z.enum(ENGINE_IDS as [string, ...string[]]),
      reasonRejected: z.string().min(1),
    }),
  ),
});
```

Replace the first two lines of `engineSystemPrompt()`:

```typescript
    "You are a senior game engine consultant. Choose exactly one of Unity, Unreal, or Godot.",
    "Parse any engine the user mentioned in their idea. You MAY challenge their choice with reasoning if another engine fits better.",
```

with:

```typescript
    "You are a senior game engine consultant. Choose exactly one engine, by its id, from the candidate engines in the provided docs.",
    "Match the project to the right engine: 2D web games favor Phaser; 3D web favors Three.js; cross-platform 2D/3D favors Unity, Godot, or GameMaker; AAA 3D favors Unreal; visual novels favor Ren'Py.",
    "If the user named an engine that is among the candidates, use it. You MAY challenge their choice with reasoning only if another candidate clearly fits better.",
```

- [ ] **Step 6: Remove `answerPossible` from `buildCategorySchema` and add the engine guard to `categorySystemPrompt`**

In `buildCategorySchema`, delete the `answerPossible: z.boolean(),` line from the returned object:

```typescript
  return z.object({
    primary: item,
    alternatives: z.array(item).max(2),
    reasoning: z.string().min(1),
  });
```

In `categorySystemPrompt`, delete the line:

```typescript
    "Set answerPossible=false if the provided candidates are genuinely insufficient for a confident pick; otherwise set it true.",
```

and replace the line `"If the candidates are insufficient for a confident pick, say so in your reasoning rather than fabricating."` with:

```typescript
    "Always choose a primary from the candidates — pick the best available even if imperfect, and note any limitation in your reasoning.",
    "If a candidate's text says it is specific to one engine (e.g. Unity only) and the chosen engine is different, do not select it as primary.",
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS — the updated prompt test passes.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/agent/prompts/advisorPrompts.ts artifacts/api-server/src/agent/steps/recommendCategory.test.ts
git commit -m "refactor: generalize engine/feasibility/category prompts and schemas"
```

---

## Task 4: Drop category pruning in feasibility step and orchestrator

**Files:**
- Modify: `artifacts/api-server/src/agent/steps/feasibility.ts`
- Modify: `artifacts/api-server/src/orchestrators/advisorOrchestrator.ts`
- Modify: `artifacts/api-server/src/types/advisor.ts:11-15` (drop `targetCategories` from `FeasibilityDecision`)
- Test: `artifacts/api-server/src/agent/steps/feasibility.test.ts` (rewrite — `targetCategories` no longer exists)

**Interfaces:**
- Consumes: `NON_ENGINE_CATEGORIES` from `types/catalog.ts`; `FeasibilitySchema` (no `targetCategories`) from Task 3.
- Produces: `runFeasibility` returns `{ feasible, reason }`; orchestrator fans out over all five `NON_ENGINE_CATEGORIES`.

- [ ] **Step 1: Rewrite the feasibility test**

Replace the entire body of `artifacts/api-server/src/agent/steps/feasibility.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { FeasibilitySchema } from "../prompts/advisorPrompts.js";

test("FeasibilitySchema accepts a decision without targetCategories", () => {
  const parsed = FeasibilitySchema.safeParse({
    feasible: true,
    reason: "Reasonable scope.",
  });
  assert.equal(parsed.success, true);
});

test("FeasibilitySchema rejects a missing reason", () => {
  const parsed = FeasibilitySchema.safeParse({ feasible: false, reason: "" });
  assert.equal(parsed.success, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — `feasibility.test.ts` still imports/uses the old `normalizeFeasibility` shape, or the schema still has `targetCategories`. (If Task 3 is already merged, this fails because `normalizeFeasibility` is still referenced elsewhere — proceed.)

- [ ] **Step 3: Update `FeasibilityDecision` in `types/advisor.ts`**

Replace lines 11-15:

```typescript
export interface FeasibilityDecision {
  feasible: boolean;
  reason: string;
  targetCategories: NonEngineCategory[];
}
```

with:

```typescript
export interface FeasibilityDecision {
  feasible: boolean;
  reason: string;
}
```

Remove the now-unused `NonEngineCategory` from the import on line 1 if the linter flags it (check whether it is used elsewhere in the file first — it is not).

- [ ] **Step 4: Simplify `feasibility.ts`**

Replace the whole file `artifacts/api-server/src/agent/steps/feasibility.ts`:

```typescript
import type { AdvisorInput, FeasibilityDecision } from "../../types/advisor.js";
import {
  FeasibilitySchema,
  feasibilitySystemPrompt,
  feasibilityUserPrompt,
} from "../prompts/advisorPrompts.js";

export async function runFeasibility(input: AdvisorInput): Promise<FeasibilityDecision> {
  // Dynamic imports defer module-level side effects (API key check) until call time.
  const [{ chatModel }, { retrieveFeasibilityContext }] = await Promise.all([
    import("../../lib/rag/chatModel.js"),
    import("../../lib/rag/retriever.js"),
  ]);

  const guidanceDocs = await retrieveFeasibilityContext(
    `${input.projectIdea} budget ${input.budget} skill ${input.skillLevel}`,
  );
  const guidance = guidanceDocs.map((d) => d.pageContent).join("\n---\n");
  const model = chatModel().withStructuredOutput(FeasibilitySchema, { name: "feasibility_decision" });
  const result = await model.invoke([
    { role: "system", content: feasibilitySystemPrompt() },
    { role: "user", content: feasibilityUserPrompt(input, guidance) },
  ]);
  return result as FeasibilityDecision;
}
```

(`normalizeFeasibility` is deleted — there is no longer a `targetCategories` to force empty.)

- [ ] **Step 5: Update the orchestrator to fan out over all five categories**

In `artifacts/api-server/src/orchestrators/advisorOrchestrator.ts`:

Add the import (top of file, with the other type imports):

```typescript
import { NON_ENGINE_CATEGORIES } from "../types/catalog.js";
```

Change the `AdvisorEvent` `feasibility_complete` variant (line 15) to carry the fixed list:

```typescript
  | { type: "feasibility_complete"; targetCategories: readonly string[] }
```

Replace the emit on line 41:

```typescript
  emit({ type: "feasibility_complete", targetCategories: feasibility.targetCategories });
```

with:

```typescript
  emit({ type: "feasibility_complete", targetCategories: NON_ENGINE_CATEGORIES });
```

Replace the recommendation loop (lines 46-53):

```typescript
  const recs: CategoryRecommendation[] = [];
  for (const category of feasibility.targetCategories) {
    const rec = await recommendCategory(input, category, engineDecision.picked);
    if (rec) {
      recs.push(rec);
      emit({ type: "category_recommended", category, primaryToolId: rec.primary.toolId });
    }
  }
```

with (note: `recommendCategory` now always returns a value — Task 6):

```typescript
  const recs: CategoryRecommendation[] = [];
  for (const category of NON_ENGINE_CATEGORIES) {
    const rec = await recommendCategory(input, category, engineDecision.picked);
    recs.push(rec);
    emit({ type: "category_recommended", category, primaryToolId: rec.primary.toolId });
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS — feasibility tests pass. (Type errors in `recommendCategory.ts` about the return type are expected and fixed in Task 6; if the test runner type-checks and fails on that, proceed to Task 6 before re-running — but `node:test` runs compiled/tsx, so unit tests for the schema pass independently.)

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/agent/steps/feasibility.ts artifacts/api-server/src/orchestrators/advisorOrchestrator.ts artifacts/api-server/src/types/advisor.ts artifacts/api-server/src/agent/steps/feasibility.test.ts
git commit -m "feat: always analyze all five non-engine categories, drop feasibility pruning"
```

---

## Task 5: Make engine detection catalog-aware (text → engine id)

**Files:**
- Modify: `artifacts/api-server/src/agent/steps/pickEngineRag.ts`
- Test: `artifacts/api-server/src/agent/steps/pickEngineRag.test.ts` (create if absent; otherwise add cases)

**Interfaces:**
- Consumes: `TOOL_CATALOG` from `lib/catalog.ts`; `EngineName` (= id) from `types/catalog.ts`.
- Produces: `detectUserPreferredEngine(projectIdea: string): EngineName | null` returns a catalog engine **id** or null; `normalizeEngineDecision` / `assertEngineInvariant` unchanged in signature.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/src/agent/steps/pickEngineRag.test.ts` (or add to existing):

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { detectUserPreferredEngine, normalizeEngineDecision } from "./pickEngineRag.js";

test("detects a named catalog engine and returns its id", () => {
  assert.equal(detectUserPreferredEngine("I want to build it in Godot"), "godot");
  assert.equal(detectUserPreferredEngine("a Phaser web game"), "phaser");
  assert.equal(detectUserPreferredEngine("using Unreal Engine 5"), "unreal_engine");
  assert.equal(detectUserPreferredEngine("a Three.js 3D scene"), "threejs");
});

test("returns null for a non-catalog engine or no engine", () => {
  assert.equal(detectUserPreferredEngine("built in CryEngine"), null);
  assert.equal(detectUserPreferredEngine("a simple 2D game"), null);
});

test("ignores a negated engine mention", () => {
  assert.equal(detectUserPreferredEngine("anything but Unity"), null);
});

test("normalizeEngineDecision agrees when picked equals detected id", () => {
  const out = normalizeEngineDecision(
    {
      picked: "phaser",
      userPreferred: null,
      agreement: "user_silent",
      reasoning: "fits web 2D",
      alternativesConsidered: [],
    },
    "a Phaser web RPG",
  );
  assert.equal(out.userPreferred, "phaser");
  assert.equal(out.agreement, "agreed");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — detection returns old name-based values (`"Godot"` not `"godot"`, null for Phaser/Three.js).

- [ ] **Step 3: Replace the detection patterns with catalog-derived ones**

In `artifacts/api-server/src/agent/steps/pickEngineRag.ts`, replace the import block and `ENGINE_PATTERNS` (lines 1-13):

```typescript
import type { AdvisorInput, EngineDecision } from "../../types/advisor.js";
import type { EngineName } from "../../types/catalog.js";
import { TOOL_CATALOG } from "../../lib/catalog.js";
import {
  EngineDecisionSchema,
  engineSystemPrompt,
  engineUserPrompt,
} from "../prompts/advisorPrompts.js";

// Build detection patterns from the catalog: each game_engine tool maps a
// name/alias regex to its id. Aliases cover common ways users name an engine.
const ENGINE_ALIASES: Record<string, string[]> = {
  unreal_engine: ["unreal\\s+engine", "unreal", "ue[45]?"],
  threejs: ["three\\.?js"],
  love2d: ["l[öo]ve2?d?", "l[öo]ve"],
  renpy: ["ren'?py"],
  construct_3: ["construct\\s*3?"],
  rpg_maker: ["rpg\\s*maker"],
};

const ENGINE_PATTERNS: Array<{ engine: EngineName; pattern: RegExp }> = TOOL_CATALOG.filter(
  (t) => t.categories.includes("game_engine"),
).map((t) => {
  const aliases = ENGINE_ALIASES[t.id] ?? [escapeRegExp(t.name)];
  return { engine: t.id, pattern: new RegExp(`\\b(?:${aliases.join("|")})\\b`, "gi") };
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

(Keep `NEGATED_ENGINE_CONTEXT` and the rest of the file. The `detectUserPreferredEngine` body already iterates `ENGINE_PATTERNS` and returns `engine` — now an id — and the negation/sorting logic is unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `pnpm run typecheck 2>&1 | head -20`
Expected: no errors in `pickEngineRag.ts`. (`assertEngineInvariant` still type-checks: `userPreferred` and `picked` are `EngineName` = string.)

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/agent/steps/pickEngineRag.ts artifacts/api-server/src/agent/steps/pickEngineRag.test.ts
git commit -m "feat: catalog-aware engine detection returning catalog ids"
```

---

## Task 6: Remove engine retrieval filter and Layer 2/3 skip; always recommend

**Files:**
- Modify: `artifacts/api-server/src/lib/rag/retriever.ts`
- Modify: `artifacts/api-server/src/lib/rag/indexer.ts:49-52` (drop engine flags)
- Modify: `artifacts/api-server/src/agent/steps/recommendCategory.ts`
- Modify: `artifacts/api-server/src/services/scoring.ts:56-61` (`engineFit` id match)
- Test: `artifacts/api-server/src/lib/rag/retriever.test.ts` (remove engine-flag cases), `recommendCategory.test.ts`

**Interfaces:**
- Consumes: `Category`, `EngineName` (= id); `confidenceGate` from `lib/rag/retrievalGate.ts` (kept, now logged not enforced).
- Produces: `recommendCategory(...)` returns `CategoryRecommendation` (non-null); `toolWhereForCategory(category)` (no engine param); `metadataMatchesWhere(meta, category)` (no engine param); `retrieveForCategory(query, category)` (no `picked` param).

- [ ] **Step 1: Update `retriever.test.ts` — drop engine-flag cases, keep fusion/guidance cases**

In `artifacts/api-server/src/lib/rag/retriever.test.ts`:
- Remove the import of `engineFlagKey` and `metadataMatchesWhere`'s engine usage. New import line:

```typescript
import { toolWhereForCategory, guidanceWhere, metadataMatchesWhere, fuseToolDocs } from "./retriever.js";
```

- Delete the test `engineFlagKey maps engine names to boolean metadata keys`.
- Delete the test `category where with engine includes picked OR any`.
- Replace the test `metadataMatchesWhere enforces category and engine OR-any` with:

```typescript
test("metadataMatchesWhere enforces type and category only", () => {
  const meta = { type: "tool", category: "art_asset" };
  assert.equal(metadataMatchesWhere(meta, "art_asset"), true);
  assert.equal(metadataMatchesWhere(meta, "audio"), false);
  assert.equal(metadataMatchesWhere({ type: "guidance", category: "art_asset" }, "art_asset"), false);
});
```

- Keep `category where without engine omits the engine clause` but rename/relax it:

```typescript
test("category where filters by type and category", () => {
  assert.deepEqual(toolWhereForCategory("audio"), {
    $and: [{ type: { $eq: "tool" } }, { category: { $eq: "audio" } }],
  });
});
```

- [ ] **Step 2: Update `recommendCategory.test.ts` — remove `shouldSkipCategory` skip-return expectation**

In `artifacts/api-server/src/agent/steps/recommendCategory.test.ts`:
- Remove the `shouldSkipCategory` import and its test if `shouldSkipCategory` is being deleted. Instead the gate is logged. Delete:

```typescript
test("shouldSkipCategory skips on weak retrieval signal", () => {
  assert.equal(shouldSkipCategory(0, 0), true);
  assert.equal(shouldSkipCategory(3, 10), false);
});
```

and remove `shouldSkipCategory` from the import on line 3 → `import { assertCandidatesOnly, formatCandidates } from "./recommendCategory.js";`

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — `engineFlagKey` import missing / `metadataMatchesWhere` signature mismatch (implementation not yet changed).

- [ ] **Step 4: Strip engine filtering from `retriever.ts`**

In `artifacts/api-server/src/lib/rag/retriever.ts`:

Delete `engineFlagKey` (lines 14-17). Replace `toolWhereForCategory` (lines 19-25):

```typescript
export function toolWhereForCategory(category: Category): Where {
  return { $and: [{ type: { $eq: "tool" } }, { category: { $eq: category } }] };
}
```

Replace `metadataMatchesWhere` (lines 45-55):

```typescript
export function metadataMatchesWhere(
  meta: Record<string, unknown>,
  category: Category,
): boolean {
  return meta.type === "tool" && meta.category === category;
}
```

Replace `bm25ForCategory` (lines 57-62) to drop the `picked` param:

```typescript
function bm25ForCategory(category: Category): Bm25Index {
  const docs = toolDocuments()
    .filter((d) => metadataMatchesWhere(d.metadata as Record<string, unknown>, category))
    .map((d) => ({ id: d.metadata.toolId as string, text: d.pageContent }));
  return buildBm25(docs);
}
```

Update `retrieveEngineDocs` (lines 83-92) — calls now omit the engine arg (they already passed only `"game_engine"`, so only the inner calls change):

```typescript
export async function retrieveEngineDocs(query: string): Promise<RetrievedCandidates> {
  const [vectorDocs, guidanceDocs] = await Promise.all([
    search(query, FETCH_K, toolWhereForCategory("game_engine")),
    search(query, 1, guidanceWhere("choosing-engine-unity-unreal-godot")),
  ]);
  const bm25Hits = bm25ForCategory("game_engine").search(query, FETCH_K);
  const bm25Ids = bm25Hits.map((h) => h.id);
  const toolDocs = fuseToolDocs(vectorDocs, bm25Ids, 3);
  return { toolDocs, guidanceDocs, toolIds: uniqueToolIds(toolDocs), topBm25Score: bm25Hits[0]?.score ?? 0 };
}
```

Replace `retrieveForCategory` (lines 94-103) — drop `picked`:

```typescript
export async function retrieveForCategory(query: string, category: Category): Promise<RetrievedCandidates> {
  const [vectorDocs, guidanceDocs] = await Promise.all([
    search(query, FETCH_K, toolWhereForCategory(category)),
    search(query, GUIDANCE_K, guidanceWhere()),
  ]);
  const bm25Hits = bm25ForCategory(category).search(query, FETCH_K);
  const bm25Ids = bm25Hits.map((h) => h.id);
  const toolDocs = fuseToolDocs(vectorDocs, bm25Ids, TOOL_K);
  return { toolDocs, guidanceDocs, toolIds: uniqueToolIds(toolDocs), topBm25Score: bm25Hits[0]?.score ?? 0 };
}
```

Remove the now-unused `EngineName` import from line 3 → `import type { Category } from "../../types/catalog.js";`

- [ ] **Step 5: Drop engine flags from the indexer**

In `artifacts/api-server/src/lib/rag/indexer.ts`, delete lines 49-52 (the four `engine_*` metadata fields) and the now-unused `compat` set (line 29). The metadata object keeps `type`, `toolId`, `name`, `category`, `toolNature`, `pricing`, `learningCurve`, `difficultyLevel`, `beginnerSuitability`, and `...platformFlags`.

After removing the `compat` set, verify `engineCompatibility` is not otherwise used in this function (it is not).

- [ ] **Step 6: Rewrite `recommendCategory.ts` to always return a recommendation**

Replace `artifacts/api-server/src/agent/steps/recommendCategory.ts`:

```typescript
import type { AdvisorInput, CategoryRecommendation } from "../../types/advisor.js";
import type { Category, EngineName } from "../../types/catalog.js";
import { confidenceGate } from "../../lib/rag/retrievalGate.js";
import {
  buildCategorySchema,
  categorySystemPrompt,
  categoryUserPrompt,
} from "../prompts/advisorPrompts.js";

export async function recommendCategory(
  input: AdvisorInput,
  category: Category,
  picked: EngineName,
): Promise<CategoryRecommendation> {
  const [{ chatModel }, { retrieveForCategory }] = await Promise.all([
    import("../../lib/rag/chatModel.js"),
    import("../../lib/rag/retriever.js"),
  ]);

  const query = `${input.projectIdea} ${category} budget ${input.budget} skill ${input.skillLevel} art ${input.artCapability}`;
  const { toolDocs, guidanceDocs, toolIds, topBm25Score } = await retrieveForCategory(query, category);

  // Layer 2 (retrieval confidence) is now observability-only: we log a weak
  // signal but always produce a recommendation rather than skipping the category.
  const gate = confidenceGate(toolDocs.length, topBm25Score);
  if (!gate.passed) {
    console.warn(`[advisor] low-confidence retrieval for category "${category}": ${gate.reason}`);
  }

  const candidates = formatCandidates(toolDocs, guidanceDocs);
  const model = chatModel().withStructuredOutput(buildCategorySchema(toolIds), {
    name: "category_recommendation",
  });
  const out = await model.invoke([
    { role: "system", content: categorySystemPrompt(category) },
    {
      role: "user",
      content: categoryUserPrompt({
        idea: input.projectIdea,
        budget: input.budget,
        skillLevel: input.skillLevel,
        artCapability: input.artCapability,
        category,
        candidates,
      }),
    },
  ]);
  assertCandidatesOnly(out, toolIds);
  return {
    category,
    primary: { ...out.primary, score: 0, scoreReason: "" },
    alternatives: out.alternatives.map((a) => ({ ...a, score: 0, scoreReason: "" })),
    reasoning: out.reasoning,
  };
}

export function assertCandidatesOnly(
  out: { primary: { toolId: string }; alternatives: Array<{ toolId: string }> },
  allowed: string[],
): void {
  const set = new Set(allowed);
  for (const id of [out.primary.toolId, ...out.alternatives.map((a) => a.toolId)]) {
    if (!set.has(id)) throw new Error(`recommendation referenced non-candidate toolId: ${id}`);
  }
}

export function formatCandidates(
  toolDocs: Array<{ metadata: Record<string, unknown>; pageContent: string }>,
  guidanceDocs: Array<{ pageContent: string }>,
): string {
  const tools = toolDocs
    .map((d) => `toolId: ${d.metadata.toolId}\n${d.pageContent}`)
    .join("\n---\n");
  const guidance = guidanceDocs.map((d) => d.pageContent).join("\n");
  return `${tools}\n\nGuidance:\n${guidance}`;
}
```

(`shouldSkipCategory` is removed; `out.answerPossible` check is gone; `retrieveForCategory` is called without `picked`. `picked` stays in the signature because the orchestrator passes it and scoring needs the engine elsewhere — it is intentionally unused here now; if the linter errors on unused param, rename to `_picked`.)

- [ ] **Step 7: Fix `engineFit` in `scoring.ts` for id-based matching**

In `artifacts/api-server/src/services/scoring.ts`, replace `engineFit` (lines 56-61):

```typescript
function engineFit(t: ToolEntry, ctx: ScoringContext): number {
  if (ctx.category === "game_engine") {
    return t.id === ctx.pickedEngine ? 1 : 0.3;
  }
  return t.engineCompatibility.includes("any") || t.engineCompatibility.includes(ctx.pickedEngine) ? 1 : 0.2;
}
```

(For non-engine categories, `engineCompatibility.includes(ctx.pickedEngine)` will now rarely match since `pickedEngine` is an id like `phaser` and compat values are `["any"]` for 46/48 tools — but `includes("any")` covers them, returning 1. The 2 engine-specific tools, Unity VFX Graph / Niagara, have compat `["Unity"]`/`["Unreal"]` which no longer equal the id; they score 0.2 for non-Unity/Unreal picks, which is the desired de-prioritization the prompt guard reinforces.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS — retriever, recommendCategory, scoring unit tests pass.

- [ ] **Step 9: Type-check the whole workspace**

Run: `pnpm run typecheck`
Expected: PASS (zero errors). If `ragEval.ts` errors on `retrieveForCategory` arity or `EngineName`, fix it in Task 7.

- [ ] **Step 10: Commit**

```bash
git add artifacts/api-server/src/lib/rag/retriever.ts artifacts/api-server/src/lib/rag/indexer.ts artifacts/api-server/src/lib/rag/retriever.test.ts artifacts/api-server/src/agent/steps/recommendCategory.ts artifacts/api-server/src/agent/steps/recommendCategory.test.ts artifacts/api-server/src/services/scoring.ts
git commit -m "feat: remove engine retrieval filter and per-category skip; always recommend"
```

---

## Task 7: Fix remaining consumers (ragEval) and full typecheck

**Files:**
- Modify: `artifacts/api-server/src/scripts/ragEval.ts`

**Interfaces:**
- Consumes: `retrieveForCategory(query, category)` (no `picked`), `EngineName` (= id) from prior tasks.

- [ ] **Step 1: Inspect ragEval for stale signatures**

Run: `pnpm run typecheck 2>&1 | grep -i ragEval`
Expected: errors about `retrieveForCategory` arity, `EngineName`, or `ENGINES`. Note each.

- [ ] **Step 2: Update `ragEval.ts` `retrieve()` to drop the engine argument**

In `artifacts/api-server/src/scripts/ragEval.ts`, replace the `retrieve` function (lines 24-28):

```typescript
async function retrieve(c: GoldCase): Promise<string[]> {
  if (c.category === "game_engine") return (await retrieveEngineDocs(c.query)).toolIds;
  if (!c.picked) throw new Error(`case "${c.name}" needs a picked engine`);
  return (await retrieveForCategory(c.query, c.category, c.picked)).toolIds;
}
```

with (the `picked` requirement is obsolete now that retrieval no longer filters by engine):

```typescript
async function retrieve(c: GoldCase): Promise<string[]> {
  if (c.category === "game_engine") return (await retrieveEngineDocs(c.query)).toolIds;
  return (await retrieveForCategory(c.query, c.category)).toolIds;
}
```

The `GoldCase.picked?: EngineName` field (line 16) becomes unused by `retrieve`; leave the field in the interface (gold-set fixtures may still carry it harmlessly) but it no longer needs to be a valid id. If `EngineName` being `string` causes no type error, no fixture change is required. Run a quick check: `pnpm run typecheck 2>&1 | grep -i ragEval` should be empty after this edit.

- [ ] **Step 3: Full typecheck passes**

Run: `pnpm run typecheck`
Expected: PASS, zero errors across the workspace.

- [ ] **Step 4: Full unit test run**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS — all unit tests green.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/scripts/ragEval.ts
git commit -m "refactor: update ragEval for id-based engines and filterless retrieval"
```

---

## Task 8: Rebuild the RAG index and verify end-to-end

**Files:** none modified — operational verification.

**Interfaces:** Consumes the final catalog + retriever from all prior tasks.

- [ ] **Step 1: Boot local services**

Run: `docker compose up -d mysql chroma`
Expected: `chroma` and `mysql` containers running. Verify: `docker compose ps` shows both `Up`.

- [ ] **Step 2: Rebuild the Chroma index**

Run: `pnpm --filter @workspace/api-server run rag:index`
Expected: prints a `toolDocs` count that increased by 3 vs. before (Three.js + Codex + Gemini, each adding one doc per category). No engine-flag fields are written (verified by code, not output).

- [ ] **Step 3: Run retrieval quality eval**

Run: `pnpm --filter @workspace/api-server run rag:eval`
Expected: completes; MRR/recall not materially regressed from the last recorded run (the prior baseline was MRR ≈ 0.903 per project history). If a gold-set entry used old engine names, it was fixed in Task 7.

- [ ] **Step 4: Run the live advisor integration test**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/agent/advisorPipeline.integration.test.ts`
Expected: PASS. (Requires `OPENAI_API_KEY` and running Chroma. If the integration test asserts a specific category set or engine, update it to expect all five categories.)

- [ ] **Step 5: Manual smoke — "2D web RPG" yields Phaser + five categories**

Run the dev server (`pnpm --filter @workspace/api-server run dev`) and POST a "2D web RPG" advisor request (or use the integration harness), then confirm:
- engine `picked` is `phaser` (or another web-2D engine), not `godot`;
- `recommendations` has exactly five entries: `art_asset`, `vfx`, `animation`, `audio`, `ai_coding`;
- the `ai_coding` recommendation respects budget (low budget → a `freemium`/`open_source` tool like Gemini/Cursor/Cline scores highest).

Expected: all three confirmed. Capture the result to confirm before claiming done.

- [ ] **Step 6: Commit any test fixture updates**

```bash
git add -A
git commit -m "test: align integration expectations with five-category guaranteed output"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (categories) → Tasks 3,4,6. Part 1 defense-layer reconciliation → Task 6 (gate logged, answerPossible removed, anti-fabrication prompt kept). Part 2 (engines + Three.js + EngineName=id) → Tasks 1,2,3,5,6. Part 2b (user-specified engine) → Tasks 3,5. Part 3 (AI coding data) → Task 1. Reindex → Task 8.
- **Layer 1** is never touched (confirmed in Task descriptions).
- **Anti-fabrication prompt rule** retained in Task 3 Step 6 (the "use ONLY ... do not invent" lines are not deleted).
- **Type consistency:** `EngineName` = catalog id everywhere; `detectUserPreferredEngine` returns id; `engineFit` matches `t.id === ctx.pickedEngine`; `recommendCategory` returns non-null `CategoryRecommendation`; `retrieveForCategory(query, category)` arity consistent across retriever, recommendCategory, ragEval.
