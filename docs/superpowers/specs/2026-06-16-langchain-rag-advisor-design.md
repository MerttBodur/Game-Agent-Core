# LangChain RAG Advisor — Design Spec

**Date:** 2026-06-16
**Status:** Approved (brainstorming complete)
**Scope:** Replace the current agent pipeline (analyze → pickEngine → deterministic SQL retrieve → recommend) and the vectorless `treeNavigator` with a **real vector RAG pipeline** built on LangChain.js + Chroma. Reduce the input set, collapse the category taxonomy to 6 categories, and add a feasibility gate. Full replacement, reusing the existing session-persistence, terminated-response, and SSE plumbing.

Source brainstorming: a single session on 2026-06-16. Supersedes the retrieval mechanism in `2026-05-09-game-dev-tool-agent-design.md` (the 4-step agent), which it replaces.

---

## 1. Goals & key decisions

| Decision | Choice |
|---|---|
| Retrieval | **Real vector RAG** (embeddings + vector store + similarity retrieval). Hard requirement. |
| Framework | **LangChain.js**, inside the existing TS/Express `api-server` (no second runtime). |
| Vector store | **Chroma**, persistent, via docker-compose next to MySQL. |
| Model provider | **OpenAI** — `gpt-4o-mini` (reasoning steps), `text-embedding-3-small` (embeddings). |
| Indexed content | **Enriched knowledge base**: tool docs + curated guidance markdown. |
| Orchestration | **Explicit TS orchestrator** for the staged flow; LangChain for the RAG layer (Approach A). |
| Feasibility gate | **Hard block + reason** (cheap early reject; no downstream work). |
| Engine selection | **Model recommends + can challenge** a user-stated engine. |
| Scoring | **Deterministic `/10`**, LLM explains why a pick isn't a 10. |
| Language | **English everywhere** — all prompts and all user-facing/generated strings. |
| Change scope | **Full replacement**, reuse session/terminated/SSE plumbing. |

**Non-goals (out of scope):** admin UI, auth, multi-language, historical session migration, caching beyond Chroma persistence, tool-calling agent.

---

## 2. Category taxonomy (6 categories, multi-membership)

| id | label | notes |
|----|-------|-------|
| `game_engine` | Game Engine | **Only** Unreal, Unity, Godot |
| `art_asset` | Art & Asset | 2D/3D art, modeling, textures, sprites |
| `vfx` | VFX | visual effects |
| `animation` | Animation | rigging, skeletal/character animation, mocap |
| `audio` | Audio | **music + SFX + sound design** (combined) |
| `ai_coding` | AI Coding Tool | Copilot, Cursor, etc. |

- **Removed categories:** `ide`, `version_control`, `deployment_publishing`, networking, backend.
- A tool belongs to **one or more** categories via `categories: string[]`. Example: Blender → `[art_asset, vfx, animation]`; Meshy → `[art_asset]`.
- AI-powered and traditional tools **coexist** in every creative category (e.g. `art_asset` contains both Meshy AI and Blender).

---

## 3. Catalog schema

Source of truth stays **`artifacts/api-server/src/data/toolCatalog.json`**, Zod-validated at boot.

New / changed fields per tool:

```ts
interface ToolEntry {
  id: string;                  // lowercase snake_case
  name: string;
  categories: string[];        // NEW — replaces single `category`; 1+ of the 6 ids
  description: string;
  bestUseCase: string;
  toolNature: "ai" | "traditional" | "hybrid";   // NEW — Meshy=ai, Blender=traditional, Photoshop(+Firefly)=hybrid
  learningCurve: "low" | "medium" | "high";       // NEW — Meshy=low, Blender=high
  engineCompatibility: ("Unity" | "Unreal" | "Godot" | "any")[]; // NEW — used to filter non-engine tools after engine pick
  pricing: "free" | "open_source" | "freemium" | "paid" | "subscription" | "revenue_share" | "enterprise";
  difficultyLevel: "beginner" | "intermediate" | "advanced";
  beginnerSuitability: number; // 0-100
  supportedPlatforms: ("pc"|"mobile"|"web"|"console"|"vr"|"ar")[];
  pros: string[];
  cons: string[];
  website?: string;
}
```

Dropped fields that were tied to removed mechanics: single `category`, `phase`, `teamSizeFit`, `genreFit`, `fit2d3d`, `alternatives` may be retained only if still used by the `/tools` UI; otherwise removed. (Implementation plan pins the exact final field list.)

**Catalog authoring:** migrate the ~40 still-relevant existing entries (engines, art, audio, AI coding), re-tag to the new categories, add the new fields, and author the missing AI tools (Meshy, Suno, etc.). User reviews for accuracy.

---

## 4. Knowledge base & RAG index

Two document types are embedded into a single Chroma collection:

1. **Tool docs** — one per catalog tool.
   - Text: `name + description + bestUseCase + pros + cons + pricing + toolNature + learningCurve`.
   - Metadata: `{ type:"tool", toolId, categories, toolNature, pricing, engineCompatibility, learningCurve }`.
