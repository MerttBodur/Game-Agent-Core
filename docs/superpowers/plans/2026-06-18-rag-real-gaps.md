# RAG Real-Gaps + Catalog Broadening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four real RAG gaps (hybrid retrieval, prompt grounding, eval metrics, metadata enrichment) and broaden/correct the tool catalog, per `docs/superpowers/specs/2026-06-18-rag-real-gaps-design.md`.

**Architecture:** Add a hand-rolled in-memory BM25 index over the catalog and fuse it with Chroma vector results via Reciprocal Rank Fusion (RRF) under shared metadata filters. Enrich indexed documents with pricing/platform/beginner signals. Harden recommendation prompts against attribute fabrication. Replace the smoke-test eval with a labeled gold-set harness reporting Recall@K / Precision@K / MRR. Grow the catalog with ~28 usability-filtered tools.

**Tech Stack:** TypeScript (ESM), LangChain.js, Chroma, OpenAI embeddings, `node:test` runner via `tsx --test`, Zod v4 (`zod/v4`).

## Global Constraints

- Test runner: `node:test` + `node:assert/strict`, executed via `tsx --test`. New `*.test.ts` files MUST be added to the `test` script's explicit file list in `artifacts/api-server/package.json`.
- Zod imports use `zod/v4`, never the default `zod` import.
- ESM relative imports MUST use the `.js` extension (e.g. `./bm25.js`).
- No new npm dependencies (BM25 is hand-rolled) — honors `minimumReleaseAge: 1440` supply-chain rule.
- Chroma metadata is scalar-only (string/number/boolean). No arrays in metadata.
- The canonical categories are `game_engine`, `art_asset`, `vfx`, `animation`, `audio`, `ai_coding`. No new category.
- Every catalog entry MUST pass `ToolCatalogSchema` (validated at boot by `lib/catalog.ts`); ids are lowercase snake_case and unique.
- All run commands assume CWD repo root; the filter `pnpm --filter @workspace/api-server` targets the API server package.

---

## File Structure

- `artifacts/api-server/src/data/toolCatalog.json` — MODIFY: fix `supportedPlatforms`; append ~28 tools.
- `artifacts/api-server/src/lib/rag/bm25.ts` — CREATE: in-memory BM25 + RRF fusion helpers.
- `artifacts/api-server/src/lib/rag/bm25.test.ts` — CREATE: unit tests for BM25 + RRF.
- `artifacts/api-server/src/lib/rag/indexer.ts` — MODIFY: enrich pageContent + scalar metadata flags.
- `artifacts/api-server/src/lib/rag/indexer.test.ts` — MODIFY: assert new metadata/content.
- `artifacts/api-server/src/lib/rag/retriever.ts` — MODIFY: fuse vector + BM25 via RRF.
- `artifacts/api-server/src/lib/rag/retriever.test.ts` — MODIFY: assert fusion ordering + filter parity.
- `artifacts/api-server/src/agent/prompts/advisorPrompts.ts` — MODIFY: grounding rules in `categorySystemPrompt`.
- `artifacts/api-server/src/agent/steps/recommendCategory.ts` — MODIFY: `---`-separated candidate formatting.
- `artifacts/api-server/src/agent/steps/recommendCategory.test.ts` — MODIFY: assert formatting/grounding.
- `artifacts/api-server/src/data/eval/goldset.json` — CREATE: labeled retrieval gold set.
- `artifacts/api-server/src/scripts/ragEval.ts` — MODIFY: Recall@K / Precision@K / MRR harness.
- `artifacts/api-server/package.json` — MODIFY: add `bm25.test.ts` to the `test` script.

---

## Task 1: Fix `supportedPlatforms` data

**Files:**
- Modify: `artifacts/api-server/src/data/toolCatalog.json`
- Test: `artifacts/api-server/src/lib/rag/indexer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: corrected catalog data — no code signatures. `pc` is the platform enum value for desktop (Win/macOS/Linux) per `PLATFORMS` in `types/catalog.ts`.

- [ ] **Step 1: Write the failing test**

Add to `artifacts/api-server/src/lib/rag/indexer.test.ts`:

```typescript
import { TOOL_CATALOG } from "../catalog.js";

