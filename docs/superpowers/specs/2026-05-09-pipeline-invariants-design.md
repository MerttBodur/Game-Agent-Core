# Pipeline Invariants — Design Spec

**Date:** 2026-05-09
**Status:** Approved (pending implementation)
**Scope:** `artifacts/api-server` advisor pipeline
**Type:** Bug-fix bringing code into compliance with PDD Section 3 + Section 5
**Predecessor:** [`2026-05-07-pdd-sections-2-3-4-5-alignment-design.md`](./2026-05-07-pdd-sections-2-3-4-5-alignment-design.md) introduced the trust-score and termination concepts; this spec enforces them at runtime.

---

## 1. Problem Statement

The advisor pipeline has three documented invariants in `PDD.md` that the current code does not enforce. As a result the response payload can be internally inconsistent — most visibly:

- A retrieval stage selects N relevant categories, but the reasoning stage returns recommendations for fewer than N (sometimes zero), with no penalty.
- The reasoning stage can fabricate recommendations for categories that retrieval did not select.
- A `terminated=true` (block-tier) response still carries the LLM's recommendations and final summary, contradicting PDD §5: *"only a warning response is returned, full analysis payload is not generated."*

This is not a model-quality problem. It is a missing-guardrail problem. The LLM output is treated as ground truth without any deterministic validation between stages.

### Concrete code references

