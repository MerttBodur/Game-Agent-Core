# Intelligent Advisor — Design Spec

**Date:** 2026-05-06
**Hackathon deadline:** 2026-05-09 (3 days)
**Status:** Approved by user, ready for implementation plan
**Supersedes:** parts of `2026-05-04-mvp-roadmap-design.md` Step 6 ("UX polish"); other steps (rate limit, deploy, demo video) remain valid

---

## 1. Goals

Make the advisor stop recommending obviously wrong tools and start recommending **differentiated** stacks tied to the actual project context. Six concrete improvements:

1. **Hard compatibility constraints** — Unity → C# only (not C++); UE → C++/Blueprint; single-player project → no networking/backend categories shown at all.
2. **Locked vs Flexible UI** — surface the cascade explicitly. User attention focuses on flexible categories; locked categories are short, deterministic, and explained.
3. **Archetype-differentiated scoring** — same tool gets different scores per project. AAA 3D realistic → UE5 ≫ Unity ≫ Godot. Indie 2D jam → Godot ≫ Unity ≫ UE5. Not the current "all engines cluster at 80".
4. **Granular scores** — break the multiples-of-5 clustering. Decimals like 82.4 / 76.9 / 31.2.
5. **Real industry-data signal** — popularity-by-archetype derived from a curated games dataset (PCGamingWiki / SteamDB / Wikipedia snapshot). Used both in scoring and in narrative grounding.
6. **Paid-priority category chips** — user picks which categories they're willing to spend on; advisor adapts paid vs free tool selection accordingly.

Plus one more, added late:

7. **Idea Score (feasibility check)** — pre-flight score 0-100. Pass / Warn / Block tiers. Block hides recommendations and shows a Reality Check panel with industry baselines and an "Advise Anyway" override.

## 2. Non-Goals

- Live API integration (Steam Web API, IGDB, etc.) — static curated dataset only.
- Per-tool USD pricing field and dollar-amount budget slider — paid-priority category chips replace this.
- Genre + fidelity sub-axes of archetype editing — only `scope` is editable in v1.
- Re-running the API call when user edits archetype/mode badges — client-side recompute only.

## 3. End-to-End Flow

```
[Form submit]
   │
   ▼
[LLM call #1 — extended metadata]
   prompt: project input + games-dataset summary + scope baselines
   returns: impliedArchetype, achievableArchetype, ideaScoreLLM,
            mismatchReasons[], projectMode, projectSummary, ...
   │
   ▼
[Heuristic cross-check]
   ideaScoreHeuristic = 100 + sum(deductions for scope/budget/team/time mismatches)
   ideaScore = 0.6 * heuristic + 0.4 * LLM
   tier = ideaScore < 30 ? "block" : ideaScore < 60 ? "warn" : "pass"
   │
   ▼
[Block tier? Early return]
   if tier === "block" and !req.body.adviseAnyway:
       return { ideaScore, ideaScoreTier: "block", mismatchReasons,
                archetype, projectMode, categoryResults: null,
                finalSummary: null }
   │
   ▼
[Engine category scoring] → top engine pick
   │
   ▼
[Hard filter cascade]
   - Engine ecosystem narrows locked categories
   - projectMode hides networking/backend_services if applicable
   │
   ▼
[Flexible category scoring]
   archetype-weighted base + popularity signal + paidPriority signal
   + tool-specific archetypeBias + deterministic jitter
   │
   ▼
[RAG retrieval — existing flow, dataset chunks now indexed]
   │
   ▼
[LLM call #2 — final summary, existing flow]
   prompt now includes ideaScore, tier, mismatchReasons, locked vs flexible split
   │
   ▼
[Response]
   { categoryResults: { locked, flexible, hidden },
     ideaScore, ideaScoreTier, mismatchReasons,
     archetype: { implied, achievable, editable: true },
     projectMode: { value, editable: true },
     ragChunks, finalSummary }
```

## 4. Data Model

### 4.1 Tool catalog (`artifacts/api-server/src/lib/gameDevTools.ts`)

Add three fields to `GameDevTool`:

```ts
ecosystem: string[]
  // values: "unity" | "unreal" | "godot" | "gamemaker" | "phaser" | "cocos"
  //       | "defold" | "love" | "web" | "engine_agnostic"
  // a tool may belong to multiple ecosystems (e.g. FMOD: ["unity","unreal","engine_agnostic"])
  // "engine_agnostic" bypasses the cascade filter entirely
  // missing or empty array = treated as engine_agnostic (lenient default)

isLockedByEngine: boolean
  // shorthand: true for tools in programming/ui/vfx/build_ci/networking-engine-side
  // controls whether the tool appears in the Locked vs Flexible UI section

popularityByArchetype: {
  jam: number,        // 0–1
  prototype: number,  // 0–1
  indie: number,      // 0–1
  AA: number,         // 0–1
  AAA: number,        // 0–1
} | null
  // dataset-derived ratios (see §4.3); null = neutral (no signal)
  // only meaningful for engine + programming categories in v1
  // other categories: null is fine, scoring skips this term

archetypeBias: {
  jam: number,        // -3..+3
  indie: number,
  AA: number,
  AAA: number,
} | null
  // hand-tuned override for cases where dataset is thin
  // example: GameMaker { jam: +1.5, indie: +1, AA: -1, AAA: -3 }
  // null = no bias
```

`pricing` enum unchanged (`free | freemium | paid | subscription | open_source`). No `priceUSD` field — paid-priority chips do the work.

### 4.2 Form input (`ProjectInput`)

Add one optional field:

```ts
paidPriorityCategories?: string[]
  // e.g. ["ai_tooling", "art", "audio"]
  // empty array or undefined = "keep everything free if possible"
  // values must be valid category ids from TOOL_CATEGORIES
```

Add one optional flag for the override path:

```ts
adviseAnyway?: boolean
  // set when user clicks "Advise Anyway" on the Block panel
  // re-submits the same form; backend skips early-return and runs full pipeline
  // session record stores `feasibilityOverridden: true`
```

### 4.3 Static games dataset (`artifacts/api-server/src/lib/games-dataset/games.json`)

New file. ~150–200 entries. Schema:

```json
[
  {
    "name": "Cyberpunk 2077",
    "engine": "REDengine 4",
    "engineFamily": "proprietary",
    "year": 2020,
    "scope": "AAA",
    "platforms": ["pc", "console"],
    "team_size_estimate": 500,
    "budget_usd_estimate": 174000000,
    "dev_years": 8,
    "source": "PCGamingWiki + Wikipedia"
  }
]
```

Build script: `artifacts/api-server/src/scripts/buildPopularityFromDataset.ts`. On run:

1. Computes `popularityByArchetype` ratios per engine and per programming-language family. Example: of the 47 AAA entries, 27 use Unreal Engine → `unreal.popularityByArchetype.AAA = 27/47 ≈ 0.57`. Writes the values back into `gameDevTools.ts` (or to a sibling JSON file imported at runtime — implementation choice for the plan stage).
2. Generates RAG chunks (one per game) and writes them to a seedable file consumed by the existing `rag:seed` script. Chunk text format: `"<name> (<year>, <scope>): <engine>, ~<team> people, ~$<budget>M, <years> years. Source: <source>."`

Sources for hand-curation:
- Wikipedia "List of Unreal Engine games" / "List of Unity games" / "List of Godot games"
- PCGamingWiki "Engine" tag pages
- SteamDB top sellers (last 5 years) — engine inferred via PCGamingWiki cross-reference
- GDC State of the Game Industry surveys (aggregate, not per-game)

Realistic collection time: ~4 hours manual entry. **Run in parallel with backend coding.**

### 4.4 OpenAPI spec (`lib/api-spec/openapi.yaml`)

```yaml
ToolRecommendation:
  + isLocked: boolean
  + ecosystemReason: string | null     # "Unity ecosystem requires C#, not C++"

CategoryResults:
  + locked: array[CategoryRecommendation]      # programming, ui, vfx, build_ci, networking-engine-side
  + flexible: array[CategoryRecommendation]    # art, audio, deployment, ai_tooling, ...
  + hidden: array[string]                      # ["networking", "backend_services"] in single_player mode

AnalysisResult:
  + ideaScore: number                          # 0-100, may be decimal
  + ideaScoreTier: enum [pass, warn, block]
  + mismatchReasons: array[string]             # human-readable, e.g. "$5K budget vs typical $50M+ for AAA"
  + archetype:
      implied: { scope, fidelity, genre }
      achievable: { scope, fidelity, genre }
      editableScope: boolean                   # true in v1
  + projectMode:
      value: enum [single_player, co_op_local, multiplayer_online, live_service]
      editable: boolean                        # true
  + feasibilityOverridden: boolean             # set when adviseAnyway=true was used
```

