# Game Dev Tool Recommendation Agent — Design Spec

**Date:** 2026-05-09
**Status:** Approved (brainstorming complete)
**Scope:** Replace `advisorOrchestrator` with a 4-step agent pipeline (analyze → engine pick → retrieve with retry → recommend) on the existing TS / Express / MySQL stack.

Source brainstorming: this document consolidates decisions made over a single brainstorming session. The original architecture reference is `game_dev_tool_agent_architecture.md` at the repo root.

---

## 1. Pipeline

```
Form (engine HARİÇ, multiplayer DAHİL) + free-text projectIdea
        │
        ▼
Step 1  ANALYZE         gpt-4o-mini      → targetCategories, signals, projectSummary
        │  SSE: analyze_complete
        ▼
Step 1.5 ENGINE PICK    gpt-4o-mini      → engineDecision (picked, agreement, reasoning)
        │  SSE: engine_picked
        ▼
Step 2  RETRIEVE        no LLM           → candidate tools per category
        │  apply constraints (engine_locked / feature_required / context_dependent)
        │  SQL fetch from MySQL `tools`
        │  retry: count<3 → broaden | count>15 → pre_filter | max 2 retries
        │  SSE: retrieval_retry (per attempt), retrieval_complete
        ▼
Step 3  RECOMMEND       gpt-4o           → structured cards + summary + trustScore
        │  SSE: done
        ▼
AnalysisResult
```

- Step 1 and 1.5 are separate LLM calls; mini model, structured JSON output.
- Step 2 has no LLM; deterministic SQL + constraint resolution.
- Step 3 uses the larger model because its output is what the user sees.
- Trust gate: `trustScore < 25` ⇒ `terminated: true`, no recommendations, no session row.

---

## 2. Input Model

The form provides hard inputs that are never empty. Free text describes the project.

```ts
interface AdvisorFormInput {
  projectIdea: string;          // free text
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: "solo" | "team";
  platformTarget: string[];     // ["PC","Mobile","Console","Web"]
  artCapability: string;
  multiplayer: boolean;         // NEW — toggle in form
  otherConstraints?: string | null;
  pinnedToolIds?: string[];
}
```

`engine` is **not** a form field. The agent picks it (Step 1.5) and may challenge a user's text-mentioned engine with reasoning.

---

## 3. Data Layer (MySQL)

### 3.1 New tables

```sql
CREATE TABLE tools (
  id                 VARCHAR(64)  PRIMARY KEY,
  name               VARCHAR(128) NOT NULL,
  leaf_category      VARCHAR(64)  NOT NULL,
  description        TEXT,
  price_model        ENUM('free','freemium','paid','subscription') NOT NULL,
  compatible_engines JSON         NOT NULL,
  tool_type          ENUM('builtin','plugin','asset','external','service') NOT NULL,
  platforms          JSON         NOT NULL,
  pros               JSON,
  cons               JSON,
  url                VARCHAR(512),
  rating             DECIMAL(3,2) DEFAULT 0.0,
  last_updated       DATE,
  INDEX idx_leaf_category (leaf_category),
  INDEX idx_price_model (price_model)
);

CREATE TABLE engine_constraints (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  engine          VARCHAR(32)  NOT NULL,   -- 'Unity'|'Unreal'|'Godot'|'*'
  category        VARCHAR(64)  NOT NULL,
  constraint_type ENUM('engine_locked','feature_required','context_dependent') NOT NULL,
  condition_json  JSON,
  result_json     JSON         NOT NULL,
  priority        INT          DEFAULT 0,
  INDEX idx_lookup (category, engine)
);
```

`advisor_sessions` (existing) is unchanged; the `result` JSON column carries the new fields.

### 3.2 Source of truth + seed

- `data/toolCatalog.json` stays the source of truth (git-reviewable).
- A new seed command `pnpm --filter @workspace/db run seed:tools` performs idempotent upsert into `tools`.
- `engine_constraints` rows are written via a SQL migration (rules change less often than tool catalog entries).

`data/toolTree.json` (already generated) is consumed by Step 1's prompt as-is.

---

## 4. Files

```
artifacts/api-server/src/
├── orchestrators/advisorOrchestrator.ts   # rewrite — state-machine controller
│
├── agent/                                 # NEW
│   ├── state.ts
│   ├── steps/
│   │   ├── analyze.ts
│   │   ├── pickEngine.ts
│   │   ├── retrieve.ts
│   │   ├── checkRetry.ts
│   │   └── recommend.ts
│   ├── constraints/
│   │   ├── apply.ts
│   │   └── matchers.ts
│   └── prompts/
│       ├── analyzePrompt.ts
│       ├── pickEnginePrompt.ts
│       └── recommendPrompt.ts
│
├── services/
│   ├── catalogService.ts        # refactor — read from MySQL
│   ├── constraintService.ts     # NEW
│   ├── reasoningService.ts      # Step 3 LLM call lives here
│   ├── scoringService.ts        # unchanged
│   └── sessionService.ts        # unchanged
│
├── controllers/advisorController.ts       # add new SSE event handlers
├── types/agent.ts                         # NEW
├── types/recommendation.ts                # extend AnalysisResult
└── lib/rag/treeNavigator.ts               # used by Step 1 (tree → prompt string)
```