- Retrieval source-of-truth: [`artifacts/api-server/src/lib/rag/treeNavigator.ts:67`](../../../artifacts/api-server/src/lib/rag/treeNavigator.ts#L67) — produces `retrieval.relevantCategories`.
- Reasoning prompt: [`artifacts/api-server/src/services/reasoningService.ts:74`](../../../artifacts/api-server/src/services/reasoningService.ts#L74) — natural-language instruction "Recommend ONE primary tool ... per relevant category" with no schema-level enforcement.
- LLM response shape: [`artifacts/api-server/src/types/recommendation.ts:50`](../../../artifacts/api-server/src/types/recommendation.ts#L50) — `recommendations` array has no `min` constraint and no relation to retrieval.
- Trust score formula: [`artifacts/api-server/src/services/reasoningService.ts:151`](../../../artifacts/api-server/src/services/reasoningService.ts#L151) — only penalises invented `toolId`s, not missing categories.
- Termination handling: [`artifacts/api-server/src/orchestrators/advisorOrchestrator.ts:45`](../../../artifacts/api-server/src/orchestrators/advisorOrchestrator.ts#L45) — sets `terminated=true` but spreads the full reasoning payload into the response.

### PDD references the design restores

- §3 Trust Score System — "If trust score falls below a critical threshold: recommendation generation stops, analysis generation stops, warning output is produced instead."
- §3 Hallucination Mitigation — "tools cannot be recommended if they do not exist in the knowledge base."
- §3 Recommendation Priorities — "AI never overrides explicit user intent."
- §5 Trust Score Enforcement — "If a trust score falls below the critical threshold: only a warning response is returned, full analysis payload is not generated, session persistence is rejected."

---

## 2. Architecture

The fix introduces **two new pure helpers** and adjusts the trust-score formula. No new modules, no new dependencies, no architecture-level changes.

```
runAdvisorPipeline (orchestrator)
  ├─ retrieveContext()                 → retrieval.relevantCategories = [A, B, C, D]
  └─ reason(inputs, retrieval)
       ├─ scoreByCategory()
       ├─ openai.chat.completions      → llm.recommendations (may be subset/superset/dup)
       ├─ ReasoningResponseSchema      → shape valid
       ├─ ★ enforceCoverage()  (NEW)   → drops extras, drops dupes, computes coverageRatio
       ├─ assemble()                   → trustScore = afterDrops × coverageRatio
       └─ trustTierFor()               → block / warn / pass

  ★ normalizeTerminated()  (NEW)
     if trustTier === "block":
        recommendations = []
        finalSummary    = BLOCK_FINAL_SUMMARY (constant)
        projectSummary  = preserved
        retrieval       = preserved
        trustScore      = preserved
        trustTier       = "block"
        terminated      = true
        sessionId       = ""
        persist         = skipped (already correct)
```

### Source-of-truth chain

| Layer | Authority | Constraint on next layer |
|---|---|---|
| `retrieval.relevantCategories` | Ground truth for which PDD categories the project needs | Reasoning may return a *subset* (penalised) but never a *superset* (silently dropped) |
| `llm.recommendations` (post-coverage) | Recommendations for the project | Must reference catalog tool IDs; missing categories tank trust score |
| `trustTier` | Single decision point for terminated state | `"block"` → response is normalised, no payload, no persist |

---

## 3. Coverage Enforcement (Fix #1 + #2 combined)

### Algorithm

After `ReasoningResponseSchema.safeParse` succeeds, before `assemble()` runs:

```
relevant   = retrieval.relevantCategories
returned   = unique(llm.recommendations.map(r => r.category))

missing    = relevant.filter(c => !returned.includes(c))
extras     = returned.filter(c => !relevant.includes(c))
duplicates = llm.recommendations.length - dedup'd length

coveredCount  = relevant.length - missing.length
coverageRatio = relevant.length === 0 ? 1 : coveredCount / relevant.length

filteredRecommendations =
  llm.recommendations
    .filter(r => relevant.includes(r.category))   // drop extras
    .filter(r => keepFirstOccurrenceByCategory)   // drop duplicates
```

### Three violation types and their handling

| Violation | Definition | Handling | Trust impact |
|---|---|---|---|
| **Missing** | Retrieval picked it, reasoning omitted it | Counted; coverageRatio drops | **Proportional**: `trustScore *= covered/total` |
| **Extras** | Reasoning produced it, retrieval did not pick it | Silently dropped from output, logged | None (drop is the response) |
| **Duplicates** | Reasoning produced 2+ entries for the same category | Keep first by source order, drop rest, logged | None |

**Rationale for asymmetry.** Retrieval is the source of truth. Reasoning may be a subset of retrieval (with a trust penalty proportional to the gap) but may never be a superset. Dropping extras is honest; penalising them would conflate two different failure modes.

### Trust score formula change

Update [`artifacts/api-server/src/services/reasoningService.ts:151`](../../../artifacts/api-server/src/services/reasoningService.ts#L151):

```ts
// BEFORE
const trustScore = Math.max(0, llm.trustScore - droppedReferences * 10);

// AFTER
const afterDrops    = Math.max(0, llm.trustScore - droppedReferences * 10);
const afterCoverage = Math.round(afterDrops * coverageRatio);
const trustScore    = afterCoverage;
```

### Score behaviour table (block threshold = 25)

| LLM trustScore | dropped refs | covered/total | Final | Tier |
|---:|---:|---:|---:|---|
| 80 | 0 | 5/5 | 80 | pass |
| 80 | 0 | 4/5 | 64 | pass/warn |
| 80 | 0 | 3/5 | 48 | warn |
| 80 | 0 | 2/5 | 32 | warn |
| 80 | 0 | 1/5 | 16 | **block** |
| 50 | 0 | 3/5 | 30 | warn |
| 50 | 1 | 3/5 | 24 | **block** |
| 50 | 0 | 5/5 | 50 | pass/warn |

The formula is single-variable and explainable: coverage gap proportionally erodes trust. No tunable per-category penalty constant.

### Helper signature

In `services/reasoningService.ts`:

```ts
function enforceCoverage(
  llm: ReasoningResponse,
  retrieval: RetrievedContextPackage,
): {
  filteredRecommendations: ReasoningResponse["recommendations"];
  coverageRatio: number;
  missing: PddCategory[];
  extras: PddCategory[];
  duplicates: PddCategory[];
}
```

`reason()` then:

```ts
const coverage     = enforceCoverage(parsed.data, retrieval);
const sanitizedLlm = { ...parsed.data, recommendations: coverage.filteredRecommendations };
return assemble(sanitizedLlm, retrieval, scored, coverage.coverageRatio);
```

`assemble()` gains a 4th parameter `coverageRatio: number` and applies it in the trust formula above. All other behaviour unchanged.

### Prompt hardening (defence in depth)

The system prompt in [`artifacts/api-server/src/services/reasoningService.ts:74`](../../../artifacts/api-server/src/services/reasoningService.ts#L74) gains an explicit category allow-list rendered from `retrieval.relevantCategories`:

```
You MUST produce exactly one recommendation entry for EACH of these categories,
in this exact order, and you MUST NOT produce entries for any other category:
  - <cat 1>
  - <cat 2>
  ...
```

Two-layer defence: prompt narrows the LLM's permissible behaviour, code enforces it deterministically.

### Edge cases

| Case | Behaviour |
|---|---|
| `relevantCategories.length === 0` | `coverageRatio = 1` (no penalty); `fallbackStatus="missing_domain"` separately keeps trustScore low |
| LLM returned `recommendations: []` | `coverageRatio = 0` (when retrieval had ≥1) → `trustScore = 0` → block |
| JSON parse / schema validation fails | Existing `degraded()` path runs; coverage check never reached |
| All retrieval categories covered exactly | `coverageRatio = 1`; behaviour matches current code |

---

## 4. Terminated Normalisation (Fix #3)

### Current bug

[`artifacts/api-server/src/orchestrators/advisorOrchestrator.ts:45-47`](../../../artifacts/api-server/src/orchestrators/advisorOrchestrator.ts#L45-L47):

```ts
const terminated = reasoning.trustTier === "block";
const sessionId = terminated ? "" : randomUUID();
const result: AnalysisResult = { ...reasoning, sessionId, terminated };
```

`sessionId` zeroes out and `persist` is skipped (correct). But `recommendations`, `finalSummary`, and `projectSummary` from the LLM flow through the spread, contradicting PDD §5.

### Solution

A pure helper in `orchestrators/advisorOrchestrator.ts`:

```ts
function normalizeTerminated(
  reasoning: Omit<AnalysisResult, "sessionId" | "terminated">,
): Omit<AnalysisResult, "sessionId" | "terminated"> {
  if (reasoning.trustTier !== "block") return reasoning;
  return {
    ...reasoning,
    recommendations: [],
    finalSummary: BLOCK_FINAL_SUMMARY,
  };
}
```

Then in the pipeline:

```ts
const reasoning  = await reason(...);
const normalized = normalizeTerminated(reasoning);
const terminated = normalized.trustTier === "block";
const sessionId  = terminated ? "" : randomUUID();
const result: AnalysisResult = { ...normalized, sessionId, terminated };
```

### Block message constant

Currently the message lives inline in [`artifacts/api-server/src/services/reasoningService.ts:170-171`](../../../artifacts/api-server/src/services/reasoningService.ts#L170-L171) (the `degraded()` helper). Promote it to a single exported constant in `types/recommendation.ts`:

```ts
export const BLOCK_FINAL_SUMMARY =
  "We could not produce a confident recommendation for this project. " +
  "This usually means the project description is too vague, the requested " +
  "platform/budget combination has no strong tooling fit, or the candidate " +
  "pool was too thin. Please refine your project description and try again.";
```

`degraded()` and `normalizeTerminated()` both consume the same constant — no drift over time.

### Field-by-field behaviour on block

| Field | Block value | Reason |
|---|---|---|
| `sessionId` | `""` | No persistence, ID would be meaningless |
| `recommendations` | `[]` | Don't show fake confidence |
| `finalSummary` | `BLOCK_FINAL_SUMMARY` | Replace LLM's misleading prose |
| `projectSummary` | LLM output preserved | Useful for debugging "why blocked" |
| `trustScore` | preserved | Frontend may show "X/100 confidence" |
| `trustTier` | `"block"` | Frontend layout switch |
| `retrieval` | preserved | Transparency / debugging |
| `terminated` | `true` | Existing contract |

### Block enters via two doors, exits via one shape

1. Schema/parse failure → `degraded()` → block-shaped payload
2. Trust tier computed as block → `normalizeTerminated()` → identical block-shaped payload

Same API contract regardless of failure mode.

---

## 5. Verification Strategy

The project has no test suite (per `CLAUDE.md`: "There are no test commands"). This change does not introduce a test framework. Verification is:

1. `pnpm run typecheck` (must pass).
2. Manual `curl` execution of 12 ground-truth scenarios listed below.
3. For each scenario, inspect the JSON response against documented expectations.

Each scenario uses a real-world game (or deliberately broken input) as ground truth. Implementation plan stage will turn these into concrete request bodies.

| # | Reference | Profile sketch | Expected primary | Expected tier | Fix exercised |
|---|---|---|---|---|---|
| 1 | Witcher 3 | AAA RPG, 20+ team, big budget, 2+ years, advanced | UE5 (custom not in catalog) | pass | Coverage on all 7 categories |
| 2 | Hollow Knight | 2D metroidvania, solo, $0, 4 yrs, intermediate | Unity, Aseprite | pass / warn | Coverage on 4-5 categories |
| 3 | Among Us | Mobile multiplayer, 3 ppl, low budget, 1 yr | Unity | warn | Multiplayer signal |
| 4 | Vampire Survivors | Pixel roguelike, solo, low, 3 mo, intermediate | Godot or Unity, Aseprite | pass | Time pressure |
| 5 | Stardew Valley | 2D farming sim, solo, low, 4 yrs, advanced | Unity, Aseprite | pass | Long timeline |
| 6 | Beat Saber | VR rhythm, 5 ppl, mid budget, 2 yrs | Unity (XR plugin) | pass | Specialised platform |
| 7 | Subnautica | 3D survival, 10 ppl, mid budget, 3 yrs | UE or Unity | pass | Mid-scale 3D |
| 8 | Doki Doki Literature Club | Visual novel, solo, $0, 6 mo, beginner | Godot or GameMaker (Ren'Py absent) | warn | Catalog gap visible |
| 9 | "I want to make a game" | Vague, no detail | — | **block** | Terminated normalisation |
| 10 | "AAA MMORPG, solo, $0, 1 month" | Unrealistic scope | — | **block** | Trust gate scope realism |
| 11 | "Mobile match-3 with NFTs", 2 ppl | Niche, thin candidate pool | low confidence | warn / block edge | Coverage formula at edge |
| 12 | "Educational coding game for kids" web | Web platformer, 5 ppl | Construct or GameMaker, web deploy | pass / warn | Atypical platform mix |

### Acceptance criteria (per scenario)

1. **Coverage**: `recommendations.length === retrieval.relevantCategories.length` when no coverage penalty was applied. Otherwise the trust score reflects the proportional drop.
2. **No extras**: every `recommendations[].category` value appears in `retrieval.relevantCategories`.
3. **No duplicates**: `unique(recommendations.map(r => r.category)).length === recommendations.length`.
4. **Block normalisation** (scenarios 9, 10, possibly 11): `terminated === true` AND `recommendations.length === 0` AND `finalSummary === BLOCK_FINAL_SUMMARY` AND no row written to `advisor_sessions`.
5. **Spec compliance**: `pinnedToolIds` are honoured (PDD §3 "AI never overrides explicit user intent").

---

## 6. Out of Scope

- Adding a test framework (Vitest, node:test, etc.).
- Refactoring `degraded()` beyond extracting the shared constant.
- Changing the trust threshold env (`TRUST_SCORE_BLOCK_THRESHOLD`).
- Changing the retrieval pipeline (`treeNavigator.ts`).
- Changing the OpenAPI schema (`lib/api-spec/openapi.yaml`) — `AnalysisResult` shape is unchanged; only its values are normalised.
- Frontend changes — frontend already reads `terminated` and `recommendations` correctly per the existing contract.

---

## 7. Files Touched

| File | Change |
|---|---|
| `artifacts/api-server/src/types/recommendation.ts` | Add `BLOCK_FINAL_SUMMARY` constant export |
| `artifacts/api-server/src/services/reasoningService.ts` | Add `enforceCoverage()`; update `assemble()` signature + formula; tighten system prompt with category allow-list; replace inline degraded message with constant |
| `artifacts/api-server/src/orchestrators/advisorOrchestrator.ts` | Add `normalizeTerminated()`; call it before constructing `result` |

No new files. No deleted files. No dependency changes.
