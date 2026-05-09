# PDD Alignment — Sprint 3: Tree-of-Contents + Vectorless Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace embeddings-based RAG (`pgvector` + OpenAI embeddings + cosine similarity) with a vectorless, LLM-driven tree-of-contents retrieval following the PageIndex pattern. Generate a static `toolTree.json` from `toolCatalog.json` at build time. At request time, a single LLM call selects relevant categories and tools from the tree; deterministic code post-processes into a `RetrievedContextPackage` that includes `fallbackStatus` and `retrievalConfidence`.

**Architecture:** Two-level tree (`root → category → tool`). Tool node `summary` is deterministic — built offline by string-templating tool fields. Retrieval is one `gpt-4o-mini` call with `response_format: json_schema` and `temperature: 0`. The reply is validated against `TOOL_CATALOG`; fabricated ids are dropped and contribute to `fallbackStatus = "missing_domain"`. Category coverage is scored using the locked weights from Sprint 1's `PDD_CATEGORY_WEIGHTS`.

**Tech Stack:** TypeScript, Node `node:fs`, `openai` SDK with structured outputs (`response_format: { type: "json_schema" }`), Zod v4 for output validation.

**Source spec:** [docs/superpowers/specs/2026-05-07-pdd-sections-2-3-4-5-alignment-design.md §4.2–§4.3](../specs/2026-05-07-pdd-sections-2-3-4-5-alignment-design.md)

**Locked design decisions (resolved 2026-05-07 with user):**

1. **Confidence weights** — already in `PDD_CATEGORY_WEIGHTS`: game_engine 30, art_asset_creation 20, audio 15, version_control 12, ai_coding_assistant 10, ide 7, deployment_publishing 6 (sum 100).
2. **`ambiguous_input` rule** — fires only when `projectIdea.trim().split(/\s+/).length < 10`. The structured-signal check is dropped: frontend always fills all `ProjectInputs` fields.
3. **Summary template** — `"{description} | {difficultyLevel} difficulty | platforms: {comma-joined} | {fit2d3d} | {pricing}"`.
4. **LLM marking → package** — `strong` and `conditional` go into `candidateTools` (the `fitNote` carries the marking suffix); `weak` and `reject` go into `rejectedTools`.
5. **JSON schema** — written in Task 1 of this plan (single inline schema covering both stage outputs).
6. **`missingInformationNotes`** — always emitted as `[]` for MVP. Kept in the package for spec compliance.

**Project conventions:**
- No tests. Verification = `pnpm run typecheck` + dev-server smoke test (`POST /api/advisor/analyze` returns sensible candidates).
- Single PR; multiple commits.
- All commands in PowerShell.
- Sprint 2 must be merged first.

