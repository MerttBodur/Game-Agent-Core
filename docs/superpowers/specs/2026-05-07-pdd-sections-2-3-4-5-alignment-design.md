# PDD Sections 2/3/4/5 Alignment Design

- Date: 2026-05-07
- Status: Draft (awaiting user review)
- Scope: Bring the existing repository in line with PDD.md Sections 2 (Tool Information), 3 (AI Implementation), 4 (Vectorless Reasoning-Based RAG), and 5 (API & Backend).
- Reference: PageIndex tree-of-contents pattern (https://github.com/VectifyAI/PageIndex)

---

## 1. Goal

Eliminate every literal contradiction between the codebase and PDD §2/§3/§4/§5. After this work the repo must:

- carry the full Section 2 tool entry model on every tool record;
- retrieve through a **vectorless, LLM-driven tree-of-contents** (PageIndex pattern) — no embeddings, no pgvector, no semantic similarity;
- expose an explicit **trust score** that can terminate the pipeline below threshold;
- run on **MySQL** (Docker for local dev) with the folder layout PDD §5 prescribes;
- return Section 3 / Section 5 compliant analysis output, including phase mapping per recommendation and explicit RAG fallback status.

## 2. Non-goals (out of scope here)

- Section 1 (frontend) changes — separate spec.
- Authentication / admin panels.
- Test suite uplift (repo has none today; PDD doesn't require one).
- Production hosting decisions beyond "managed cloud MySQL eventually" — local Docker is the documented dev path.
- Speculative abstractions (interfaces with one impl, retry/timeout frameworks, custom error taxonomies).

## 3. Contradictions inventory

| # | Where | Repo today | PDD requirement | Severity |
|---|---|---|---|---|
| C1 | `lib/rag/embeddings.ts`, `vectorStore.ts`, `retriever.ts`, `seedRag.ts`, `knowledgeChunks.ts` | OpenAI embeddings + pgvector + cosine similarity | §3, §4: no embeddings, no vector DB, no semantic similarity; vectorless tree navigation | Critical |
| C2 | `lib/db` Drizzle Postgres + Neon | PostgreSQL | §5: MySQL | Critical |
| C3 | `gameDevTools.ts` 16 categories incl. `ai_tooling`, `programming` (no `ide`) | 7 PDD MVP categories incl. `ide` and `ai_coding_assistant` | §2 | Major |
| C4 | `GameDevTool` missing fields: Difficulty Level, Beginner Suitability (0–100), Team-Size Fit, Genre Fit, 2D/3D Fit, Alternatives, Phase | All mandatory per §2 | §2 | Major |
| C5 | No explicit trust score; `ideaScoreTier: pass/warn/block` exists but isn't surfaced as a numeric trust value or persistence gate | Trust score 0–100, terminates pipeline below threshold, blocks persistence | §3, §5 | Major |
| C6 | No `phase` on tool records nor in `CategoryRecommendation` output | §3 recommendation output and §2 phase mapping require it | §2, §3 | Major |
| C7 | RAG layer silently degrades on failure; no fallback signal | §4: explicit `fallbackStatus` + `confidence` in retrieval package | §4 | Major |
| C8 | `src/{routes,lib,middleware,scripts}` only | `routes/controllers/services/orchestrators/middleware/data/utils/types` | §5 | Minor |
| C9 | `pricing` enum `[free, freemium, paid, subscription, open_source]` | §2 also lists `revenue_share`, `enterprise` | §2 | Minor |
| C10 | Pipeline order: scoring then RAG augment | §5: validation → orchestrator → RAG retrieval → AI reasoning → tool matching → trust → response | §5 | Minor |

## 4. Target architecture

### 4.1 Tool catalog data model (§2)

The single source of truth becomes a static JSON file: `artifacts/api-server/src/data/toolCatalog.json` (PDD §5 explicitly mandates static JSON). The TypeScript module `gameDevTools.ts` is reduced to a typed loader that reads and validates this JSON at boot.

Tool entry schema (TypeScript + Zod mirror):

```ts
type Phase =
  | "planning"
  | "programming"
  | "version_control"
  | "art_assets"
  | "audio"
  | "deployment_publishing";

type Pricing =
  | "free" | "open_source" | "freemium" | "paid"
  | "subscription" | "revenue_share" | "enterprise";

type DifficultyLevel = "beginner" | "intermediate" | "advanced";

type Fit2D3D = "2d" | "3d" | "both";

type TeamSizeFit = "solo" | "small" | "medium" | "large";

interface ToolEntry {
  id: string;                       // stable slug, e.g. "unity"
  name: string;                     // §2 Tool Name
  category: PddCategory;            // §2 Category — see 4.1.1
  description: string;              // §2 Description (short, retrieval-friendly)
  bestUseCase: string;              // §2 Best Use Case (single statement)
  supportedPlatforms: Platform[];   // §2 Supported Platforms
  pricing: Pricing;                 // §2 Pricing
  difficultyLevel: DifficultyLevel; // §2 Difficulty Level (tool intrinsic)
  beginnerSuitability: number;      // §2 0–100
  teamSizeFit: TeamSizeFit[];       // §2 Team-Size Fit (multi)
  genreFit: Genre[];                // §2 Genre Fit (multi)
  fit2d3d: Fit2D3D;                 // §2 2D/3D Fit
  pros: string[];                   // §2 Pros
  cons: string[];                   // §2 Cons
  alternatives: string[];           // §2 Alternatives — array of tool ids, ≥1 required
  phase: Phase[];                   // §2 + §3 phase mapping (multi)
  website?: string;
}
```

#### 4.1.1 Category set

The repo collapses to PDD's 7 MVP categories:

```
game_engine, ide, version_control, art_asset_creation,
audio, ai_coding_assistant, deployment_publishing
```

Migration of existing 16 categories:

| Existing | Target |
|---|---|
| `engine` | `game_engine` |
| `programming` (IDE-like rows) | `ide` |
| `programming` (other rows) | distribute to `game_engine` / drop if non-MVP |
| `art`, `animation`, `ui`, `vfx` | `art_asset_creation` (subtype kept as `subcategory` field — see below) |
| `audio` | `audio` |
| `ai_tooling` | `ai_coding_assistant` (drop non-coding AI rows or move to `art_asset_creation` if asset-gen) |
| `version_control` | `version_control` |
| `deployment` | `deployment_publishing` |
| `networking`, `backend_services`, `monetization`, `analytics`, `narrative`, `build_ci` | Removed from MVP catalog (§2 explicitly limits MVP to 7 categories; PDD allows future expansion but not in MVP) |

To preserve information without breaking PDD's 7-category rule, an optional `subcategory: string` field is allowed for retrieval hinting (e.g. `subcategory: "animation"` under `art_asset_creation`). It is metadata only — it does not appear in PDD-mandated category lists or scoring.

#### 4.1.2 Fields removed

`ecosystem`, `popularityByArchetype`, `archetypeBias`, `tags`, `bestFor[]`, `strengths`, `weaknesses`, `minSkillLevel` are removed from the canonical entry. Their information is folded as follows:
- `strengths` → `pros`
- `weaknesses` → `cons`
- `bestFor[]` → first item becomes `bestUseCase`; remainder dropped
- `minSkillLevel` → not the same concept as §2 `difficultyLevel`; new `difficultyLevel` is authored fresh
- `tags`, `ecosystem`, `popularity*`, `archetypeBias` → removed; tree-of-contents retrieval replaces tag-based filtering

### 4.2 Tree-of-contents index (§4, PageIndex pattern)

A static JSON tree built from the tool catalog at build time, written to `artifacts/api-server/src/data/toolTree.json`.

Node shape (PageIndex-aligned):

```json
{
  "node_id": "root",
  "title": "Game Development Tools",
  "summary": "Top-level catalog covering 7 MVP categories.",
  "nodes": [
    {
      "node_id": "cat.game_engine",
      "title": "Game Engine",
      "summary": "Core engines for 2D/3D production. Highest weight in scoring.",
      "nodes": [
        {
          "node_id": "tool.unity",
          "title": "Unity",
          "summary": "Cross-platform 2D/3D engine; freemium; beginner-suitable; broad genre fit.",
          "ref": { "toolId": "unity" }
        }
      ]
    }
  ]
}
```

- Two levels deep: `root → category → tool`. No tool-level children for MVP (PDD §4 calls the structure "hierarchical" but doesn't mandate depth; deeper nesting is YAGNI).
- `summary` is generated **offline** from the tool entry (`description` + key fits) at catalog-build time — no LLM call to generate it; deterministic. This avoids §3's hallucination concern and keeps the tree reproducible.
- Tree is regenerated by a single script (`pnpm --filter @workspace/api-server run tree:build`) which replaces `rag:seed`.

### 4.3 Vectorless retrieval pipeline (§4)

New module: `artifacts/api-server/src/lib/rag/treeNavigator.ts`. Old `rag/{embeddings,vectorStore,retriever,documents,documentIds}.ts` and the `seedRag` script are deleted along with the `knowledge_chunks` schema.

Retrieval call signature:

```ts
async function retrieveContext(
  inputs: ProjectInputs,            // structured frontend signals + free-text idea
  tree: ToolTree,                   // loaded from toolTree.json at boot
): Promise<RetrievedContextPackage>;
```

Output (mirrors §4 §"Retrieved Context Package"):

```ts
interface RetrievedContextPackage {
  relevantCategories: PddCategory[];       // chosen branches
  candidateTools: { toolId: string; nodePath: string; fitNote: string }[];
  rejectedTools: { toolId: string; reason: string }[];
  missingInformationNotes: string[];
  retrievalConfidence: number;             // 0–100
  fallbackStatus: "ok" | "weak_coverage" | "ambiguous_input" | "missing_domain";
}
```

Algorithm (single LLM call, structured output via `response_format: json_schema`):

1. **Stage 1 — top-level branch selection.** Build a prompt containing: PDD's 7 category names + 1-line summaries pulled from the tree's category nodes + the structured `ProjectInputs` + the free-text idea. Ask the LLM to return relevant categories and which to skip, with a one-line reason each.
2. **Stage 2 — candidate selection.** For each selected category branch, include all tool nodes (id, title, summary). Ask the LLM to mark each as `strong | conditional | weak | reject` with a short fit note. Output is constrained by JSON schema; only `toolId`s present in the tree are accepted (post-validation strips fabricated ids → contributes to `fallbackStatus`).
3. **Stage 3 — package assembly.** Deterministic code merges Stage 1 + Stage 2, computes `retrievalConfidence` from coverage (categories selected vs PDD priority list), and sets `fallbackStatus` from the rules below.

Anti-overengineering note: stages 1+2 may be merged into a single LLM call if the prompt fits comfortably (it does for 7 categories × ~5 tools each). The spec authorises this single-call implementation.

Fallback rules (deterministic, post-LLM):
- `weak_coverage` — any of `game_engine`, `ide`, `version_control` is empty after retrieval.
- `ambiguous_input` — free-text idea < 10 words AND fewer than 3 structured signals provided.
- `missing_domain` — LLM returned a category not in the catalog OR fabricated a `toolId` (post-validation triggers this).
- `ok` — none of the above.

The retrieval layer **never** decides feasibility (§4 separation rule); that lives in §4.4.

### 4.4 AI reasoning + scoring (§3)

`advisorEngine.ts` is split:

- `services/scoringService.ts` — pure deterministic per-category scoring + weighted average. Reuses today's weights as the starting point; weight constants exported for tuning.
- `orchestrators/advisorOrchestrator.ts` — pipeline coordinator (§5).
- `services/reasoningService.ts` — single LLM call that takes the retrieval package + scoring output and produces: per-category recommendation reasoning, primary + 1–2 alternatives, pros/cons/compatibility/use-case justification per recommendation, plus a `trustScore` integer 0–100 with brief rationale.

Trust score:
- Numeric field, range 0–100.
- Threshold: **25** (constant in `services/scoringService.ts`, override via env `TRUST_SCORE_BLOCK_THRESHOLD`).
- Below threshold → orchestrator returns a warning-only response (`terminated: true`), persistence is skipped (§5).
- `trustTier` derived: `block` (`< 25`), `warn` (`25–49`), `pass` (`≥ 50`). The existing `ideaScoreTier` field is renamed to `trustTier` for §3 vocabulary alignment.

Recommendation output (per category, mirrors §3):

```ts
interface Recommendation {
  category: PddCategory;
  primary: { toolId: string; score: number; reasoning: string;
             pros: string[]; cons: string[];
             compatibility: string; useCaseJustification: string;
             phase: Phase[] };
  alternatives: Array<{ /* same shape, max 2 */ }>;
}
```

Hallucination mitigation (§3):
- Reasoning service is allowed to reference only `toolId`s present in the retrieval package. Post-validation drops fabricated ids and lowers `trustScore` by 10 per dropped reference (audit-logged).
- User explicit preference (e.g. user pinned `unity`) overrides scoring rank; reasoning service is instructed to "adapt around" the preference (§3 explicit rule).

### 4.5 Backend (§5)

#### 4.5.1 Folder layout

```
artifacts/api-server/src/
  app.ts
  index.ts
  routes/
    advisor.ts
    tools.ts
    health.ts
    index.ts
  controllers/
    advisorController.ts
    toolsController.ts
  services/
    scoringService.ts
    reasoningService.ts
    catalogService.ts        // loads toolCatalog.json, exposes filters
    sessionService.ts        // MySQL persistence
  orchestrators/
    advisorOrchestrator.ts
  middleware/
    rateLimit.ts
    validate.ts
    errorHandler.ts
  data/
    toolCatalog.json         // §5 static JSON
    toolTree.json            // §4 tree-of-contents
  lib/
    rag/
      treeNavigator.ts
      types.ts
    logger.ts
  utils/
  types/
    pdd.ts                   // PddCategory, Phase, Pricing, etc.
  scripts/
    buildTree.ts             // builds toolTree.json from toolCatalog.json
```

`lib/rag/{embeddings,vectorStore,retriever,documents,documentIds}.ts` and `scripts/seedRag.ts` are **deleted**.

#### 4.5.2 Database — MySQL via Docker

- Runtime driver: `mysql2` (promise API) + Drizzle's MySQL dialect.
- Local dev: `docker-compose.yml` at repo root running `mysql:8.4` with a named volume; ports `3306:3306`. `.env.example` provides `MYSQL_URL=mysql://root:root@localhost:3306/toolrecommender`.
- Schema (Drizzle MySQL):
  - `sessions` — successful analyses only. Columns: `id` (CHAR(36) UUID), `created_at` (TIMESTAMP, default CURRENT_TIMESTAMP, ISO-8601 on read), `inputs` (JSON), `result` (JSON, includes Markdown summary), `trust_score` (INT), `trust_tier` (VARCHAR(8)).
  - `knowledge_chunks` — **dropped** (vector store is gone).
  - No `tools` table — catalog lives only in `toolCatalog.json`.
- Decision: catalog lives **only** in `toolCatalog.json` (PDD §5 says static JSON for MVP). The `tools` MySQL table is removed entirely; `/tools`, `/tools/:id`, `/tools/categories` are served from the in-memory loaded catalog. This eliminates a sync source of truth and matches PDD literally.
- Migration tool: keep `drizzle-kit` in MySQL mode for `sessions` only.
- Postgres / pgvector / Neon connection code: removed. `lib/db` repackaged for MySQL.

#### 4.5.3 Endpoints

All 7 PDD endpoints already exist; only response shapes change:

| Endpoint | Change |
|---|---|
| `GET /tools/categories` | Returns the 7 PDD categories with `id`, `label`, `description`, `toolCount` |
| `GET /tools` | Filters from in-memory catalog; supports `category, platform, pricing, difficulty, teamSize, fit2d3d` |
| `GET /tools/:id` | Returns full §2 entry |
| `POST /advisor/analyze` | New pipeline order (validate → orchestrate → retrieve → reason → score → trust gate → format). Response includes `trustScore`, `trustTier`, `terminated`, `retrieval` package, recommendations with `phase`. AI summary returned as Markdown string. |
| `GET /advisor/sessions` | MySQL-backed |
| `GET /advisor/sessions/:id` | MySQL-backed |
| `GET /advisor/stats` | Aggregates from MySQL `sessions` |

OpenAPI spec (`lib/api-spec/openapi.yaml`) is updated to reflect: new `Tool` schema (§2 fields), new `AnalysisResult` (trust + phase + retrieval), new `Pricing` enum (adds `revenue_share`, `enterprise`). Codegen is rerun; generated React Query hooks and Zod schemas update consequentially.

#### 4.5.4 Middleware

- `validate.ts` — Zod-based body validation on `/advisor/analyze`. Rejects malformed payloads before orchestration.
- `rateLimit.ts` — already exists; kept.
- `errorHandler.ts` — centralised; never leaks orchestration internals (§5 explicit rule).

#### 4.5.5 Persistence rules (§5)

- Persist a session only when `terminated === false`.
- Never persist: failed analyses, blocked-by-trust analyses, retrieval reasoning traces, intermediate LLM scratch.
- `/advisor/stats` reads only from persisted (i.e. successful) sessions — automatically excludes blocked ones.

## 5. Concrete change list

### 5.1 Files to delete

- `artifacts/api-server/src/lib/rag/embeddings.ts`
- `artifacts/api-server/src/lib/rag/vectorStore.ts`
- `artifacts/api-server/src/lib/rag/retriever.ts`
- `artifacts/api-server/src/lib/rag/documents.ts`
- `artifacts/api-server/src/lib/rag/documentIds.ts`
- `artifacts/api-server/src/scripts/seedRag.ts`
- `lib/db/src/schema/knowledgeChunks.ts`
- `artifacts/api-server/src/scripts/buildPopularityFromDataset.ts` (popularity field is removed; this script no longer has a target)

### 5.2 Files to add

- `artifacts/api-server/src/data/toolCatalog.json` (authored from current `gameDevTools.ts` + new §2 fields)
- `artifacts/api-server/src/data/toolTree.json` (generated)
- `artifacts/api-server/src/scripts/buildTree.ts`
- `artifacts/api-server/src/lib/rag/treeNavigator.ts`
- `artifacts/api-server/src/services/{scoringService,reasoningService,catalogService,sessionService}.ts`
- `artifacts/api-server/src/orchestrators/advisorOrchestrator.ts`
- `artifacts/api-server/src/controllers/{advisorController,toolsController}.ts`
- `artifacts/api-server/src/middleware/{validate,errorHandler}.ts`
- `artifacts/api-server/src/types/pdd.ts`
- `docker-compose.yml` (MySQL 8.4 service)
- `.env.example` updated with `MYSQL_URL`, `TRUST_SCORE_BLOCK_THRESHOLD`, `OPENAI_API_KEY`

### 5.3 Files to change

- `artifacts/api-server/src/lib/gameDevTools.ts` → becomes a thin loader/validator over `toolCatalog.json`
- `artifacts/api-server/src/lib/advisorEngine.ts` → split out into the services above; file deleted after migration
- `artifacts/api-server/src/routes/advisor.ts`, `tools.ts` → become thin routers calling controllers
- `lib/db/src/index.ts`, `lib/db/src/schema/sessions.ts` → MySQL dialect
- `lib/db/drizzle.config.ts` → MySQL
- `lib/api-spec/openapi.yaml` → schemas updated, regenerate `lib/api-client-react` and `lib/api-zod`
- `package.json` (api-server) → swap `pg`/`pgvector`/`@neondatabase/serverless` → `mysql2`
- `CLAUDE.md` → MySQL commands, no more `rag:seed`, new `tree:build`

## 6. Migration sequencing

The work runs in 5 sequential sprints. Each sprint leaves the repo type-checking and the dev server bootable.

1. **Sprint 1 — Section 2 catalog.** Author `toolCatalog.json` with all §2 fields for current MVP-relevant tools, collapsed into the 7 categories. Update `gameDevTools.ts` loader, OpenAPI `Tool` schema, regenerate clients. Existing pgvector path keeps working through this sprint.
2. **Sprint 2 — MySQL migration.** Add `docker-compose.yml`, swap drivers, port `tools` removal + `sessions` schema, drop `knowledge_chunks`. Decommission Neon/Postgres config. `pnpm --filter @workspace/db run push` writes against MySQL.
3. **Sprint 3 — Tree-of-contents + vectorless retrieval.** Add `buildTree.ts`, generate `toolTree.json`, add `treeNavigator.ts`. Wire `advisorEngine` to call `treeNavigator` in place of `retriever.ts`. Delete embedding files.
4. **Sprint 4 — AI reasoning + trust score.** Split engine into services + orchestrator + controller. Introduce `trustScore` (threshold 25), `trustTier`, `terminated`, `retrieval` package, `phase` per recommendation. Update OpenAPI, regenerate clients.
5. **Sprint 5 — §5 folder layout + middleware finalisation.** Move files into `controllers/services/orchestrators/data/types`. Add `validate.ts` and `errorHandler.ts`. Final docs pass on `CLAUDE.md`.

Each sprint produces one PR.

## 7. Acceptance criteria

The work is complete when **all** of the following hold:

- [ ] No file under `artifacts/api-server/src/lib/rag/` references embeddings, vectors, or `pgvector`. `git grep -i 'embedding\|pgvector\|cosine\|knowledge_chunks'` returns zero hits in source.
- [ ] `lib/db` only ships MySQL dialect; `package.json` has no `pg`, `pgvector`, or `@neondatabase/*` dependency.
- [ ] `toolCatalog.json` validates against the §2 Zod schema; every entry has all 14 §2 fields populated and at least one alternative.
- [ ] Categories present in catalog == exactly the PDD 7. `git grep '"category":' artifacts/api-server/src/data/toolCatalog.json` shows only those 7 values.
- [ ] `POST /advisor/analyze` response includes `trustScore`, `trustTier`, `terminated`, `retrieval.fallbackStatus`, and each recommendation includes `phase[]`.
- [ ] When `trustScore < 25`, the response sets `terminated: true`, recommendations are absent, and no row is written to `sessions`.
- [ ] `/tools/categories` returns the 7 PDD categories.
- [ ] `docker compose up -d mysql` + `pnpm --filter @workspace/db run push` + `pnpm --filter @workspace/api-server run dev` succeeds end-to-end on a clean checkout following `CLAUDE.md`.
- [ ] OpenAPI codegen runs without diff after the migration is committed (i.e. clients are regenerated and committed).

## 8. Open deviations from PDD

These are conscious deviations; flagged so they can be revisited:

1. **Hosting** — PDD §5 says "managed cloud-hosted MySQL". This spec ships local Docker MySQL only; managed-cloud choice is deferred to deployment time. Documented in `CLAUDE.md`.
2. **Tree depth** — PDD §4 implies arbitrary hierarchy; this spec uses two levels (`category → tool`). Deeper nesting added only when a real retrieval failure motivates it.
3. **Single-call retrieval** — PDD §4 lists three sequential stages; this spec collapses Stages 1+2 into one structured-output LLM call when prompt size permits, deterministic Stage 3 in code. Functionally equivalent, lower latency / cost.
4. **`subcategory` field** — additive metadata, not in §2's mandatory list. Used purely as retrieval hint, never surfaced as a category.

## 9. Risks

- LLM determinism: tree navigation uses `gpt-4o-mini` with `response_format: json_schema` and `temperature: 0`. Output validated against the catalog; fabricated ids dropped → `trustScore` penalty. Acceptable given §3 hallucination-mitigation requirements.
- Data loss: removing `popularityByArchetype`, `archetypeBias`, `ecosystem`, `tags` discards information used by today's scoring. Replacement: structured §2 fields (`difficultyLevel`, `beginnerSuitability`, `teamSizeFit`, `genreFit`, `fit2d3d`) carry the relevant signal for scoring; tags removed because retrieval no longer relies on keyword matching.
- Migration cost: ~5 PRs, each non-trivial. Mitigated by sprint sequencing — repo stays bootable between sprints.

---

End of design.
