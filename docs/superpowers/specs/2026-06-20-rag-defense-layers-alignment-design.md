# RAG Defense Layers — Pipeline Alignment Design

**Date:** 2026-06-20
**Status:** Approved (design phase)
**Source:** `rag-defense-layers-integration.md` (reference design, Python/FastAPI/Qdrant/Cohere)

## Problem

`rag-defense-layers-integration.md` is a reference design for a 4-layer defense RAG
assistant, written against a Python/FastAPI/Qdrant/Cohere stack and a single free-text
`/ask` endpoint. Our pipeline is a structured multi-step advisor
(feasibility → engine → per-category → deterministic scoring) over a constrained form,
streamed via SSE, using LangChain + Chroma with hybrid BM25+vector retrieval and **no
reranker**.

Two problems follow:

1. **Real defense gaps** in our pipeline relative to the doc's concepts (Layers 1 and 2).
2. **The doc itself is misleading** — it prescribes modules (Qdrant, Cohere, FastAPI,
   Prometheus) we do not use, so a future reader would be led to copy the wrong stack.

The chosen interpretation (confirmed with the user): **adopt the concepts, not the code.**
Map the 4 layers onto our existing TS architecture; rewrite the doc to describe *our*
pipeline.

## Gap Analysis

| Layer | Doc concept | Our pipeline today | Action |
|---|---|---|---|
| **1. Input validation (hardblock)** | Regex injection + length guard before the LLM | `validateBody` checks schema shape only; `projectIdea` is unbounded `string` flowing straight into LLM prompts | **Build** |
| **2. Retrieval confidence gate (softblock)** | Score < threshold → graceful fallback | `recommendCategory` returns `null` only on **zero** candidates; weak-but-nonempty matches still reach the LLM | **Build (adapted)** |
| **3. Prompt guardrails (LLM reasoning)** | System prompt + structured output, candidates-only | Already strong: enum candidate schemas, `assertCandidatesOnly`, "don't invent" rules, feasibility gate | **Minor hardening** |
| **4. Post-gen faithfulness check** | Cheap judge model verifies grounding | None | **Defer (documented)** |

### Architectural constraints that shape the mapping

- **No reranker.** The doc gates Layer 2 on a Cohere rerank score (0–1 calibrated). We use
  RRF-fused BM25+vector with no per-doc absolute relevance score. Our Layer 2 must gate on
  signals we own: non-empty fused pool **and** top BM25 score above a floor.
- **Structured form, not free-text Q&A.** The doc's "reject off-domain questions" guardrail
  is mostly irrelevant — our input is a constrained form. Layer 1 for us targets the one
  free-text field: `projectIdea`.
- **Release-age policy** (`minimumReleaseAge: 1440`) and existing architecture rule out a
  literal port (Cohere client, FastAPI, Prometheus).

## Design

### A. Code Changes

#### Layer 1 — Input validation guard

- **New `artifacts/api-server/src/lib/security/promptGuard.ts`** (pure, no deps):
  exports `validateProjectIdea(text: string, maxLength = MAX_PROJECT_IDEA_LENGTH):
  { allowed: boolean; reason?: string }`. Ports the doc's injection regex set
  (instruction-override, role-hijack, prompt-extraction, delimiter-injection, guard-bypass)
  plus empty/length checks. `MAX_PROJECT_IDEA_LENGTH = 1000` is a named constant.
- **New `artifacts/api-server/src/middleware/inputGuard.ts`** (thin): Express middleware
  that runs `validateProjectIdea(req.body.projectIdea)`; on block returns
  `400 { error }` via the existing response shape, before any LLM call.
- **Wire** into `routes/advisor.ts`: `rateLimit → validateBody → inputGuard → analyze`.
- **`openapi.yaml`**: add `maxLength: 1000` to `projectIdea` (defense in depth at the
  contract boundary; codegen regenerated).
- **Tests** `promptGuard.test.ts`: mirrors the doc's `test_input_validation.py` —
  blocks injections, allows legit game-dev ideas, blocks empty/too-long.

#### Layer 2 — Retrieval confidence gate

