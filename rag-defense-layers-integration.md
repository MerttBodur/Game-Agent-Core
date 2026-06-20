# Production RAG Defense Layers Integration Guide

This document describes the implemented defense-layer mapping for the
ToolRecommender advisor pipeline. It is no longer a generic reference
implementation. The active stack is TypeScript, Express 5, SSE streaming,
LangChain, Chroma, OpenAI-backed model calls, and hybrid vector plus BM25
retrieval. There is no reranker in this project.

The API contract source of truth remains `lib/api-spec/openapi.yaml`.

## Working Order For Agents

Use the implemented files below as the source of truth:

1. Read `replit.md`.
2. Check the API shape in `lib/api-spec/openapi.yaml`.
3. For defense-layer behavior, inspect the files named in this guide.
4. Run focused tests first, then the full API server test suite.
5. Calibrate retrieval thresholds with `pnpm --filter @workspace/api-server run rag:eval` after catalog, embedding, or BM25 changes.

Do not add runtime MCP dependencies for this feature. MCP remains development
tooling only in this phase.

## Architecture Overview

```text
POST /api/advisor/analyze
      |
      v
+------------------------------------------------+
| LAYER 1: Input Validation (hardblock)          |
| prompt-injection/length guard on projectIdea   |
+------------------------------------------------+
      |
      v
validate + stream advisor pipeline
      |
      v
+------------------------------------------------+
| Existing feasibility gate                      |
| rejects impossible scope/resource requests     |
+------------------------------------------------+
      |
      v
Engine choice + category loop
      |
      v
Hybrid retrieval: Chroma vector search + BM25
      |
      v
+------------------------------------------------+
| LAYER 2: Retrieval Gate (softblock)            |
| empty/weak category context skips the category |
+------------------------------------------------+
      |
      v
+------------------------------------------------+
| LAYER 3: Prompt Guardrails + Structured Output |
| enum candidate schema + answerPossible escape  |
+------------------------------------------------+
      |
      v
+------------------------------------------------+
| LAYER 4: Post-generation Faithfulness Check    |
| deferred; structured output already narrows    |
| the hallucination surface                      |
+------------------------------------------------+
      |
      v
Scored recommendations + SSE events
```

## Current Project Layout

The defense layers live inside the existing `@workspace/api-server` package:

```text
artifacts/api-server/src/
  middleware/inputGuard.ts
  lib/security/promptGuard.ts
  lib/rag/retrievalGate.ts
  lib/rag/retriever.ts
  agent/prompts/advisorPrompts.ts
  agent/steps/recommendCategory.ts
  scripts/ragEval.ts
  routes/advisor.ts
```

No separate service, runtime MCP server, sidecar, or alternate web framework is
needed for these layers.

## Layer 1: Input Validation Hardblock

Purpose: stop clear prompt-injection or malformed `projectIdea` values before
any LLM prompt is built.

Implemented files:

- `artifacts/api-server/src/lib/security/promptGuard.ts`
- `artifacts/api-server/src/lib/security/promptGuard.test.ts`
- `artifacts/api-server/src/middleware/inputGuard.ts`
- `artifacts/api-server/src/routes/advisor.ts`
- `lib/api-spec/openapi.yaml`

`validateProjectIdea(text, maxLength?)` is a pure helper. It blocks empty input,
over-length input, and clear instruction-override, role-hijack,
prompt-extraction, delimiter-injection, or guard-bypass phrases. The named
limit is `MAX_PROJECT_IDEA_LENGTH = 1000`.

`inputGuard` is the Express adapter. It runs after `validateBody(...)` and before
`advisor.analyze`, so a rejected request returns `400 { error: string }` before
the SSE stream opens.

`openapi.yaml` also caps `ProjectInput.projectIdea` with `maxLength: 1000`.
That is defense in depth at the contract boundary. The middleware remains the
authoritative prompt-injection guard.

Scope note: only `projectIdea` needs this free-text guard. The rest of the form
is constrained by enum-like API fields.

Focused test:

```powershell
pnpm.cmd --filter @workspace/api-server exec tsx --test src/lib/security/promptGuard.test.ts
```

## Layer 2: Retrieval Confidence Softblock

Purpose: avoid asking the category LLM to choose from low-signal or empty
retrieval context.

Implemented files:

- `artifacts/api-server/src/lib/rag/retrievalGate.ts`
- `artifacts/api-server/src/lib/rag/retrievalGate.test.ts`
- `artifacts/api-server/src/lib/rag/retriever.ts`
- `artifacts/api-server/src/agent/steps/recommendCategory.ts`
- `artifacts/api-server/src/scripts/ragEval.ts`

`confidenceGate(toolDocCount, topBm25Score, opts?)` is pure and I/O-free. It
passes only when:

- the fused category pool has at least `MIN_CHUNKS_REQUIRED` documents, and
- the category's top BM25 score is at least `MIN_BM25_SCORE`.

`retrieveForCategory(...)` now returns `topBm25Score` with the fused tool docs,
guidance docs, and tool IDs. `recommendCategory(...)` calls
`shouldSkipCategory(toolDocs.length, topBm25Score)`. A failed gate returns
`null`, so the orchestrator gracefully skips that category and continues.

This is intentionally a softblock. It should not fail the whole advisor request.
It matches the older zero-candidate behavior but extends it to weak non-empty
retrieval results.

