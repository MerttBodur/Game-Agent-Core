# LangChain RAG Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vectorless `treeNavigator` + 4-step deterministic-SQL agent with a real vector RAG pipeline (LangChain.js + Chroma + OpenAI) staged as feasibility → engine → per-category recommend → deterministic /10 scoring, collapsing the taxonomy to 6 categories.

**Architecture:** An explicit TS orchestrator drives four stages. Each stage uses a LangChain chain internally (`retriever → ChatPromptTemplate → ChatOpenAI.withStructuredOutput(zodSchema)`). Retrieval is Chroma similarity search with **scalar** metadata filters applied first (category + engine flags), then semantic ranking. The catalog (`toolCatalog.json`) stays the source of truth and is embedded into one Chroma collection alongside curated guidance markdown. Session/terminated/SSE plumbing is reused; the Round-0 feasibility gate replaces the old trust-score block gate.

**Tech Stack:** TypeScript, Express 5, LangChain.js (`@langchain/openai`, `@langchain/community`, `langchain`, `chromadb`), Chroma (Docker), OpenAI `gpt-4o-mini` + `text-embedding-3-small`, Zod v4 (`zod/v4`), Drizzle/MySQL (sessions only), React 19 + Vite + Tailwind v4, Orval codegen, `node:test` via `tsx --test`.

---

## Migration strategy (read first)

This is a **full replacement** but the repo must stay type-checkable. Strategy:

1. **Additive first.** New taxonomy, types, RAG lib, scoring, steps, and catalog data are built in **new files** (`types/catalog.ts`, `types/advisor.ts`, `lib/rag/*`, `agent/steps/*` new names) reading a **temporary** `data/catalog.json`. Old files stay untouched and compiling.
2. **One cutover task (Task 13).** Wire the new orchestrator into the controller, switch `/tools` to the new catalog, rename `data/catalog.json` → `data/toolCatalog.json` (overwriting the old), then delete all dead files (old steps, constraints, treeNavigator, `toolTree.json`, old services, `pdd.ts`, `tree.ts`, `gameDevTools.ts`, old tests, `buildTree`/`evaluateScenarios`).
3. **Contract + frontend last.** OpenAPI change + codegen, then wizard/results.

`pnpm run typecheck` is green at the end of every task. Chroma + OpenAI-dependent tests are explicitly marked **live** (need `docker compose up -d chroma` and an API key) and are not part of the pure-unit `test` script.

A Chroma metadata value must be a **scalar** (string/number/boolean) — arrays are not allowed. Because a tool can belong to multiple categories, the indexer writes **one document per (tool × category)** with a scalar `category` field, and flattens engine compatibility into booleans `engine_unity` / `engine_unreal` / `engine_godot` / `engine_any`. This is the single most important constraint in the design; every retrieval filter relies on it.

---

## Canonical type surface (used by every task — names are fixed here)

`artifacts/api-server/src/types/catalog.ts`:
```ts
export const CATEGORIES = ["game_engine", "art_asset", "vfx", "animation", "audio", "ai_coding"] as const;
export type Category = (typeof CATEGORIES)[number];
export const NON_ENGINE_CATEGORIES = ["art_asset", "vfx", "animation", "audio", "ai_coding"] as const;
export type NonEngineCategory = (typeof NON_ENGINE_CATEGORIES)[number];

export const ENGINES = ["Unity", "Unreal", "Godot"] as const;
export type EngineName = (typeof ENGINES)[number];
export const ENGINE_COMPAT = ["Unity", "Unreal", "Godot", "any"] as const;

export interface ToolEntry { /* see Task 3 schema */ }
```

`artifacts/api-server/src/types/advisor.ts`:
```ts
export interface AdvisorInput {
  projectIdea: string;
  budget: "low" | "medium" | "high" | "enterprise";
  skillLevel: "beginner" | "intermediate" | "advanced" | "expert";
  teamSize: "solo" | "team";
  platformTarget: string[];
  artCapability: "none" | "basic" | "intermediate" | "advanced" | "professional";
  paidPriorityCategories?: string[];
  notes?: string | null;
}
export interface FeasibilityDecision { feasible: boolean; reason: string; targetCategories: NonEngineCategory[]; }
export interface EngineDecision {
  picked: EngineName;
  userPreferred: EngineName | null;
  agreement: "agreed" | "challenged" | "user_silent";
  reasoning: string;
  alternativesConsidered: Array<{ engine: EngineName; reasonRejected: string }>;
}
export interface RecommendedTool {
  toolId: string; score: number /* 0-10, one decimal */; scoreReason: string;
  reasoning: string; pros: string[]; cons: string[];
}
export interface CategoryRecommendation {
  category: Category; primary: RecommendedTool; alternatives: RecommendedTool[] /* ≤2 */; reasoning: string;
}
export interface AnalysisResult {
  sessionId: string /* "" when terminated */;
  feasible: boolean;
  reason: string;
  terminated: boolean;
  projectSummary: string;
  engineDecision?: EngineDecision;
  recommendations: CategoryRecommendation[]; /* [] when terminated */
  finalSummary: string;
}
```

---

## File structure

**Create**
- `artifacts/api-server/src/types/catalog.ts` — 6-category taxonomy + `ToolEntry` Zod schema + loader-facing types
- `artifacts/api-server/src/types/advisor.ts` — pipeline + result types (above)
- `artifacts/api-server/src/lib/catalog.ts` — loads + Zod-validates `toolCatalog.json` (replaces `gameDevTools.ts`)
- `artifacts/api-server/src/lib/rag/embeddings.ts` — `OpenAIEmbeddings` factory
- `artifacts/api-server/src/lib/rag/vectorStore.ts` — Chroma client + collection accessor
- `artifacts/api-server/src/lib/rag/indexer.ts` — build (tool×category) + guidance `Document[]`, upsert
- `artifacts/api-server/src/lib/rag/retriever.ts` — metadata-filtered retrieval helpers + Chroma `where` builders
- `artifacts/api-server/src/lib/rag/chatModel.ts` — `ChatOpenAI` factory
- `artifacts/api-server/src/scripts/indexRag.ts` — `rag:index` entrypoint
- `artifacts/api-server/src/services/scoring.ts` — deterministic 0–10 scorer (replaces `scoringService.ts`)
- `artifacts/api-server/src/agent/steps/feasibility.ts` — Round 0
- `artifacts/api-server/src/agent/steps/pickEngineRag.ts` — Step 1 (RAG)
- `artifacts/api-server/src/agent/steps/recommendCategory.ts` — Step 2 (fan-out)
- `artifacts/api-server/src/agent/steps/scoreStack.ts` — Step 3 (deterministic /10 + LLM explanation)
- `artifacts/api-server/src/agent/prompts/advisorPrompts.ts` — English prompts for all steps
- `artifacts/api-server/src/data/knowledge/*.md` — guidance docs
- Tests: `services/scoring.test.ts`, `agent/steps/feasibility.test.ts`, `agent/steps/pickEngineRag.test.ts`, `agent/steps/recommendCategory.test.ts`, `lib/rag/retriever.test.ts`, plus live: `scripts/ragEval.ts`, `agent/advisorPipeline.integration.test.ts`
- `artifacts/game-dev-advisor/src/components/analyzer/FeasibilityBlock.tsx`

**Modify**
- `docker-compose.yml`, `artifacts/api-server/package.json`, `artifacts/api-server/.env(.example)`
- `artifacts/api-server/src/orchestrators/advisorOrchestrator.ts` (rewrite)
- `artifacts/api-server/src/controllers/advisorController.ts` (SSE event remap, drop trust)
- `artifacts/api-server/src/controllers/toolsController.ts` + `services/catalogService.ts` (serve new catalog, drop SQL)
- `artifacts/api-server/src/services/sessionService.ts` (drop trustScore/trustTier columns usage)
- `lib/db/src/schema/sessions.ts`, `lib/db/src/schema/index.ts` (drop tools + engineConstraints)
- `lib/api-spec/openapi.yaml` → codegen `lib/api-zod`, `lib/api-client-react`
- `artifacts/game-dev-advisor/src/components/analyzer/questions.ts`, `pages/Analyzer.tsx`, `components/analyzer/GeneratingState.tsx`
- `artifacts/api-server/src/data/toolCatalog.json` (rebuilt)
- `CLAUDE.md`

**Remove (Task 13)**
- `agent/steps/{analyze,retrieve,checkRetry,recommend,pickEngine}.ts` + their tests, `agent/state.ts`
- `agent/constraints/*`, `services/constraintService.ts`, `services/reasoningService.ts`
- `lib/rag/treeNavigator.ts`, `lib/rag/index.ts`, `data/toolTree.json`
- `lib/gameDevTools.ts`, `types/pdd.ts`, `types/tree.ts`, `types/agent.ts` (old), old `services/scoringService.ts`
- `scripts/buildTree.ts`, `scripts/evaluateScenarios.ts`
- `lib/db/src/schema/{tools,engineConstraints}.ts`, `lib/db/src/seed/tools.ts`, `lib/db/drizzle/0001_engine_constraints_seed.sql`

---

### Task 1: Infrastructure — Chroma service, dependencies, env

**Files:**
- Modify: `docker-compose.yml`
- Modify: `artifacts/api-server/package.json`
- Create: `artifacts/api-server/.env.example` (and update local `.env` if present)

- [ ] **Step 1: Add the Chroma service to docker-compose**

Edit `docker-compose.yml` — add under `services:` and extend `volumes:`. Pin a concrete tag (confirm the current stable tag on Docker Hub before committing; do not use `:latest`):

```yaml
  chroma:
    image: chromadb/chroma:0.6.3
    container_name: toolrecommender-chroma
    ports:
      - "8000:8000"
    volumes:
      - chroma-data:/data
    environment:
      IS_PERSISTENT: "TRUE"
      ANONYMIZED_TELEMETRY: "FALSE"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v2/heartbeat"]
      interval: 5s
      timeout: 3s
      retries: 20

volumes:
  mysql-data:
  chroma-data:
```

- [ ] **Step 2: Boot Chroma and verify it answers**

Run: `docker compose up -d chroma`
Then: `curl http://localhost:8000/api/v2/heartbeat`
Expected: JSON like `{"nanosecond heartbeat": <number>}` (HTTP 200).

- [ ] **Step 3: Install LangChain + Chroma client dependencies**

Run (each version must be ≥1 day old per `minimumReleaseAge: 1440`; let pnpm resolve the latest eligible):
```bash
pnpm --filter @workspace/api-server add @langchain/openai @langchain/community langchain chromadb
```
Expected: PASS, packages added to `artifacts/api-server/package.json` `dependencies`.

- [ ] **Step 4: Verify the workspace still type-checks**

Run: `pnpm run typecheck`
Expected: PASS (no source changed yet).

- [ ] **Step 5: Document env vars**