test("cross-platform desktop tools include pc in supportedPlatforms", () => {
  const desktop = ["blender", "krita", "aseprite", "audacity", "reaper", "fmod_studio", "wwise", "autodesk_maya", "zbrush", "substance_painter"];
  for (const id of desktop) {
    const tool = TOOL_CATALOG.find((t) => t.id === id);
    assert.ok(tool, `missing tool ${id}`);
    assert.ok(tool!.supportedPlatforms.includes("pc"), `${id} should list pc`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/indexer.test.ts`
Expected: FAIL — at least one desktop tool lacks `pc` (e.g. those currently showing a single non-pc platform).

- [ ] **Step 3: Fix the data**

In `toolCatalog.json`, for each of the listed desktop tools, ensure `supportedPlatforms` contains `"pc"` (add it if missing; keep existing values like `"mobile"`, `"web"`, `"console"` where already correct). Use only values from `PLATFORMS` = `pc | mobile | web | console | vr | ar`. Do not invent platforms a tool does not support.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/indexer.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify catalog still validates**

Run: `pnpm --filter @workspace/api-server exec tsx -e "import('./src/lib/catalog.js').then(m => console.log('ok', m.TOOL_CATALOG.length))"`
Expected: prints `ok 31`.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/data/toolCatalog.json artifacts/api-server/src/lib/rag/indexer.test.ts
git commit -m "fix: correct supportedPlatforms for cross-platform desktop tools"
```

---

## Task 2: Broaden the catalog (~28 usability-filtered tools)

**Files:**
- Modify: `artifacts/api-server/src/data/toolCatalog.json`
- Test: `artifacts/api-server/src/lib/rag/indexer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a larger catalog (~59 tools). Each new entry conforms to `ToolEntrySchema`: `id` (lowercase snake_case, unique), `name`, `categories[]` (from the 6 canonical), `description`, `bestUseCase`, `toolNature` (`ai|traditional|hybrid`), `learningCurve` (`low|medium|high`), `engineCompatibility[]` (`Unity|Unreal|Godot|any`), `pricing` (`free|open_source|freemium|paid|subscription|revenue_share|enterprise`), `difficultyLevel` (`beginner|intermediate|advanced`), `beginnerSuitability` (0–100 int), `supportedPlatforms[]`, `pros[]` (≥1), `cons[]` (≥1), optional `website`.

Tools to add (do NOT add `leonardo_ai` — already present):

- game_engine: `gamemaker`, `construct_3`, `gdevelop`, `rpg_maker`, `renpy`, `defold`, `phaser`, `love2d`
- art_asset: `nano_banana` (ai), `tripo` (ai), `rodin` (ai), `midjourney` (ai), `photoshop`, `gimp`, `clip_studio_paint`, `magicavoxel`
- animation: `kling` (ai), `opentoonz`, `moho`, `rive`
- vfx: `runway` (ai)
- audio: `fl_studio`, `lmms`, `bosca_ceoil`, `chiptone`
- ai_coding: `claude_code` (ai), `cline` (ai), `aider` (ai)

- [ ] **Step 1: Write the failing test**

Add to `artifacts/api-server/src/lib/rag/indexer.test.ts`:

```typescript
test("broadened catalog includes the new usability-filtered tools", () => {
  const expected = [
    "gamemaker", "construct_3", "gdevelop", "rpg_maker", "renpy", "defold", "phaser", "love2d",
    "nano_banana", "tripo", "rodin", "midjourney", "photoshop", "gimp", "clip_studio_paint", "magicavoxel",
    "kling", "opentoonz", "moho", "rive",
    "runway",
    "fl_studio", "lmms", "bosca_ceoil", "chiptone",
    "claude_code", "cline", "aider",
  ];
  const ids = new Set(TOOL_CATALOG.map((t) => t.id));
  for (const id of expected) assert.ok(ids.has(id), `missing new tool ${id}`);
  assert.equal(ids.has("leonardo_ai"), true); // dedupe: must not be duplicated
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/indexer.test.ts`
Expected: FAIL — new tool ids missing.

- [ ] **Step 3: Add the tool entries**

Append the 28 entries to `toolCatalog.json`. Each MUST be fully field-complete and factually grounded in the spec's research (verified 2026-06-18). Example shape (write real values per tool, not placeholders):

```json
{
  "id": "gamemaker",
  "name": "GameMaker",
  "categories": ["game_engine"],
  "description": "2D-first game engine with the GML scripting language and a visual drag-and-drop layer, used to ship Undertale, Hotline Miami and Hyper Light Drifter.",
  "bestUseCase": "2D platformers, pixel-art adventures and arcade games.",
  "toolNature": "traditional",
  "learningCurve": "low",
  "engineCompatibility": ["any"],
  "pricing": "freemium",
  "difficultyLevel": "beginner",
  "beginnerSuitability": 85,
  "supportedPlatforms": ["pc", "mobile", "web", "console"],
  "pros": ["Fast 2D workflow", "Drag-and-drop plus GML", "Proven indie hits", "Strong export targets"],
  "cons": ["Limited 3D", "Paid tiers for commercial export"],
  "website": "https://gamemaker.io"
}
```

For AI tools set `"toolNature": "ai"`; for `engineCompatibility` use `["any"]` for standalone asset/audio/AI tools, and the specific engine(s) only when the tool plugs directly into one (e.g. `unity_vfx_graph`-style). Keep descriptions ~100–160 chars to match existing entries.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/indexer.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify catalog validates and has unique ids**

Run: `pnpm --filter @workspace/api-server exec tsx -e "import('./src/lib/catalog.js').then(m => console.log('ok', m.TOOL_CATALOG.length))"`
Expected: prints `ok 59`. (If a duplicate id slipped in, `lib/catalog.ts` throws `duplicate tool id`.)

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/data/toolCatalog.json artifacts/api-server/src/lib/rag/indexer.test.ts
git commit -m "data: broaden tool catalog with 28 usability-filtered AI and traditional tools"
```

---

## Task 3: Enrich indexed documents (content + scalar metadata)

**Files:**
- Modify: `artifacts/api-server/src/lib/rag/indexer.ts:12-49` (`toolDocuments`)
- Test: `artifacts/api-server/src/lib/rag/indexer.test.ts`

**Interfaces:**
- Consumes: `ToolEntry` fields incl. `pricing`, `supportedPlatforms`, `beginnerSuitability`, `difficultyLevel`.
- Produces: each tool `Document` gains, in `metadata`, the scalar booleans `platform_pc`, `platform_mobile`, `platform_web`, `platform_console`, `platform_vr`, `platform_ar`, plus `beginnerSuitability` (number) and `difficultyLevel` (string); and its `pageContent` includes lines `Pricing: <pricing>`, `Platforms: <comma list>`, `Beginner suitability: <n>/100`. `toolDocuments(catalog?)` signature is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `artifacts/api-server/src/lib/rag/indexer.test.ts`:

```typescript
test("tool documents carry platform flags and enriched content", () => {
  const blender = toolDocuments().find((d) => d.metadata.toolId === "blender");
  assert.ok(blender);
  assert.equal(blender!.metadata.platform_pc, true);
  assert.equal(typeof blender!.metadata.beginnerSuitability, "number");
  assert.equal(typeof blender!.metadata.difficultyLevel, "string");
  assert.match(blender!.pageContent, /Platforms:/);
  assert.match(blender!.pageContent, /Beginner suitability:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/indexer.test.ts`
Expected: FAIL — `platform_pc` undefined / content missing.

- [ ] **Step 3: Implement enrichment**

In `indexer.ts` `toolDocuments`, extend the `pageContent` array and `metadata` object:

```typescript
const PLATFORM_KEYS = ["pc", "mobile", "web", "console", "vr", "ar"] as const;

// inside the loop, after building the existing pageContent lines:
const pageContent = [
  t.name,
  t.description,
  `Best use case: ${t.bestUseCase}`,
  `Pros: ${t.pros.join(", ")}`,
  `Cons: ${t.cons.join(", ")}`,
  `Pricing: ${t.pricing}`,
  `Platforms: ${t.supportedPlatforms.join(", ")}`,
  `Beginner suitability: ${t.beginnerSuitability}/100`,
  `Nature: ${t.toolNature}`,
  `Learning curve: ${t.learningCurve}`,
].join("\n");

const platforms = new Set(t.supportedPlatforms);
const platformFlags = Object.fromEntries(
  PLATFORM_KEYS.map((p) => [`platform_${p}`, platforms.has(p)]),
);

// in the Document metadata, spread the flags and add the two scalars:
metadata: {
  type: "tool",
  toolId: t.id,
  name: t.name,
  category,
  toolNature: t.toolNature,
  pricing: t.pricing,
  learningCurve: t.learningCurve,
  difficultyLevel: t.difficultyLevel,
  beginnerSuitability: t.beginnerSuitability,
  engine_unity: compat.has("Unity"),
  engine_unreal: compat.has("Unreal"),
  engine_godot: compat.has("Godot"),
  engine_any: compat.has("any"),
  ...platformFlags,
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/indexer.test.ts`
Expected: PASS (all indexer tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/rag/indexer.ts artifacts/api-server/src/lib/rag/indexer.test.ts
git commit -m "feat: enrich indexed tool docs with platform flags and pricing/beginner content"
```

---

## Task 4: Hand-rolled BM25 + RRF fusion module

**Files:**
- Create: `artifacts/api-server/src/lib/rag/bm25.ts`
- Test: `artifacts/api-server/src/lib/rag/bm25.test.ts`
- Modify: `artifacts/api-server/package.json` (add test file to `test` script)

**Interfaces:**
- Consumes: nothing (pure functions over plain strings/objects).
- Produces:
  - `tokenize(text: string): string[]` — lowercased word tokens.
  - `type Bm25Doc = { id: string; text: string }`.
  - `buildBm25(docs: Bm25Doc[]): Bm25Index` — `Bm25Index` has `search(query: string, k: number): Array<{ id: string; score: number }>` returning highest score first.
  - `rrfFuse(rankings: string[][], k?: number): string[]` — fuses ordered id-lists (best-first) via Reciprocal Rank Fusion (`score += 1/(k + rank)`, default `k = 60`, `rank` 0-based), returns a single best-first id list, deduped.

- [ ] **Step 1: Write the failing tests**

Create `artifacts/api-server/src/lib/rag/bm25.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { tokenize, buildBm25, rrfFuse } from "./bm25.js";

test("tokenize lowercases and splits on non-word characters", () => {
  assert.deepEqual(tokenize("Pixel-Art, Sprite!"), ["pixel", "art", "sprite"]);
});

test("bm25 ranks the doc containing the query term first", () => {
  const idx = buildBm25([
    { id: "aseprite", text: "pixel art sprite animation tool" },
    { id: "fmod", text: "audio middleware sound engine" },
    { id: "blender", text: "3d modeling sculpting animation" },
  ]);
  const hits = idx.search("pixel art", 3);
  assert.equal(hits[0].id, "aseprite");
});

test("bm25 returns at most k results", () => {
  const idx = buildBm25([
    { id: "a", text: "alpha" },
    { id: "b", text: "alpha beta" },
    { id: "c", text: "alpha beta gamma" },
  ]);
  assert.equal(idx.search("alpha", 2).length, 2);
});

test("rrfFuse ranks an id appearing high in both lists above one in a single list", () => {
  const fused = rrfFuse([
    ["x", "y", "z"],
    ["y", "x", "w"],
  ]);
  // y is rank0+rank1, x is rank1+rank0 — both beat z and w which appear once.
  assert.deepEqual(fused.slice(0, 2).sort(), ["x", "y"]);
  assert.ok(fused.indexOf("z") > 1 && fused.indexOf("w") > 1);
});

test("rrfFuse dedupes ids", () => {
  const fused = rrfFuse([["a", "b"], ["a", "b"]]);
  assert.deepEqual([...fused].sort(), ["a", "b"]);
});
```

- [ ] **Step 2: Register the test file**

In `artifacts/api-server/package.json`, add `src/lib/rag/bm25.test.ts` to the space-separated file list of the `test` script (after `indexer.test.ts`).

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/bm25.test.ts`
Expected: FAIL — `Cannot find module './bm25.js'`.

- [ ] **Step 4: Implement `bm25.ts`**

Create `artifacts/api-server/src/lib/rag/bm25.ts`:

```typescript
// Hand-rolled Okapi BM25 over a tiny in-memory corpus (~60 tool docs).
// No external dependency — corpus is small enough that a naive implementation
// is sub-millisecond, and this avoids the package release-age policy.

const K1 = 1.5;
const B = 0.75;
const RRF_K = 60;

export interface Bm25Doc {
  id: string;
  text: string;
}

export interface Bm25Index {
  search(query: string, k: number): Array<{ id: string; score: number }>;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function buildBm25(docs: Bm25Doc[]): Bm25Index {
  const tokenized = docs.map((d) => ({ id: d.id, terms: tokenize(d.text) }));
  const docLen = tokenized.map((d) => d.terms.length);
  const avgLen = docLen.reduce((a, b) => a + b, 0) / (docLen.length || 1);
  const df = new Map<string, number>();
  for (const d of tokenized) {
    for (const term of new Set(d.terms)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const N = tokenized.length;
  const tf = tokenized.map((d) => {
    const counts = new Map<string, number>();
    for (const term of d.terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    return counts;
  });

  function idf(term: string): number {
    const n = df.get(term) ?? 0;
    // BM25+ style smoothing keeps idf non-negative.
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  }

  return {
    search(query, k) {
      const qTerms = [...new Set(tokenize(query))];
      const scored = tokenized.map((d, i) => {
        let score = 0;
        for (const term of qTerms) {
          const f = tf[i].get(term) ?? 0;
          if (f === 0) continue;
          const denom = f + K1 * (1 - B + (B * docLen[i]) / (avgLen || 1));
          score += idf(term) * ((f * (K1 + 1)) / denom);
        }
        return { id: d.id, score };
      });
      return scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}

export function rrfFuse(rankings: string[][], k = RRF_K): string[] {
  const scores = new Map<string, number>();
  for (const list of rankings) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/bm25.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/lib/rag/bm25.ts artifacts/api-server/src/lib/rag/bm25.test.ts artifacts/api-server/package.json
git commit -m "feat: add hand-rolled BM25 index and RRF fusion for hybrid retrieval"
```

---

## Task 5: Fuse BM25 + vector search in the retriever

**Files:**
- Modify: `artifacts/api-server/src/lib/rag/retriever.ts`
- Test: `artifacts/api-server/src/lib/rag/retriever.test.ts`

**Interfaces:**
- Consumes: `buildBm25`, `rrfFuse`, `Bm25Doc` from `./bm25.js`; `toolDocuments` from `./indexer.js`; `getVectorStore().similaritySearch` from `./vectorStore.js`.
- Produces: a module-level helper `bm25ForFilter(predicate: (meta: Record<string, unknown>) => boolean): Bm25Index` that builds a BM25 index from `toolDocuments()` filtered by the same predicate logic as the Chroma `where`; and an internal `hybridToolSearch(query, k, where, predicate)` that runs vector search + BM25, fuses ids via `rrfFuse`, and returns the top-k tool `Document`s in fused order. `retrieveForCategory` / `retrieveEngineDocs` return shapes are UNCHANGED (`RetrievedCandidates`).

- [ ] **Step 1: Write the failing test**

Add to `artifacts/api-server/src/lib/rag/retriever.test.ts`:

```typescript
import { metadataMatchesWhere, fuseToolDocs } from "./retriever.js";
import { Document } from "@langchain/core/documents";

test("metadataMatchesWhere enforces category and engine OR-any", () => {
  const meta = { type: "tool", category: "art_asset", engine_unity: false, engine_any: true };
  assert.equal(metadataMatchesWhere(meta, "art_asset", "Unity"), true);
  const metaNo = { type: "tool", category: "art_asset", engine_unity: false, engine_any: false };
  assert.equal(metadataMatchesWhere(metaNo, "art_asset", "Unity"), false);
  assert.equal(metadataMatchesWhere(meta, "audio", "Unity"), false);
});

test("fuseToolDocs orders by RRF of vector and bm25 id lists", () => {
  const mk = (id: string) => new Document({ id, pageContent: id, metadata: { toolId: id } });
  const vector = [mk("a"), mk("b"), mk("c")];
  const bm25Ids = ["b", "a"];
  const fused = fuseToolDocs(vector, bm25Ids, 3);
  // 'b' is rank0 in bm25 and rank1 in vector; 'a' is rank1 bm25, rank0 vector — both beat 'c'.
  assert.deepEqual(fused.slice(0, 2).map((d) => d.metadata.toolId).sort(), ["a", "b"]);
  assert.equal(fused[2].metadata.toolId, "c");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/retriever.test.ts`
Expected: FAIL — `metadataMatchesWhere` / `fuseToolDocs` not exported.

- [ ] **Step 3: Implement fusion + filter parity in `retriever.ts`**

Add these exports and rewire the two tool searches. Keep the existing `toolWhereForCategory`, `guidanceWhere`, `engineFlagKey` and the guidance search untouched.

```typescript
import { buildBm25, rrfFuse, type Bm25Index } from "./bm25.js";
import { toolDocuments } from "./indexer.js";

// Predicate mirror of toolWhereForCategory, used to scope the in-memory BM25
// corpus to the SAME subspace Chroma's `where` filters to.
export function metadataMatchesWhere(
  meta: Record<string, unknown>,
  category: Category,
  picked?: EngineName,
): boolean {
  if (meta.type !== "tool") return false;
  if (meta.category !== category) return false;
  if (!picked) return true;
  const flag = engineFlagKey(picked);
  return meta[flag] === true || meta.engine_any === true;
}

function bm25ForCategory(category: Category, picked?: EngineName): Bm25Index {
  const docs = toolDocuments()
    .filter((d) => metadataMatchesWhere(d.metadata as Record<string, unknown>, category, picked))
    .map((d) => ({ id: d.metadata.toolId as string, text: d.pageContent }));
  return buildBm25(docs);
}

// Fuse a vector-ranked Document list with a BM25-ranked id list via RRF,
// returning the top-k Documents in fused order (vector docs are the payload
// source; bm25 only contributes ranking signal).
export function fuseToolDocs(vectorDocs: Document[], bm25Ids: string[], k: number): Document[] {
  const vectorIds = vectorDocs.map((d) => d.metadata.toolId as string);
  const byId = new Map(vectorDocs.map((d) => [d.metadata.toolId as string, d]));
  const fusedIds = rrfFuse([vectorIds, bm25Ids]);
  const ordered: Document[] = [];
  for (const id of fusedIds) {
    const doc = byId.get(id);
    if (doc && !ordered.includes(doc)) ordered.push(doc);
    if (ordered.length >= k) break;
  }
  return ordered;
}
```

Then update the tool searches to fuse. Replace the body of `retrieveForCategory` and the tool branch of `retrieveEngineDocs`:

```typescript
export async function retrieveForCategory(query: string, category: Category, picked: EngineName): Promise<RetrievedCandidates> {
  const [vectorDocs, guidanceDocs] = await Promise.all([
    search(query, TOOL_K, toolWhereForCategory(category, picked)),
    search(query, GUIDANCE_K, guidanceWhere()),
  ]);
  const bm25Ids = bm25ForCategory(category, picked).search(query, TOOL_K).map((h) => h.id);
  const toolDocs = fuseToolDocs(vectorDocs, bm25Ids, TOOL_K);
  return { toolDocs, guidanceDocs, toolIds: uniqueToolIds(toolDocs) };
}

export async function retrieveEngineDocs(query: string): Promise<RetrievedCandidates> {
  const [vectorDocs, guidanceDocs] = await Promise.all([
    search(query, 3, toolWhereForCategory("game_engine")),
    search(query, 1, guidanceWhere("choosing-engine-unity-unreal-godot")),
  ]);
  const bm25Ids = bm25ForCategory("game_engine").search(query, 3).map((h) => h.id);
  const toolDocs = fuseToolDocs(vectorDocs, bm25Ids, 3);
  return { toolDocs, guidanceDocs, toolIds: uniqueToolIds(toolDocs) };
}
```

Add the `Document` type import if not present: `import { Document } from "@langchain/core/documents";` (replace the existing type-only import).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/lib/rag/retriever.test.ts`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/rag/retriever.ts artifacts/api-server/src/lib/rag/retriever.test.ts
git commit -m "feat: fuse BM25 and vector retrieval via RRF under shared metadata filters"
```

---

## Task 6: Harden recommendation prompt grounding

**Files:**
- Modify: `artifacts/api-server/src/agent/prompts/advisorPrompts.ts:100-108` (`categorySystemPrompt`)
- Modify: `artifacts/api-server/src/agent/steps/recommendCategory.ts:60-69` (`formatCandidates`)
- Test: `artifacts/api-server/src/agent/steps/recommendCategory.test.ts`

**Interfaces:**
- Consumes: `toolDocs`/`guidanceDocs` Document arrays.
- Produces: `formatCandidates` returns candidate blocks separated by a line of `---`, each block fully labeled (toolId + the doc's pageContent lines, untruncated); `categorySystemPrompt` includes an explicit anti-fabrication instruction. `formatCandidates` becomes an exported function for testing.

- [ ] **Step 1: Write the failing test**

Add to `artifacts/api-server/src/agent/steps/recommendCategory.test.ts`:

```typescript
import { formatCandidates } from "./recommendCategory.js";
import { categorySystemPrompt } from "../prompts/advisorPrompts.js";

test("formatCandidates separates candidates with --- and keeps full content", () => {
  const out = formatCandidates(
    [
      { metadata: { toolId: "aseprite" }, pageContent: "Aseprite\nPixel art tool\nPricing: paid" },
      { metadata: { toolId: "krita" }, pageContent: "Krita\nDigital painting\nPricing: open_source" },
    ],
    [{ pageContent: "Guidance text" }],
  );
  assert.match(out, /---/);
  assert.match(out, /aseprite/);
  assert.match(out, /krita/);
  assert.match(out, /Pricing: paid/);
});

test("categorySystemPrompt forbids fabricating attributes", () => {
  const p = categorySystemPrompt("art_asset");
  assert.match(p, /only/i);
  assert.match(p, /not invent|do not invent|don't invent/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/agent/steps/recommendCategory.test.ts`
Expected: FAIL — `formatCandidates` not exported / prompt lacks the rule.

- [ ] **Step 3: Update the system prompt**

In `advisorPrompts.ts`, replace `categorySystemPrompt`'s array with:

```typescript
export function categorySystemPrompt(category: string): string {
  return [
    `You recommend tools for the "${category}" category of a game project.`,
    "Choose ONE primary tool and up to 2 alternatives, ONLY from the provided candidates.",
    "Use ONLY the pros, cons, pricing, platforms and facts present in each candidate's text.",
    "Do NOT invent capabilities, prices, or platform support that are not shown in the candidate text.",
    "If the candidates are insufficient for a confident pick, say so in your reasoning rather than fabricating.",
    "Apply the AI-vs-traditional rule: when skill/art capability is low and budget is tight,",
    "prefer ai / low-learning-curve tools (e.g. Meshy) over high-curve standalone tools (e.g. Blender), and say why.",
    "Answer in English.",
  ].join("\n");
}
```

- [ ] **Step 4: Update `formatCandidates` and export it**

In `recommendCategory.ts`, change `formatCandidates` to be exported and use `---` separators with untruncated content:

```typescript
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

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/agent/steps/recommendCategory.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/agent/prompts/advisorPrompts.ts artifacts/api-server/src/agent/steps/recommendCategory.ts artifacts/api-server/src/agent/steps/recommendCategory.test.ts
git commit -m "feat: harden category prompt grounding and candidate formatting"
```

---

## Task 7: Gold-set eval harness (Recall@K / Precision@K / MRR)

**Files:**
- Create: `artifacts/api-server/src/data/eval/goldset.json`
- Modify: `artifacts/api-server/src/scripts/ragEval.ts`

**Interfaces:**
- Consumes: `retrieveForCategory`, `retrieveEngineDocs` from `../lib/rag/retriever.js`; `Category`, `EngineName` from `../types/catalog.js`.
- Produces: a runnable script that, for each gold case, retrieves `toolIds` and computes Recall@K, Precision@K, MRR against `relevantToolIds`; prints a per-case table and aggregate means; exits non-zero if mean MRR < `MRR_FLOOR` (0.5).

- [ ] **Step 1: Create the gold set**

Create `artifacts/api-server/src/data/eval/goldset.json` with ~12 cases. Each case: `{ "name", "query", "category", "picked"?, "relevantToolIds": [...] }`. `category: "game_engine"` cases omit `picked` and use the engine retriever. Use real catalog ids. Example:

```json
[
  { "name": "weak art + low budget 3D models", "query": "weak art skills, low budget, wants good-looking 3D models", "category": "art_asset", "picked": "Unity", "relevantToolIds": ["meshy", "tripo"] },
  { "name": "free pixel art editor", "query": "free pixel art sprite editor for a 2D game", "category": "art_asset", "picked": "Godot", "relevantToolIds": ["aseprite", "krita"] },
  { "name": "lightweight 2D engine for beginner", "query": "lightweight open-source 2D pixel game, beginner solo dev", "category": "game_engine", "relevantToolIds": ["godot", "gamemaker"] },
  { "name": "visual novel engine", "query": "narrative visual novel with branching dialogue", "category": "game_engine", "relevantToolIds": ["renpy"] },
  { "name": "AI image generation for textures", "query": "generate concept art and textures with AI", "category": "art_asset", "picked": "Unity", "relevantToolIds": ["nano_banana", "midjourney", "leonardo_ai"] },
  { "name": "retro chiptune sfx", "query": "make retro 8-bit chiptune sound effects for free", "category": "audio", "picked": "Godot", "relevantToolIds": ["bfxr", "chiptone"] },
  { "name": "free DAW for music", "query": "free digital audio workstation to compose game music", "category": "audio", "picked": "Unity", "relevantToolIds": ["lmms", "reaper"] },
  { "name": "skeletal 2D animation", "query": "skeletal rig 2D character animation for a game", "category": "animation", "picked": "Unity", "relevantToolIds": ["spine", "moho"] },
  { "name": "AI video cutscene", "query": "generate an AI video cutscene from an image", "category": "animation", "picked": "Unreal", "relevantToolIds": ["kling"] },
  { "name": "AI coding assistant in terminal", "query": "AI coding assistant that works in the terminal", "category": "ai_coding", "picked": "Godot", "relevantToolIds": ["claude_code", "aider"] },
  { "name": "AI pair programmer in editor", "query": "AI autocomplete and chat inside my editor", "category": "ai_coding", "picked": "Unity", "relevantToolIds": ["github_copilot", "cursor", "cline"] },
  { "name": "vfx particle effects", "query": "real-time particle and visual effects in the engine", "category": "vfx", "picked": "Unreal", "relevantToolIds": ["niagara_ue5"] }
]
```

- [ ] **Step 2: Rewrite `ragEval.ts`**

Replace the file with the metric harness:

```typescript
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { retrieveEngineDocs, retrieveForCategory } from "../lib/rag/retriever.js";
import type { Category, EngineName } from "../types/catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MRR_FLOOR = 0.5;
const K = 5;

interface GoldCase {
  name: string;
  query: string;
  category: Category;
  picked?: EngineName;
  relevantToolIds: string[];
}

function loadCases(): GoldCase[] {
  return JSON.parse(readFileSync(resolve(__dirname, "../data/eval/goldset.json"), "utf8"));
}

async function retrieve(c: GoldCase): Promise<string[]> {
  if (c.category === "game_engine") return (await retrieveEngineDocs(c.query)).toolIds;
  if (!c.picked) throw new Error(`case "${c.name}" needs a picked engine`);
  return (await retrieveForCategory(c.query, c.category, c.picked)).toolIds;
}

function metrics(retrieved: string[], relevant: string[]) {
  const topK = retrieved.slice(0, K);
  const rel = new Set(relevant);
  const hits = topK.filter((id) => rel.has(id)).length;
  const recall = relevant.length ? hits / relevant.length : 0;
  const precision = topK.length ? hits / topK.length : 0;
  const firstRank = topK.findIndex((id) => rel.has(id));
  const rr = firstRank === -1 ? 0 : 1 / (firstRank + 1);
  return { recall, precision, rr };
}

async function main(): Promise<void> {
  const cases = loadCases();
  let sumR = 0, sumP = 0, sumRR = 0;
  console.log(`name`.padEnd(38), "R@K", "P@K", "MRR", "retrieved");
  for (const c of cases) {
    const ids = await retrieve(c);
    const { recall, precision, rr } = metrics(ids, c.relevantToolIds);
    sumR += recall; sumP += precision; sumRR += rr;
    console.log(
      c.name.padEnd(38),
      recall.toFixed(2), precision.toFixed(2), rr.toFixed(2),
      `[${ids.slice(0, K).join(", ")}]`,
    );
  }
  const n = cases.length || 1;
  const meanRR = sumRR / n;
  console.log("\n--- aggregate ---");
  console.log(`Recall@${K}: ${(sumR / n).toFixed(3)}  Precision@${K}: ${(sumP / n).toFixed(3)}  MRR: ${meanRR.toFixed(3)}`);
  if (meanRR < MRR_FLOOR) {
    console.error(`FAIL: MRR ${meanRR.toFixed(3)} below floor ${MRR_FLOOR}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/data/eval/goldset.json artifacts/api-server/src/scripts/ragEval.ts
git commit -m "feat: add gold-set RAG eval harness with Recall@K, Precision@K and MRR"
```

> Note: this script runs against live Chroma + OpenAI — it is exercised in Task 8 after the index is rebuilt, not in this task's commit step (no API/Docker assumed mid-plan).

---

## Task 8: Rebuild index and verify end-to-end

**Files:** none (operational verification).

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a rebuilt Chroma collection reflecting the broadened, enriched catalog, and a passing eval run.

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm --filter @workspace/api-server run test`
Expected: all test files PASS (catalog, indexer, retriever, bm25, scoring, feasibility, pickEngineRag, recommendCategory, scoreStack).

- [ ] **Step 2: Typecheck the whole workspace**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 3: Boot services and rebuild the index**

Run: `docker compose up -d mysql chroma`
Then: `pnpm --filter @workspace/api-server run rag:index`
Expected: prints `Indexed <N> tool docs + <M> guidance docs into Chroma.` where N reflects the broadened catalog (tool×category docs).

- [ ] **Step 4: Run the eval harness**

Run: `pnpm --filter @workspace/api-server run rag:eval`
Expected: per-case table prints; aggregate `MRR` ≥ 0.5 (no `FAIL` line, exit 0). If below floor, inspect which cases scored `rr=0.00`, adjust the offending `relevantToolIds` only if the gold label is genuinely wrong (do NOT relax the floor to pass).

- [ ] **Step 5: Run the live pipeline integration test**

Run: `pnpm --filter @workspace/api-server exec tsx --test src/agent/advisorPipeline.integration.test.ts`
Expected: PASS — the advisor pipeline still completes against the enriched index.

- [ ] **Step 6: Commit any gold-label corrections (if Step 4 required them)**

```bash
git add artifacts/api-server/src/data/eval/goldset.json
git commit -m "test: correct gold-set labels after live eval"
```

---

## Self-Review

**Spec coverage:**
- Workstream 1 (hybrid BM25+RRF) → Tasks 4, 5. ✅
- Workstream 2 (prompt grounding) → Task 6. ✅
- Workstream 3 (eval metrics) → Task 7 (+ run in Task 8). ✅
- Workstream 4 (metadata/content enrichment + platform data fix) → Tasks 1, 3. ✅
- Workstream 5 (catalog broadening) → Task 2. ✅
- Workstream 6 (index rebuild) → Task 8. ✅
- Skips (chunking, reranking, agentic, taxonomy change) → none implemented. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code; the one JSON "example shape" in Task 2 is explicitly labeled as a template with real-values instruction, and the gold set in Task 7 is complete. ✅

**Type consistency:** `buildBm25`/`rrfFuse`/`tokenize`/`Bm25Index`/`Bm25Doc` defined in Task 4 are consumed with matching signatures in Task 5. `metadataMatchesWhere`/`fuseToolDocs`/`formatCandidates` defined and consumed consistently. `toolDocuments` signature unchanged across Tasks 3/5. Platform flag keys (`platform_pc`…) consistent between Tasks 3 and the eval/retriever logic. ✅
