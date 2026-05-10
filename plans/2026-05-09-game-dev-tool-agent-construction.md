# Game Dev Tool Agent — Construction Plan

**Source spec:** [docs/superpowers/specs/2026-05-09-game-dev-tool-agent-design.md](../docs/superpowers/specs/2026-05-09-game-dev-tool-agent-design.md)
**Mode:** Direct — commit to `main` after each step. Single dev, post-hackathon refactor.
**Scope:** Replace `advisorOrchestrator` with the 4-step agent pipeline (analyze → engine pick → retrieve+retry → recommend) end-to-end. No deploy/demo work in this plan.

---

## Step Map

| # | Step | Depends on | Verify |
|---|------|-----------|--------|
| 1 | DB schema + seed (`tools`, `engine_constraints`) | — | `pnpm --filter @workspace/db run push`; `seed:tools` writes ≥27 rows; `SELECT COUNT(*) FROM engine_constraints` ≥ seeded rule count |
| 2 | Types + form input model (`multiplayer`, drop `engine`) | — | `pnpm run typecheck` green; form renders multiplayer toggle |
| 3 | Step 1 Analyze (prompt + step + Zod schema) | 2 | smoke: `runAnalyze` on a fixture → schema-valid result, ≥1 leaf in `targetCategories` |
| 4 | Step 1.5 Pick Engine (prompt + step + Zod schema) | 2 | smoke: 3 fixtures → `agreed`, `challenged`, `user_silent` each appear; `picked ∈ {Unity,Unreal,Godot,Custom}` |
| 5 | Constraint engine + Step 2 Retrieve (no retry yet) | 1, 2 | unit: every `constraint_type` × condition row → expected verdict; `runRetrieve` returns `candidatesByCategory` with `fetched`/`locked`/`skipped`/`context` mix |
| 6 | Retry logic (`broaden`, `pre_filter`, `checkRetry`) | 5 | unit: retry decision table (counts 0/2/3/15/16, retryCount 0/1/2) → expected next; sibling expansion uses `toolTree.json`, never climbs ancestors |
| 7 | Step 3 Recommend (prompt + step + Zod schema) | 2 | smoke: fixture state → schema-valid `AnalysisResult`; toolIds all from candidate list; locked/skipped categories absent from `recommendations[]` |
| 8 | Orchestrator rewrite + SSE wiring + trust gate | 3, 4, 5, 6, 7 | curl: SSE stream emits `analyze_complete` → `engine_picked` → (optional `retrieval_retry`*) → `retrieval_complete` → `done` in order; `trustScore < 25` ⇒ `terminated:true`, no DB row |
| 9 | Tests + LLM eval scenarios | 8 | unit suite green; `scripts/evaluateScenarios.ts` runs 10–20 scenarios with engine + category assertions; 3–4 integration scenarios Zod-validate `AnalysisResult` |

**Parallelism:**
- Steps 1 + 2 share no files — can run in parallel from a fresh start.
- Steps 3, 4, 5 can land in any order once 1 + 2 are merged. They share no files (different `agent/steps/*` and `agent/prompts/*`).
- Step 6 needs 5; Step 7 only needs 2 (operates on whatever state shape exists).
- Step 8 is the integration choke point — everything serializes here.

---

## Open Decisions to Pin During Implementation

These come from spec §14 and must be resolved as their step is executed. Record the decision in the commit message:

- **`treeNavigator.ts` reuse (resolved in Step 3).** Inline call vs. extract a `treePromptString()` helper. Default: **inline** unless a second caller appears.
- **Scoring placement (resolved in Step 7).** Invoke `scoringService` before Step 3 and pass scores into the prompt, **or** fold scoring into the LLM's structured output. Default: **pass scores in** — keeps scoring deterministic and auditable.
- **Migration filenames + `seed:tools` semantics (resolved in Step 1).** Idempotent upsert keyed by `id`. Migrations under `lib/db/drizzle/` follow Drizzle's existing naming (`NNNN_description.sql`).

---

## Step 1 — DB schema + seed

