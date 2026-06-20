# Design — Category Coverage, Full Engine Support & Budget-Aware AI Coding

**Date:** 2026-06-20
**Status:** Approved (pending spec review)

## Problem

Three user-reported defects in the advisor analysis:

1. **Missing categories.** A run for "A 2D Web RPG Game" returned only Engine, Art & Asset, and Audio. AI Coding, VFX, and Animation were absent. The catalog defines all six categories, but the LLM feasibility step prunes `targetCategories`, and the orchestrator silently drops any category whose retrieval yields no confident pick.

2. **Engine selection is structurally limited.** The pipeline can only recommend Unity / Unreal / Godot (hardcoded `ENGINES` const), even though the catalog contains 11 game engines including web-native ones (Phaser, Construct 3, GDevelop, Defold, LÖVE, Ren'Py). For a 2D web game the correct answer is Phaser, but the system was forbidden from recommending it and fell back to Godot. Three.js is not in the catalog at all.

3. **No token / cost data for AI coding tools.** The catalog models price as a coarse `pricing` enum (`subscription` / `freemium` / `open_source`) with no notion of token-usage cost. The pipeline therefore cannot express that Codex/Cursor are cheaper per task than token-heavy Claude Code.

## Root Cause

All three share one root cause: **hardcoded narrowing that ignores the catalog.**

- Categories are narrowed by an LLM with no "always include" floor (`ai_coding`).
- Engines are narrowed to 3 by a const (`ENGINES`) that predates the catalog's 11 engines, plus an engine-compatibility flag system (`engine_unity`/`engine_unreal`/`engine_godot`) baked into the Chroma index and retriever.
- Cost is narrowed to a 3-value enum that cannot represent token-usage economics.

Investigation of the engine-compatibility flags showed they affect only **2 of 48** non-engine tools (Unity VFX Graph → Unity only, Niagara → Unreal only); 46 tools are `engine_any`. The filter's cost (blocking 11-engine support) far exceeds its benefit (eliminating 2 tools from the wrong engine).

## Solution

### Part 1 — Category selection

User decision: every game needs Coding, Animation, and VFX too — so **all five non-engine categories are always active**. The LLM no longer decides *which* categories; it only decides *whether the project is feasible*.

Note: previously *no* category was guaranteed. All five (including art_asset and audio) came from the LLM's `targetCategories` output, so the set varied per run — the "2D web RPG" run happened to keep art_asset + audio and drop the other three, but a later run could have dropped audio too. The fix makes the set deterministic and guarantees one recommendation per category.

There are two pruning points; both are removed:

1. **Feasibility-level pruning** (the LLM picks `targetCategories`).
2. **Recommendation-level pruning** (`recommendCategory` returns `null` when retrieval finds no confident candidate, so the orchestrator skips it).

- **Always analyze all five `NON_ENGINE_CATEGORIES`** (`art_asset`, `vfx`, `animation`, `audio`, `ai_coding`) for every feasible project. `targetCategories` becomes a fixed list, not an LLM output.
- **Remove `targetCategories` from `FeasibilitySchema`** and from the feasibility prompt's category-selection instructions ("pick the categories this project needs / skip the ones it doesn't"). The orchestrator assigns the full `NON_ENGINE_CATEGORIES` list directly. This shrinks the LLM's structured-output surface and removes the first pruning failure mode.
- **Always recommend the best candidate per category.** Remove the `answerPossible: false` escape path (Layer 3) from `buildCategorySchema` / `categorySystemPrompt`; `recommendCategory` must always return a `primary`. The catalog is populated in all five categories (art_asset 17, vfx 6, animation 11, audio 11, ai_coding 7+2), so a reasonable candidate always exists. Guarantee: 5 categories → 5 recommendations.
- **Keep the feasibility gate** (`feasible` boolean + `reason`) exactly as-is — unrealistic projects still terminate early.
- **No `category_skipped` event needed.** With both pruning points removed, a category can no longer vanish, so the orchestrator's silent-drop branch (`if (rec)`) is deleted rather than instrumented.

#### Interaction with the new RAG defense layers (Layer 1/2/3)

The advisor recently gained three defense layers (`rag-defense-layers-integration.md`). The "guarantee one recommendation per category" rule conflicts with the *skip* action of Layer 2 and Layer 3 but **not** with their protective intent. Resolution (decided with the user):

- **Layer 1 (prompt-injection input guard):** untouched — it runs at input, unrelated to category selection.
- **Layer 2 (retrieval confidence gate, `confidenceGate`/`shouldSkipCategory`):** keep the gate code, but `recommendCategory` no longer returns `null` on a failed gate. Instead it **logs** the gate reason (`console.warn`) and proceeds to recommend the best candidate. The low-confidence signal is observable in server logs, not silently dropped — but the category still produces a recommendation.
- **Layer 3 (`answerPossible`):** removed — the model can no longer decline to pick.
- **Anti-fabrication prompt rule** (categorySystemPrompt: "use ONLY facts in the candidate text; do not invent capabilities/prices/platforms") is **kept verbatim** — this is the real protection against hallucinated recommendations and does not conflict with the guarantee.
- **Transparency:** low-confidence is server-log only for now; surfacing a "low confidence" flag to the UI (new `confidence` field + openapi.yaml + frontend) is explicitly out of scope.

### Part 2 — Full engine support (11 catalog engines + Three.js)

- **Make `EngineName` the catalog tool `id`, not the display name.** Today `ENGINES = ["Unity","Unreal","Godot"]` are display-ish names that happen to lowercase-match their ids — but this is fragile: the real catalog name "Unreal Engine" does not match id `unreal_engine`, and 5 of 11 engines (Unreal Engine, Construct 3, RPG Maker, Ren'Py, LÖVE) fail `name.toLowerCase() === id`. `scoring.engineFit` relies on `t.id === ctx.pickedEngine.toLowerCase()`, which breaks at scale. Fix: `ENGINES` becomes the **ids** of all `game_engine` tools (`unity`, `unreal_engine`, `godot`, `gamemaker`, `construct_3`, `gdevelop`, `rpg_maker`, `renpy`, `defold`, `phaser`, `love2d`, plus new `threejs`), derived from the catalog at load time. `engineFit` becomes a direct `t.id === ctx.pickedEngine` match (no `.toLowerCase()`). Display names are looked up from the catalog (`TOOL_BY_ID`) when rendering.
- **Remove the engine-compatibility flag filter.** Delete `engineFlagKey`, and the engine portion of `toolWhereForCategory` / `metadataMatchesWhere`. Category tools are no longer filtered by engine (96% are `any`).
- **Guard the 2 engine-specific VFX tools via prompt.** Add to `categorySystemPrompt`: "If a candidate's text says it is specific to a particular engine (e.g. Unity only) and the chosen engine is not that one, do not select it as primary."
- **Add Three.js to the catalog.** Modeled on Phaser (JS/web framework) but as a *3D* library with a high learning curve: `pricing: open_source` (MIT), `toolNature: traditional`, `learningCurve: high`, `difficultyLevel: advanced`, `beginnerSuitability: ~35`, `supportedPlatforms: ["web"]`, `engineCompatibility: ["any"]`, `description`/`bestUseCase` clearly stating "3D web" so the LLM does not pick it for a 2D project.
- **Generalize the engine-selection prompt** (`engineSystemPrompt`) from "choose one of Unity/Unreal/Godot" to "choose one of the retrieved candidate engines."
- **Reindex** (`pnpm --filter @workspace/api-server run rag:index`) — required because Three.js is a new document and the engine flag fields are removed.

### Part 2b — User-specified engine: "use it if it exists, otherwise recommend"

User rule: if the user names a specific engine, check whether it exists in the catalog; if it does, use it; if not, recommend an alternative.

- **Make engine detection catalog-aware.** `detectUserPreferredEngine` builds its patterns from the catalog engine display names (Phaser, Three.js, Construct 3, …) and returns the matched engine **id** (e.g. "Unreal" / "Unreal Engine" → `unreal_engine`), instead of the fixed 3-engine `ENGINE_PATTERNS`.
- If the user names a **catalog** engine → `userPreferred` = that engine id → `agreement: "agreed"` → it is used.
- If the user names a **non-catalog** engine (e.g. CryEngine) or names none → `userPreferred: null` → system recommends the best fit. This "otherwise recommend" behavior needs no extra code: an unrecognized name simply isn't detected.

### Part 3 — Budget-aware AI coding + token/cost data

Schema unchanged; data + reindex only.

- **Add two tools** the user requested:
  - **ChatGPT Codex** — `pricing: freemium` (Free tier + Go $8 / Plus $20), `toolNature: ai`.
  - **Gemini CLI / Code Assist** — `pricing: freemium` (generous free tier: ~60 req/min, ~1,000 req/day).
- **Set realistic pricing + add token/cost notes** to pros/cons for the four target tools (from June 2026 research):

  | Tool | pricing | Added note |
  |------|---------|------------|
  | Claude Code | `subscription` | con: token-heavy agent use is expensive; Max plan $100–200/mo |
  | Cursor | `freemium` | pro: flat $20/mo + included credit pool; predictable cost |
  | ChatGPT Codex | `freemium` | pro: free tier + $8 Go plan; affordable entry |
  | Gemini | `freemium` | pro: generous free tier (~1,000 req/day); ideal for low budget |

- **Budget filtering already works.** `budgetFit` + `BUDGET_ALLOWED` give `free`/`open_source`/`freemium` tools full score at low budget and drop `subscription` tools to 0.2. No scoring code changes.

## Out of Scope (YAGNI)

- No new `costModel` schema field — pros/cons text + correct `pricing` enum meets the goal.
- No full per-engine compatibility model for all 11 engines — the flag filter is removed, not expanded.
- No changes to the `agreement` three-state model beyond making detection catalog-aware.

## Affected Files

- `artifacts/api-server/src/types/catalog.ts` — `ENGINES` derived from catalog.
- `artifacts/api-server/src/agent/steps/feasibility.ts` — drop `targetCategories` from output; orchestrator assigns all five `NON_ENGINE_CATEGORIES`.
- `artifacts/api-server/src/agent/prompts/advisorPrompts.ts` — feasibility (remove category-selection instructions), `FeasibilitySchema` (drop `targetCategories`), `buildCategorySchema` (drop `answerPossible`), category prompt (engine-specific guard, always-pick), engine (generalize).
- `artifacts/api-server/src/agent/steps/recommendCategory.ts` — always return a `primary` (no null path).
- `artifacts/api-server/src/agent/steps/pickEngineRag.ts` — catalog-aware engine detection.
- `artifacts/api-server/src/lib/rag/retriever.ts` — remove engine flag filter.
- `artifacts/api-server/src/orchestrators/advisorOrchestrator.ts` — fan out over all five categories; delete the silent-drop branch.
- `artifacts/api-server/src/data/toolCatalog.json` — add Three.js, Codex, Gemini; update 4 AI-coding tools.
- RAG index — rebuild after catalog edits.

## Testing

- Unit: catalog-derived `ENGINES`; catalog-aware `detectUserPreferredEngine` (catalog engine → detected; non-catalog → null); orchestrator always fans out over all five `NON_ENGINE_CATEGORIES` and produces five recommendations; `recommendCategory` always returns a `primary`; retriever no longer filters by engine flag.
- Catalog validation: `ToolCatalogSchema` passes with the 3 new/edited entries at boot.
- Integration: a "2D web RPG" run surfaces Engine (Phaser-eligible) plus all five categories — Art, VFX, Animation, Audio, AI Coding (exactly five recommendations, none dropped); a low-budget run favors freemium AI coding tools.
- Reindex + `rag:eval` to confirm retrieval quality holds.

## Sources (AI coding pricing, June 2026)

- [Claude Code Pricing 2026 — finout.io](https://www.finout.io/blog/claude-code-pricing-2026)
- [OpenAI Codex Pricing 2026 — eesel.ai](https://www.eesel.ai/blog/codex-pricing)
- [Cursor Pricing 2026 — eesel.ai](https://www.eesel.ai/blog/cursor-pricing)
- [Gemini CLI Quotas and Pricing — google-gemini.github.io](https://google-gemini.github.io/gemini-cli/docs/quota-and-pricing.html)
- [Three.js LICENSE (MIT) — github.com/mrdoob/three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE)