**Anti-overengineering boundary:**
- One LLM call for retrieval, not three. Spec §8.3 explicitly authorizes this.
- No retry, no timeout wrapper, no AbortSignal composition. Native error bubbles.
- No retrieval-result cache. Every analyze call hits the LLM.
- No `IRetrievalProvider` interface. Direct function.
- No "weak coverage backfill" heuristic. If a category is empty, `fallbackStatus` reflects it; reasoning service handles the consequence in Sprint 4.
- The legacy `GAME_DEV_TOOLS` adapter and `advisorEngine.ts` remain intact this sprint — they call the new retrieval through a thin adapter so Sprint 3 doesn't bleed into Sprint 4's reasoning split.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `artifacts/api-server/src/types/tree.ts` | Create | `ToolTreeNode`, `ToolTree`, `RetrievedContextPackage` types + Zod schemas for the LLM response |
| `artifacts/api-server/src/scripts/buildTree.ts` | Create | Reads `toolCatalog.json`, writes `toolTree.json` |
| `artifacts/api-server/src/data/toolTree.json` | Generate (committed) | Static tree-of-contents |
| `artifacts/api-server/src/lib/rag/treeNavigator.ts` | Create | `retrieveContext(inputs, tree)` — single LLM call + deterministic merge |
| `artifacts/api-server/src/lib/rag/index.ts` | Rewrite | Re-export only `treeNavigator` and `tree` types |
| `artifacts/api-server/src/lib/advisorEngine.ts` | Modify | Replace `retrieveAdvisorKnowledge` body with a call to `retrieveContext`; expose its package via the existing `retrievedKnowledgeContext` plus an additional `retrieval` field |
| `artifacts/api-server/src/lib/rag/embeddings.ts` | Delete | |
| `artifacts/api-server/src/lib/rag/vectorStore.ts` | Delete | |
| `artifacts/api-server/src/lib/rag/retriever.ts` | Delete | |
| `artifacts/api-server/src/lib/rag/documents.ts` | Delete | |
| `artifacts/api-server/src/lib/rag/documentIds.ts` | Delete | |
| `artifacts/api-server/src/lib/rag/types.ts` | Delete | (Replaced by `types/tree.ts`) |
| `artifacts/api-server/src/scripts/seedRag.ts` | Delete | |
| `artifacts/api-server/src/scripts/buildPopularityFromDataset.ts` | Delete | Popularity field is gone (Sprint 1) |
| `artifacts/api-server/package.json` | Modify | Replace `rag:seed` script with `tree:build` |
| `CLAUDE.md` | Modify | Document `tree:build`, remove RAG paragraph |

---

## Task 1: Define tree + retrieval types

**Files:**
- Create: `artifacts/api-server/src/types/tree.ts`

- [ ] **Step 1.1: Create the file**

```ts
import { z } from "zod/v4";
import { PDD_CATEGORIES, type PddCategory } from "./pdd.js";

// ── Tree shape ───────────────────────────────────────────────

export interface ToolTreeLeaf {
  node_id: string;
  title: string;
  summary: string;
  ref: { toolId: string };
}

export interface ToolTreeCategoryNode {
  node_id: string;
  title: string;
  summary: string;
  category: PddCategory;
  nodes: ToolTreeLeaf[];
}

export interface ToolTree {
  node_id: "root";
  title: string;
  summary: string;
  nodes: ToolTreeCategoryNode[];
}

// ── Retrieval package (returned to advisor pipeline) ────────

export type FallbackStatus = "ok" | "weak_coverage" | "ambiguous_input" | "missing_domain";

export interface RetrievedContextPackage {
  relevantCategories: PddCategory[];
  candidateTools: Array<{ toolId: string; nodePath: string; fitNote: string }>;
  rejectedTools: Array<{ toolId: string; reason: string }>;
  missingInformationNotes: string[];
  retrievalConfidence: number;
  fallbackStatus: FallbackStatus;
}

// ── LLM response schema (validated post-call) ────────────────

export const ToolMarking = z.enum(["strong", "conditional", "weak", "reject"]);
export type ToolMarking = z.infer<typeof ToolMarking>;

export const LlmRetrievalResponseSchema = z.object({
  selectedCategories: z.array(
    z.object({
      category: z.string(),
      reason: z.string().min(1),
    }),
  ),
  toolEvaluations: z.array(
    z.object({
      toolId: z.string(),
      marking: ToolMarking,
      fitNote: z.string().min(1),
    }),
  ),
});
export type LlmRetrievalResponse = z.infer<typeof LlmRetrievalResponseSchema>;

// JSON Schema literal for OpenAI structured output. Mirrors LlmRetrievalResponseSchema.
export const LLM_RETRIEVAL_JSON_SCHEMA = {
  name: "tool_retrieval_response",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      selectedCategories: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string", enum: [...PDD_CATEGORIES] },
            reason: { type: "string" },
          },
          required: ["category", "reason"],
        },
      },
      toolEvaluations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            toolId: { type: "string" },
            marking: { type: "string", enum: ["strong", "conditional", "weak", "reject"] },
            fitNote: { type: "string" },
          },
          required: ["toolId", "marking", "fitNote"],
        },
      },
    },
    required: ["selectedCategories", "toolEvaluations"],
  },
  strict: true,
} as const;
```