**Brief.** Add `tools` and `engine_constraints` tables and the seed pipeline. `data/toolCatalog.json` stays the source of truth; the seed command upserts into MySQL. `engine_constraints` rules ship as a SQL migration because they change rarely.

**Files to edit/create:**
- `lib/db/src/schema/tools.ts` (new) — Drizzle schema for `tools`.
- `lib/db/src/schema/engineConstraints.ts` (new) — Drizzle schema for `engine_constraints`.
- `lib/db/src/schema/index.ts` — re-export.
- `lib/db/drizzle/NNNN_engine_constraints_seed.sql` (new) — initial rule rows.
- `lib/db/src/seed/tools.ts` (new) — reads `artifacts/api-server/src/data/toolCatalog.json`, upserts by `id`.
- `lib/db/package.json` — add `"seed:tools": "tsx src/seed/tools.ts"`.

**Tasks:**
- [ ] Define `tools` schema matching spec §3.1 columns and indexes.
- [ ] Define `engine_constraints` schema matching spec §3.1.
- [ ] Run `pnpm --filter @workspace/db run push`; verify in MySQL.
- [ ] Write seed script: `INSERT … ON DUPLICATE KEY UPDATE` for each catalog entry. Map `compatibleEngines` (catalog) → `compatible_engines` JSON column.
- [ ] Hand-write rule rows for the migration. Cover at minimum: `programming_language` engine_locked per engine; `ui_framework` engine_locked per engine; one `feature_required` (e.g. `networking` requires `multiplayer=true`); one `context_dependent` example.
- [ ] Run `seed:tools`; confirm row count == catalog length.

**Exit:** `pnpm run typecheck` green. `SELECT * FROM tools LIMIT 1` returns valid JSON in `compatible_engines` and `platforms`.

**Anti-overengineering note.** No admin UI, no diff/audit logging, no migration of historical rows. Spec §13 says these are out of scope.

---

## Step 2 — Types + form input model

**Brief.** Land the type surface and the `multiplayer` toggle. Form drops the `engine` field entirely (spec §2). Keeping types and form in one PR avoids a half-typed intermediate state.

**Files to edit/create:**
- `artifacts/api-server/src/types/agent.ts` (new) — verbatim from spec §5.
- `artifacts/api-server/src/types/recommendation.ts` — extend `AnalysisResult` with `engineDecision`, `lockedCategories`, `skippedCategories`, `retryMetadata`.
- `lib/api-spec/openapi.yaml` — add `multiplayer: boolean` to `ProjectInput`; remove `engine` if present; add the new `AnalysisResult` fields as optional.
- Run `pnpm --filter @workspace/api-spec run codegen`.
- `artifacts/game-dev-advisor/src/…` (form component) — add multiplayer toggle, remove engine select.

**Tasks:**
- [ ] Copy types from spec §5 into `types/agent.ts`. No invented fields.
- [ ] Extend `AnalysisResult` per spec §5 closing block. Keep all existing fields.
- [ ] Update OpenAPI; codegen.
- [ ] Form: replace engine select with a `<Switch>` for multiplayer. Default `false`.

**Exit:** `pnpm run typecheck` green across all packages. Frontend dev server renders the form with the multiplayer toggle and no engine field.

**Anti-overengineering note.** Don't add UI for engine override — the agent picks. Spec is explicit.

---

## Step 3 — Step 1 Analyze

**Brief.** First LLM call. Reads form + projectIdea + `toolTree.json` and emits `AnalyzeResult`. Structured output via `response_format: json_schema`, parsed with Zod.

**Files to edit/create:**
- `artifacts/api-server/src/agent/prompts/analyzePrompt.ts` (new) — system + user prompt builders.
- `artifacts/api-server/src/agent/steps/analyze.ts` (new) — `runAnalyze(state) => Promise<AnalyzeResult>`.
- Zod schema for `AnalyzeResult` co-located in `analyze.ts` (extract to `agent/schemas.ts` only when a second step needs to reuse).