2. **Guidance docs** — curated markdown in `artifacts/api-server/src/data/knowledge/*.md` (git-reviewable). Topics include:
   - "AI vs traditional asset creation"
   - "Choosing between Unity / Unreal / Godot"
   - "Low-budget / weak-art-skill playbook"
   - "What's realistic for a solo dev" (feeds the feasibility gate)
   - Metadata: `{ type:"guidance", topic, categories? }`.

**Indexer:** `pnpm --filter @workspace/api-server run rag:index` reads `toolCatalog.json` + `data/knowledge/*.md`, embeds with `text-embedding-3-small`, and upserts into the Chroma collection. Retrieval applies **metadata filters first** (category + engine compatibility) **then** semantic similarity, so each query is correctly scoped before ranking.

---

## 5. Data layer

- **Keep:** `advisor_sessions` table (session persistence). Sessions persisted only when `terminated === false`.
- **Remove:** `engine_constraints` table + the constraint engine (replaced by metadata filtering + guidance docs). Retire the `tools` MySQL mirror and the SQL retrieval path; `/tools` API serves from the JSON catalog (the catalog service already has a JSON path). The `treeNavigator` (vectorless) and `toolTree.json` are removed.
- **Add:** a `chroma` service in `docker-compose.yml` with a persisted volume.

---

## 6. Pipeline

Explicit TS orchestrator (`orchestrators/advisorOrchestrator.ts`). Each stage is a pure-ish step: `(state) → partial`. Steps use LangChain chains internally: `retriever → ChatPromptTemplate → model.withStructuredOutput(zodSchema)`.

### Round 0 — Feasibility gate (`gpt-4o-mini`, RAG-light, cheap)
- Inputs: `projectIdea`, `budget`, `skillLevel`, `teamSize`, `artCapability`, `platformTarget`. Retrieves 1–2 "what's realistic" guidance chunks.
- Output (Zod): `{ feasible: boolean, reason: string, targetCategories: string[] }`.
  - `targetCategories` = which of the 5 non-engine categories this project actually needs (e.g. a text-only game may skip `animation`/`vfx`), so Step 2 doesn't fan out pointlessly.
- **If `!feasible` → hard block:** return `terminated: true` + `reason`, emit `feasibility_blocked`, and **stop** — no engine pick, no retrieval, no recommend, no session row. This is the token-saving early reject (e.g. "solo GTA 5 in a week").

### Step 1 — Engine pick (`gpt-4o-mini`, RAG)
- Retrieve the 3 engine tool docs + engine-comparison guidance (metadata filter `categories ∋ game_engine`).
- Parse any user-mentioned engine from `projectIdea`. Pick the best of Unreal / Unity / Godot; may **challenge** the user's choice with reasoning.
- Output: `{ picked, userPreferred, agreement: "agreed"|"challenged"|"user_silent", reasoning, alternativesConsidered: [{ engine, reasonRejected }] }`.

### Step 2 — Per-category retrieve + recommend (`gpt-4o-mini`, RAG fan-out)
- For each `targetCategory`: build a query from `projectIdea + category + budget + skillLevel + artCapability`. Chroma search with metadata filter `categories ∋ cat AND (engineCompatibility ∋ picked OR "any")`. Retrieve top-k tool docs + relevant guidance.
- The LLM picks `primary` + up to 2 `alternatives` **only from retrieved candidates**, applying the **AI-vs-traditional rule:** when `skillLevel` / `artCapability` is low and `budget` is tight, prefer `toolNature:"ai"` / `learningCurve:"low"` tools (e.g. Meshy) over high-curve standalone tools (e.g. Blender) — and state the reason.
- Output per category: `{ category, primary, alternatives[], reasoning }`.

### Step 3 — Holistic review + scoring (deterministic `/10` + `gpt-4o-mini` explanation)
- Deterministic scorer computes **`score` 0–10** per recommended tool from: budget fit, skill fit, platform fit, art-capability fit, AI-vs-traditional appropriateness, engine compatibility.
- LLM reviews the whole stack and writes `finalSummary` + a per-recommendation `scoreReason` explaining *why a pick is e.g. 8/10 and not 10/10* given the constraints.
- Assemble `AnalysisResult`; persist session (reused plumbing).

### SSE events (reuse the streaming mechanism)
`feasibility_complete` / `feasibility_blocked` → `engine_picked` → `category_recommended` (progress, per category) → `done`. `error` on any failure.

---

## 7. LangChain.js usage

- Packages: `@langchain/openai` (`ChatOpenAI`, `OpenAIEmbeddings`), `@langchain/community` (Chroma vector store), `langchain` core, `chromadb` client.
- Structured output via `model.withStructuredOutput(zodSchema)` — replaces the hand-written OpenAI `json_schema` objects with Zod-native schemas.
- New files under `artifacts/api-server/src/lib/rag/`: `vectorStore.ts` (Chroma client + collection), `embeddings.ts`, `retriever.ts` (metadata-filtered retriever), `indexer.ts` (build/upsert).