Create `artifacts/api-server/.env.example` (append if it exists):
```
PORT=3000
MYSQL_URL=mysql://root:root@localhost:3306/toolrecommender
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=gamedev_tools
```
Mirror these into the real `.env` used for local dev.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml artifacts/api-server/package.json artifacts/api-server/.env.example pnpm-lock.yaml
git commit -m "chore: add chroma service and langchain dependencies"
```

---

### Task 2: Knowledge base guidance docs

**Files:**
- Create: `artifacts/api-server/src/data/knowledge/whats-realistic-solo-dev.md`
- Create: `artifacts/api-server/src/data/knowledge/choosing-engine-unity-unreal-godot.md`
- Create: `artifacts/api-server/src/data/knowledge/ai-vs-traditional-asset-creation.md`
- Create: `artifacts/api-server/src/data/knowledge/low-budget-weak-art-playbook.md`

- [ ] **Step 1: Author `whats-realistic-solo-dev.md` (feeds the feasibility gate)**

Front-load the file with a YAML-ish heading the indexer can read as topic via filename. Content is plain markdown, ~150–300 words, English. Cover: realistic scope for solo/small teams within a budget tier; red-flag asks (AAA-scale clones, photorealistic open worlds, MMOs solo); what a beginner can ship in weeks vs. years. Example skeleton:

```markdown
# What's realistic for a solo or small-team developer

A solo beginner working in evenings can realistically ship a small, focused
game (a short narrative, a single-mechanic arcade game, a compact puzzle or
platformer) in weeks to a few months. ...

## Unrealistic asks (block these)
- Recreating a AAA open-world title (e.g. GTA-scale) solo in days or weeks.
- Photorealistic 3D worlds with no art capability and a low budget.
- A persistent online MMO as a first solo project.