**Tasks:**
- [ ] Build the prompt per spec §9.1. Include the rules verbatim (multiplayer ⇒ networking + backend; never include `programming_language` / `ui_framework`).
- [ ] Inject `toolTree.json` content via `treeNavigator` (decision: inline call — change only if Step 4 needs the same string).
- [ ] Zod schema: `targetCategories: z.array(z.string()).min(1)`, `signals: { is2D, is3D, targetPlatformPrimary, complexitySignals }`, `userMentionedEngine: z.enum([...]).nullable()`.
- [ ] `runAnalyze` calls `gpt-4o-mini`, parses with Zod, returns. No retries on schema fail (let it throw — error middleware handles it).

**Exit:** Smoke fixture (one-off script) returns a schema-valid `AnalyzeResult`.

**Anti-overengineering note.** No streaming, no token-budget check, no caching layer. Single call, parse, return.

---

## Step 4 — Step 1.5 Pick Engine

**Brief.** Second LLM call. Reads `analyze.projectSummary + signals`, form, and `userMentionedEngine`. Static engine profiles (Unity / Unreal / Godot / Custom) live inside the prompt — no DB lookup.

**Files to edit/create:**
- `artifacts/api-server/src/agent/prompts/pickEnginePrompt.ts` (new).
- `artifacts/api-server/src/agent/steps/pickEngine.ts` (new) — `runPickEngine(state) => Promise<EngineDecision>`.

**Tasks:**
- [ ] Engine profiles in the prompt: 4 short blurbs (one paragraph each) describing what each engine is good/bad for. Source: spec §9.2.
- [ ] Cross-field invariant: when `userMentionedEngine == null` ⇒ `agreement === "user_silent"`. Validate in code after parse — Zod's enum alone can't enforce cross-field rules.
- [ ] `runPickEngine` calls `gpt-4o-mini`, parses, asserts the invariant, returns.

**Exit:** Three smoke fixtures (engine matches user / engine differs / no engine in text) → produces `agreed`, `challenged`, `user_silent` respectively.

**Anti-overengineering note.** No "confidence score". Spec defines `agreement` as the only output dimension — adding a confidence number invents requirements.

---

## Step 5 — Constraint engine + Step 2 Retrieve

**Brief.** The deterministic core. `catalogService` moves from JSON to MySQL. `constraintService` resolves rules per category. `retrieve.ts` orchestrates per-category fetch. **No retry logic in this step** — Step 6 adds it.

**Files to edit/create:**
- `artifacts/api-server/src/services/catalogService.ts` — refactor: replace JSON read with `mysql2` query against `tools`. Export `fetchToolsByCategory(category, engine, opts?) => Promise<ToolRow[]>`.
- `artifacts/api-server/src/services/constraintService.ts` (new) — `resolveConstraint(category, engine) => ConstraintRow | null` (first match by `engine = picked` then `engine = '*'` then `priority DESC`, `LIMIT 1`).
- `artifacts/api-server/src/agent/constraints/matchers.ts` (new) — `matchCondition(conditionJson, formInput, signals) => boolean`.
- `artifacts/api-server/src/agent/constraints/apply.ts` (new) — given a constraint row + match result, produce the `CandidateEntry` verdict (`fetch` | `locked` | `skip` | `context`).
- `artifacts/api-server/src/agent/steps/retrieve.ts` (new) — loop targetCategories, call constraint resolver + catalog fetcher, build `RetrievalResult`.

**Tasks:**
- [ ] Implement the `fetch` SQL from spec §6 verbatim. The `JSON_CONTAINS(..., '"Custom"')` clause is the engine-agnostic escape hatch.
- [ ] Decision table from spec §6 lives in `apply.ts` as a `switch (constraint_type)`. No matching row at all → `fetch` (independent category).
- [ ] `matchers.ts` supports the conditions actually used by seeded rules in Step 1 (multiplayer flag, platform contains, etc.). **Don't pre-build matchers for unused condition shapes.**
- [ ] `retrieve.ts` aggregates: `totalToolCount` is the sum of `tools.length` across all `fetched` and `context` entries.