---

## 5. Types

```ts
// types/agent.ts

export type Engine = "Unity" | "Unreal" | "Godot" | "Custom" | "unknown";
export type Agreement = "agreed" | "challenged" | "user_silent";
export type RetryMode = "broaden" | "pre_filter";

export interface AnalyzeResult {
  targetCategories: string[];          // toolTree leaf IDs
  projectSummary: string;
  userMentionedEngine: Engine | null;
  signals: {
    is2D: boolean;
    is3D: boolean;
    targetPlatformPrimary: string;
    complexitySignals: string[];
  };
}

export interface EngineDecision {
  picked: Exclude<Engine, "unknown">;
  userPreferred: Engine | null;
  agreement: Agreement;
  reasoning: string;
  alternativesConsidered: Array<{ engine: Engine; reasonRejected: string }>;
}

export type CandidateEntry =
  | { type: "fetched"; tools: ToolRow[] }
  | { type: "locked"; lockedTo: string[]; note: string }
  | { type: "skipped"; reason: string }
  | { type: "context"; tools: ToolRow[]; note: string };

export interface RetrievalResult {
  candidatesByCategory: Record<string, CandidateEntry>;
  totalToolCount: number;
  retryHistory: Array<{ attempt: number; mode: RetryMode; countBefore: number }>;
}

export interface AgentState {
  input: AdvisorFormInput;
  analyze?: AnalyzeResult;
  engineDecision?: EngineDecision;
  retrieval?: RetrievalResult;
  retryCount: number;
  finalResult?: AnalysisResult;
}

export interface ToolRow {
  id: string;
  name: string;
  leafCategory: string;
  description: string | null;
  priceModel: "free" | "freemium" | "paid" | "subscription";
  compatibleEngines: Engine[];
  toolType: "builtin" | "plugin" | "asset" | "external" | "service";
  platforms: string[];
  pros: string[];
  cons: string[];
  url: string | null;
  rating: number;
  lastUpdated: string | null;
}
```

`AnalysisResult` (in `types/recommendation.ts`) gains:

```ts
engineDecision: EngineDecision;
lockedCategories: Array<{ category: string; lockedTo: string[]; note: string }>;
skippedCategories: Array<{ category: string; reason: string }>;
retryMetadata: { retryCount: number; history: RetrievalResult["retryHistory"] };
```

Existing fields (`sessionId`, `projectSummary`, `trustScore`, `trustTier`, `terminated`, `retrieval`, `recommendations`, `finalSummary`) are kept.

---

## 6. Constraint Engine

For each target category, look up rules ordered by `engine = picked` first, then `engine = '*'`, then `priority DESC`. **First match wins (`LIMIT 1`).**

| `constraint_type` | If condition matches → action | If not → action |
|---|---|---|
| `engine_locked` | `locked` (note + lockedTo) | (n/a — engine_locked has no condition) |
| `feature_required` | `fetch` | `skip` (with reason) |
| `context_dependent` | `context` (use `recommend_ids`) | `fetch` |

No matching row at all → `fetch` (independent category).

### `fetch` SQL

```sql
SELECT * FROM tools
WHERE leaf_category = ?
  AND (
    JSON_CONTAINS(compatible_engines, JSON_QUOTE(?))
    OR JSON_CONTAINS(compatible_engines, '"Custom"')
  )
ORDER BY rating DESC
LIMIT 50;
```

`Custom` in `compatible_engines` means engine-agnostic.

---

## 7. Retry Logic

After Step 2:

- `totalToolCount < 3` → mode `broaden`
- `totalToolCount > 15` → mode `pre_filter`
- otherwise → done

Hard cap: `retryCount >= 2` ⇒ proceed with whatever is in hand. If both conditions could trigger (mixed buckets), `< 3` wins.

### `broaden`

Expand `targetCategories` with **sibling leaves** under the same parent in `toolTree.json`. Each category is broadened at most once; ancestors are not climbed.

### `pre_filter`

Add to the `fetch` query:

```sql
AND price_model IN ('free','freemium')
AND JSON_OVERLAPS(platforms, ?)            -- form.platformTarget
```

On the second `pre_filter`: tighten to `price_model = 'free'` and `rating >= 4.0`.

---

## 8. SSE Events