OpenAPI change is the first step of any implementation that touches API shape — `pnpm --filter @workspace/api-spec run codegen` regenerates `lib/api-zod` and `lib/api-client-react`.

### 4.5 Database

`sessions` table's `analysisResult` is a JSON column. New fields land automatically. No migration needed.

## 5. Scoring Pipeline

Three layers, applied in order: hard filter → archetype-weighted soft scoring → granularity injection.

### 5.1 Hard filter

```ts
function applyHardFilter(toolsByCategory, ctx): {
  kept: Record<category, Tool[]>,
  hidden: category[],
} {
  // Project mode hides categories
  const hidden: category[] = []
  if (ctx.projectMode === "single_player") hidden.push("networking", "backend_services")
  else if (ctx.projectMode === "co_op_local") hidden.push("backend_services")

  // Engine ecosystem cascade for locked categories
  const ecosystem = ctx.topEnginePick.ecosystem.find(e => e !== "engine_agnostic")
  const LOCKED_CATEGORIES = ["programming", "ui", "vfx", "build_ci"]
  for (const cat of LOCKED_CATEGORIES) {
    toolsByCategory[cat] = toolsByCategory[cat].filter(t =>
      t.ecosystem.includes(ecosystem) || t.ecosystem.includes("engine_agnostic")
    )
  }
  // networking is split: engine-side libs (Mirror, Netcode for GameObjects) follow ecosystem;
  // service-tier libs (Photon, Nakama) stay flexible. Modeled via per-tool ecosystem field.

  return { kept: toolsByCategory, hidden }
}
```

### 5.2 Archetype-weighted soft scoring

Replaces current `scoreTool`. Weights table:

```ts
const WEIGHTS_BY_ARCHETYPE: Record<scope, Record<axis, number>> = {
  jam:        { budget: 0.6, skill: 1.2, platform: 0.8, time: 1.5, art: 1.0 },
  prototype:  { budget: 0.7, skill: 1.1, platform: 0.9, time: 1.3, art: 1.0 },
  indie:      { budget: 1.0, skill: 1.0, platform: 1.0, time: 1.0, art: 1.0 },  // baseline
  AA:         { budget: 0.9, skill: 0.9, platform: 1.1, time: 0.8, art: 1.1 },
  AAA:        { budget: 0.7, skill: 0.7, platform: 1.3, time: 0.6, art: 1.3 },
  live_service: { budget: 0.9, skill: 0.9, platform: 1.2, time: 0.7, art: 1.0 },
}
```

```ts
function scoreTool(tool, ctx): number {
  const w = WEIGHTS_BY_ARCHETYPE[ctx.achievableArchetype.scope]
  let s = 50
  s += budgetDelta(tool, ctx)   * w.budget
  s += skillDelta(tool, ctx)    * w.skill
  s += platformDelta(tool, ctx) * w.platform
  s += timeDelta(tool, ctx)     * w.time
  s += artDelta(tool, ctx)      * w.art

  // Popularity-by-archetype signal (engine + programming categories mostly)
  if (tool.popularityByArchetype) {
    const popularity = tool.popularityByArchetype[ctx.achievableArchetype.scope] ?? 0.5
    s += (popularity - 0.5) * 25   // -12.5 to +12.5
  }

  // Paid-priority signal
  const isPaid = ["paid", "subscription", "freemium"].includes(tool.pricing)
  const flagged = ctx.input.paidPriorityCategories?.includes(tool.category) ?? false
  if (isPaid && flagged)        s += 8
  else if (isPaid && !flagged)  s -= 6
  else if (!isPaid && !flagged) s += 4
  // !isPaid && flagged → 0; user paid but tool is free anyway, neutral

  // Tool-specific archetype bias
  if (tool.archetypeBias) {
    s += tool.archetypeBias[ctx.achievableArchetype.scope] ?? 0
  }

  return s
}
```

### 5.3 Granularity injection