---

## 8. Inputs & API contract

**Final wizard inputs:** `projectIdea` (theme + mechanics free text), `budget` (`low|medium|high|enterprise` — no `zero`), `skillLevel`, `teamSize` (`solo|team`), `platformTarget[]`, `artCapability`, `paidPriorityCategories[]` (options updated to `art_asset|vfx|animation|audio|ai_coding`), `notes`.

**Removed inputs:** `timeLimit`, `multiplayer`, known-tools picker, and the `zero` budget option.

**OpenAPI (`lib/api-spec/openapi.yaml`) → regenerate Orval client (`api-zod`, `api-client-react`):**
- `ProjectInput`: drop `timeLimit` and `multiplayer`; `budget` enum loses `zero`.
- Every category enum → `[game_engine, art_asset, vfx, animation, audio, ai_coding]`.
- `RecommendationItem.score` → **0–10**; add `scoreReason: string`.
- `AnalysisResult`: add `feasible: boolean` and feasibility `reason: string`; keep `terminated`, `sessionId`, `projectSummary`, `engineDecision`, `recommendations`, `finalSummary`. **Remove `trustScore` and `trustTier`** — blocking is now Round 0's feasibility gate, and quality is expressed by the per-recommendation `/10` scores, so a separate overall trust score is redundant. Round 0 **reuses** the existing `terminated`/no-session plumbing, replacing (not duplicating) the old block-tier trust gate.

---

## 9. Frontend (`artifacts/game-dev-advisor`)

- **Wizard** (`components/analyzer/questions.ts`): remove Time / Multiplayer / Known-tools cards; drop `zero` budget; update `paid_priority` options; update category labels to the 6 new ones.
- **Results** (`pages/Analyzer.tsx`): 6 category cards showing **score /10 + scoreReason**, the engine decision (including a "challenged" note when the model overrode the user's stated engine), and a dedicated **feasibility-block screen** when `terminated` (shows the rejection `reason`).
- `GeneratingState` stage indicator remapped to the new SSE events.
- All UI strings in **English**.

---

## 10. Files

```
artifacts/api-server/src/
├── orchestrators/advisorOrchestrator.ts     # rewrite — feasibility → engine → per-category → score
├── agent/
│   ├── steps/
│   │   ├── feasibility.ts                    # NEW (Round 0)
│   │   ├── pickEngine.ts                     # rewrite (RAG-backed)
│   │   ├── recommendCategory.ts              # NEW (per-category fan-out)
│   │   └── score.ts                          # NEW (deterministic /10 + LLM explanation)
│   └── prompts/                              # rewrite, English; Zod structured-output schemas
├── lib/rag/
│   ├── vectorStore.ts                        # NEW (Chroma)
│   ├── embeddings.ts                         # NEW
│   ├── retriever.ts                          # NEW (metadata-filtered)
│   └── indexer.ts                            # NEW (build/upsert from JSON + markdown)
├── services/
│   ├── scoringService.ts                     # rewrite — 0–10 scale + new factors
│   ├── catalogService.ts                     # serve /tools from JSON; drop SQL retrieval
│   └── sessionService.ts                     # unchanged (reused)
├── data/
│   ├── toolCatalog.json                      # rebuilt — 6 categories, new fields
│   └── knowledge/*.md                        # NEW — guidance docs
├── types/{pdd,agent,recommendation}.ts       # updated taxonomy/fields/score
└── (removed) lib/rag/treeNavigator.ts, data/toolTree.json,
             agent/steps/{analyze,retrieve,checkRetry}.ts,
             agent/constraints/*, services/constraintService.ts

lib/api-spec/openapi.yaml                     # contract update → Orval codegen
lib/db/                                        # remove engine_constraints + tools mirror schema; keep sessions
docker-compose.yml                             # add chroma service
```

---

## 11. Testing (node:test, existing `tsx --test`)

- **Unit:** deterministic `/10` scorer (incl. AI-vs-traditional weighting), `targetCategories` relevance, feasibility decision shaping.
- **RAG eval:** a script asserting retrieval quality — "weak art + low budget + good graphics" surfaces Meshy in `art_asset` top-k; engine queries surface the correct engine docs.
- **Integration:** end-to-end scenarios that Zod-validate `AnalysisResult`; a "solo GTA 5" scenario asserts `terminated: true` with a `reason` and **zero** downstream LLM calls (proves the early reject).

---

## 12. Open items for the implementation plan

- Exact final field list on `ToolEntry` (which legacy fields the `/tools` UI still needs).
- Chroma collection naming, persistence path, and re-index trigger (manual script vs. boot-time check).
- Whether `targetCategories` relevance is fully LLM-decided in Round 0 or partly rule-based.
- Concrete top-k and metadata-filter syntax for the Chroma retriever.
- Migration/removal order so the app stays type-checkable at each step (contract → types → backend → frontend).