- [ ] **Step 1.2: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 1.3: Commit**

```powershell
git add artifacts/api-server/src/types/tree.ts
git commit -m "feat(api): add tree + retrieval types and LLM JSON schema"
```

---

## Task 2: Build the static `toolTree.json`

**Files:**
- Create: `artifacts/api-server/src/scripts/buildTree.ts`
- Modify: `artifacts/api-server/package.json` (add `tree:build` script, remove `rag:seed`)

- [ ] **Step 2.1: Write `buildTree.ts`**

```ts
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_CATALOG, TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import type { PddCategory } from "../types/pdd.js";
import type { ToolTree, ToolTreeCategoryNode, ToolTreeLeaf } from "../types/tree.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../data/toolTree.json");

function summarizeTool(t: (typeof TOOL_CATALOG)[number]): string {
  const platforms = t.supportedPlatforms.join(", ");
  return `${t.description} | ${t.difficultyLevel} difficulty | platforms: ${platforms} | ${t.fit2d3d} | ${t.pricing}`;
}

const categoryNodes: ToolTreeCategoryNode[] = TOOL_CATEGORIES.map((cat) => {
  const tools = TOOL_CATALOG.filter((t) => t.category === cat.id);
  const leaves: ToolTreeLeaf[] = tools.map((t) => ({
    node_id: `tool.${t.id}`,
    title: t.name,
    summary: summarizeTool(t),
    ref: { toolId: t.id },
  }));
  return {
    node_id: `cat.${cat.id}`,
    title: cat.label,
    summary: `${cat.description} (${tools.length} tools)`,
    category: cat.id as PddCategory,
    nodes: leaves,
  };
});

const tree: ToolTree = {
  node_id: "root",
  title: "Game Development Tools",
  summary: `Top-level catalog covering the ${TOOL_CATEGORIES.length} PDD MVP categories.`,
  nodes: categoryNodes,
};

writeFileSync(outPath, JSON.stringify(tree, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath} (${categoryNodes.reduce((n, c) => n + c.nodes.length, 0)} tool leaves)`);
```

- [ ] **Step 2.2: Edit `artifacts/api-server/package.json`**

In the `scripts` block, replace `"rag:seed": "tsx ./src/scripts/seedRag.ts"` with `"tree:build": "tsx ./src/scripts/buildTree.ts"`.

- [ ] **Step 2.3: Run the script**

```powershell
pnpm --filter @workspace/api-server run tree:build
```

Expected output: `Wrote .../toolTree.json (~62 tool leaves)`. The file is committed.

- [ ] **Step 2.4: Sanity check the output**

```powershell
Get-Content artifacts/api-server/src/data/toolTree.json | Select-Object -First 30
```

Expected: top of JSON shows `"node_id": "root"`, the first category node `"cat.game_engine"`, and a few tool leaves with `summary` strings following the template.

- [ ] **Step 2.5: Commit**

```powershell
git add artifacts/api-server/src/scripts/buildTree.ts artifacts/api-server/src/data/toolTree.json artifacts/api-server/package.json
git commit -m "feat(api): generate static toolTree.json (tree:build script)"
```

---

## Task 3: Implement `treeNavigator.ts`

**Files:**
- Create: `artifacts/api-server/src/lib/rag/treeNavigator.ts`
- Rewrite: `artifacts/api-server/src/lib/rag/index.ts`

- [ ] **Step 3.1: Write `treeNavigator.ts`**

```ts
import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PDD_CATEGORIES,
  PDD_CATEGORY_WEIGHTS,
  type PddCategory,
} from "../../types/pdd.js";
import {
  LLM_RETRIEVAL_JSON_SCHEMA,
  LlmRetrievalResponseSchema,
  type FallbackStatus,
  type RetrievedContextPackage,
  type ToolTree,
} from "../../types/tree.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const treePath = resolve(__dirname, "../../data/toolTree.json");