Calibration:

```powershell
pnpm.cmd --filter @workspace/api-server run rag:eval
```

Use the gold-set harness in `src/scripts/ragEval.ts` when changing the catalog,
knowledge docs, embeddings, BM25 weighting, or `MIN_BM25_SCORE`. Do not raise
the threshold by intuition alone.

Focused tests:

```powershell
pnpm.cmd --filter @workspace/api-server exec tsx --test src/lib/rag/retrievalGate.test.ts
pnpm.cmd --filter @workspace/api-server exec tsx --test src/lib/rag/retriever.test.ts
```

## Layer 3: Prompt Guardrails And Structured Output

Purpose: keep model output inside retrieved candidate IDs and let the model
decline when the provided candidates are insufficient.

Implemented files:

- `artifacts/api-server/src/agent/prompts/advisorPrompts.ts`
- `artifacts/api-server/src/agent/steps/recommendCategory.ts`
- `artifacts/api-server/src/agent/steps/recommendCategory.test.ts`
- `artifacts/api-server/src/agent/steps/feasibility.ts`
- `artifacts/api-server/src/agent/steps/pickEngineRag.ts`

The category schema is built per request by `buildCategorySchema(candidateIds)`.
It uses a Zod enum of retrieved candidate IDs, then LangChain calls
`chatModel().withStructuredOutput(...)`. This keeps the model response bound to
the candidate set.

`categorySystemPrompt(...)` also tells the model:

- choose only from provided candidates,
- do not invent capabilities, prices, or platform support,
- use `answerPossible=false` when the candidate set is insufficient.

`recommendCategory(...)` applies both guardrails:

- Layer 2 gate failure returns `null` before the model call.
- `answerPossible === false` returns `null` after structured generation.

`assertCandidatesOnly(...)` remains a final invariant check over `primary` and
`alternatives`.

Focused test:

```powershell
pnpm.cmd --filter @workspace/api-server exec tsx --test src/agent/steps/recommendCategory.test.ts
```

## Layer 4: Faithfulness Check Deferred

Layer 4 is documented but not implemented.

Rationale: category recommendations are already constrained by retrieved
candidate IDs, Zod structured output, and `assertCandidatesOnly(...)`. That
substantially reduces the off-catalog hallucination surface. A second model call
per category would add cost and latency that is disproportionate for the current
pipeline.

Revisit this if the product starts generating long free-form grounded answers,
summaries with many factual claims, or user-visible citations that require
independent verification.

## Orchestration Behavior

The current request flow is:

```text
routes/advisor.ts
  -> rateLimit
  -> validateBody(analyzeBodySchema)
  -> inputGuard
  -> advisor.analyze
      -> feasibility
      -> pickEngineRag
      -> recommendCategory for each target category
          -> retrieveForCategory
          -> shouldSkipCategory / confidenceGate
          -> withStructuredOutput(buildCategorySchema(...))
          -> answerPossible escape
          -> assertCandidatesOnly
      -> scoreStack
```

Layer 1 blocks the HTTP request with a JSON error. Layer 2 and Layer 3 return
`null` for a category and let the rest of the pipeline continue.

## Verification

Focused checks:

```powershell
pnpm.cmd --filter @workspace/api-server exec tsx --test src/lib/security/promptGuard.test.ts
pnpm.cmd --filter @workspace/api-server exec tsx --test src/lib/rag/retrievalGate.test.ts
pnpm.cmd --filter @workspace/api-server exec tsx --test src/agent/steps/recommendCategory.test.ts
pnpm.cmd --filter @workspace/api-server run typecheck
```

Full checks:

```powershell
pnpm.cmd --filter @workspace/api-server run test
pnpm.cmd run typecheck
```

The `artifacts/api-server/package.json` test script explicitly lists all test
files. When adding a new test file, append it to that script or it will not run.

## Optional Future Hardening

These items are future work, not part of the current implementation:

- Add structured logging for Layer 1 reject reasons and Layer 2 skip reasons.
- Track skip/reject rates in the existing app telemetry surface if one is added.
- Store low-confidence queries from Layer 2 and use them as a knowledge-base gap
  backlog.
- Add a separate faithfulness judge only for long free-form grounded responses.
- Automate `rag:eval` after catalog or knowledge-doc changes.
- Add regression fixtures for high-risk categories and known weak retrieval
  cases.
- Review the prompt-injection regex list periodically against real rejected
  traffic.

## Layer Role Summary

| Layer | Type | Implemented mechanism | Result |
| --- | --- | --- | --- |
| 1. Input validation | Hardblock | `validateProjectIdea` in `lib/security/promptGuard.ts`, adapted by `middleware/inputGuard.ts` | `400 { error }` before SSE/LLM |
| 2. Retrieval confidence | Softblock | `confidenceGate` in `lib/rag/retrievalGate.ts`, using fused pool size and top BM25 score | Category returns `null` |
| 3. Prompt guardrails | Structured generation | `buildCategorySchema`, candidate ID enum, `answerPossible`, `assertCandidatesOnly` | Candidate-only recommendation or category skip |
| 4. Post-generation check | Deferred | Not built; structured output already limits off-catalog claims | Revisit for long grounded answers |

The only hardblock is Layer 1. The other active layers degrade gracefully by
skipping weak categories instead of failing the whole recommendation request.