```ts
function injectJitter(score: number, toolName: string, projectIdSeed: string): number {
  const hashInput = `${toolName}::${projectIdSeed}`
  const hash = simpleHash(hashInput) // any deterministic hash, e.g. djb2
  const jitter = (hash % 1000) / 1000 - 0.5   // -0.5 to +0.5
  return Math.max(0, Math.min(100, score + jitter))
}
```

Result is stored as a float. **Do not round.** Frontend renders `score.toFixed(1)`.

### 5.4 Idea Score blend

```ts
function heuristicIdeaScore(ctx): number {
  let s = 100
  const implied = ctx.impliedArchetype.scope
  const ach = ctx.achievableArchetype.scope
  const order = ["jam", "prototype", "indie", "AA", "AAA"]
  const gap = order.indexOf(implied) - order.indexOf(ach)
  if (gap >= 3) s -= 50            // e.g. AAA implied vs jam achievable
  else if (gap === 2) s -= 30
  else if (gap === 1) s -= 15

  // Per-axis sanity. ProjectInput.budget and teamSize are enum strings; map to USD/headcount midpoints:
  const budgetUSD: Record<string, number> = { zero: 0, low: 1_000, medium: 25_000, high: 500_000, enterprise: 5_000_000 }
  const teamCount: Record<string, number> = { solo: 1, small: 3, medium: 8, large: 30, studio: 150 }
  const budgetMin: Record<scope, number> = { jam: 0, prototype: 0, indie: 1000, AA: 500_000, AAA: 5_000_000 }
  const teamMin:   Record<scope, number> = { jam: 1, prototype: 1, indie: 1,    AA: 20,      AAA: 100 }
  if ((budgetUSD[ctx.input.budget] ?? 0) < budgetMin[implied])  s -= 20
  if ((teamCount[ctx.input.teamSize] ?? 1) < teamMin[implied])  s -= 20

  return Math.max(0, Math.min(100, s))
}
// Note: exact teamSize enum values are project-defined; the implementation plan must verify
// against the current Zod schema and adjust the keys above accordingly.

const ideaScore = 0.6 * heuristicIdeaScore(ctx) + 0.4 * llmIdeaScore
const tier = ideaScore < 30 ? "block" : ideaScore < 60 ? "warn" : "pass"
```

`mismatchReasons` is the **union** of LLM-generated reasons and heuristic-generated reasons (deduplicated). Heuristic reasons use the static dataset to ground ranges: `"AAA budget typically $50M–$300M, you have $5K (source: PCGamingWiki snapshot, n=47 AAA titles 2018–2024)"`.

## 6. UI / UX

### 6.1 Form (Analyzer page)

One new field, placed between "Art Capability" and "Other Constraints":

```
[ Where are you willing to spend? (optional) ]
  toggle-group multi-select chips:
   AI Tooling | Art | Audio | VFX | Networking | Backend Services | Analytics | Monetization
  helper text: "Pick categories where you're open to paid tools.
                Unchecked categories default to free / open-source picks."
```

Empty state allowed. Default = empty (all free).

### 6.2 Result page — top section, three tier variants

**Pass (60–100)** — small green pill at top:
```
✓ Idea Score: 78.3 / 100 — Realistic
Implied: Indie 2D Platformer ✎    Mode: Single-player ✎
```

**Warn (30–59)** — yellow banner, recommendations open:
```
⚠ Idea Score: 47.1 / 100 — Tight Fit
Concerns:
  • $5K budget vs typical $50K+ for indie 3D
  • Solo developer vs typical 2-5 person team
Recommendations may stretch your resources.   [Why? ▼]
```

**Block (0–29)** — full-width red Reality Check panel, recommendations hidden:
```
✕ Idea Score: 18.4 / 100 — Not Feasible

Your project: AAA action RPG
Your resources: $5K, 5 people, 6 months

Industry baseline (PCGamingWiki snapshot, n=47):
  • AAA budget: $50M – $300M
  • AAA team:   100 – 500 people
  • AAA dev:    3 – 7 years

Examples:
  Cyberpunk 2077  ($174M, 500 ppl, 8 y)
  Hogwarts Legacy ($150M, 300 ppl, 6 y)
  Black Myth Wukong (~$70M, 140 ppl, 6 y)

Suggested adjustments:
  → Scope down to indie 2D RPG
  → Or extend timeline to 4+ years

[ ⚠ Advise Anyway ]   [ Adjust Inputs ]
```