**Exit:** Unit test covers all four constraint verdicts. Smoke fixture invoking `runRetrieve` on a state with 4–6 categories returns a sensible `candidatesByCategory` mix.

**Anti-overengineering note.** No connection pool tuning, no query caching. mysql2 default pool is fine. Don't add a generic "rule engine" abstraction — first-match-wins is six lines.

---

## Step 6 — Retry logic

**Brief.** Wrap Step 5 in the retry loop from spec §7 + §10. `broaden` expands sibling leaves once per category. `pre_filter` tightens SQL filters; second pass tightens further.

**Files to edit/create:**
- `artifacts/api-server/src/agent/steps/checkRetry.ts` (new) — `checkRetry(state) => "done" | "broaden" | "pre_filter"`.
- `artifacts/api-server/src/agent/steps/retrieve.ts` — accept `retryMode` and `retryCount`, branch SQL/category list accordingly.
- `artifacts/api-server/src/services/catalogService.ts` — accept optional `priceModel?: string[]`, `requirePlatformOverlap?: string[]`, `minRating?: number`.

**Tasks:**
- [ ] Decision: `count < 3 → broaden`; `count > 15 → pre_filter`; both could trigger ⇒ `< 3` wins (spec §7).
- [ ] `broaden`: for each category, look up its parent in `toolTree.json`, add sibling leaf IDs, deduplicate. **Each category broadened at most once** — track in `retryHistory`.
- [ ] `pre_filter` first pass: `price_model IN ('free','freemium')` AND `JSON_OVERLAPS(platforms, ?)` (form.platformTarget).
- [ ] `pre_filter` second pass: `price_model = 'free'` AND `rating >= 4.0`.
- [ ] Hard cap `retryCount >= 2` ⇒ proceed with whatever exists.

**Exit:** Unit test covers (count, retryCount) → expected next mode for the matrix `{0, 2, 3, 10, 15, 16} × {0, 1, 2}`. Sibling expansion test verifies it never climbs ancestors.

**Anti-overengineering note.** No exponential backoff, no jitter, no "smart" retry heuristic. Two booleans and a counter.

---

## Step 7 — Step 3 Recommend

**Brief.** Final LLM call (`gpt-4o`). Produces the user-facing `AnalysisResult`. Trust gate is applied **outside** this step (Step 8) — keep this function pure.

**Files to edit/create:**
- `artifacts/api-server/src/agent/prompts/recommendPrompt.ts` (new).
- `artifacts/api-server/src/agent/steps/recommend.ts` (new) — `runRecommend(state) => Promise<AnalysisResult>`.
- `artifacts/api-server/src/services/scoringService.ts` — kept as-is; called from `recommend.ts` to inject scores into the prompt context.

**Tasks:**
- [ ] **Decision: scoring runs before the LLM call.** `recommend.ts` calls `scoreTools(state.retrieval.candidatesByCategory)` and the prompt receives `[{toolId, score}]` per category. Document this choice in the commit message.
- [ ] Build prompt per spec §9.3. Output schema enforces: `recommendations[].primary` and `alternatives[]` toolIds must be members of the candidate list passed in (validate post-parse, not via Zod).
- [ ] Locked categories ⇒ entry in `lockedExplanations[]` only, never in `recommendations[]`. Skipped categories ⇒ `skippedExplanations[]` only. Validate post-parse.
- [ ] If LLM emits an unknown toolId or violates the locked/skipped invariant, throw — error middleware handles it.

**Exit:** Smoke fixture state → schema-valid `AnalysisResult` with `trustScore` populated, `recommendations[]` toolIds all from candidate list, locked/skipped invariants hold.

**Anti-overengineering note.** Don't fold scoring into the LLM. Determinism > novelty.

---

## Step 8 — Orchestrator rewrite + SSE wiring + trust gate

**Brief.** Replace `advisorOrchestrator.ts` with the state-machine controller from spec §10. Wire all SSE events through `advisorController.ts`. Apply the trust gate per spec §11.

