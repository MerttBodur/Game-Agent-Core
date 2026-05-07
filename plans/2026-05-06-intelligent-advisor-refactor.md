# Intelligent Advisor — Refactor Plan

**Source spec:** [docs/superpowers/specs/2026-05-06-intelligent-advisor-design.md](../docs/superpowers/specs/2026-05-06-intelligent-advisor-design.md)
**Deadline:** 2026-05-09 (hackathon)
**Mode:** Direct — commit to `main` after each step. Hackathon, single dev.
**Scope:** This plan covers the refactor only. Day-4 deploy + demo video carry over from `2026-05-04-hackathon-mvp.md` (Steps 8 + 9).

---

## Step Map

| # | Day | Step | Depends on | Verify |
|---|-----|------|-----------|--------|
| 1 | 1 | API contract + tool catalog fields | — | `pnpm run typecheck` green; codegen ran |
| 2 | 1 | Hard filter + locked/flexible split (backend) | 1 | curl: Unity pick → `programming.locked = ["C#"]`, no C++ |
| 3 | 1 | Frontend: paid-priority chips + Locked/Flexible sections | 1 | manual: form submits, result page renders both sections |
| 4 | 2 | Heuristic Idea Score + LLM metadata extension | 2 | curl AAA+$5K → `tier:"block"`, recommendations omitted |
| 5 | 2 | Three-tier UI + Advise Anyway | 4 | manual: 3 scenarios render Pass / Warn / Block correctly |
| 6 | 3 | Archetype-weighted scoring + popularity + jitter | 2, 4 | curl same project AAA-framed vs jam-framed → different engine ranks, decimals |
| 7 | 3 | Granular display + editable badges (client recompute) | 6 | manual: edit Mode/Archetype → scores recompute, narrative shows stale disclaimer |
| 8 | 3 | Dataset + popularity activation + RAG re-seed | 6 | 5 canonical scenarios from spec §7 day 3 pass end-to-end |

**Parallelism:**
- Steps 2 + 3 share no files (backend / frontend) — run after Step 1 lands.
- Step 8 dataset entry runs in background across days 1–3 (~4h total manual).
- Step 5 can begin once Step 4's API shape is committed.

---

## Step 1 — API contract + tool catalog fields

**Brief.** Define the new wire format and tool fields. Everything downstream depends on this. OpenAPI is source-of-truth — codegen propagates Zod + React Query types.

**Files to edit:**
- `lib/api-spec/openapi.yaml`
- `artifacts/api-server/src/lib/gameDevTools.ts`

**Tasks:**
- [ ] OpenAPI `AnalysisResult`: add `ideaScore: number`, `ideaScoreTier: enum[pass,warn,block]`, `mismatchReasons: string[]`, `archetype: { implied, achievable }`, `projectMode: enum[single_player,co_op_local,multiplayer_online,live_service]`. Make all of these optional to keep responses valid when block tier early-returns or LLM omits.
- [ ] OpenAPI `CategoryResults`: change to object with `locked: CategoryRecommendation[]`, `flexible: CategoryRecommendation[]`, `hidden: string[]`.
- [ ] OpenAPI `ProjectInput`: add `paidPriorityCategories?: string[]`, `adviseAnyway?: boolean`.
- [ ] `GameDevTool`: add `ecosystem: string[]` and `popularityByArchetype: {jam,prototype,indie,AA,AAA} | null` (set to `null` for now). Add optional `archetypeBias?: {jam,indie,AA,AAA}`.
- [ ] Tag all 27 existing tools with `ecosystem`. Default lenient: most → `["engine_agnostic"]`. Engine-locked tools tagged precisely (e.g. UI Toolkit → `["unity"]`, Blueprint → `["unreal"]`, GDScript → `["godot"]`).
- [ ] Run `pnpm --filter @workspace/api-spec run codegen`.

**Exit:** `pnpm run typecheck` green across all packages.

**Anti-overengineering note.** No `priceUSD` field. No per-tool `isLocked` flag — locked-ness is the constant `LOCKED_CATEGORIES = ["programming", "ui", "vfx", "build_ci"]` defined in Step 2.

---

## Step 2 — Hard filter + locked/flexible split

**Brief.** Replace the flat category map in `advisorEngine.ts` with the three-bucket result. Apply ecosystem cascade after engine pick.

**Files to edit:** `artifacts/api-server/src/lib/advisorEngine.ts`, `artifacts/api-server/src/routes/advisor.ts` (response shape).