`Advise Anyway` POSTs the same form body with `adviseAnyway: true`. Result renders normally with a persistent red banner at top: *"You proceeded despite feasibility concerns. Recommendations are best-effort but your project may not be deliverable."* Session row gets `feasibilityOverridden: true`; the public session URL surfaces the same banner.

### 6.3 Locked vs Flexible (main result body)

```
═══════════════════════════════════════════════
  🔒 LOCKED — Determined by your engine choice
═══════════════════════════════════════════════
[ Engine: Unity              82.4   ▓▓▓▓▓▓▓░░ ]   ← top pick of engine, has alternatives expandable
[ Programming: C#       — Locked — ]
   tooltip: "Unity ecosystem uses C#. C++, Blueprint,
             GDScript, GML are incompatible."
[ UI: UI Toolkit        — Locked — ]
[ VFX: VFX Graph        — Locked — ]
[ Build CI: Unity Cloud Build  — Locked — ]

═══════════════════════════════════════════════
  ✎ FLEXIBLE — Your call
═══════════════════════════════════════════════
[ Art: Aseprite              91.7   ▓▓▓▓▓▓▓▓▓ ]   ← full card, expandable alternatives + evidence
[ Audio: Audacity            73.2   ▓▓▓▓▓▓░░░ ]
[ AI Tooling: Cursor         86.5   ▓▓▓▓▓▓▓▓░ ]
[ Deployment: itch.io        88.1   ▓▓▓▓▓▓▓▓░ ]
[ Version Control: Git+LFS   84.9   ▓▓▓▓▓▓▓▓░ ]
...
```

Locked cards = compact (no alternatives shown, single tool, ecosystem tooltip). Engine itself stays in the Locked section but keeps alternatives + score breakdown — it's the *cause* of the cascade, so its scoring transparency matters most.

Flexible cards = current shadcn `Card` with score, alternatives toggle, evidence panel.

### 6.4 Editable badges → client-side recompute

`Mode: Single-player ✎` and `Archetype: Indie ✎` (scope only in v1). Click → dropdown:

- Mode: `single_player | co_op_local | multiplayer_online | live_service`
- Archetype scope: `jam | prototype | indie | AA | AAA | live_service`

On change, frontend re-runs **hard filter + scoring + granularity** locally (the full data is already in the response — `categoryResults` has all candidate tools per category). LLM-generated narrative does NOT regenerate; a small disclaimer shows: *"Adjusted client-side. Submit the form again to regenerate the narrative."*

Implementation: scoring math (hard filter, archetype weights, jitter) needs to be reachable from both backend and frontend. The exact factoring — shared workspace package vs duplicated module — is left to the implementation plan; see §9.1.

### 6.5 Granular score display

- Card score: `score.toFixed(1)` → e.g. `82.4`
- Score bar width: `style={{ width: '${score}%' }}` (no rounding)
- Hover tooltip: shows breakdown `"82.4 = 50 + budget +12.0 + skill +8.0 + platform +9.5 + popularity +3.4 - 0.5 jitter"`

## 7. Implementation Phases (3 days)

### Day 1 — 2026-05-06 (today)

- **Backend foundations**
  - Add `ecosystem`, `isLockedByEngine`, `archetypeBias` fields to `GameDevTool` interface + tag existing 27 tools (most → `["engine_agnostic"]`; engine-locked categories tagged precisely).
  - Wire `paidPriorityCategories` into `ProjectInput` and Zod schema.
  - Implement `applyHardFilter` and locked/flexible split in `advisorEngine.ts`.
  - Update OpenAPI spec → run codegen → propagate types.
- **Frontend foundations**
  - Form: paid-priority chip multi-select (shadcn `toggle-group`).
  - Result page: split into Locked / Flexible sections (placeholder styling acceptable).
- **Parallel (manual)**: Start games-dataset spreadsheet — first 50 entries.

### Day 2 — 2026-05-07

- **LLM prompt extension**
  - Extend metadata-call prompt to return `impliedArchetype`, `achievableArchetype`, `ideaScoreLLM`, `mismatchReasons[]`, `projectMode`. Inject scope baselines + dataset summary into prompt.
  - Implement `heuristicIdeaScore` + blend.
  - Tier decision + early-return for Block.