**Files to edit/create:**
- `artifacts/api-server/src/agent/state.ts` (new) — `AgentState` factory + helpers.
- `artifacts/api-server/src/orchestrators/advisorOrchestrator.ts` — rewrite per spec §10 loop.
- `artifacts/api-server/src/controllers/advisorController.ts` — handle the 5 new SSE event types from spec §8.

**Tasks:**
- [ ] State machine exactly as spec §10. Pure-function steps, immutable merge (`{ ...state, ... }`).
- [ ] `runRetrieve` reads `state.retryCount` and `state.retrieval?.retryHistory` to know broadening/filter intensity.
- [ ] Emit `analyze_complete`, `engine_picked`, `retrieval_retry` (per attempt), `retrieval_complete`, `done`, `error`. Payloads per spec §8.
- [ ] Trust gate: `terminated = trustScore < 25`. When terminated: clear `recommendations`, set `sessionId = ""`, do **not** call `persistSession`.
- [ ] Delete legacy code paths: the old `retrieveContext` + flat `reason()` flow is fully replaced.

**Exit:** `curl -N` against `/advisor/analyze` produces the 5 SSE events in order for a happy-path fixture. A low-trust fixture produces `done` with `terminated:true` and no row appears in `advisor_sessions`.

**Anti-overengineering note.** No abort signals, no event replay buffer, no cancellation. The frontend can close the connection — that's enough.

---

## Step 9 — Tests + LLM eval scenarios

**Brief.** Lock the deterministic pieces with unit tests and the LLM pieces with scenario evals. Use the existing `scripts/evaluateScenarios.ts` pattern; do not introduce a new test framework (spec §12).

**Files to edit/create:**
- `artifacts/api-server/src/agent/constraints/apply.test.ts`.
- `artifacts/api-server/src/agent/steps/checkRetry.test.ts`.
- `artifacts/api-server/src/agent/steps/broaden.test.ts` (sibling expansion).
- `scripts/evaluateScenarios.ts` — extend with 10–20 scenarios asserting `engineDecision.picked` and `targetCategories` set membership.
- `artifacts/api-server/src/agent/integration.test.ts` — 3–4 scenarios that run the full orchestrator and Zod-validate `AnalysisResult`.

**Tasks:**
- [ ] If repo lacks any `*.test.ts` runner, add the smallest viable wiring (`node --test` or `tsx --test`) with a single `pnpm test` script. **No vitest/jest/etc.** unless one already exists.
- [ ] Constraint table test: every constraint_type × condition combination → expected verdict.
- [ ] Retry table test: matrix above.
- [ ] Sibling expansion: pick a leaf with siblings, assert siblings included; pick a leaf alone under its parent, assert no expansion.
- [ ] Eval scenarios: 10–20 inputs spanning solo 2D / AAA 3D / mobile multiplayer / web jam / etc. Assert engine pick and that key categories appear.
- [ ] Integration: run the orchestrator with a stub LLM (or live, if scenarios already do), Zod-validate the result.

**Exit:** `pnpm test` (or whatever the wiring uses) green. `scripts/evaluateScenarios.ts` runs to completion with ≥ 80% scenarios passing their assertions.

**Anti-overengineering note.** Don't backfill tests for unchanged code (`scoringService`, `sessionService`). Spec §12 limits scope.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `engine_constraints` rules wrong → wrong locked/skipped behavior | Step 5 unit table covers every seeded rule; Step 9 eval includes engine-specific scenarios |
| LLM returns toolId not in candidate list (hallucination) | Step 7 post-parse validation throws; SSE `error` event surfaces it |
| Step 6 retry loops forever | Hard cap `retryCount >= 2`; loop breaks unconditionally on `done` or cap |
| Frontend breaks when `engine` field disappears | Step 2 ships frontend + backend together |
| MySQL down during `runRetrieve` | Existing error middleware path; no new handling needed |

---

## Done Definition

- All 9 steps committed to `main`.
- `pnpm run typecheck` green.
- `pnpm run build` green.
- A live curl through `/advisor/analyze` for a representative input emits the full SSE sequence and writes one `advisor_sessions` row.
- The 3 open decisions in §"Open Decisions to Pin" have a recorded answer in their step's commit message.