export const TOOL_TREE: ToolTree = JSON.parse(readFileSync(treePath, "utf8"));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Inputs ───────────────────────────────────────────────────

export interface ProjectInputs {
  projectIdea: string;
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: string;
  platformTarget: string[];
  artCapability: string;
  otherConstraints?: string | null;
}

// ── Public retrieval ─────────────────────────────────────────

export async function retrieveContext(
  inputs: ProjectInputs,
  tree: ToolTree = TOOL_TREE,
): Promise<RetrievedContextPackage> {
  const { allToolIds, validCategoryIds, treeIndex } = indexTree(tree);

  const messages = buildPrompt(inputs, tree);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages,
    response_format: { type: "json_schema", json_schema: LLM_RETRIEVAL_JSON_SCHEMA },
  });

  const raw = response.choices[0]?.message.content ?? "{}";
  const parsed = LlmRetrievalResponseSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return emptyPackage("missing_domain");
  }

  // ── Stage 3: deterministic merge ──────────────────────────

  let domainViolation = false;

  const relevantCategories: PddCategory[] = [];
  for (const sel of parsed.data.selectedCategories) {
    if (validCategoryIds.has(sel.category) && PDD_CATEGORIES.includes(sel.category as PddCategory)) {
      if (!relevantCategories.includes(sel.category as PddCategory)) {
        relevantCategories.push(sel.category as PddCategory);
      }
    } else {
      domainViolation = true;
    }
  }

  const candidateTools: RetrievedContextPackage["candidateTools"] = [];
  const rejectedTools: RetrievedContextPackage["rejectedTools"] = [];

  for (const ev of parsed.data.toolEvaluations) {
    if (!allToolIds.has(ev.toolId)) {
      domainViolation = true;
      continue;
    }
    const node = treeIndex[ev.toolId];
    if (ev.marking === "strong" || ev.marking === "conditional") {
      candidateTools.push({
        toolId: ev.toolId,
        nodePath: node.path,
        fitNote: `[${ev.marking}] ${ev.fitNote}`,
      });
    } else {
      rejectedTools.push({ toolId: ev.toolId, reason: `[${ev.marking}] ${ev.fitNote}` });
    }
  }

  const retrievalConfidence = relevantCategories.reduce(
    (sum, c) => sum + (PDD_CATEGORY_WEIGHTS[c] ?? 0),
    0,
  );

  const fallbackStatus = computeFallbackStatus({
    inputs,
    candidateTools,
    domainViolation,
  });

  return {
    relevantCategories,
    candidateTools,
    rejectedTools,
    missingInformationNotes: [],
    retrievalConfidence,
    fallbackStatus,
  };
}

// ── Internal helpers ────────────────────────────────────────