- **Three-tier UI**
  - Reality Check panel component (Block).
  - Warn banner.
  - Pass pill.
  - `Advise Anyway` flow + persistent banner + `feasibilityOverridden` flag.
- **Parallel (manual)**: dataset to ~150 entries.

### Day 3 — 2026-05-08

- **Scoring depth**
  - Archetype-weighted scoring + popularity signal + paid-priority signal + archetypeBias.
  - Granularity jitter injection.
  - Frontend: granular score display, breakdown tooltips.
- **Editable badges**
  - Dropdowns + client-side recompute.
- **Dataset finalization**
  - Run `buildPopularityFromDataset.ts` → write `popularityByArchetype` values into catalog.
  - Re-seed RAG with dataset chunks.
- **Demo polish**
  - 5 canonical scenarios verified end-to-end:
    1. Solo + jam + 2D platformer → Pass, Godot leads.
    2. Indie + 3D RPG + $20K + 6 months → Warn, Unity leads.
    3. AAA + $5K + 5 people → Block, Reality Check shown.
    4. AAA + $200M + 200 people + 5 years → Pass, UE leads.
    5. Mobile casual + freemium + paid AI Tooling flagged → Unity locks C#, Cursor surfaces, Meshy demoted.

### Day 4 morning — 2026-05-09

- Replit deploy + prod RAG seed (carry-over from earlier Step 8).
- 3-min demo video (carry-over from earlier Step 9).
- Rate-limit middleware (Step 7) — slot in if time permits, otherwise skip; not user-visible for demo.

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Dataset collection eats more than 4 hours | Medium | Time-box to 4 hours. If short on time, ship with 80 entries; popularityByArchetype values get a "low-confidence" flag and scoring weight is halved (`(p - 0.5) * 12.5` instead of `* 25`). |
| LLM returns malformed archetype/idea-score JSON | Medium | Heuristic fallback (already 60% of blend). Schema is parsed with try/catch; any parse failure → rely on heuristic alone. |
| Client-side recompute drifts from server logic | Medium | Extract scoring into a single TypeScript module imported by both. If timeline is tight, duplicate the math (~150 LOC) and cover with a snapshot test that compares server vs client output for 10 sample inputs. |
| Hard filter is too aggressive (e.g. legitimate cross-ecosystem tool gets hidden) | Medium | `engine_agnostic` is a wide net by default — tools explicitly tagged otherwise are vetted manually. Add a Cypress-style smoke test: each engine choice must yield ≥1 tool in every locked category. |
| Idea Score Block annoys the user when they actually wanted advice | Low | Threshold is conservative (< 30). "Advise Anyway" is one click. UX copy is non-judgmental. |
| Archetype editing causes confusing partial recomputation | Low | Show a clear disclaimer when narrative is stale. Submit-again button is prominent. |

## 9. Open Questions for the Plan Stage

1. Where does the shared scoring module live? Options: new `lib/advisor-scoring/` workspace package, or co-location in `artifacts/api-server` with a copied client-side mirror. Decide based on bundler config readiness — copied mirror is acceptable for hackathon.
2. Does `buildPopularityFromDataset.ts` write directly into `gameDevTools.ts` (codegen-style) or emit a sibling JSON imported at runtime? Sibling JSON is safer (no source-file rewriting).
3. How are dataset entries with `engine: "proprietary"` (Decima, REDengine 4, Frostbite) handled in popularity ratios? Proposal: bucketed under `engineFamily: "proprietary"` and shown in the Reality Check panel ("AAA: 32% Unreal, 24% Unity, 44% proprietary in-house engines"). Don't recommend "Build your own engine" as a tool — but mention it as context.

## 10. Success Criteria

A demo that, side-by-side on the same form input, shows three different result types within 90 seconds:

1. **Block scenario** — input is unrealistic, Reality Check panel appears with industry baselines and Advise-Anyway override.
2. **Locked + Flexible scenario** — input picks an engine, downstream categories cascade and are visibly split into Locked vs Flexible sections, with one programming-language tooltip explaining the lock.
3. **Differentiated scoring scenario** — same project description run against AAA-framed inputs vs jam-framed inputs produces visibly different engine rankings (UE5 ≫ Godot vs Godot ≫ UE5), with decimal scores and visible popularity-by-archetype evidence in the side panel.

If any of those three is not demoable end-to-end on prod by 2026-05-09, the spec failed.