**Tasks:**
- [ ] Add `const LOCKED_CATEGORIES = ["programming", "ui", "vfx", "build_ci"] as const;`.
- [ ] Score the `engine` category first. Pick top engine. Read its `ecosystem[0]` (excluding `engine_agnostic`).
- [ ] `applyHardFilter`: filter LOCKED_CATEGORIES to tools where `tool.ecosystem.includes(ecosystem) || tool.ecosystem.includes("engine_agnostic")`. Engine itself stays in locked bucket but keeps alternatives.
- [ ] `projectMode` derivation for v1: read from LLM metadata once Step 4 lands. Until then default to `"single_player"`. Hide `["networking","backend_services"]` for `single_player`, `["backend_services"]` for `co_op_local`.
- [ ] Return `{ locked: [...], flexible: [...], hidden: [...] }`.

**Verify:**
```powershell
curl -X POST http://localhost:3000/api/advisor/analyze -H "Content-Type: application/json" -d '{...projectInput forcing Unity engine...}' | ConvertFrom-Json | Select -ExpandProperty categoryResults
```
Expect: `programming.locked` only contains C#, no C++.

---

## Step 3 — Frontend: paid-priority chips + Locked/Flexible sections

**Brief.** UI matches the new response shape. Placeholder styling is fine — polish in Step 7.

**Files to edit:** `artifacts/game-dev-advisor/src/...` (form component + result page).

**Tasks:**
- [ ] Form: add shadcn `toggle-group` multi-select chips for `paidPriorityCategories`. Categories: `ai_tooling, art, audio, vfx, networking, backend_services, analytics, monetization`. Default empty.
- [ ] Result page: render two sections — `🔒 LOCKED` (compact rows, no alternatives toggle) and `✎ FLEXIBLE` (existing card). Engine card stays in Locked but keeps alternatives.
- [ ] Compact locked-card tooltip: hardcoded ecosystem-tooltip text per engine pick (e.g. Unity → "Unity ecosystem uses C#. C++, Blueprint, GDScript are incompatible."). 5 strings, one per engine — derive at render, not stored on tools.

**Verify:** `pnpm --filter @workspace/game-dev-advisor run dev`, submit form, confirm both sections render.

---

## Step 4 — Heuristic Idea Score + LLM metadata extension

**Brief.** Tier decision is **heuristic-only** (deterministic). LLM provides `mismatchReasons[]` text; merge with heuristic reasons.

**Files to edit:** `artifacts/api-server/src/lib/advisorEngine.ts`, `artifacts/api-server/src/openai-ai-server.ts` (or wherever metadata-call prompt lives).

**Tasks:**
- [ ] Extend metadata LLM prompt to also return `impliedArchetype: {scope}`, `achievableArchetype: {scope}`, `mismatchReasons: string[]`, `projectMode`. Inject scope baselines into the system prompt (numbers from spec §5.4).
- [ ] Implement `heuristicIdeaScore(ctx)` per spec §5.4 — scope-gap penalty + budget/team thresholds. Verify the budget/teamSize enum keys against the current Zod schema before wiring.
- [ ] `tier = score < 30 ? "block" : score < 60 ? "warn" : "pass"`.
- [ ] Early return for `tier === "block"` and `!input.adviseAnyway`: return `{ ideaScore, ideaScoreTier, mismatchReasons, archetype, projectMode, categoryResults: null, finalSummary: null }`. Skip filter / scoring / LLM call #2.
- [ ] Merge LLM `mismatchReasons` with heuristic-derived reasons; dedup by string.
- [ ] If LLM JSON parse fails: derive `achievableArchetype.scope` from form fields (budget+team+time → scope), skip `impliedArchetype` mismatch from LLM.

**Verify:**
```powershell
# AAA implied + $5K budget + solo → expect block
curl -X POST .../analyze -d '{...}' | ConvertFrom-Json | Select ideaScore, ideaScoreTier
```

---

## Step 5 — Three-tier UI + Advise Anyway

**Brief.** Render the tier banners and the Reality Check panel. Persist override in session JSON.

**Files to edit:** result page components, `artifacts/api-server/src/routes/advisor.ts` (session row write). DB write goes into existing `analysisResult` JSON column — no migration.

**Tasks:**
- [ ] Pass pill (green, top of page).
- [ ] Warn banner (yellow, above recommendations).
- [ ] Block panel: full-width red, hides recommendations. Pull industry baselines from a static frontend constant (no extra API field — the dataset summary numbers are stable). Three example games hardcoded for v1; can be wired to the dataset in Step 8 if time.
- [ ] `Advise Anyway` button → re-POST same body with `adviseAnyway: true`. Result renders normally with persistent red banner.
- [ ] On override path, set `feasibilityOverridden: true` in the session row's `analysisResult` JSON.
- [ ] Public session URL surfaces the same banner when `feasibilityOverridden === true`.

**Verify:** Manual browser run of three scenarios from spec §10.

---

## Step 6 — Archetype-weighted scoring + popularity + jitter

**Brief.** Replace `scoreTool` with the weighted version. Engine ranking should differ between AAA and jam framings of the same project.