- **New pure helper** `artifacts/api-server/src/lib/rag/retrievalGate.ts`:
  `confidenceGate(toolDocs, topBm25Score, { minScore, minChunks })` → `{ passed, reason? }`.
  (Standalone file per our many-small-files rule; keeps `retriever.ts` focused on I/O.)
  Gates on signals we own: non-empty fused pool **and** top BM25 score ≥ `MIN_BM25_SCORE`
  floor. The floor is a named constant, documented as calibratable via our existing
  `ragEval.ts` gold-set harness (this is how the doc's mandatory §9.1 calibration maps onto
  our stack — we do **not** invent a magic threshold).
- **`retrieveForCategory`** returns the top BM25 score alongside the fused docs so the gate
  has its signal.
- **`recommendCategory`**: extend the existing `toolIds.length === 0 → null` path to also
  return `null` when the gate fails on weak signal. The orchestrator already skips `null`
  categories, so **no SSE contract change**.
- **Tests** for the gate helper: mirrors the doc's `test_retrieval_gate.py`.

#### Layer 3 — Minor hardening

- Add an `answer_possible`-style escape to `buildCategorySchema` so the model can flag
  "candidates insufficient" instead of being forced to pick. Minimal schema + system-prompt
  tweak in `advisorPrompts.ts`; orchestrator treats "not possible" as a skip (consistent
  with the `null` path).

#### Layer 4 — Not built

Documented as deferred. Rationale: our enum-constrained structured output already prevents
off-catalog tool selection, so the hallucination surface is small; a per-category judge
call adds cost/latency disproportionate to the marginal safety gain here.

### B. Doc Rewrite (`rag-defense-layers-integration.md`)

Rewrite the stack-specific sections to describe our pipeline:

- Replace Python/FastAPI/Qdrant/Cohere/Prometheus prescriptions with our actual stack
  (TypeScript, LangChain, Chroma, Express, SSE, hybrid BM25+vector, no reranker).
- Rewrite Layer 2 to gate on our fused/BM25 signal rather than a Cohere rerank score; point
  calibration at `ragEval.ts` instead of `calibrate_threshold.py`.
- Map each layer to the actual file it lives in (`promptGuard.ts` /
  `inputGuard.ts`, `retriever.ts` / `retrievalGate.ts`, `advisorPrompts.ts`).
- Mark Layer 4 deferred with rationale.
- **Keep** the stack-agnostic conceptual content: the 4-layer summary table and the
  architecture diagram.

## Components & Boundaries

- `lib/security/promptGuard.ts` — pure; in: string; out: `{ allowed, reason? }`; no deps.
- `middleware/inputGuard.ts` — thin Express adapter over `promptGuard`; depends on
  `promptGuard` only.
- `retrievalGate.ts` (or helper in `retriever.ts`) — pure; in: docs + score + thresholds;
  out: `{ passed, reason? }`; no I/O.
- `advisorPrompts.ts` — schema/prompt change is additive; existing callers unaffected
  except `recommendCategory` reading the new flag.

## Data Flow (after change)

```text
POST /advisor/analyze
  → rateLimit
  → validateBody (Zod shape + maxLength)
  → inputGuard (Layer 1: injection/length)   ← NEW, 400 on block
  → analyze (SSE)
      → feasibility gate (existing)
      → engine pick (existing)
      → per category:
          retrieveForCategory → confidenceGate (Layer 2)   ← NEW, skip on weak signal
          recommendCategory (Layer 3: candidates-only + answer_possible)
      → deterministic scoring (existing)
```

## Error Handling

- Layer 1 block → `400 { error }`, no LLM call, no SSE stream opened.
- Layer 2 weak signal → category skipped (`null`), pipeline continues; consistent with the
  existing zero-candidate path.
- No new silent failures: gate decisions are explicit return values; block reasons logged.

## Testing

- `promptGuard.test.ts` — injection/length/empty/legit cases.
- `retrievalGate.test.ts` — above/below threshold, empty pool.
- Existing `recommendCategory.test.ts` extended for the gate + `answer_possible` path.
- `pnpm --filter @workspace/api-server run test` and `pnpm run typecheck` green.

## Out of Scope

Cohere reranker, FastAPI rewrite, Prometheus metrics, Python modules, response/embedding
caching, circuit breaker. (The doc's §15 hardening list is retained as conceptual guidance
only.)
