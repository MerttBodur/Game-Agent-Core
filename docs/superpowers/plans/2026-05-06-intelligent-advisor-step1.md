# Intelligent Advisor — Step 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the new wire format (OpenAPI) and tool-catalog fields (`ecosystem`, `popularityByArchetype`, `archetypeBias`) so all downstream refactor steps have stable types to compile against.

**Architecture:** OpenAPI is single source of truth — codegen propagates Zod (`lib/api-zod`) and React Query hooks (`lib/api-client-react`). After this step, downstream callsites in `advisorEngine.ts`, `routes/advisor.ts`, `Analyzer.tsx`, `SessionDetail.tsx` will fail typecheck — this is expected and is fixed in Steps 2–8 of the source plan.

**Tech Stack:** TypeScript, OpenAPI 3.1, Orval codegen, Zod v4, pnpm monorepo.

**Source spec:** [docs/superpowers/specs/2026-05-06-intelligent-advisor-design.md §4](../specs/2026-05-06-intelligent-advisor-design.md)
**Source plan:** [plans/2026-05-06-intelligent-advisor-refactor.md Step 1](../../../plans/2026-05-06-intelligent-advisor-refactor.md)

**Project conventions (read first):**
- No test framework. Verification = `pnpm run typecheck` + visual inspection of codegen output.
- Single commit at the end of this step.
- After OpenAPI changes, `pnpm --filter @workspace/api-spec run codegen` is mandatory before typecheck.
- Imports must use `zod/v4`, never `zod` default.
- All commands run in PowerShell.

**Anti-overengineering boundary:** Only fields the spec explicitly requires. No `priceUSD`. No per-tool `isLocked` flag (locked-ness is a constant defined in Step 2). No backward-compat shim for the old flat `categories` array — replaced cleanly. No new test scaffolding.

---

## File Structure

This step modifies two existing files. No new files.

- `lib/api-spec/openapi.yaml` — add `Archetype` + `CategoryResults` schemas; rewrite `AnalysisResult` shape; extend `ProjectInput`.
- `artifacts/api-server/src/lib/gameDevTools.ts` — add `Ecosystem` + `ArchetypeScope` type unions; add three new fields to `GameDevTool` interface; tag all 27 existing tool entries with `ecosystem` + `popularityByArchetype: null`.

---

## Task 1: API Contract + Tool Catalog Fields

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (add schemas around line 320, rewrite `AnalysisResult` lines 343–374, extend `ProjectInput` lines 192–233)
- Modify: `artifacts/api-server/src/lib/gameDevTools.ts` (replace lines 1–13, then walk every entry in `GAME_DEV_TOOLS`)

- [ ] **Step 1.1: Add `Archetype` and `CategoryResults` schemas to OpenAPI**

Open `lib/api-spec/openapi.yaml`. Locate the `Evidence` schema (around line 308–319). After it, insert:

```yaml
    Archetype:
      type: object
      properties:
        scope:
          type: string
          enum: [jam, prototype, indie, AA, AAA]
      required:
        - scope

    CategoryResults:
      type: object
      properties:
        locked:
          type: array
          items:
            $ref: "#/components/schemas/CategoryRecommendation"
        flexible:
          type: array
          items:
            $ref: "#/components/schemas/CategoryRecommendation"
        hidden:
          type: array
          items:
            type: string
          description: "Category ids hidden by projectMode (e.g. networking, backend_services)"
      required:
        - locked
        - flexible
        - hidden
```

- [ ] **Step 1.2: Rewrite `AnalysisResult` schema**

In `lib/api-spec/openapi.yaml`, replace the entire existing `AnalysisResult` block (currently lines 343–374) with:

```yaml
    AnalysisResult:
      type: object
      properties:
        sessionId:
          type: integer
        projectSummary:
          type: string
        detectedProjectType:
          type: string
        categoryResults:
          oneOf:
            - $ref: "#/components/schemas/CategoryResults"
            - type: "null"
          description: "Null when ideaScoreTier == 'block' and adviseAnyway is false"
        overallConfidence:
          type: number
        finalSummary:
          type: ["string", "null"]
        stackOverview:
          type: ["string", "null"]
        ideaScore:
          type: number
          description: "0-100 feasibility score, may be decimal"
        ideaScoreTier:
          type: string
          enum: [pass, warn, block]
        mismatchReasons:
          type: array
          items:
            type: string
        archetype:
          type: object
          properties:
            implied:
              $ref: "#/components/schemas/Archetype"
            achievable:
              $ref: "#/components/schemas/Archetype"
          required:
            - implied
            - achievable
        projectMode:
          type: string
          enum: [single_player, co_op_local, multiplayer_online, live_service]
        feasibilityOverridden:
          type: boolean
          default: false
      required:
        - sessionId
        - projectSummary
        - detectedProjectType
        - overallConfidence
        - ideaScore
        - ideaScoreTier
        - mismatchReasons
        - archetype
        - projectMode
        - feasibilityOverridden
```

Note: the old `categories: array<CategoryRecommendation>` is gone — replaced by `categoryResults`. `finalSummary` and `stackOverview` are now nullable to support the block-tier early-return added in Step 4.

- [ ] **Step 1.3: Extend `ProjectInput` with `paidPriorityCategories` and `adviseAnyway`**

In `lib/api-spec/openapi.yaml`, locate the `ProjectInput` schema (lines 192–233). Inside its `properties:` block, after the existing `otherConstraints:` field and **before** the `required:` list, insert:

```yaml
        paidPriorityCategories:
          type: array
          items:
            type: string
          description: "Category ids where user accepts paid tools. Empty = prefer free."
        adviseAnyway:
          type: boolean
          description: "Set true to bypass block-tier early-return"
```

Do NOT add either field to `required` — both are optional.

- [ ] **Step 1.4: Run codegen**

```powershell
pnpm --filter @workspace/api-spec run codegen
```

Expected: codegen exits 0. Two packages were regenerated: `lib/api-zod` (new Zod schemas) and `lib/api-client-react` (new TS types + React Query hooks).

Verify the new types appear in the codegen output:

```powershell
Select-String -Path lib/api-client-react/src -Pattern "categoryResults|ideaScore|adviseAnyway|paidPriorityCategories" -SimpleMatch | Select-Object -First 10
```

Expected: at least one match for each of the four strings. If any are missing, the OpenAPI edits in Steps 1.1–1.3 didn't land — re-check syntax.

- [ ] **Step 1.5: Run typecheck — observe expected callsite errors**

```powershell
pnpm run typecheck
```

Expected: typecheck FAILS. The errors should be confined to four files referencing the now-removed flat `categories` field or the missing tool fields:
- `artifacts/api-server/src/lib/advisorEngine.ts`
- `artifacts/api-server/src/routes/advisor.ts`
- `artifacts/game-dev-advisor/src/pages/Analyzer.tsx`
- `artifacts/game-dev-advisor/src/pages/SessionDetail.tsx`

Note the error count for sanity. Errors in any other file mean a malformed OpenAPI edit — re-check Steps 1.1–1.3.

These errors are **not fixed in this step** — they're addressed in Tasks 2–5 of the source plan.

- [ ] **Step 1.6: Add `Ecosystem` + `ArchetypeScope` type unions and extend `GameDevTool`**

In `artifacts/api-server/src/lib/gameDevTools.ts`, replace lines 1–13 (the entire current `GameDevTool` interface block) with:

```ts
export type Ecosystem =
  | "unity"
  | "unreal"
  | "godot"
  | "gamemaker"
  | "phaser"
  | "cocos"
  | "defold"
  | "love"
  | "construct"
  | "bevy"
  | "web"
  | "engine_agnostic";

export type ArchetypeScope = "jam" | "prototype" | "indie" | "AA" | "AAA";

export interface GameDevTool {
  name: string;
  category: string;
  description: string;
  website: string;
  pricing: "free" | "freemium" | "paid" | "subscription" | "open_source";
  minSkillLevel: "beginner" | "intermediate" | "advanced" | "expert";
  platforms: string[];
  strengths: string[];
  weaknesses: string[];
  bestFor: string[];
  tags: string[];
  ecosystem: Ecosystem[];
  popularityByArchetype: Record<ArchetypeScope, number> | null;
  archetypeBias?: Partial<Record<ArchetypeScope, number>>;
}
```