## What scales with budget and team
...
```

- [ ] **Step 2: Author `choosing-engine-unity-unreal-godot.md`**

~200–350 words. When to pick Unity (mobile, cross-platform, C#, asset store), Unreal (high-fidelity 3D, Blueprints/C++, AAA visuals), Godot (lightweight, 2D-first, open-source, GDScript, beginner-friendly). Mention platform/skill/budget trade-offs so the engine step can cite it.

- [ ] **Step 3: Author `ai-vs-traditional-asset-creation.md`**

~200–350 words. The core rule: when skill/art capability is low AND budget is tight, AI tools (`toolNature: ai`, low learning curve — e.g. Meshy for 3D, Suno for music) beat high-curve traditional tools (Blender, DAWs). When craft control/quality matters and capability is high, traditional wins. Hybrid tools bridge both.

- [ ] **Step 4: Author `low-budget-weak-art-playbook.md`**

~150–250 words. Concrete stack guidance for a low-budget, weak-art-skill developer who still wants good-looking results: lean on AI generation, asset packs, stylized over realistic, free/freemium tools.

- [ ] **Step 5: Verify files exist and are non-empty**

Run: `ls artifacts/api-server/src/data/knowledge && wc -w artifacts/api-server/src/data/knowledge/*.md`
Expected: 4 files, each > 100 words.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/data/knowledge
git commit -m "feat: add RAG guidance knowledge base"
```

---

### Task 3: New catalog types + loader (additive)

**Files:**
- Create: `artifacts/api-server/src/types/catalog.ts`
- Create: `artifacts/api-server/src/lib/catalog.ts`
- Create: `artifacts/api-server/src/data/catalog.json` (temporary name; renamed to `toolCatalog.json` at cutover)
- Test: `artifacts/api-server/src/lib/catalog.test.ts`

- [ ] **Step 1: Write the catalog types + Zod schema**

Create `artifacts/api-server/src/types/catalog.ts`:
```ts
import { z } from "zod/v4";

export const CATEGORIES = ["game_engine", "art_asset", "vfx", "animation", "audio", "ai_coding"] as const;
export type Category = (typeof CATEGORIES)[number];

export const NON_ENGINE_CATEGORIES = ["art_asset", "vfx", "animation", "audio", "ai_coding"] as const;
export type NonEngineCategory = (typeof NON_ENGINE_CATEGORIES)[number];

export const ENGINES = ["Unity", "Unreal", "Godot"] as const;
export type EngineName = (typeof ENGINES)[number];

export const ENGINE_COMPAT = ["Unity", "Unreal", "Godot", "any"] as const;
export const TOOL_NATURES = ["ai", "traditional", "hybrid"] as const;
export const LEARNING_CURVES = ["low", "medium", "high"] as const;
export const PRICING = ["free", "open_source", "freemium", "paid", "subscription", "revenue_share", "enterprise"] as const;
export const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const PLATFORMS = ["pc", "mobile", "web", "console", "vr", "ar"] as const;

export const CATEGORY_LABELS: Record<Category, string> = {
  game_engine: "Game Engine",
  art_asset: "Art & Asset",
  vfx: "VFX",
  animation: "Animation",
  audio: "Audio",
  ai_coding: "AI Coding Tool",
};

export const ToolEntrySchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/, "id must be lowercase snake_case"),
  name: z.string().min(1),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  description: z.string().min(1),
  bestUseCase: z.string().min(1),
  toolNature: z.enum(TOOL_NATURES),
  learningCurve: z.enum(LEARNING_CURVES),
  engineCompatibility: z.array(z.enum(ENGINE_COMPAT)).min(1),
  pricing: z.enum(PRICING),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS),
  beginnerSuitability: z.number().int().min(0).max(100),
  supportedPlatforms: z.array(z.enum(PLATFORMS)).min(1),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  website: z.string().url().optional(),
});
export type ToolEntry = z.infer<typeof ToolEntrySchema>;

export const ToolCatalogSchema = z.array(ToolEntrySchema);
export type ToolCatalog = z.infer<typeof ToolCatalogSchema>;
```

- [ ] **Step 2: Seed a minimal 3-entry temporary catalog (full authoring is Task 4)**

Create `artifacts/api-server/src/data/catalog.json` with exactly these three valid entries so the loader + tests work before full authoring:
```json
[
  {
    "id": "unity",
    "name": "Unity",
    "categories": ["game_engine"],
    "description": "Cross-platform C# game engine with a large asset store and strong mobile support.",
    "bestUseCase": "Cross-platform 2D/3D games, especially mobile.",
    "toolNature": "traditional",
    "learningCurve": "medium",
    "engineCompatibility": ["Unity"],
    "pricing": "freemium",
    "difficultyLevel": "intermediate",
    "beginnerSuitability": 65,
    "supportedPlatforms": ["pc", "mobile", "web", "console", "vr", "ar"],
    "pros": ["Huge ecosystem", "Cross-platform", "C# tooling"],
    "cons": ["Editor can feel heavy", "Licensing changes have been controversial"],
    "website": "https://unity.com"
  },
  {
    "id": "blender",
    "name": "Blender",
    "categories": ["art_asset", "vfx", "animation"],
    "description": "Free open-source 3D creation suite for modeling, sculpting, texturing, rigging, animation, and VFX.",
    "bestUseCase": "End-to-end 3D asset and animation production.",
    "toolNature": "traditional",
    "learningCurve": "high",
    "engineCompatibility": ["any"],
    "pricing": "open_source",
    "difficultyLevel": "advanced",
    "beginnerSuitability": 30,
    "supportedPlatforms": ["pc"],
    "pros": ["Free and open-source", "Full 3D pipeline", "Large community"],
    "cons": ["Steep learning curve", "Demanding for low-end machines"],
    "website": "https://www.blender.org"
  },
  {
    "id": "meshy",
    "name": "Meshy",
    "categories": ["art_asset"],
    "description": "AI tool that generates 3D models from text or images, suitable for fast asset prototyping.",
    "bestUseCase": "Generating 3D assets quickly without modeling skills.",
    "toolNature": "ai",
    "learningCurve": "low",
    "engineCompatibility": ["any"],
    "pricing": "freemium",
    "difficultyLevel": "beginner",
    "beginnerSuitability": 90,
    "supportedPlatforms": ["web"],
    "pros": ["No modeling skill required", "Very fast", "Engine-agnostic exports"],
    "cons": ["Limited fine control", "Quality varies by prompt"],
    "website": "https://www.meshy.ai"
  }
]
```

- [ ] **Step 3: Write the loader**

Create `artifacts/api-server/src/lib/catalog.ts`:
```ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ToolCatalogSchema, CATEGORIES, CATEGORY_LABELS, type Category, type ToolEntry } from "../types/catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// NOTE: Task 13 renames data/catalog.json -> data/toolCatalog.json; update this path then.
const catalogPath = resolve(__dirname, "../data/catalog.json");

function loadCatalog(): ToolEntry[] {
  const raw = JSON.parse(readFileSync(catalogPath, "utf8"));
  const parsed = ToolCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`catalog failed validation: ${JSON.stringify(parsed.error.format())}`);
  }
  const ids = new Set<string>();
  for (const t of parsed.data) {
    if (ids.has(t.id)) throw new Error(`duplicate tool id: ${t.id}`);
    ids.add(t.id);
  }
  return parsed.data;
}

export const TOOL_CATALOG: readonly ToolEntry[] = loadCatalog();
export const TOOL_BY_ID: ReadonlyMap<string, ToolEntry> = new Map(TOOL_CATALOG.map((t) => [t.id, t]));

export function toolsInCategory(category: Category): ToolEntry[] {
  return TOOL_CATALOG.filter((t) => t.categories.includes(category));
}

export const CATEGORY_LIST = CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id] }));
```

- [ ] **Step 4: Write the failing test**

Create `artifacts/api-server/src/lib/catalog.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { TOOL_CATALOG, TOOL_BY_ID, toolsInCategory } from "./catalog.js";

test("catalog loads and validates against the schema", () => {
  assert.ok(TOOL_CATALOG.length >= 3);
});

test("tool ids are unique and indexed", () => {
  assert.equal(TOOL_BY_ID.size, TOOL_CATALOG.length);
  assert.equal(TOOL_BY_ID.get("unity")?.name, "Unity");
});

test("multi-membership category filtering works", () => {
  const artTools = toolsInCategory("art_asset").map((t) => t.id);
  assert.ok(artTools.includes("blender"));
  assert.ok(artTools.includes("meshy"));
});
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/catalog.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Type-check + commit**

Run: `pnpm run typecheck` → PASS.
```bash
git add artifacts/api-server/src/types/catalog.ts artifacts/api-server/src/lib/catalog.ts artifacts/api-server/src/data/catalog.json artifacts/api-server/src/lib/catalog.test.ts
git commit -m "feat: add new 6-category catalog types and loader"
```

---

### Task 4: Author the full catalog data

**Files:**
- Modify: `artifacts/api-server/src/data/catalog.json`

> This is data authoring, not code. The loader from Task 3 validates it at boot. The **user reviews for accuracy** after this task.

- [ ] **Step 1: Author all entries**

Expand `data/catalog.json` to the full set. Migrate the ~40 still-relevant entries from the old `toolCatalog.json` (engines, art, audio, AI coding), re-tag to the 6 categories, fill the new fields, and add missing AI tools. Minimum required coverage so retrieval never returns an empty category:

- `game_engine` (exactly 3, `engineCompatibility` = its own name): `unity`, `unreal_engine`, `godot`.
- `art_asset` (≥6, mix of natures): `blender` (traditional), `meshy` (ai), `aseprite` (traditional), `krita` (traditional), `substance_painter` (traditional/hybrid), `scenario` or `leonardo_ai` (ai).
- `vfx` (≥3): `houdini` (traditional), `embergen` (traditional), `blender` (re-tagged via `categories`), plus an AI option if one fits.
- `animation` (≥3): `blender`, `mixamo` (ai-ish/traditional), `cascadeur` (hybrid), `live2d_cubism`.
- `audio` (≥5, music + SFX + sound design combined): `audacity`, `reaper`, `fmod_studio`, `wwise`, `bfxr`, `suno` (ai music), `elevenlabs` (ai voice).
- `ai_coding` (≥3): `github_copilot`, `cursor`, `codeium`.

For each entry set `toolNature`, `learningCurve`, `engineCompatibility` (use `["any"]` for engine-agnostic creative tools; engine plugins list specific engines), `difficultyLevel`, `beginnerSuitability`, `supportedPlatforms`, `pros`, `cons`, `website`. Tools that span categories (Blender) list all in `categories`.

- [ ] **Step 2: Validate by booting the loader**

Run: `pnpm --filter @workspace/api-server exec tsx -e "import('./src/lib/catalog.ts').then(m => console.log('tools:', m.TOOL_CATALOG.length, 'engines:', m.toolsInCategory('game_engine').map(t=>t.id)))"`
Expected: prints the count and exactly `['unity','unreal_engine','godot']` for engines. Any schema error fails loudly here.

- [ ] **Step 3: Re-run the catalog test**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/catalog.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/data/catalog.json
git commit -m "feat: author full 6-category tool catalog"
```

- [ ] **Step 5: Request user review**

Pause and ask the user to review `data/catalog.json` for factual accuracy (pricing, learning curve, engine compatibility) before relying on it for recommendations.

---

### Task 5: RAG primitives — embeddings, chat model, vector store

**Files:**
- Create: `artifacts/api-server/src/lib/rag/embeddings.ts`
- Create: `artifacts/api-server/src/lib/rag/chatModel.ts`
- Create: `artifacts/api-server/src/lib/rag/vectorStore.ts`

- [ ] **Step 1: Embeddings factory**

Create `artifacts/api-server/src/lib/rag/embeddings.ts`:
```ts
import { OpenAIEmbeddings } from "@langchain/openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OpenAI API key missing for embeddings.");

export const embeddings = new OpenAIEmbeddings({
  apiKey,
  model: "text-embedding-3-small",
  configuration: { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL },
});
```

- [ ] **Step 2: Chat model factory**

Create `artifacts/api-server/src/lib/rag/chatModel.ts`:
```ts
import { ChatOpenAI } from "@langchain/openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OpenAI API key missing for chat model.");

export function chatModel(): ChatOpenAI {
  return new ChatOpenAI({
    apiKey,
    model: "gpt-4o-mini",
    temperature: 0,
    configuration: { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL },
  });
}
```

- [ ] **Step 3: Vector store accessor**

Create `artifacts/api-server/src/lib/rag/vectorStore.ts`:
```ts
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { embeddings } from "./embeddings.js";

export const COLLECTION_NAME = process.env.CHROMA_COLLECTION ?? "gamedev_tools";
const CHROMA_URL = process.env.CHROMA_URL ?? "http://localhost:8000";

export function getVectorStore(): Chroma {
  return new Chroma(embeddings, {
    collectionName: COLLECTION_NAME,
    url: CHROMA_URL,
    collectionMetadata: { "hnsw:space": "cosine" },
  });
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm run typecheck`
Expected: PASS. (If `@langchain/community` Chroma import path differs in the installed version, confirm the export path via `node -e "console.log(require.resolve('@langchain/community/vectorstores/chroma'))"` and adjust.)

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/rag/embeddings.ts artifacts/api-server/src/lib/rag/chatModel.ts artifacts/api-server/src/lib/rag/vectorStore.ts
git commit -m "feat: add RAG embeddings, chat model, and vector store accessors"
```

---

### Task 6: Indexer + `rag:index` script

**Files:**
- Create: `artifacts/api-server/src/lib/rag/indexer.ts`
- Create: `artifacts/api-server/src/scripts/indexRag.ts`
- Modify: `artifacts/api-server/package.json` (add `rag:index` script)
- Test: `artifacts/api-server/src/lib/rag/indexer.test.ts`

- [ ] **Step 1: Write the document builders (pure, testable)**

Create `artifacts/api-server/src/lib/rag/indexer.ts`:
```ts
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document } from "@langchain/core/documents";
import { TOOL_CATALOG } from "../catalog.js";
import type { ToolEntry } from "../../types/catalog.js";
import { getVectorStore } from "./vectorStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const knowledgeDir = resolve(__dirname, "../../data/knowledge");

// One document PER (tool × category) because Chroma metadata must be scalar.
export function toolDocuments(catalog: readonly ToolEntry[] = TOOL_CATALOG): Document[] {
  const docs: Document[] = [];
  for (const t of catalog) {
    const pageContent = [
      t.name,
      t.description,
      `Best use case: ${t.bestUseCase}`,
      `Pros: ${t.pros.join(", ")}`,
      `Cons: ${t.cons.join(", ")}`,
      `Pricing: ${t.pricing}`,
      `Nature: ${t.toolNature}`,
      `Learning curve: ${t.learningCurve}`,
    ].join("\n");
    const compat = new Set(t.engineCompatibility);
    for (const category of t.categories) {
      docs.push(
        new Document({
          id: `tool__${t.id}__${category}`,
          pageContent,
          metadata: {
            type: "tool",
            toolId: t.id,
            name: t.name,
            category,
            toolNature: t.toolNature,
            pricing: t.pricing,
            learningCurve: t.learningCurve,
            engine_unity: compat.has("Unity"),
            engine_unreal: compat.has("Unreal"),
            engine_godot: compat.has("Godot"),
            engine_any: compat.has("any"),
          },
        }),
      );
    }
  }
  return docs;
}

export function guidanceDocuments(): Document[] {
  return readdirSync(knowledgeDir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const topic = file.replace(/\.md$/, "");
      return new Document({
        id: `guidance__${topic}`,
        pageContent: readFileSync(resolve(knowledgeDir, file), "utf8"),
        metadata: { type: "guidance", topic },
      });
    });
}

export async function buildIndex(): Promise<{ toolDocs: number; guidanceDocs: number }> {
  const tDocs = toolDocuments();
  const gDocs = guidanceDocuments();
  const all = [...tDocs, ...gDocs];
  const store = getVectorStore();
  // Upsert by id so re-runs replace rather than duplicate.
  await store.addDocuments(all, { ids: all.map((d) => d.id as string) });
  return { toolDocs: tDocs.length, guidanceDocs: gDocs.length };
}
```

- [ ] **Step 2: Write the failing test (pure builders only — no network)**

Create `artifacts/api-server/src/lib/rag/indexer.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { toolDocuments, guidanceDocuments } from "./indexer.js";

test("blender produces one document per category", () => {
  const docs = toolDocuments();
  const blender = docs.filter((d) => d.metadata.toolId === "blender");
  assert.ok(blender.length >= 2);
  for (const d of blender) {
    assert.equal(typeof d.metadata.category, "string");
    assert.equal(d.metadata.engine_any, true);
  }
});

test("engine docs flatten compatibility into booleans", () => {
  const unity = toolDocuments().find((d) => d.metadata.toolId === "unity");
  assert.equal(unity?.metadata.engine_unity, true);
  assert.equal(unity?.metadata.engine_unreal, false);
});

test("guidance docs are loaded with topic metadata", () => {
  const g = guidanceDocuments();
  assert.ok(g.length >= 4);
  assert.ok(g.every((d) => d.metadata.type === "guidance" && typeof d.metadata.topic === "string"));
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/indexer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Write the script entrypoint**

Create `artifacts/api-server/src/scripts/indexRag.ts`:
```ts
import "dotenv/config";
import { buildIndex } from "../lib/rag/indexer.js";

buildIndex()
  .then(({ toolDocs, guidanceDocs }) => {
    console.log(`Indexed ${toolDocs} tool docs + ${guidanceDocs} guidance docs into Chroma.`);
  })
  .catch((err) => {
    console.error("RAG indexing failed:", err);
    process.exitCode = 1;
  });
```

Add to `artifacts/api-server/package.json` `scripts`:
```json
"rag:index": "tsx ./src/scripts/indexRag.ts"
```

- [ ] **Step 5: Run the indexer against live Chroma (LIVE — needs Chroma + API key)**

Run: `docker compose up -d chroma && pnpm --filter @workspace/api-server run rag:index`
Expected: `Indexed <N> tool docs + 4 guidance docs into Chroma.` (N = total tool×category pairs).

- [ ] **Step 6: Type-check + commit**

Run: `pnpm run typecheck` → PASS.
```bash
git add artifacts/api-server/src/lib/rag/indexer.ts artifacts/api-server/src/lib/rag/indexer.test.ts artifacts/api-server/src/scripts/indexRag.ts artifacts/api-server/package.json
git commit -m "feat: add RAG indexer and rag:index script"
```

---

### Task 7: Metadata-filtered retriever

**Files:**
- Create: `artifacts/api-server/src/lib/rag/retriever.ts`
- Test: `artifacts/api-server/src/lib/rag/retriever.test.ts`

- [ ] **Step 1: Write the `where`-clause builders + retrieval helpers**

Create `artifacts/api-server/src/lib/rag/retriever.ts`:
```ts
import type { Document } from "@langchain/core/documents";
import type { Category, EngineName } from "../../types/catalog.js";
import { getVectorStore } from "./vectorStore.js";

const TOOL_K = 5;
const GUIDANCE_K = 2;

type Where = Record<string, unknown>;

// Chroma metadata is scalar-only; engine compatibility is matched via boolean flags.
export function engineFlagKey(engine: EngineName): "engine_unity" | "engine_unreal" | "engine_godot" {
  return engine === "Unity" ? "engine_unity" : engine === "Unreal" ? "engine_unreal" : "engine_godot";
}

export function toolWhereForCategory(category: Category, picked?: EngineName): Where {
  const clauses: Where[] = [{ type: { $eq: "tool" } }, { category: { $eq: category } }];
  if (picked) {
    clauses.push({ $or: [{ [engineFlagKey(picked)]: { $eq: true } }, { engine_any: { $eq: true } }] });
  }
  return { $and: clauses };
}

export function guidanceWhere(topic?: string): Where {
  return topic ? { $and: [{ type: { $eq: "guidance" } }, { topic: { $eq: topic } }] } : { type: { $eq: "guidance" } };
}

export interface RetrievedCandidates { toolDocs: Document[]; guidanceDocs: Document[]; toolIds: string[]; }

async function search(query: string, k: number, where: Where): Promise<Document[]> {
  return getVectorStore().similaritySearch(query, k, where);
}

export async function retrieveEngineDocs(query: string): Promise<RetrievedCandidates> {
  const [toolDocs, guidanceDocs] = await Promise.all([
    search(query, 3, toolWhereForCategory("game_engine")),
    search(query, 1, guidanceWhere("choosing-engine-unity-unreal-godot")),
  ]);
  return { toolDocs, guidanceDocs, toolIds: uniqueToolIds(toolDocs) };
}

export async function retrieveForCategory(query: string, category: Category, picked: EngineName): Promise<RetrievedCandidates> {
  const [toolDocs, guidanceDocs] = await Promise.all([
    search(query, TOOL_K, toolWhereForCategory(category, picked)),
    search(query, GUIDANCE_K, guidanceWhere()),
  ]);
  return { toolDocs, guidanceDocs, toolIds: uniqueToolIds(toolDocs) };
}

export async function retrieveFeasibilityContext(query: string): Promise<Document[]> {
  return search(query, GUIDANCE_K, guidanceWhere("whats-realistic-solo-dev"));
}

function uniqueToolIds(docs: Document[]): string[] {
  return [...new Set(docs.map((d) => d.metadata.toolId as string))];
}
```

- [ ] **Step 2: Write the failing test (pure `where` builders — no network)**

Create `artifacts/api-server/src/lib/rag/retriever.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { toolWhereForCategory, guidanceWhere, engineFlagKey } from "./retriever.js";

test("engineFlagKey maps engine names to boolean metadata keys", () => {
  assert.equal(engineFlagKey("Unreal"), "engine_unreal");
});

test("category where without engine omits the engine clause", () => {
  assert.deepEqual(toolWhereForCategory("audio"), {
    $and: [{ type: { $eq: "tool" } }, { category: { $eq: "audio" } }],
  });
});

test("category where with engine includes picked OR any", () => {
  const where = toolWhereForCategory("art_asset", "Unity") as { $and: unknown[] };
  assert.deepEqual(where.$and[2], { $or: [{ engine_unity: { $eq: true } }, { engine_any: { $eq: true } }] });
});

test("guidanceWhere filters by topic when provided", () => {
  assert.deepEqual(guidanceWhere("x"), { $and: [{ type: { $eq: "guidance" } }, { topic: { $eq: "x" } }] });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/retriever.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 4: Smoke-test retrieval against live Chroma (LIVE)**

Run: `pnpm --filter @workspace/api-server exec tsx -e "import('./src/lib/rag/retriever.ts').then(async m => { const r = await m.retrieveForCategory('weak art skills, low budget, good-looking 3D models', 'art_asset', 'Unity'); console.log(r.toolIds); })"`
Expected: `meshy` appears in the returned `toolIds` (low-curve AI tool surfaces for weak-art + low-budget query).

- [ ] **Step 5: Type-check + commit**

Run: `pnpm run typecheck` → PASS.
```bash
git add artifacts/api-server/src/lib/rag/retriever.ts artifacts/api-server/src/lib/rag/retriever.test.ts
git commit -m "feat: add metadata-filtered Chroma retriever"
```

---

### Task 8: Deterministic /10 scorer

**Files:**
- Create: `artifacts/api-server/src/services/scoring.ts`
- Test: `artifacts/api-server/src/services/scoring.test.ts`

- [ ] **Step 1: Write the failing test first (TDD)**

Create `artifacts/api-server/src/services/scoring.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { scoreTool, type ScoringContext } from "./scoring.js";
import type { ToolEntry } from "../types/catalog.js";

const meshy: ToolEntry = {
  id: "meshy", name: "Meshy", categories: ["art_asset"], description: "x", bestUseCase: "x",
  toolNature: "ai", learningCurve: "low", engineCompatibility: ["any"], pricing: "freemium",
  difficultyLevel: "beginner", beginnerSuitability: 90, supportedPlatforms: ["web"],
  pros: ["x"], cons: ["x"],
};
const blender: ToolEntry = {
  ...meshy, id: "blender", name: "Blender", toolNature: "traditional", learningCurve: "high",
  pricing: "open_source", difficultyLevel: "advanced", beginnerSuitability: 30, supportedPlatforms: ["pc"],
};

const weakArtLowBudget: ScoringContext = {
  budget: "low", skillLevel: "beginner", artCapability: "none",
  platformTarget: ["pc"], pickedEngine: "Unity", category: "art_asset", paidPriorityCategories: [],
};

test("scores are clamped to 0-10", () => {
  const s = scoreTool(meshy, weakArtLowBudget);
  assert.ok(s >= 0 && s <= 10);
});

test("AI low-curve tool beats high-curve tool for weak-art + low-budget", () => {
  assert.ok(scoreTool(meshy, weakArtLowBudget) > scoreTool(blender, weakArtLowBudget));
});

test("engine-incompatible tool is penalized", () => {
  const unityOnly: ToolEntry = { ...blender, engineCompatibility: ["Unity"] };
  const forUnreal: ScoringContext = { ...weakArtLowBudget, pickedEngine: "Unreal", category: "art_asset" };
  const forUnity: ScoringContext = { ...weakArtLowBudget, pickedEngine: "Unity", category: "art_asset" };
  assert.ok(scoreTool(unityOnly, forUnity) > scoreTool(unityOnly, forUnreal));
});

test("paid-priority category relaxes the budget penalty", () => {
  const paidTool: ToolEntry = { ...blender, pricing: "subscription" };
  const strict: ScoringContext = { ...weakArtLowBudget, paidPriorityCategories: [] };
  const relaxed: ScoringContext = { ...weakArtLowBudget, paidPriorityCategories: ["art_asset"] };
  assert.ok(scoreTool(paidTool, relaxed) >= scoreTool(paidTool, strict));
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/services/scoring.test.ts`
Expected: FAIL with "Cannot find module './scoring.js'".

- [ ] **Step 3: Implement the scorer**

Create `artifacts/api-server/src/services/scoring.ts`:
```ts
import type { Category, EngineName, ToolEntry } from "../types/catalog.js";

export interface ScoringContext {
  budget: "low" | "medium" | "high" | "enterprise";
  skillLevel: "beginner" | "intermediate" | "advanced" | "expert";
  artCapability: "none" | "basic" | "intermediate" | "advanced" | "professional";
  platformTarget: string[];
  pickedEngine: EngineName;
  category: Category;
  paidPriorityCategories: string[];
}

const WEIGHTS = { budget: 0.2, skill: 0.15, platform: 0.15, art: 0.15, ai: 0.15, engine: 0.2 } as const;

const BUDGET_ALLOWED: Record<ScoringContext["budget"], ToolEntry["pricing"][]> = {
  low: ["free", "open_source", "freemium"],
  medium: ["free", "open_source", "freemium", "subscription"],
  high: ["free", "open_source", "freemium", "paid", "subscription", "revenue_share"],
  enterprise: ["free", "open_source", "freemium", "paid", "subscription", "revenue_share", "enterprise"],
};
const SKILL_RANK = { beginner: 0, intermediate: 1, advanced: 2, expert: 2 } as const;
const DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;
const ART_RANK = { none: 0, basic: 1, intermediate: 2, advanced: 3, professional: 4 } as const;
const CURVE_RANK = { low: 0, medium: 1, high: 2 } as const;
const ART_CATEGORIES: Category[] = ["art_asset", "vfx", "animation"];

function budgetFit(t: ToolEntry, ctx: ScoringContext): number {
  if (BUDGET_ALLOWED[ctx.budget].includes(t.pricing)) return 1;
  return ctx.paidPriorityCategories.includes(ctx.category) ? 0.7 : 0.2;
}
function skillFit(t: ToolEntry, ctx: ScoringContext): number {
  const gap = DIFFICULTY_RANK[t.difficultyLevel] - SKILL_RANK[ctx.skillLevel];
  return gap <= 0 ? 1 : Math.max(0, 1 - gap * 0.5);
}
function platformFit(t: ToolEntry, ctx: ScoringContext): number {
  if (ctx.platformTarget.length === 0) return 0.5;
  const supported = new Set(t.supportedPlatforms as readonly string[]);
  const matched = ctx.platformTarget.filter((p) => supported.has(p)).length;
  return matched / ctx.platformTarget.length;
}
function artFit(t: ToolEntry, ctx: ScoringContext): number {
  if (!ART_CATEGORIES.includes(ctx.category)) return 1;
  const gap = CURVE_RANK[t.learningCurve] - ART_RANK[ctx.artCapability] / 2;
  return gap <= 0 ? 1 : Math.max(0, 1 - gap * 0.4);
}
// When skill/art is low and budget tight, AI / low-curve tools are more appropriate.
function aiAppropriateness(t: ToolEntry, ctx: ScoringContext): number {
  const constrained = ctx.budget === "low" && (ctx.skillLevel === "beginner" || ART_RANK[ctx.artCapability] <= 1);
  if (!constrained) return t.toolNature === "ai" || t.learningCurve === "low" ? 0.8 : 0.7;
  if (t.toolNature === "ai" || t.learningCurve === "low") return 1;
  return t.learningCurve === "high" ? 0.3 : 0.6;
}
function engineFit(t: ToolEntry, ctx: ScoringContext): number {
  if (ctx.category === "game_engine") return t.id === ctx.pickedEngine.toLowerCase() || t.engineCompatibility.includes(ctx.pickedEngine) ? 1 : 0.3;
  return t.engineCompatibility.includes("any") || t.engineCompatibility.includes(ctx.pickedEngine) ? 1 : 0.2;
}

export function scoreTool(t: ToolEntry, ctx: ScoringContext): number {
  const raw =
    WEIGHTS.budget * budgetFit(t, ctx) +
    WEIGHTS.skill * skillFit(t, ctx) +
    WEIGHTS.platform * platformFit(t, ctx) +
    WEIGHTS.art * artFit(t, ctx) +
    WEIGHTS.ai * aiAppropriateness(t, ctx) +
    WEIGHTS.engine * engineFit(t, ctx);
  return Math.round(raw * 10 * 10) / 10; // 0-10, one decimal
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/services/scoring.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check + commit**

Run: `pnpm run typecheck` → PASS.
```bash
git add artifacts/api-server/src/services/scoring.ts artifacts/api-server/src/services/scoring.test.ts
git commit -m "feat: add deterministic 0-10 scorer with AI-vs-traditional weighting"
```

---

### Task 9: Feasibility step (Round 0)

**Files:**
- Create: `artifacts/api-server/src/agent/prompts/advisorPrompts.ts`
- Create: `artifacts/api-server/src/agent/steps/feasibility.ts`
- Test: `artifacts/api-server/src/agent/steps/feasibility.test.ts`

- [ ] **Step 1: Start the shared prompts module with the feasibility schema + prompt**

Create `artifacts/api-server/src/agent/prompts/advisorPrompts.ts`:
```ts
import { z } from "zod/v4";
import { NON_ENGINE_CATEGORIES } from "../../types/catalog.js";

export const FeasibilitySchema = z.object({
  feasible: z.boolean(),
  reason: z.string().min(1),
  targetCategories: z.array(z.enum(NON_ENGINE_CATEGORIES)),
});
export type FeasibilityShape = z.infer<typeof FeasibilitySchema>;

export function feasibilitySystemPrompt(): string {
  return [
    "You are a pragmatic game-development feasibility reviewer.",
    "Given a project idea and constraints, decide whether the project is realistically achievable.",
    "Block ONLY clearly unrealistic asks (e.g. a solo dev cloning a AAA open-world game in a week).",
    "If feasible, pick the non-engine categories this project actually needs from:",
    NON_ENGINE_CATEGORIES.join(", ") + ".",
    "Skip categories the project does not need (e.g. a text-only game needs no animation or vfx).",
    "Answer in English. Keep the reason to 1-2 sentences.",
  ].join("\n");
}

export function feasibilityUserPrompt(input: {
  projectIdea: string; budget: string; skillLevel: string; teamSize: string;
  artCapability: string; platformTarget: string[];
}, guidance: string): string {
  return [
    `Project idea: ${input.projectIdea}`,
    `Budget: ${input.budget}, Skill: ${input.skillLevel}, Team: ${input.teamSize}, Art capability: ${input.artCapability}`,
    `Platforms: ${input.platformTarget.join(", ") || "unspecified"}`,
    "",
    "Reference guidance:",
    guidance || "(none retrieved)",
  ].join("\n");
}
```

- [ ] **Step 2: Write the step**

Create `artifacts/api-server/src/agent/steps/feasibility.ts`:
```ts
import { chatModel } from "../../lib/rag/chatModel.js";
import { retrieveFeasibilityContext } from "../../lib/rag/retriever.js";
import type { AdvisorInput, FeasibilityDecision } from "../../types/advisor.js";
import { FeasibilitySchema, feasibilitySystemPrompt, feasibilityUserPrompt } from "../prompts/advisorPrompts.js";

export async function runFeasibility(input: AdvisorInput): Promise<FeasibilityDecision> {
  const guidanceDocs = await retrieveFeasibilityContext(
    `${input.projectIdea} budget ${input.budget} skill ${input.skillLevel} team ${input.teamSize}`,
  );
  const guidance = guidanceDocs.map((d) => d.pageContent).join("\n---\n");
  const model = chatModel().withStructuredOutput(FeasibilitySchema, { name: "feasibility_decision" });
  const result = await model.invoke([
    { role: "system", content: feasibilitySystemPrompt() },
    { role: "user", content: feasibilityUserPrompt(input, guidance) },
  ]);
  return normalizeFeasibility(result);
}

// If blocked, targetCategories is irrelevant — force empty so downstream never fans out.
export function normalizeFeasibility(d: FeasibilityDecision): FeasibilityDecision {
  return d.feasible ? d : { ...d, targetCategories: [] };
}
```

- [ ] **Step 3: Write the failing test (pure `normalizeFeasibility` — no network)**

Create `artifacts/api-server/src/agent/steps/feasibility.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFeasibility } from "./feasibility.js";

test("blocked decision drops targetCategories", () => {
  const out = normalizeFeasibility({ feasible: false, reason: "Too ambitious for a solo dev in a week.", targetCategories: ["art_asset", "audio"] });
  assert.deepEqual(out.targetCategories, []);
});

test("feasible decision keeps targetCategories", () => {
  const out = normalizeFeasibility({ feasible: true, reason: "Reasonable scope.", targetCategories: ["audio"] });
  assert.deepEqual(out.targetCategories, ["audio"]);
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/agent/steps/feasibility.test.ts`
Expected: PASS (2 tests). (Add `types/advisor.ts` from the canonical surface above if not yet created — create it now.)

- [ ] **Step 5: Type-check + commit**

Run: `pnpm run typecheck` → PASS.
```bash
git add artifacts/api-server/src/types/advisor.ts artifacts/api-server/src/agent/prompts/advisorPrompts.ts artifacts/api-server/src/agent/steps/feasibility.ts artifacts/api-server/src/agent/steps/feasibility.test.ts
git commit -m "feat: add feasibility gate step"
```

---

### Task 10: Engine pick step (RAG)

**Files:**
- Modify: `artifacts/api-server/src/agent/prompts/advisorPrompts.ts` (add engine schema/prompt)
- Create: `artifacts/api-server/src/agent/steps/pickEngineRag.ts`
- Test: `artifacts/api-server/src/agent/steps/pickEngineRag.test.ts`

- [ ] **Step 1: Add engine schema + prompt + invariant helper to `advisorPrompts.ts`**

Append to `artifacts/api-server/src/agent/prompts/advisorPrompts.ts`:
```ts
import { ENGINES } from "../../types/catalog.js";

export const EngineDecisionSchema = z.object({
  picked: z.enum(ENGINES),
  userPreferred: z.enum(ENGINES).nullable(),
  agreement: z.enum(["agreed", "challenged", "user_silent"]),
  reasoning: z.string().min(1),
  alternativesConsidered: z.array(z.object({ engine: z.enum(ENGINES), reasonRejected: z.string().min(1) })),
});
export type EngineDecisionShape = z.infer<typeof EngineDecisionSchema>;

export function engineSystemPrompt(): string {
  return [
    "You are a senior game engine consultant. Choose exactly one of Unity, Unreal, or Godot.",
    "Parse any engine the user mentioned in their idea. You MAY challenge their choice with reasoning if another engine fits better.",
    "Set userPreferred to the engine the user mentioned, or null if they mentioned none.",
    "agreement rules: 'user_silent' if userPreferred is null; 'agreed' if picked === userPreferred; 'challenged' if picked !== userPreferred.",
    "Only use the provided engine docs and guidance as evidence. Answer in English.",
  ].join("\n");
}

export function engineUserPrompt(idea: string, context: string): string {
  return [`Project idea: ${idea}`, "", "Engine docs and guidance:", context].join("\n");
}
```

- [ ] **Step 2: Write the step + invariant assertion**

Create `artifacts/api-server/src/agent/steps/pickEngineRag.ts`:
```ts
import { chatModel } from "../../lib/rag/chatModel.js";
import { retrieveEngineDocs } from "../../lib/rag/retriever.js";
import type { AdvisorInput, EngineDecision } from "../../types/advisor.js";
import { EngineDecisionSchema, engineSystemPrompt, engineUserPrompt } from "../prompts/advisorPrompts.js";

export async function runPickEngine(input: AdvisorInput): Promise<EngineDecision> {
  const { toolDocs, guidanceDocs } = await retrieveEngineDocs(input.projectIdea);
  const context = [...toolDocs, ...guidanceDocs].map((d) => d.pageContent).join("\n---\n");
  const model = chatModel().withStructuredOutput(EngineDecisionSchema, { name: "engine_decision" });
  const decision = await model.invoke([
    { role: "system", content: engineSystemPrompt() },
    { role: "user", content: engineUserPrompt(input.projectIdea, context) },
  ]);
  assertEngineInvariant(decision);
  return decision;
}

export function assertEngineInvariant(d: EngineDecision): void {
  if (d.userPreferred === null && d.agreement !== "user_silent") {
    throw new Error("agreement must be user_silent when no engine was mentioned");
  }
  if (d.userPreferred !== null && d.picked === d.userPreferred && d.agreement !== "agreed") {
    throw new Error("agreement must be agreed when picked === userPreferred");
  }
  if (d.userPreferred !== null && d.picked !== d.userPreferred && d.agreement !== "challenged") {
    throw new Error("agreement must be challenged when picked !== userPreferred");
  }
}
```

- [ ] **Step 3: Write the failing test (pure invariant — no network)**

Create `artifacts/api-server/src/agent/steps/pickEngineRag.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { assertEngineInvariant } from "./pickEngineRag.js";

test("user_silent required when no engine mentioned", () => {
  assert.throws(() => assertEngineInvariant({ picked: "Unity", userPreferred: null, agreement: "agreed", reasoning: "x", alternativesConsidered: [] }));
});

test("challenged required when picked differs from preference", () => {
  assert.throws(() => assertEngineInvariant({ picked: "Godot", userPreferred: "Unreal", agreement: "agreed", reasoning: "x", alternativesConsidered: [] }));
});

test("valid agreed decision passes", () => {
  assert.doesNotThrow(() => assertEngineInvariant({ picked: "Unity", userPreferred: "Unity", agreement: "agreed", reasoning: "x", alternativesConsidered: [] }));
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/agent/steps/pickEngineRag.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check + commit**

Run: `pnpm run typecheck` → PASS.
```bash
git add artifacts/api-server/src/agent/prompts/advisorPrompts.ts artifacts/api-server/src/agent/steps/pickEngineRag.ts artifacts/api-server/src/agent/steps/pickEngineRag.test.ts
git commit -m "feat: add RAG-backed engine pick step"
```

---

### Task 11: Per-category recommend step (fan-out)

**Files:**
- Modify: `artifacts/api-server/src/agent/prompts/advisorPrompts.ts` (add per-category schema/prompt)
- Create: `artifacts/api-server/src/agent/steps/recommendCategory.ts`
- Test: `artifacts/api-server/src/agent/steps/recommendCategory.test.ts`

- [ ] **Step 1: Add the per-category schema builder + prompt**

Append to `artifacts/api-server/src/agent/prompts/advisorPrompts.ts`:
```ts
// Built per-request so the model can only choose from retrieved candidate ids.
export function buildCategorySchema(candidateIds: string[]) {
  const idEnum = z.enum(candidateIds as [string, ...string[]]);
  const item = z.object({
    toolId: idEnum,
    reasoning: z.string().min(1),
    pros: z.array(z.string().min(1)).min(1),
    cons: z.array(z.string().min(1)).min(1),
  });
  return z.object({ primary: item, alternatives: z.array(item).max(2), reasoning: z.string().min(1) });
}

export function categorySystemPrompt(category: string): string {
  return [
    `You recommend tools for the "${category}" category of a game project.`,
    "Choose ONE primary tool and up to 2 alternatives, ONLY from the provided candidates.",
    "Apply the AI-vs-traditional rule: when skill/art capability is low and budget is tight,",
    "prefer ai / low-learning-curve tools (e.g. Meshy) over high-curve standalone tools (e.g. Blender), and say why.",
    "Answer in English.",
  ].join("\n");
}

export function categoryUserPrompt(args: {
  idea: string; budget: string; skillLevel: string; artCapability: string; category: string; candidates: string;
}): string {
  return [
    `Project idea: ${args.idea}`,
    `Budget: ${args.budget}, Skill: ${args.skillLevel}, Art capability: ${args.artCapability}`,
    `Category: ${args.category}`,
    "",
    "Candidate tools (choose only from these):",
    args.candidates,
  ].join("\n");
}
```

- [ ] **Step 2: Write the step (single category) + a guard helper**

Create `artifacts/api-server/src/agent/steps/recommendCategory.ts`:
```ts
import { chatModel } from "../../lib/rag/chatModel.js";
import { retrieveForCategory } from "../../lib/rag/retriever.js";
import type { Category, EngineName } from "../../types/catalog.js";
import type { AdvisorInput, CategoryRecommendation } from "../../types/advisor.js";
import { buildCategorySchema, categorySystemPrompt, categoryUserPrompt } from "../prompts/advisorPrompts.js";

export async function recommendCategory(
  input: AdvisorInput,
  category: Category,
  picked: EngineName,
): Promise<CategoryRecommendation | null> {
  const query = `${input.projectIdea} ${category} budget ${input.budget} skill ${input.skillLevel} art ${input.artCapability}`;
  const { toolDocs, guidanceDocs, toolIds } = await retrieveForCategory(query, category, picked);
  if (toolIds.length === 0) return null; // nothing to recommend — skip the category

  const candidates = formatCandidates(toolDocs, guidanceDocs);
  const model = chatModel().withStructuredOutput(buildCategorySchema(toolIds), { name: "category_recommendation" });
  const out = await model.invoke([
    { role: "system", content: categorySystemPrompt(category) },
    {
      role: "user",
      content: categoryUserPrompt({
        idea: input.projectIdea, budget: input.budget, skillLevel: input.skillLevel,
        artCapability: input.artCapability, category, candidates,
      }),
    },
  ]);
  assertCandidatesOnly(out, toolIds);
  return {
    category,
    primary: { ...out.primary, score: 0, scoreReason: "" }, // score filled by Task 12
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

function formatCandidates(toolDocs: { metadata: Record<string, unknown>; pageContent: string }[], guidanceDocs: { pageContent: string }[]): string {
  const tools = toolDocs.map((d) => `- ${d.metadata.toolId}: ${d.pageContent.split("\n").slice(0, 3).join(" ")}`).join("\n");
  const guidance = guidanceDocs.map((d) => d.pageContent).join("\n");
  return `${tools}\n\nGuidance:\n${guidance}`;
}
```

- [ ] **Step 3: Write the failing test (pure `assertCandidatesOnly` — no network)**

Create `artifacts/api-server/src/agent/steps/recommendCategory.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { assertCandidatesOnly } from "./recommendCategory.js";

test("passes when all ids are candidates", () => {
  assert.doesNotThrow(() => assertCandidatesOnly({ primary: { toolId: "meshy" }, alternatives: [{ toolId: "blender" }] }, ["meshy", "blender"]));
});

test("throws when a non-candidate id appears", () => {
  assert.throws(() => assertCandidatesOnly({ primary: { toolId: "ghost" }, alternatives: [] }, ["meshy"]));
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/agent/steps/recommendCategory.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Type-check + commit**

Run: `pnpm run typecheck` → PASS.
```bash
git add artifacts/api-server/src/agent/prompts/advisorPrompts.ts artifacts/api-server/src/agent/steps/recommendCategory.ts artifacts/api-server/src/agent/steps/recommendCategory.test.ts
git commit -m "feat: add per-category RAG recommend step"
```

---

### Task 12: Holistic scoring + explanation step

**Files:**
- Modify: `artifacts/api-server/src/agent/prompts/advisorPrompts.ts` (add review schema/prompt)
- Create: `artifacts/api-server/src/agent/steps/scoreStack.ts`
- Test: `artifacts/api-server/src/agent/steps/scoreStack.test.ts`

- [ ] **Step 1: Add the holistic review schema + prompt**

Append to `artifacts/api-server/src/agent/prompts/advisorPrompts.ts`:
```ts
export function buildReviewSchema(recommendedIds: string[]) {
  return z.object({
    projectSummary: z.string().min(1),
    finalSummary: z.string().min(1),
    scoreReasons: z.array(z.object({
      toolId: z.enum(recommendedIds as [string, ...string[]]),
      scoreReason: z.string().min(1),
    })),
  });
}

export function reviewSystemPrompt(): string {
  return [
    "You are a senior game-development consultant reviewing a recommended tool stack.",
    "Each tool already has a deterministic score out of 10. For EACH tool, write a one-sentence scoreReason",
    "explaining why it scored what it did given the constraints (e.g. why 8/10 and not 10/10).",
    "Then write a short markdown finalSummary (max ~200 words) and a one-line projectSummary. English only.",
  ].join("\n");
}

export function reviewUserPrompt(idea: string, stack: string): string {
  return [`Project idea: ${idea}`, "", "Scored recommendations:", stack].join("\n");
}
```

- [ ] **Step 2: Write the step — deterministic scores first, then one LLM explanation pass**

Create `artifacts/api-server/src/agent/steps/scoreStack.ts`:
```ts
import { chatModel } from "../../lib/rag/chatModel.js";
import { TOOL_BY_ID } from "../../lib/catalog.js";
import { scoreTool, type ScoringContext } from "../../services/scoring.js";
import type { EngineName } from "../../types/catalog.js";
import type { AdvisorInput, CategoryRecommendation } from "../../types/advisor.js";
import { buildReviewSchema, reviewSystemPrompt, reviewUserPrompt } from "../prompts/advisorPrompts.js";

export interface ScoredStack { projectSummary: string; finalSummary: string; recommendations: CategoryRecommendation[]; }

export function applyDeterministicScores(
  recs: CategoryRecommendation[],
  input: AdvisorInput,
  picked: EngineName,
): CategoryRecommendation[] {
  const scoreItem = (toolId: string, category: CategoryRecommendation["category"]) => {
    const tool = TOOL_BY_ID.get(toolId);
    if (!tool) return 0;
    const ctx: ScoringContext = {
      budget: input.budget, skillLevel: input.skillLevel, artCapability: input.artCapability,
      platformTarget: input.platformTarget, pickedEngine: picked, category,
      paidPriorityCategories: input.paidPriorityCategories ?? [],
    };
    return scoreTool(tool, ctx);
  };
  return recs.map((rec) => ({
    ...rec,
    primary: { ...rec.primary, score: scoreItem(rec.primary.toolId, rec.category) },
    alternatives: rec.alternatives.map((a) => ({ ...a, score: scoreItem(a.toolId, rec.category) })),
  }));
}

export async function runScoreStack(
  input: AdvisorInput,
  recs: CategoryRecommendation[],
  picked: EngineName,
): Promise<ScoredStack> {
  const scored = applyDeterministicScores(recs, input, picked);
  const ids = scored.flatMap((r) => [r.primary.toolId, ...r.alternatives.map((a) => a.toolId)]);
  const stackText = scored
    .map((r) => `[${r.category}] primary ${r.primary.toolId}=${r.primary.score}/10; alts: ${r.alternatives.map((a) => `${a.toolId}=${a.score}`).join(", ") || "none"}`)
    .join("\n");

  const model = chatModel().withStructuredOutput(buildReviewSchema(ids.length ? ids : ["none"]), { name: "stack_review" });
  const review = await model.invoke([
    { role: "system", content: reviewSystemPrompt() },
    { role: "user", content: reviewUserPrompt(input.projectIdea, stackText) },
  ]);

  const reasonById = new Map(review.scoreReasons.map((r) => [r.toolId, r.scoreReason]));
  const withReasons = scored.map((r) => ({
    ...r,
    primary: { ...r.primary, scoreReason: reasonById.get(r.primary.toolId) ?? "" },
    alternatives: r.alternatives.map((a) => ({ ...a, scoreReason: reasonById.get(a.toolId) ?? "" })),
  }));
  return { projectSummary: review.projectSummary, finalSummary: review.finalSummary, recommendations: withReasons };
}
```

- [ ] **Step 3: Write the failing test (pure `applyDeterministicScores` — no network)**

Create `artifacts/api-server/src/agent/steps/scoreStack.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { applyDeterministicScores } from "./scoreStack.js";
import type { AdvisorInput, CategoryRecommendation } from "../../types/advisor.js";

const input: AdvisorInput = {
  projectIdea: "x", budget: "low", skillLevel: "beginner", teamSize: "solo",
  platformTarget: ["pc"], artCapability: "none", paidPriorityCategories: [],
};
const recs: CategoryRecommendation[] = [{
  category: "art_asset",
  primary: { toolId: "meshy", score: 0, scoreReason: "", reasoning: "x", pros: ["x"], cons: ["x"] },
  alternatives: [{ toolId: "blender", score: 0, scoreReason: "", reasoning: "x", pros: ["x"], cons: ["x"] }],
  reasoning: "x",
}];

test("fills numeric 0-10 scores from the deterministic scorer", () => {
  const out = applyDeterministicScores(recs, input, "Unity");
  assert.ok(out[0].primary.score > 0 && out[0].primary.score <= 10);
  assert.ok(out[0].primary.score >= out[0].alternatives[0].score); // meshy >= blender for weak art + low budget
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/agent/steps/scoreStack.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

Run: `pnpm run typecheck` → PASS.
```bash
git add artifacts/api-server/src/agent/prompts/advisorPrompts.ts artifacts/api-server/src/agent/steps/scoreStack.ts artifacts/api-server/src/agent/steps/scoreStack.test.ts
git commit -m "feat: add holistic scoring and explanation step"
```

---

### Task 13: Orchestrator rewrite + cutover (wire new pipeline, delete old)

**Files:**
- Rewrite: `artifacts/api-server/src/orchestrators/advisorOrchestrator.ts`
- Modify: `artifacts/api-server/src/controllers/advisorController.ts`
- Modify: `artifacts/api-server/src/services/sessionService.ts`
- Modify: `artifacts/api-server/src/services/catalogService.ts`, `controllers/toolsController.ts`, `routes/tools.ts`
- Modify: `lib/db/src/schema/sessions.ts`, `lib/db/src/schema/index.ts`
- Rename: `artifacts/api-server/src/data/catalog.json` → `toolCatalog.json`; update path in `lib/catalog.ts`
- Delete: old steps/services/types/scripts/db schema listed in **Remove** above

- [ ] **Step 1: Rewrite the orchestrator**

Replace `artifacts/api-server/src/orchestrators/advisorOrchestrator.ts`:
```ts
import { randomUUID } from "node:crypto";
import { runFeasibility } from "../agent/steps/feasibility.js";
import { runPickEngine } from "../agent/steps/pickEngineRag.js";
import { recommendCategory } from "../agent/steps/recommendCategory.js";
import { runScoreStack } from "../agent/steps/scoreStack.js";
import { persistSession } from "../services/sessionService.js";
import type { AdvisorInput, AnalysisResult, CategoryRecommendation, EngineDecision } from "../types/advisor.js";

export type AdvisorEvent =
  | { type: "feasibility_complete"; targetCategories: string[] }
  | { type: "feasibility_blocked"; reason: string }
  | { type: "engine_picked"; engineDecision: EngineDecision }
  | { type: "category_recommended"; category: string; primaryToolId: string }
  | { type: "done"; result: AnalysisResult };

export async function runAdvisorPipeline(
  input: AdvisorInput,
  emit: (event: AdvisorEvent) => void,
): Promise<AnalysisResult> {
  const feasibility = await runFeasibility(input);

  if (!feasibility.feasible) {
    emit({ type: "feasibility_blocked", reason: feasibility.reason });
    return {
      sessionId: "", feasible: false, reason: feasibility.reason, terminated: true,
      projectSummary: "", recommendations: [], finalSummary: "",
    };
  }
  emit({ type: "feasibility_complete", targetCategories: feasibility.targetCategories });

  const engineDecision = await runPickEngine(input);
  emit({ type: "engine_picked", engineDecision });

  const recs: CategoryRecommendation[] = [];
  for (const category of feasibility.targetCategories) {
    const rec = await recommendCategory(input, category, engineDecision.picked);
    if (rec) {
      recs.push(rec);
      emit({ type: "category_recommended", category, primaryToolId: rec.primary.toolId });
    }
  }

  const { projectSummary, finalSummary, recommendations } = await runScoreStack(input, recs, engineDecision.picked);

  const sessionId = randomUUID();
  const result: AnalysisResult = {
    sessionId, feasible: true, reason: feasibility.reason, terminated: false,
    projectSummary, engineDecision, recommendations, finalSummary,
  };
  try {
    await persistSession({ id: sessionId, inputs: input as unknown as Record<string, unknown>, result });
  } catch (error) {
    console.warn("[advisor] analysis completed but session persistence failed", error);
  }
  return result;
}
```

- [ ] **Step 2: Update the controller SSE mapping**

Replace the `analyze` body in `artifacts/api-server/src/controllers/advisorController.ts` event handling:
```ts
await runAdvisorPipeline(input, (event) => {
  if (event.type === "feasibility_complete") send("feasibility_complete", { targetCategories: event.targetCategories });
  else if (event.type === "feasibility_blocked") send("feasibility_blocked", { reason: event.reason });
  else if (event.type === "engine_picked") send("engine_picked", event.engineDecision);
  else if (event.type === "category_recommended") send("category_recommended", { category: event.category, primaryToolId: event.primaryToolId });
  else if (event.type === "done") send("done", event.result);
});
```
Also: change the import to `from "../orchestrators/advisorOrchestrator.js"` and update `AdvisorInput` import to `../types/advisor.js`. Update `listSessions`/`getStats` to drop `trustScore`/`trustTier` (use `feasible`/recommendation counts only).

- [ ] **Step 3: Update session persistence (drop trust columns)**

In `lib/db/src/schema/sessions.ts`, remove `trustScore` and `trustTier` columns. In `services/sessionService.ts`, remove them from `persistSession` insert and from `listRecentSessions` select. Update `lib/db/src/schema/index.ts` to `export * from "./sessions";` only.

- [ ] **Step 4: Switch `/tools` to the new catalog (JSON, no SQL)**

Rewrite `services/catalogService.ts` to serve from `TOOL_CATALOG` (new shape) with simple filters (`category` via `categories.includes`, `pricing`, `platform`, `difficulty`, `toolNature`). Remove all `pool`/SQL code and `fetchToolsByCategory*`. Update `toolsController.ts` filters accordingly and `listCategoriesWithCounts` to use `CATEGORY_LIST` + `toolsInCategory`.

- [ ] **Step 5: Rename the catalog file and fix the loader path**

Run: `git mv artifacts/api-server/src/data/catalog.json artifacts/api-server/src/data/toolCatalog.json`
Edit `lib/catalog.ts`: change `catalogPath` to `resolve(__dirname, "../data/toolCatalog.json")`.

- [ ] **Step 6: Delete all dead files**

```bash
git rm artifacts/api-server/src/agent/steps/analyze.ts artifacts/api-server/src/agent/steps/retrieve.ts \
  artifacts/api-server/src/agent/steps/checkRetry.ts artifacts/api-server/src/agent/steps/checkRetry.test.ts \
  artifacts/api-server/src/agent/steps/broaden.test.ts artifacts/api-server/src/agent/steps/recommend.ts \
  artifacts/api-server/src/agent/steps/pickEngine.ts artifacts/api-server/src/agent/state.ts \
  artifacts/api-server/src/agent/prompts/analyzePrompt.ts artifacts/api-server/src/agent/prompts/pickEnginePrompt.ts \
  artifacts/api-server/src/agent/prompts/recommendPrompt.ts \
  artifacts/api-server/src/agent/constraints/apply.ts artifacts/api-server/src/agent/constraints/apply.test.ts \
  artifacts/api-server/src/agent/constraints/matchers.ts \
  artifacts/api-server/src/services/constraintService.ts artifacts/api-server/src/services/reasoningService.ts \
  artifacts/api-server/src/services/scoringService.ts \
  artifacts/api-server/src/lib/rag/treeNavigator.ts artifacts/api-server/src/lib/rag/index.ts \
  artifacts/api-server/src/lib/gameDevTools.ts artifacts/api-server/src/data/toolTree.json \
  artifacts/api-server/src/types/pdd.ts artifacts/api-server/src/types/tree.ts artifacts/api-server/src/types/agent.ts \
  artifacts/api-server/src/types/recommendation.ts \
  artifacts/api-server/src/scripts/buildTree.ts artifacts/api-server/src/scripts/evaluateScenarios.ts \
  lib/db/src/schema/tools.ts lib/db/src/schema/engineConstraints.ts lib/db/src/seed/tools.ts \
  lib/db/drizzle/0001_engine_constraints_seed.sql
```
Remove the `tree:build` script from `artifacts/api-server/package.json`. Update its `test` script to the new pure-unit test list:
```json
"test": "tsx --test src/lib/catalog.test.ts src/lib/rag/indexer.test.ts src/lib/rag/retriever.test.ts src/services/scoring.test.ts src/agent/steps/feasibility.test.ts src/agent/steps/pickEngineRag.test.ts src/agent/steps/recommendCategory.test.ts src/agent/steps/scoreStack.test.ts"
```

- [ ] **Step 7: Rebuild lib project references and type-check the whole repo**

Run: `pnpm run typecheck:libs && pnpm run typecheck`
Expected: PASS. Fix any dangling imports the deletions surfaced (search for `gameDevTools`, `pdd.js`, `tree.js`, `scoringService`, `reasoningService`, `trustScore`, `trustTier`).

- [ ] **Step 8: Run the full unit test suite**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS (all pure-unit tests green).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: cut over to RAG advisor pipeline and remove legacy agent"
```

---

### Task 14: End-to-end integration test (early-reject proof)

**Files:**
- Create: `artifacts/api-server/src/agent/advisorPipeline.integration.test.ts` (LIVE)

- [ ] **Step 1: Write the integration test**

Create `artifacts/api-server/src/agent/advisorPipeline.integration.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { runAdvisorPipeline } from "../orchestrators/advisorOrchestrator.js";
import type { AdvisorInput } from "../types/advisor.js";

// LIVE: requires `docker compose up -d chroma`, an indexed collection, and an OpenAI key.
const base: AdvisorInput = {
  projectIdea: "", budget: "low", skillLevel: "beginner", teamSize: "solo",
  platformTarget: ["pc"], artCapability: "none", paidPriorityCategories: [], notes: null,
};

test("solo GTA 5 in a week is blocked with a reason and zero downstream work", async () => {
  const events: string[] = [];
  const result = await runAdvisorPipeline(
    { ...base, projectIdea: "Build GTA 5 — a full AAA open-world game — solo in one week." },
    (e) => events.push(e.type),
  );
  assert.equal(result.terminated, true);
  assert.equal(result.feasible, false);
  assert.ok(result.reason.length > 0);
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.sessionId, "");
  assert.ok(events.includes("feasibility_blocked"));
  assert.ok(!events.includes("engine_picked")); // proves no downstream LLM calls
});

test("a realistic cozy 2D game produces a scored, Zod-valid stack", async () => {
  const result = await runAdvisorPipeline(
    { ...base, projectIdea: "A cozy 2D pixel-art farming game with simple mechanics, shipping on PC." },
    () => {},
  );
  assert.equal(result.terminated, false);
  assert.ok(result.engineDecision);
  assert.ok(result.recommendations.length >= 1);
  for (const rec of result.recommendations) {
    assert.ok(rec.primary.score >= 0 && rec.primary.score <= 10);
    assert.ok(rec.primary.scoreReason.length > 0);
  }
});
```

- [ ] **Step 2: Run it live**

Run: `docker compose up -d chroma mysql && pnpm --filter @workspace/api-server run rag:index && pnpm --filter @workspace/api-server exec tsx --test src/agent/advisorPipeline.integration.test.ts`
Expected: PASS (2 tests). The first proves the early reject; if it fails on `engine_picked` present, the orchestrator is doing downstream work after a block — fix the early return.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/agent/advisorPipeline.integration.test.ts
git commit -m "test: add live end-to-end advisor pipeline integration tests"
```

---

### Task 15: OpenAPI contract update + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Regenerate: `lib/api-zod`, `lib/api-client-react`

- [ ] **Step 1: Update `ProjectInput`**

In `lib/api-spec/openapi.yaml` `ProjectInput`: remove `timeLimit` and `multiplayer` (and from `required`); change `budget` enum to `[low, medium, high, enterprise]`; keep `paidPriorityCategories`, `pinnedToolIds` optional; add nothing else. `required`: `projectIdea, budget, skillLevel, teamSize, platformTarget, artCapability`.

- [ ] **Step 2: Update category enums everywhere**

Replace every category enum occurrence (`Recommendation.category`, `Retrieval.relevantCategories`, `Tool.category`, `ToolCategory.id`) with `[game_engine, art_asset, vfx, animation, audio, ai_coding]`.

- [ ] **Step 3: Update `RecommendationItem` + `Recommendation`**

`RecommendationItem`: `score` `minimum: 0, maximum: 10`; add `scoreReason: { type: string }` to properties and `required`; drop `phase`, `compatibility`, `useCaseJustification` (no longer produced). `Recommendation`: keep `category, primary, alternatives`; add `reasoning: { type: string }` (required).

- [ ] **Step 4: Rewrite `AnalysisResult`**

Properties: `sessionId, feasible (boolean), reason (string), terminated (boolean), projectSummary, engineDecision, recommendations, finalSummary`. Add `EngineDecision.picked` enum `[Unity, Unreal, Godot]` (drop `Custom`). **Remove** `trustScore`, `trustTier`, `retrieval`, `detectedProjectType`, `overallConfidence`, `stackOverview`, `ideaScore*`, `archetype*`, `projectMode`, `feasibilityOverridden`, `categoryResults`, `categories`, `lockedCategories`, `skippedCategories`, `retryMetadata` and the now-unused schemas (`Retrieval`, `CategoryResults`, `CategoryRecommendation*`, `Evidence`, `Archetype*`, `ProjectMode`, `IdeaScoreTier`, `LockedCategory`, `SkippedCategory`, `RetryMetadata`, `RetryHistoryItem`, `Phase`). Update `SessionSummary` to drop `trustScore/trustTier/detectedProjectType/overallConfidence/stackOverview`, keeping `id, projectIdea, feasible, createdAt`.

- [ ] **Step 5: Update the `Tool` + `ToolCategory` schemas to the new catalog shape**

`Tool`: `id, name, categories (array of category enum), description, bestUseCase, toolNature, learningCurve, engineCompatibility, pricing, difficultyLevel, beginnerSuitability, supportedPlatforms, pros, cons, website`. Drop `subcategory, bestFor, platforms, minSkillLevel, teamSizeFit, genreFit, fit2d3d, strengths, weaknesses, alternatives, tags, phase`. Update `/tools` query params: replace `teamSize`/`fit2d3d` with `toolNature`.

- [ ] **Step 6: Regenerate the client + zod types**

Run: `pnpm --filter @workspace/api-spec run codegen`
Then: `pnpm run typecheck:libs`
Expected: codegen succeeds; `lib/api-zod` and `lib/api-client-react` rebuild. The frontend will not type-check yet (next tasks) — that is expected; `typecheck:libs` covers the libs.

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat: update API contract for RAG advisor and 6 categories"
```

---

### Task 16: Frontend wizard (questions)

**Files:**
- Modify: `artifacts/game-dev-advisor/src/components/analyzer/questions.ts`

- [ ] **Step 1: Remove dropped questions + fix budget/paid-priority/known-tools**

Edit `questions.ts`:
- Remove the `time`, `multiplayer`, and `experienced` (known-tools) entries from `QUESTIONS` and from the `QuestionId` union.
- `budget` options: drop `zero` (keep `low|medium|high|enterprise`).
- `paid_priority` options → `[{value:"art_asset",label:"Art & Assets"},{value:"vfx",label:"VFX"},{value:"animation",label:"Animation"},{value:"audio",label:"Audio"},{value:"ai_coding",label:"AI Coding"}]`.

- [ ] **Step 2: Update `buildProjectInput`**

Rewrite to the new `ProjectInput` (no `timeLimit`/`multiplayer`/known-tools):
```ts
export function buildProjectInput(answers: Answers): ProjectInput {
  const theme = (answers.theme as string).trim();
  const mechanics = (answers.mechanics as string).trim();
  const projectIdea = mechanics ? `${theme}\n\nCore mechanics: ${mechanics}` : theme;
  const notes = (answers.notes as string).trim();
  const paidPriority = answers.paid_priority as string[];
  return {
    projectIdea,
    budget: answers.budget as ProjectInput["budget"],
    skillLevel: answers.skill as ProjectInput["skillLevel"],
    teamSize: answers.team as ProjectInput["teamSize"],
    platformTarget: answers.platforms as string[],
    artCapability: answers.art as ProjectInput["artCapability"],
    paidPriorityCategories: paidPriority.length > 0 ? paidPriority : undefined,
    notes: notes || null,
  };
}
```
(Confirm the generated `ProjectInput` uses `notes`; the OpenAPI from Task 15 should expose `notes` — if you kept `otherConstraints` instead, match that name here.)

- [ ] **Step 3: Type-check the frontend**

Run: `pnpm --filter @workspace/game-dev-advisor run typecheck` (or `pnpm run typecheck`)
Expected: `questions.ts` compiles; `Analyzer.tsx` may still error until Task 17.

- [ ] **Step 4: Commit**

```bash
git add artifacts/game-dev-advisor/src/components/analyzer/questions.ts
git commit -m "feat: update wizard inputs for new contract"
```

---

### Task 17: Frontend results + feasibility block + stage remap

**Files:**
- Create: `artifacts/game-dev-advisor/src/components/analyzer/FeasibilityBlock.tsx`
- Modify: `artifacts/game-dev-advisor/src/pages/Analyzer.tsx`
- Modify: `artifacts/game-dev-advisor/src/components/analyzer/GeneratingState.tsx`

- [ ] **Step 1: Create the feasibility-block screen**

Create `artifacts/game-dev-advisor/src/components/analyzer/FeasibilityBlock.tsx`:
```tsx
import { Button } from "@/components/ui/button";

export function FeasibilityBlock({ reason, onRestart }: { reason: string; onRestart: () => void }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
        <h2 className="text-lg font-bold text-red-300 mb-2">This project isn't feasible as described</h2>
        <p className="text-sm text-red-200/90 leading-relaxed">{reason}</p>
      </div>
      <Button onClick={onRestart} className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
        Adjust your answers
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Update the result type + render in `Analyzer.tsx`**

In `pages/Analyzer.tsx`:
- Replace `BackendAnalysisResult` with the new shape: `{ sessionId, feasible, reason, terminated, projectSummary, engineDecision?, recommendations: BackendRecommendation[], finalSummary }`, where `BackendRecommendationItem` is `{ toolId, score, scoreReason, reasoning, pros, cons }` and `BackendRecommendation` adds `reasoning`.
- Update `CATEGORY_LABELS` to the 6 ids: `game_engine, art_asset, vfx, animation, audio, ai_coding`.
- In `ItemBlock`, render `item.score` as `{item.score.toFixed(1)}/10`, the `ScoreBar` width as `item.score * 10` (0–10 → 0–100%), and show `item.scoreReason` under the score.
- In `RecommendationCard`, show `rec.reasoning` once near the top.
- In `AnalysisView`, when `result.engineDecision?.agreement === "challenged"`, render a note: "We recommended {picked} instead of your {userPreferred}: {reasoning}".
- Replace the trust-score header block with the `projectSummary` (drop the trust number/`trustColor`).
- In the `phase === "done"` branch: if `result.terminated`, render `<FeasibilityBlock reason={result.reason} onRestart={restart} />`; otherwise render `AnalysisView`.

- [ ] **Step 3: Remap SSE stage events**

In `applySseEvent` (Analyzer.tsx): map `feasibility_complete` → stage 1, `engine_picked` → stage 2, `category_recommended` → stage 3 (set once). Keep `done`/`error`. Handle `feasibility_blocked` by setting the result to a terminated shape and `phase="done"` (so `FeasibilityBlock` shows), or store `reason` and short-circuit.

In `GeneratingState.tsx` `stageLabels`: `["Checking feasibility.", "Choosing the right engine.", "Finding tools for each category.", "Scoring and finalizing."]`. Keep `GENERATING_STAGE_COUNT = 4`.

- [ ] **Step 4: Type-check + build the frontend**

Run: `pnpm run typecheck`
Expected: PASS across the repo.

- [ ] **Step 5: Manual smoke (LIVE)**

Run backend (`pnpm --filter @workspace/api-server run dev`) + frontend (`pnpm --filter @workspace/game-dev-advisor run dev`). Submit a realistic project → see 6-or-fewer category cards with `/10` + scoreReason and an engine decision. Submit "solo GTA 5 in a week" → see the feasibility-block screen.

- [ ] **Step 6: Commit**

```bash
git add artifacts/game-dev-advisor/src/components/analyzer/FeasibilityBlock.tsx artifacts/game-dev-advisor/src/pages/Analyzer.tsx artifacts/game-dev-advisor/src/components/analyzer/GeneratingState.tsx
git commit -m "feat: render scored recommendations, engine challenge, and feasibility block"
```

---

### Task 18: RAG retrieval eval script

**Files:**
- Create: `artifacts/api-server/src/scripts/ragEval.ts` (LIVE)
- Modify: `artifacts/api-server/package.json` (add `rag:eval`)

- [ ] **Step 1: Write the eval script**

Create `artifacts/api-server/src/scripts/ragEval.ts`:
```ts
import "dotenv/config";
import { retrieveForCategory, retrieveEngineDocs } from "../lib/rag/retriever.js";

interface Case { name: string; run: () => Promise<string[]>; expectIncludes: string; }

const cases: Case[] = [
  {
    name: "weak art + low budget surfaces Meshy in art_asset",
    run: async () => (await retrieveForCategory("weak art skills, low budget, wants good-looking 3D models", "art_asset", "Unity")).toolIds,
    expectIncludes: "meshy",
  },
  {
    name: "engine query surfaces godot for a lightweight 2D game",
    run: async () => (await retrieveEngineDocs("lightweight open-source 2D pixel game, beginner solo dev")).toolIds,
    expectIncludes: "godot",
  },
];

async function main() {
  let failed = 0;
  for (const c of cases) {
    const ids = await c.run();
    const ok = ids.includes(c.expectIncludes);
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"} ${c.name} → [${ids.join(", ")}] (expected ${c.expectIncludes})`);
  }
  if (failed) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
```
Add to `package.json` scripts: `"rag:eval": "tsx ./src/scripts/ragEval.ts"`.

- [ ] **Step 2: Run it (LIVE)**

Run: `pnpm --filter @workspace/api-server run rag:eval`
Expected: both cases `PASS`. If Meshy doesn't surface, revisit catalog tagging (`toolNature: ai`, `learningCurve: low`) and the guidance docs.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/scripts/ragEval.ts artifacts/api-server/package.json
git commit -m "test: add RAG retrieval quality eval script"
```

---

### Task 19: Docs + final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Update the Commands + Architecture sections: replace `tree:build` with `rag:index` (and `rag:eval`), add `docker compose up -d chroma`, describe the RAG pipeline (feasibility → engine → per-category → score), the Chroma collection + per-(tool×category) indexing, the feasibility gate replacing the trust gate, and the new 6-category taxonomy. Remove references to `treeNavigator`, `toolTree.json`, `engine_constraints`, the trust gate, and the SQL `tools` mirror. Per the repo's git convention, commit this change on its own.

- [ ] **Step 2: Full verification sweep**

Run, in order:
```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test
docker compose up -d chroma mysql
pnpm --filter @workspace/api-server run rag:index
pnpm --filter @workspace/api-server run rag:eval
pnpm --filter @workspace/api-server exec tsx --test src/agent/advisorPipeline.integration.test.ts
pnpm run build
```
Expected: typecheck PASS; unit tests PASS; index succeeds; eval PASS; integration PASS; build PASS.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for RAG advisor pipeline"
```

---

## Self-review notes (coverage check against the spec)

- §1 decisions → Tasks 1,5,6,7 (LangChain/Chroma/OpenAI), 9–13 (orchestrator), 9 (feasibility hard block), 10 (engine challenge), 8 (deterministic /10), prompts are English (Task 9–12).
- §2 taxonomy (6 categories, multi-membership) → Task 3 (`CATEGORIES`, `categories[]`), Task 6 (per-category docs).
- §3 catalog schema → Task 3 (schema), Task 4 (data).
- §4 KB + index → Task 2 (guidance), Task 6 (indexer, `rag:index`, metadata-filter-first).
- §5 data layer → Task 1 (chroma compose), Task 13 (drop `engine_constraints`/`tools` mirror, treeNavigator/toolTree; keep sessions).
- §6 pipeline + SSE → Tasks 9–13 (stages + events `feasibility_complete|blocked → engine_picked → category_recommended → done`).
- §7 LangChain usage → Tasks 5–7 (vectorStore/embeddings/retriever/chatModel), `withStructuredOutput` in Tasks 9–12.
- §8 contract → Task 15.
- §9 frontend → Tasks 16–17.
- §10 files → covered across tasks; deletions in Task 13.
- §11 testing → unit (Tasks 8,9,10,11,12), RAG eval (Task 18), integration incl. early-reject (Task 14).
- §12 open items resolved: ToolEntry field list (Task 3, no legacy fields); Chroma collection `gamedev_tools`, persisted volume, manual `rag:index` (Tasks 1,5,6); `targetCategories` fully LLM-decided constrained to the 5-enum (Task 9); top-k=5 tools / k=2 guidance + scalar metadata `where` (Task 7); migration order = additive-then-cutover (Migration strategy + Task 13).

**Known risk:** LangChain `withStructuredOutput` zod interop. The repo uses `zod/v4`. If LangChain's schema conversion rejects v4 schemas at runtime, fall back to passing a JSON-schema object to `withStructuredOutput(jsonSchema, { name, strict: true })` (the same strict JSON schemas the old code already used), or add `method: "jsonSchema"`. Verify on the first live run in Task 9.