function buildPrompt(inputs: ProjectInputs, tree: ToolTree) {
  const treeBlock = tree.nodes
    .map((cat) => {
      const tools = cat.nodes.map((leaf) => `    - ${leaf.ref.toolId}: ${leaf.summary}`).join("\n");
      return `[${cat.category}] ${cat.title} — ${cat.summary}\n${tools}`;
    })
    .join("\n\n");

  const inputsBlock = JSON.stringify(inputs, null, 2);

  const system = `You are a tool selection assistant for a game-development advisor.
You receive structured project inputs and a catalog tree of categories and tools.
Pick relevant categories from the 7 fixed PDD categories: ${PDD_CATEGORIES.join(", ")}.
Within each selected category evaluate the listed tools and mark each one:
  - "strong"      = clear top fit
  - "conditional" = fits if a tradeoff is accepted (note it)
  - "weak"        = poor fit but possible
  - "reject"      = wrong category or wrong project profile
Only emit toolId values that appear in the catalog. Do not invent new ones.
Do not assess project feasibility — that is a separate step. Only assess fit.`;

  const user = `Project inputs:
\`\`\`json
${inputsBlock}
\`\`\`

Catalog (category → tools):
${treeBlock}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

function indexTree(tree: ToolTree) {
  const allToolIds = new Set<string>();
  const validCategoryIds = new Set<string>();
  const treeIndex: Record<string, { path: string }> = {};
  for (const cat of tree.nodes) {
    validCategoryIds.add(cat.category);
    for (const leaf of cat.nodes) {
      allToolIds.add(leaf.ref.toolId);
      treeIndex[leaf.ref.toolId] = { path: `root/${cat.node_id}/${leaf.node_id}` };
    }
  }
  return { allToolIds, validCategoryIds, treeIndex };
}

function computeFallbackStatus(args: {
  inputs: ProjectInputs;
  candidateTools: RetrievedContextPackage["candidateTools"];
  domainViolation: boolean;
}): FallbackStatus {
  if (args.domainViolation) return "missing_domain";

  // ambiguous_input: free-text idea < 10 words.
  // Structured signals are guaranteed by the frontend (locked decision 2026-05-07).
  const wordCount = args.inputs.projectIdea.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 10) return "ambiguous_input";

  // weak_coverage: any of the three high-weight categories is empty after retrieval.
  const coreCats: PddCategory[] = ["game_engine", "ide", "version_control"];
  const candidateCategories = new Set(
    args.candidateTools
      .map((c) => /^root\/cat\.([^/]+)\//.exec(c.nodePath)?.[1] as PddCategory | undefined)
      .filter(Boolean) as PddCategory[],
  );
  for (const c of coreCats) {
    if (!candidateCategories.has(c)) return "weak_coverage";
  }

  return "ok";
}

function emptyPackage(status: FallbackStatus): RetrievedContextPackage {
  return {
    relevantCategories: [],
    candidateTools: [],
    rejectedTools: [],
    missingInformationNotes: [],
    retrievalConfidence: 0,
    fallbackStatus: status,
  };
}
```

- [ ] **Step 3.2: Replace `lib/rag/index.ts`**

```ts
export * from "./treeNavigator.js";
export * from "../../types/tree.js";
```

- [ ] **Step 3.3: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: likely fails — `advisorEngine.ts` and/or `routes/advisor.ts` still import the deleted-soon `embeddings`, `vectorStore`, `retriever`, `documents`, `documentIds` modules. Move on to Task 4 to fix those before re-running typecheck.

- [ ] **Step 3.4: Commit (intermediate, broken state OK because rag/* still exists)**

```powershell
git add artifacts/api-server/src/lib/rag/treeNavigator.ts artifacts/api-server/src/lib/rag/index.ts
git commit -m "feat(api): add vectorless treeNavigator (single-call structured retrieval)"
```

---

## Task 4: Wire `advisorEngine.ts` to use `retrieveContext`

**Files:**
- Modify: `artifacts/api-server/src/lib/advisorEngine.ts`
- Modify: `artifacts/api-server/src/routes/advisor.ts`

The current `advisorEngine.ts` exports `retrieveAdvisorKnowledge(input)` returning `{ ragChunks, retrievedKnowledgeContext }`. Sprint 4 will redesign this; for Sprint 3 we keep the signature stable and adapt the new package into the old shape.

- [ ] **Step 4.1: Replace `retrieveAdvisorKnowledge` in `advisorEngine.ts`**

Find the function (search for the name) and replace its body:

```ts
import { retrieveContext, type RetrievedContextPackage } from "./rag/treeNavigator.js";

// Re-export so routes/advisor.ts can read the package without importing from rag/.
export type { RetrievedContextPackage };

export async function retrieveAdvisorKnowledge(input: ProjectInput): Promise<{
  ragChunks: Array<{ text: string; source: string; score?: number | null }>;
  retrievedKnowledgeContext: string;
  retrieval: RetrievedContextPackage;
}> {
  const retrieval = await retrieveContext({
    projectIdea: input.projectIdea,
    budget: input.budget,
    timeLimit: input.timeLimit,
    skillLevel: input.skillLevel,
    teamSize: input.teamSize,
    platformTarget: input.platformTarget,
    artCapability: input.artCapability,
    otherConstraints: input.otherConstraints,
  });

  // Old shape kept so the rest of advisorEngine stays compiling. The "ragChunks"
  // becomes a serialisation of the candidate fit notes for the narrative LLM.
  const ragChunks = retrieval.candidateTools.map((c) => ({
    text: c.fitNote,
    source: c.toolId,
    score: null,
  }));
  const retrievedKnowledgeContext = ragChunks
    .map((chunk) => `- ${chunk.source}: ${chunk.text}`)
    .join("\n");

  return { ragChunks, retrievedKnowledgeContext, retrieval };
}
```

- [ ] **Step 4.2: Drop unused imports/local helpers in `advisorEngine.ts`**

Search the file for `embeddings`, `vectorStore`, `documents`, `documentIds`, `pgvector`, `KnowledgeChunk`, and remove every reference. Drop the corresponding imports.

- [ ] **Step 4.3: Update `routes/advisor.ts` to forward the `retrieval` package**

In the analyze handler, the current destructuring is:

```ts
const { ragChunks, retrievedKnowledgeContext } = await retrieveAdvisorKnowledge(input);
```

Change to:

```ts
const { ragChunks, retrievedKnowledgeContext, retrieval } = await retrieveAdvisorKnowledge(input);
```

In both the `blockedResult` and `resultObj` literals, add:

```ts
retrieval,
```

near `feasibilityOverridden`. The OpenAPI shape gains this field formally in Sprint 4 — Sprint 3 returns it as an extra property; clients ignore unknown properties.

- [ ] **Step 4.4: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS (the still-existing `lib/rag/{embeddings,vectorStore,retriever,documents,documentIds,types}.ts` files remain on disk but are no longer imported).

- [ ] **Step 4.5: Smoke test**

Make sure `OPENAI_API_KEY` is set in `.env`. Then:

```powershell
docker compose up -d mysql
pnpm --filter @workspace/api-server run dev
```

POST `/api/advisor/analyze`:

```json
{ "projectIdea": "A cozy 2D farming game with multiplayer co-op for PC and Switch.", "budget": "low", "timeLimit": "year", "skillLevel": "intermediate", "teamSize": "small", "platformTarget": ["pc","console"], "artCapability": "intermediate" }
```

Expected: streaming completes; the final event payload includes a `retrieval` object with non-empty `relevantCategories` (at least `game_engine`) and several `candidateTools`. `fallbackStatus` should be `"ok"`.

Also try with a 4-word idea:

```json
{ "projectIdea": "make game", "budget": "low", "timeLimit": "year", "skillLevel": "intermediate", "teamSize": "small", "platformTarget": ["pc"], "artCapability": "basic" }
```

Expected: `fallbackStatus: "ambiguous_input"`.

- [ ] **Step 4.6: Commit**

```powershell
git add artifacts/api-server/src/lib/advisorEngine.ts artifacts/api-server/src/routes/advisor.ts
git commit -m "refactor(api): retrieve via treeNavigator, expose retrieval package"
```

---

## Task 5: Delete embeddings + pgvector code

**Files:**
- Delete: `artifacts/api-server/src/lib/rag/embeddings.ts`
- Delete: `artifacts/api-server/src/lib/rag/vectorStore.ts`
- Delete: `artifacts/api-server/src/lib/rag/retriever.ts`
- Delete: `artifacts/api-server/src/lib/rag/documents.ts`
- Delete: `artifacts/api-server/src/lib/rag/documentIds.ts`
- Delete: `artifacts/api-server/src/lib/rag/types.ts`
- Delete: `artifacts/api-server/src/scripts/seedRag.ts`
- Delete: `artifacts/api-server/src/scripts/buildPopularityFromDataset.ts`

- [ ] **Step 5.1: Delete the files**

```powershell
Remove-Item artifacts/api-server/src/lib/rag/embeddings.ts
Remove-Item artifacts/api-server/src/lib/rag/vectorStore.ts
Remove-Item artifacts/api-server/src/lib/rag/retriever.ts
Remove-Item artifacts/api-server/src/lib/rag/documents.ts
Remove-Item artifacts/api-server/src/lib/rag/documentIds.ts
Remove-Item artifacts/api-server/src/lib/rag/types.ts
Remove-Item artifacts/api-server/src/scripts/seedRag.ts
Remove-Item artifacts/api-server/src/scripts/buildPopularityFromDataset.ts
```

- [ ] **Step 5.2: Confirm nothing imports them**

```powershell
Get-ChildItem -Recurse -Include *.ts artifacts/api-server/src,lib | Select-String -Pattern 'embeddings|vectorStore|seedRag|buildPopularityFromDataset|documentIds' -SimpleMatch
```

Expected: no output. Any remaining hit must be cleaned up before continuing.

- [ ] **Step 5.3: Typecheck**

```powershell
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 5.4: Commit**

```powershell
git add -A artifacts/api-server/src/lib/rag artifacts/api-server/src/scripts
git commit -m "feat(api): remove embeddings, pgvector retrieval, and seed scripts"
```

---

## Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 6.1: Replace the RAG paragraph and seed mention**

Remove any sentence referencing `pgvector`, `knowledge_chunks`, embeddings, `rag:seed`, or "vector store". Replace the relevant paragraph in the Architecture section with:

```markdown
**Retrieval (vectorless tree-of-contents):** `artifacts/api-server/src/data/toolTree.json` is generated from `toolCatalog.json` at build time (`pnpm --filter @workspace/api-server run tree:build`). At request time, `lib/rag/treeNavigator.ts` makes a single `gpt-4o-mini` call with structured-output JSON schema to pick relevant categories and mark candidate tools. The result is a `RetrievedContextPackage` with `retrievalConfidence` and `fallbackStatus`.
```

In the commands block, replace `rag:seed` with `tree:build`:

```powershell
# Regenerate the tree-of-contents from the tool catalog
pnpm --filter @workspace/api-server run tree:build
```

- [ ] **Step 6.2: Commit**

```powershell
git add CLAUDE.md
git commit -m "docs(claude-md): document tree-of-contents retrieval"
```

---

## Task 7: Sprint exit checklist

- [ ] **Step 7.1: Verify acceptance**

```powershell
# 1. No embeddings/pgvector code anywhere
Get-ChildItem -Recurse -Include *.ts artifacts/api-server/src,lib | Select-String -Pattern 'embedding|pgvector|cosine|knowledge_chunks' -SimpleMatch
# expected: no output

# 2. Tree builds and validates
pnpm --filter @workspace/api-server run tree:build
# expected: "Wrote .../toolTree.json (...)"

# 3. Type-check passes
pnpm run typecheck

# 4. End-to-end happy path with realistic idea returns fallbackStatus=ok and >=1 game_engine candidate
docker compose up -d mysql
pnpm --filter @workspace/api-server run dev
# Then POST /api/advisor/analyze with the cozy 2D farming JSON above; inspect response.retrieval.fallbackStatus
```

- [ ] **Step 7.2: Push branch and open PR**

```powershell
git push -u origin <branch>
gh pr create --title "Sprint 3: vectorless tree-of-contents retrieval" --body "<reference spec §6 sprint 3>"
```

---

## Out of scope for Sprint 3

- Splitting `advisorEngine.ts` into `scoringService` / `reasoningService` / `orchestrator` — Sprint 4.
- Introducing `trustScore`, `trustTier`, `terminated`, `phase` per recommendation — Sprint 4.
- Removing the legacy `GAME_DEV_TOOLS` adapter — Sprint 5 (after `advisorEngine` no longer references it).
- Adding the `retrieval` field formally to `AnalysisResult` in OpenAPI — Sprint 4 (so it lands together with the trust fields).