- [ ] **Step 1.7: Tag the 10 engine entries with `ecosystem` + `popularityByArchetype: null`**

Inside the `GAME_DEV_TOOLS` array in `artifacts/api-server/src/lib/gameDevTools.ts`, find each engine entry and append the two new fields. Apply this exact mapping (engine name → ecosystem array):

| Tool name           | `ecosystem`         |
|---------------------|---------------------|
| `Unity`             | `["unity"]`         |
| `Unreal Engine`     | `["unreal"]`        |
| `Godot`             | `["godot"]`         |
| `GameMaker`         | `["gamemaker"]`     |
| `Phaser`            | `["phaser"]`        |
| `Cocos Creator`     | `["cocos"]`         |
| `Defold`            | `["defold"]`        |
| `LOVE`              | `["love"]`          |
| `Construct 3`       | `["construct"]`     |
| `Bevy`              | `["bevy"]`          |

For each engine, add the two new fields just before the closing `},`. Example for Unity:

```ts
  {
    name: "Unity",
    category: "engine",
    // ... existing fields unchanged ...
    tags: ["2d", "3d", "mobile", "vr", "ar", "beginner-friendly", "c#"],
    ecosystem: ["unity"],
    popularityByArchetype: null,
  },
```

- [ ] **Step 1.8: Tag programming-language entries**

Apply this mapping to every entry in `GAME_DEV_TOOLS` whose `category === "programming"`:

| Tool name (or contains) | `ecosystem` |
|-------------------------|-------------|
| `C# with .NET` (Unity-side C#) | `["unity"]` |
| `C++` | `["unreal", "engine_agnostic"]` |
| `Blueprint` (Unreal visual scripting) | `["unreal"]` |
| `GDScript` | `["godot"]` |
| `GML` (GameMaker Language) | `["gamemaker"]` |
| `Lua` | `["love", "defold", "engine_agnostic"]` |
| `JavaScript` or `TypeScript` (when present as a programming tool) | `["phaser", "cocos", "web", "engine_agnostic"]` |
| `Rust` | `["bevy", "engine_agnostic"]` |
| Anything else (Python, Haxe, etc.) | `["engine_agnostic"]` |

Example:
```ts
  {
    name: "C# with .NET",
    category: "programming",
    // ... existing fields unchanged ...
    ecosystem: ["unity"],
    popularityByArchetype: null,
  },
```

If the catalog only has one or two programming entries, that's fine — apply the mapping to whichever ones exist.

- [ ] **Step 1.9: Tag UI / VFX / Build-CI entries**

Apply this mapping to entries whose `category` is `ui`, `vfx`, or `build_ci`:

| Tool name (or contains) | Category | `ecosystem` |
|-------------------------|----------|-------------|
| `UI Toolkit` (Unity-side) | `ui` | `["unity"]` |
| `UMG` (Unreal Motion Graphics) | `ui` | `["unreal"]` |
| `Niagara` | `vfx` | `["unreal"]` |
| `VFX Graph` (Unity-side) | `vfx` | `["unity"]` |
| `Unity Cloud Build` | `build_ci` | `["unity"]` |
| Anything else (Rive, NoesisGUI, Houdini, EmberGen, generic CI like GitHub Actions) | any | `["engine_agnostic"]` |

Example for UI Toolkit:
```ts
  {
    name: "UI Toolkit",
    category: "ui",
    // ... existing fields unchanged ...
    ecosystem: ["unity"],
    popularityByArchetype: null,
  },
```

- [ ] **Step 1.10: Tag engine-side networking entries**

Networking has two flavors per spec §5.1:

| Tool name (or contains) | `ecosystem` |
|-------------------------|-------------|
| `Mirror` (Unity netcode) | `["unity"]` |
| `Netcode for GameObjects` | `["unity"]` |
| Unreal Replication / Iris (engine-side networking for Unreal) | `["unreal"]` |
| `Photon`, `Nakama`, `PlayFab`, `Pragma` (service-tier, engine-agnostic) | `["engine_agnostic"]` |

The split is what lets the hard filter cascade hide engine-side libs that don't match the picked engine while keeping service-tier providers available.

- [ ] **Step 1.11: Tag everything else with `["engine_agnostic"]`**

For every remaining entry in `GAME_DEV_TOOLS` not yet tagged (categories: `art`, `audio`, `animation`, `version_control`, `deployment`, `ai_tooling`, `backend_services`, `analytics`, `monetization`, `narrative`, plus any leftover misc), append:

```ts
    ecosystem: ["engine_agnostic"],
    popularityByArchetype: null,
```

Quick sweep to confirm no entry was missed — search for entries lacking the new fields:

```powershell
Select-String -Path artifacts/api-server/src/lib/gameDevTools.ts -Pattern "ecosystem:" -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count
```

Expected: count equals the total number of entries in `GAME_DEV_TOOLS` (27 if no other tasks have added tools; check current count with `Select-String -Path artifacts/api-server/src/lib/gameDevTools.ts -Pattern "name:" -SimpleMatch | Measure-Object`).

- [ ] **Step 1.12: Run typecheck**

```powershell
pnpm run typecheck
```

Expected: same callsite errors as Step 1.5 (in `advisorEngine.ts`, `routes/advisor.ts`, `Analyzer.tsx`, `SessionDetail.tsx`). **No new errors** introduced by the catalog edits.

If typecheck reports new errors inside `gameDevTools.ts` itself — e.g. "Property 'ecosystem' is missing" — an entry was missed. Re-run the sweep from Step 1.11 to find it.

- [ ] **Step 1.13: Commit**

```powershell
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/lib/gameDevTools.ts
git commit -m "feat: add api contract + tool catalog fields for advisor refactor"
```

Verify commit landed:
```powershell
git log -1 --stat
```

Expected: four files touched (the openapi.yaml + the two regenerated lib packages + gameDevTools.ts).

---

## Self-Review Checklist

**1. Spec coverage** — Step 1 of the source plan and spec §4 ("Data Model") map cleanly:
- §4.1 `ecosystem` field → Step 1.6 (interface) + Steps 1.7–1.11 (data)
- §4.1 `popularityByArchetype` field → Step 1.6 (interface) + Steps 1.7–1.11 (set to `null`; populated in Task 8)
- §4.1 optional `archetypeBias` → Step 1.6 (interface only; values added in Task 8 if needed)
- §4.2 `paidPriorityCategories` → Step 1.3 (OpenAPI)
- §4.2 `adviseAnyway` → Step 1.3 (OpenAPI)
- §4.4 `CategoryResults` schema → Step 1.1
- §4.4 `Archetype` shape → Step 1.1
- §4.4 `AnalysisResult` extension (idea-score, archetype, projectMode, feasibilityOverridden) → Step 1.2

**2. Placeholder scan** — No "TBD", "implement later", "handle edge cases". Every step has a runnable command or concrete code block.

**3. Type consistency**
- `ArchetypeScope` enum `jam | prototype | indie | AA | AAA` is identical between OpenAPI (Step 1.1 `Archetype`) and the TS type union (Step 1.6).
- `Ecosystem` enum is TS-side only; OpenAPI doesn't constrain it (deliberate — lets us add new ecosystems without an OpenAPI bump).
- `popularityByArchetype` is `Record<ArchetypeScope, number> | null`: matches the spec's "null = neutral" convention and lets Task 8's loader assign a populated record.
- `paidPriorityCategories` is `string[]` (not enum) — categories are dynamic; Zod runtime check happens at the route level in Task 4 if needed.

**4. Anti-overengineering check**
- No `priceUSD` field added (spec excludes).
- No per-tool `isLocked` flag added (spec §4.1 explicitly says lockedness is determined by the constant).
- No backward-compat shim for the removed `categories` field — clean replacement.
- No test scaffolding — project has no test framework; relying on typecheck + later curl smoke is the project's actual posture.
- No new workspace package for shared types — codegen already handles cross-package types.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-intelligent-advisor-step1.md`.

**Two execution options:**

1. **Subagent-Driven** — Dispatch a fresh subagent for this 13-step task. Best when you want a clean handoff and final review before commit.

2. **Inline Execution** — Execute steps in this session using executing-plans. Faster for a single self-contained task.

**Which approach?**