**Files to edit:** `advisorEngine.ts` only.

**Tasks:**
- [ ] `WEIGHTS_BY_ARCHETYPE` table from spec §5.2.
- [ ] New `scoreTool(tool, ctx)`: base 50 + weighted axis deltas + popularity term `(p - 0.5) * 25` (when `popularityByArchetype` non-null) + paid-priority delta + `archetypeBias`.
- [ ] `injectJitter`: djb2 hash of `${toolName}::${projectIdSeed}`, mod 1000, normalized to `-0.5..+0.5`. Clamp result to `[0, 100]`.
- [ ] **Stop rounding** — score stays float through to response.
- [ ] If dataset thin (<100 entries shipped): halve popularity weight to `(p - 0.5) * 12.5`. One-line guard.

**Verify:** Same project description, two different `scope` values:
```powershell
# AAA framing → expect UE5 > Unity > Godot
# jam framing  → expect Godot > Unity > UE5
```
Decimal scores visible (e.g. `82.4`, not `80`).

---

## Step 7 — Granular display + editable badges

**Brief.** Frontend renders decimals + breakdown. Mode/Archetype dropdowns trigger client-side recompute. Narrative does NOT regenerate; show disclaimer.

**Files to edit:** result page components, new `artifacts/game-dev-advisor/src/lib/scoring.ts`.

**Tasks:**
- [ ] `score.toFixed(1)` for card label. Bar width `${score}%` (no rounding).
- [ ] Hover tooltip with breakdown (`50 + budget +12.0 + skill +8.0 + popularity +3.4 - 0.5 jitter`).
- [ ] Editable badges: Mode + Archetype scope dropdowns next to top section.
- [ ] **Duplicate scoring math** into `artifacts/game-dev-advisor/src/lib/scoring.ts` — copy weights table, scoreTool, jitter, hard filter from backend. ~150 LOC. The backend response carries all candidate tools per category, so client recompute is a pure function of `(response, modeOverride, scopeOverride)`.
- [ ] On dropdown change: re-run filter + scoring locally; update card scores + ranks. Show disclaimer banner: *"Adjusted client-side. Submit the form again to regenerate the narrative."*

**Anti-overengineering note.** No shared workspace package. Yes the math is duplicated — DRY normally wins, but spec §9.1 explicitly authorizes this for hackathon. Accept the drift risk; if it bites, extract later.

---

## Step 8 — Dataset + popularity activation + RAG re-seed

**Brief.** Activate the popularity signal and the Reality Check panel's evidence chunks. Manual data entry has been running in parallel since Day 1.

**Files to add:**
- `artifacts/api-server/src/lib/games-dataset/games.json`
- `artifacts/api-server/src/lib/games-dataset/popularity.json` (sibling JSON, generated)
- `artifacts/api-server/src/scripts/buildPopularityFromDataset.ts`

**Tasks:**
- [ ] Finalize `games.json` (target 150, accept whatever ≥80 by Day 3).
- [ ] `buildPopularityFromDataset.ts`: compute per-engine + per-language ratios across `{jam,prototype,indie,AA,AAA}`. Emit `popularity.json` (sibling, not codegen rewrite of `gameDevTools.ts`).
- [ ] `gameDevTools.ts`: import `popularity.json` and merge values onto tools at module load (lookup by tool id or canonical name). Keeps the source file diff-clean across dataset updates.
- [ ] Generate RAG chunks (one per game), append to seed input, run `pnpm --filter @workspace/api-server run rag:seed`.
- [ ] Walk through the 5 canonical scenarios in spec §7 day 3 manually. Each must demo cleanly.

**Verify:**
1. Solo + jam + 2D platformer → Pass, Godot leads.
2. Indie + 3D RPG + $20K + 6 months → Warn, Unity leads.
3. AAA + $5K + 5 people → Block, Reality Check shown.
4. AAA + $200M + 200 people + 5 years → Pass, UE leads.
5. Mobile casual + freemium + paid AI Tooling flagged → Unity locks C#, Cursor surfaces, Meshy demoted.

---

## Out of scope for this plan

- Replit deploy + prod RAG seed → existing `2026-05-04-hackathon-mvp.md` Step 8 (Day 4).
- 3-min demo video → existing Step 9 (Day 4).
- Rate limit middleware → existing Step 7, slot in if Day 4 has slack.

## Risks (carried from spec §8)

| Risk | Mitigation in this plan |
|------|------|
| Dataset eats >4h | Step 6 halves popularity weight if shipped <100 entries |
| LLM metadata JSON malformed | Step 4 derives `achievableArchetype` from form fields as fallback |
| Client/server scoring drift | Manual smoke check in Step 8 — same input on both should match within ±0.1 |
| Block tier annoys user | Conservative `<30` threshold + one-click Advise Anyway (Step 5) |