| Event | Emitted after | Payload |
|---|---|---|
| `analyze_complete` | Step 1 | `AnalyzeResult` |
| `engine_picked` | Step 1.5 | `EngineDecision` |
| `retrieval_retry` | each retry trigger | `{ mode, attempt, previousCount }` |
| `retrieval_complete` | Step 2 final | `{ totalToolCount, retryCount, lockedCategories, skippedCategories }` |
| `done` | Step 3 | `AnalysisResult` |
| `error` | any failure | `{ message }` (existing) |

---

## 9. Prompts (skeletons)

Prompts live under `agent/prompts/`. Output is enforced via OpenAI `response_format: json_schema` and parsed with Zod.

### 9.1 Analyze (`gpt-4o-mini`)

```
Inputs: form fields + projectIdea + toolTree.json
Output JSON:
{
  targetCategories: string[],          // leaf IDs only, no labels
  projectSummary: string,              // 1–2 cümle Türkçe
  userMentionedEngine: Engine|null,    // only if explicitly stated in text
  signals: { is2D, is3D, targetPlatformPrimary, complexitySignals[] }
}
Rules:
- multiplayer=true ⇒ include networking + backend categories
- never include programming_language or ui_framework (handled by constraints)
```

### 9.2 Pick Engine (`gpt-4o-mini`)

```
Inputs: analyze.projectSummary + analyze.signals + form + analyze.userMentionedEngine
Engine profiles (static knowledge in prompt): Unity / Unreal / Godot / Custom
Output JSON:
{
  picked, userPreferred, agreement, reasoning,
  alternativesConsidered: [{ engine, reasonRejected }]
}
agreement values:
  agreed       — user named engine, picked matches
  challenged   — user named engine, picked differs (reasoning must say WHY user's
                 choice doesn't fit)
  user_silent  — user did not name an engine
```

### 9.3 Recommend (`gpt-4o`)

```
Inputs: input + engineDecision + retrieval.candidatesByCategory + retrieval.retryHistory
Output JSON:
{
  projectSummary,
  engineExplanation,            // explain pick to user; if challenged, be polite
  recommendations: [{ category, primary, alternatives[0..2] }],
  lockedExplanations: [{ category, lockedTo, note }],
  skippedExplanations: [{ category, reason }],
  trustScore (0..100),
  trustRationale,
  finalSummary                  // markdown — starting point + ordered action plan
}
Rules:
- toolIds must come from candidate list
- 'locked' / 'skipped' categories never appear in recommendations[]
```

---

## 10. State Mutation Pattern

Each step is a pure function: `(state) → partial`. The orchestrator merges and emits.

```ts
let state: AgentState = { input, retryCount: 0 };

state = { ...state, analyze: await runAnalyze(state) };
emit("analyze_complete", state.analyze);

state = { ...state, engineDecision: await runPickEngine(state) };
emit("engine_picked", state.engineDecision);

while (true) {
  state = { ...state, retrieval: await runRetrieve(state) };
  const next = checkRetry(state);              // "done" | "broaden" | "pre_filter"
  if (next === "done" || state.retryCount >= 2) break;
  state = { ...state, retryCount: state.retryCount + 1 };
  emit("retrieval_retry", { mode: next, attempt: state.retryCount, ... });
}
emit("retrieval_complete", summarize(state.retrieval));

const final = await runRecommend(state);
emit("done", final);
```

`runRetrieve` reads `state.retryCount` and `state.retrieval?.retryHistory` to know whether broaden/pre_filter applies and at which intensity.

---

## 11. Trust Gate

Same as today:

```ts
const terminated = trustScore < 25;
const trustTier =
  trustScore < 25 ? "block" :
  trustScore < 60 ? "warn"  : "pass";

if (terminated) {
  // recommendations cleared, sessionId empty, no advisor_sessions row
}
```

---

## 12. Tests / Eval

The repo currently has no test suite. Scope of this spec adds:

- **Unit tests** (deterministic): constraint resolution table (every `constraint_type` × condition), retry decision table, sibling expansion in `broaden`.
- **LLM eval**: extend the existing `scripts/evaluateScenarios.ts` pattern with 10–20 scenarios that assert engine pick and category set.
- **Integration**: 3–4 end-to-end scenarios that run the orchestrator and Zod-validate the `AnalysisResult` shape.

No new test framework. Anything beyond the above is out of scope here.

---

## 13. Out of Scope

- Replacing the existing OpenAI client / model abstraction.
- Admin UI for editing tools or constraints (MySQL-direct edits suffice).
- Caching layer for tool lookups.
- Multi-language UI; prompts and user-facing strings are Turkish, matching the existing system.
- Migration of historical `advisor_sessions` rows; new pipeline writes new rows from day one.

---

## 14. Open Items for Implementation Plan

These are decided in spirit but the implementation plan must pin them down:

- Exact SQL migration filenames and the upsert semantics of `seed:tools`.
- How `treeNavigator.ts` is reused by Step 1 (helper extraction vs. inline call).
- Whether `scoringService` is invoked before Step 3 or its scoring is folded into the LLM output.
- Concrete Zod schema for each new structured output.
