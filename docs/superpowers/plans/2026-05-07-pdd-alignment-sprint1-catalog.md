# PDD Alignment — Sprint 1: Section 2 Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `gameDevTools.ts`'s 16-category, freeform tool list with a §2-compliant static `toolCatalog.json` covering exactly the 7 PDD MVP categories, validated by a Zod schema, while keeping the legacy advisor pipeline bootable.

**Architecture:** A new `data/toolCatalog.json` becomes the single source of truth. `gameDevTools.ts` is rewritten as a thin loader that reads, validates (Zod), and re-exports the catalog. The legacy `pgvector` retrieval, `advisorEngine`, and `routes/advisor.ts` keep compiling against an adapter that maps the new entries to the old field names — that adapter is deleted in Sprints 3–5. OpenAPI `Tool` schema is updated to §2 fields; clients are regenerated.

**Tech Stack:** TypeScript, Zod v4, pnpm monorepo, Orval codegen, OpenAPI 3.1.

**Source spec:** [docs/superpowers/specs/2026-05-07-pdd-sections-2-3-4-5-alignment-design.md §4.1](../specs/2026-05-07-pdd-sections-2-3-4-5-alignment-design.md)

**Project conventions (read first):**
- No test framework. Verification = `pnpm run typecheck` + manually reading codegen output.
- Imports must use `zod/v4`, never `zod` default.
- All commands run in PowerShell.
- Single PR for the whole sprint, several commits inside.
- After OpenAPI changes, `pnpm --filter @workspace/api-spec run codegen` is mandatory before typecheck.

**Anti-overengineering boundary:**
- No new abstractions for "future tool sources" — JSON file is the only source.
- No interface/factory for the loader; one concrete function.
- No runtime feature flags toggling old vs new catalog.
- Keep the legacy adapter (Task 3) absolutely minimal: one mapping function, one shape, deleted in Sprint 3.
- Do not rebuild OpenAPI schemas that are unaffected (e.g. `AnalysisResult`, `ProjectInput` — those move in Sprint 4).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `artifacts/api-server/src/types/pdd.ts` | Create | Canonical PDD enums + `ToolEntry` interface + Zod schema |
| `artifacts/api-server/src/data/toolCatalog.json` | Create | Static §2 catalog (7 categories, full §2 fields per entry) |
| `artifacts/api-server/src/lib/gameDevTools.ts` | Rewrite | Loader: read JSON, validate via Zod, expose `TOOL_CATALOG` (new shape) + `TOOL_CATEGORIES` + legacy `GAME_DEV_TOOLS` adapter |
| `lib/api-spec/openapi.yaml` | Modify | `Tool` schema → §2 fields; `Pricing` enum gains `revenue_share`, `enterprise`; `ToolCategory.id` enum tightens to 7 PDD ids |
| `lib/api-client-react/**` | Regenerate | Run codegen |
| `lib/api-zod/**` | Regenerate | Run codegen |

The legacy `lib/db/src/schema/tools.ts` and the `tools` Postgres table are untouched in Sprint 1 (deleted in Sprint 2). `routes/tools.ts` switches to the in-memory catalog in Sprint 1.

---

## Task 1: Define PDD Type Surface

**Files:**
- Create: `artifacts/api-server/src/types/pdd.ts`

- [ ] **Step 1.1: Create the file**

```ts
import { z } from "zod/v4";

export const PDD_CATEGORIES = [
  "game_engine",
  "ide",
  "version_control",
  "art_asset_creation",
  "audio",
  "ai_coding_assistant",
  "deployment_publishing",
] as const;
export type PddCategory = (typeof PDD_CATEGORIES)[number];

export const PHASES = [
  "planning",
  "programming",
  "version_control",
  "art_assets",
  "audio",
  "deployment_publishing",
] as const;
export type Phase = (typeof PHASES)[number];

export const PRICING = [
  "free",
  "open_source",
  "freemium",
  "paid",
  "subscription",
  "revenue_share",
  "enterprise",
] as const;
export type Pricing = (typeof PRICING)[number];

export const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const FIT_2D3D = ["2d", "3d", "both"] as const;
export type Fit2D3D = (typeof FIT_2D3D)[number];

export const TEAM_SIZES = ["solo", "small", "medium", "large"] as const;
export type TeamSizeFit = (typeof TEAM_SIZES)[number];

export const PLATFORMS = ["pc", "mobile", "web", "console", "vr", "ar"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const GENRES = [
  "action", "adventure", "rpg", "strategy", "simulation",
  "puzzle", "platformer", "shooter", "racing", "sports",
  "horror", "narrative", "casual", "arcade",
] as const;
export type Genre = (typeof GENRES)[number];

export const ToolEntrySchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/, "id must be lowercase snake_case"),
  name: z.string().min(1),
  category: z.enum(PDD_CATEGORIES),
  subcategory: z.string().optional(),
  description: z.string().min(1),
  bestUseCase: z.string().min(1),
  supportedPlatforms: z.array(z.enum(PLATFORMS)).min(1),
  pricing: z.enum(PRICING),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS),
  beginnerSuitability: z.number().int().min(0).max(100),
  teamSizeFit: z.array(z.enum(TEAM_SIZES)).min(1),
  genreFit: z.array(z.enum(GENRES)).min(1),
  fit2d3d: z.enum(FIT_2D3D),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  alternatives: z.array(z.string().min(1)).min(1),
  phase: z.array(z.enum(PHASES)).min(1),
  website: z.string().url().optional(),
});
export type ToolEntry = z.infer<typeof ToolEntrySchema>;

export const ToolCatalogSchema = z.array(ToolEntrySchema);
export type ToolCatalog = z.infer<typeof ToolCatalogSchema>;

export const PDD_CATEGORY_LABELS: Record<PddCategory, { label: string; description: string }> = {
  game_engine: { label: "Game Engine", description: "Core engines for 2D/3D production." },
  ide: { label: "IDE", description: "Code editors and integrated development environments." },
  version_control: { label: "Version Control", description: "Source control and code collaboration." },
  art_asset_creation: { label: "Art & Asset Creation", description: "2D art, 3D modelling, animation, UI, and VFX." },
  audio: { label: "Audio", description: "Sound design, music, and audio middleware." },
  ai_coding_assistant: { label: "AI Coding Assistant", description: "AI tools that help write code." },
  deployment_publishing: { label: "Deployment & Publishing", description: "Stores and distribution platforms." },
};

// Retrieval-confidence weights (Sprint 3 uses these). Sum to 100.
// Locked decisions (2026-05-07 user spec):
// engine = core; art_assets next; deployment + ide = lowest impact.
export const PDD_CATEGORY_WEIGHTS: Record<PddCategory, number> = {
  game_engine: 30,
  art_asset_creation: 20,
  audio: 15,
  version_control: 12,
  ai_coding_assistant: 10,
  ide: 7,
  deployment_publishing: 6,
};
```

- [ ] **Step 1.2: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: PASS — file is self-contained.

- [ ] **Step 1.3: Commit**

```powershell
git add artifacts/api-server/src/types/pdd.ts
git commit -m "feat(api): add PDD §2 type surface (enums + ToolEntry zod schema + retrieval weights)"
```

---

## Task 2: Author `toolCatalog.json` (data move)

**Files:**
- Create: `artifacts/api-server/src/data/toolCatalog.json`

This is the largest authoring step. It is **data**, not code — keep the format exactly as the schema in Task 1 expects.

**Authoring rules (must match §4.1 of the spec):**
- Exactly the 7 PDD categories. No `programming`, `animation`, `ui`, `vfx`, `ai_tooling`, `engine`, `deployment`, `networking`, `backend_services`, `monetization`, `analytics`, `narrative`, `build_ci`.
- Every entry MUST have all 17 required fields plus `subcategory`/`website` when applicable.
- `id` is lowercase snake_case, stable, unique. Examples: `unity`, `unreal_engine`, `git_github`, `aseprite`, `adobe_photoshop`.
- `alternatives` is an array of **at least one** other tool's `id` from the same category.
- `phase` is multi-valued; pick from `planning | programming | version_control | art_assets | audio | deployment_publishing`. Game engines → `["programming"]`. Adobe Photoshop → `["art_assets"]`. Steam → `["deployment_publishing"]`. Git → `["version_control"]`. AI coding assistants → `["programming"]`.
- `subcategory` is optional, used only inside `art_asset_creation` to keep the old discriminator: `"animation" | "ui" | "vfx" | "2d_art" | "3d_modelling" | "texturing"`.
- `beginnerSuitability` is an integer 0–100. Calibrate against today's `minSkillLevel`: beginner → 80, intermediate → 50, advanced → 25, expert → 10. Adjust ±10 for known accessibility (Godot bumps up, Unreal trims down).

**Migration map (use this EXACTLY when picking which existing tools survive):**

| Old category | New category | Action |
|---|---|---|
| `engine` (Unity, Unreal Engine, Godot, GameMaker, Phaser, Cocos Creator, Defold, LOVE, Construct 3, Bevy) | `game_engine` | Keep all 10 |
| `programming` (C#, GDScript, C++, Lua, JS/TS, Rust, Haxe, Python) | DROP from MVP catalog | Languages are not in the §2 MVP. |
| `programming` (none currently) | `ide` | Author **new** entries: `vs_code`, `visual_studio`, `rider`, `jetbrains_intellij`, `sublime_text` (5 entries). Use Microsoft / JetBrains / Sublime HQ public docs for descriptions. |
| `art` (Aseprite, Blender, Adobe Photoshop, Krita, Substance Painter, Substance Designer, ZBrush, Autodesk Maya, Procreate, Pyxel Edit) | `art_asset_creation` | Keep all 10. `subcategory`: Aseprite/Pyxel Edit → `2d_art`; Blender/Maya/ZBrush → `3d_modelling`; Photoshop/Krita/Procreate → `2d_art`; Substance Painter/Designer → `texturing` |
| `animation` (Spine, DragonBones, Cascadeur, Mixamo, Live2D Cubism, Maya Animation) | `art_asset_creation` (`subcategory: "animation"`) | Keep all 6. Drop `Maya Animation` if redundant with `Autodesk Maya`. |
| `ui` (Unity UI Toolkit, Godot Control Nodes, NoesisGUI, Rive) | `art_asset_creation` (`subcategory: "ui"`) | Keep all 4 |
| `vfx` (Unity VFX Graph, Godot Particles, After Effects, Niagara (UE5), Houdini, EmberGen) | `art_asset_creation` (`subcategory: "vfx"`) | Keep all 6 |
| `audio` (FMOD Studio, Wwise, Audacity, Reaper, Soundly, BFXR, Eleven Labs TTS, Suno Music) | `audio` | Keep all 8 |
| `version_control` (Git+GitHub, Plastic SCM, Perforce Helix Core, GitLab, Diversion) | `version_control` | Keep all 5 |
| `deployment` (Steam, itch.io, Google Play Store, Apple App Store, Epic Games Store, GOG, Console Partner Portals, CrazyGames, Poki) | `deployment_publishing` | Keep all 9 |
| `ai_tooling` (GitHub Copilot, Cursor, Claude Code, Windsurf, ChatGPT/GPT-4) | `ai_coding_assistant` | Keep these 5 only |
| `ai_tooling` (Midjourney, Scenario.gg, Leonardo.ai, Meshy, Tripo3D, Layer.ai, Promethean AI, Krea, Runway, Move.ai, Rosebud AI, Lovable, Bolt.new, v0.dev, Suno, Eleven Labs, Inworld AI, Convai, Charisma.ai) | DROP | Per §4.1.1 non-coding AI tools removed from MVP. |
| `networking`, `backend_services`, `monetization`, `analytics`, `narrative`, `build_ci` | DROP | Removed from MVP. |

Final catalog size target: ~62 entries (10 engines + 5 IDEs + 5 VCS + 26 art subcategories + 8 audio + 5 AI coding + 9 deployment).

- [ ] **Step 2.1: Write the file with one worked entry as template**

Create `artifacts/api-server/src/data/toolCatalog.json`:

```json
[
  {
    "id": "unity",
    "name": "Unity",
    "category": "game_engine",
    "description": "Cross-platform 2D/3D engine with C# scripting, asset store, and broad target support.",
    "bestUseCase": "Cross-platform 2D/3D indie and mobile production with strong tooling and community.",
    "supportedPlatforms": ["pc", "mobile", "web", "console", "vr"],
    "pricing": "freemium",
    "difficultyLevel": "beginner",
    "beginnerSuitability": 80,
    "teamSizeFit": ["solo", "small", "medium", "large"],
    "genreFit": ["action", "adventure", "rpg", "platformer", "puzzle", "casual", "arcade", "shooter"],
    "fit2d3d": "both",
    "pros": [
      "Massive community and tutorials",
      "Huge Asset Store",
      "Excellent cross-platform support",
      "Strong 2D and 3D pipeline"
    ],
    "cons": [
      "Performance overhead vs native engines",
      "Licensing costs at scale",
      "Complex build pipeline"
    ],
    "alternatives": ["unreal_engine", "godot", "gamemaker"],
    "phase": ["programming"],
    "website": "https://unity.com"
  }
]
```

- [ ] **Step 2.2: Add the remaining ~61 entries**

Walk the migration map row by row. For each existing tool kept, copy across:
- `name` → `name`
- old `description` → `description` (keep as-is)
- old `bestFor[0]` → `bestUseCase` (rephrase as full sentence; drop the rest)
- old `pricing` → `pricing` (no enum changes for current values; new values `revenue_share`, `enterprise` are not used yet — they exist in the schema for catalog growth)
- old `platforms` → `supportedPlatforms` (filter to `PLATFORMS` enum; `vr` and `ar` already match)
- old `minSkillLevel` → `difficultyLevel` (`expert` → `advanced`; everything else identical)
- `beginnerSuitability` → calibrated per the rule above
- `teamSizeFit` → infer from old `bestFor`: AAA studio tools → all four; jam/indie tools → `["solo","small"]`
- `genreFit` → derive from `tags` and `bestFor`; default to a permissive set (4–6 genres) if unclear
- `fit2d3d` → `2d` for Aseprite/Spine, `3d` for Blender/ZBrush/Niagara, `both` for Unity/Unreal/Godot/Photoshop
- `pros` → copy `strengths` (limit 5)
- `cons` → copy `weaknesses` (limit 4)
- `alternatives` → pick 2–3 sibling `id`s in the same category
- `phase` → per the rule above
- `website` → carry over

For the 5 new IDE entries author from scratch using public product pages. Template:

```json
{
  "id": "vs_code",
  "name": "Visual Studio Code",
  "category": "ide",
  "description": "Free, extensible code editor with first-class TypeScript and C# support, debugging, and a deep extension marketplace.",
  "bestUseCase": "General-purpose IDE for game logic, scripts, and tooling across all engines.",
  "supportedPlatforms": ["pc"],
  "pricing": "free",
  "difficultyLevel": "beginner",
  "beginnerSuitability": 90,
  "teamSizeFit": ["solo", "small", "medium", "large"],
  "genreFit": ["action", "adventure", "rpg", "strategy", "simulation", "puzzle", "platformer", "shooter", "casual", "arcade"],
  "fit2d3d": "both",
  "pros": ["Free", "Huge extension ecosystem", "Cross-platform", "First-class git integration"],
  "cons": ["Heavier than minimal editors", "Telemetry on by default"],
  "alternatives": ["sublime_text", "rider"],
  "phase": ["programming"],
  "website": "https://code.visualstudio.com"
}
```

Repeat for `visual_studio`, `rider`, `jetbrains_intellij`, `sublime_text` with appropriate values.

- [ ] **Step 2.3: Validate the catalog locally with a one-shot script**

Author a temporary script `artifacts/api-server/src/scripts/validateCatalog.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ToolCatalogSchema } from "../types/pdd.js";

const json = JSON.parse(readFileSync(resolve("artifacts/api-server/src/data/toolCatalog.json"), "utf8"));
const result = ToolCatalogSchema.safeParse(json);
if (!result.success) {
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

const ids = new Set<string>();
for (const entry of result.data) {
  if (ids.has(entry.id)) {
    console.error(`Duplicate id: ${entry.id}`);
    process.exit(1);
  }
  ids.add(entry.id);
}
for (const entry of result.data) {
  for (const alt of entry.alternatives) {
    if (!ids.has(alt)) {
      console.error(`${entry.id} references unknown alternative ${alt}`);
      process.exit(1);
    }
  }
}
console.log(`Catalog valid: ${result.data.length} entries`);
```

Run: `pnpm --filter @workspace/api-server exec tsx src/scripts/validateCatalog.ts`
Expected: `Catalog valid: <N> entries` and exit 0.

If validation fails, fix the offending entries — every error is actionable.

- [ ] **Step 2.4: Delete the temporary script**

```powershell
Remove-Item artifacts/api-server/src/scripts/validateCatalog.ts
```

The Zod validation lives in the loader from Task 3.

- [ ] **Step 2.5: Commit**

```powershell
git add artifacts/api-server/src/data/toolCatalog.json
git commit -m "feat(api): add §2-compliant toolCatalog.json (7 PDD categories)"
```

---

## Task 3: Rewrite `gameDevTools.ts` as a JSON loader

**Files:**
- Modify: `artifacts/api-server/src/lib/gameDevTools.ts` (replace entire contents)

This module must keep exporting `GAME_DEV_TOOLS` and `TOOL_CATEGORIES` so legacy code keeps compiling. Both are derived from the new JSON.

- [ ] **Step 3.1: Replace the file with the loader + legacy adapter**

```ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PDD_CATEGORIES,
  PDD_CATEGORY_LABELS,
  ToolCatalogSchema,
  type PddCategory,
  type ToolEntry,
} from "../types/pdd.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(__dirname, "../data/toolCatalog.json");

function loadCatalog(): ToolEntry[] {
  const raw = JSON.parse(readFileSync(catalogPath, "utf8"));
  const parsed = ToolCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`toolCatalog.json failed validation: ${JSON.stringify(parsed.error.format())}`);
  }
  return parsed.data;
}

export const TOOL_CATALOG: readonly ToolEntry[] = loadCatalog();

export const TOOL_CATEGORIES: readonly { id: PddCategory; label: string; description: string }[] =
  PDD_CATEGORIES.map((id) => ({
    id,
    label: PDD_CATEGORY_LABELS[id].label,
    description: PDD_CATEGORY_LABELS[id].description,
  }));

// ──────────────────────────────────────────────────────────────
// Legacy adapter — keeps Sprint 1 booting against advisorEngine.
// Removed in Sprint 3.
// ──────────────────────────────────────────────────────────────

export type Ecosystem = string;
export type ArchetypeScope = "jam" | "prototype" | "indie" | "AA" | "AAA";

export interface GameDevTool {
  name: string;
  category: string;
  description: string;
  website: string;
  pricing: ToolEntry["pricing"];
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

function toLegacy(entry: ToolEntry): GameDevTool {
  return {
    name: entry.name,
    category: entry.category,
    description: entry.description,
    website: entry.website ?? "",
    pricing: entry.pricing,
    minSkillLevel: entry.difficultyLevel,
    platforms: [...entry.supportedPlatforms],
    strengths: [...entry.pros],
    weaknesses: [...entry.cons],
    bestFor: [entry.bestUseCase],
    tags: entry.subcategory ? [entry.subcategory] : [],
    ecosystem: [],
    popularityByArchetype: null,
  };
}

export const GAME_DEV_TOOLS: GameDevTool[] = TOOL_CATALOG.map(toLegacy);
```

- [ ] **Step 3.2: Typecheck the api-server package**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: Likely fails — `advisorEngine.ts` references categories that no longer exist (e.g. `programming`, `ai_tooling`, `networking`).

- [ ] **Step 3.3: Patch `advisorEngine.ts` to use the new category set**

Read `artifacts/api-server/src/lib/advisorEngine.ts` and find any literal category strings. Apply this rename map mechanically (search and replace inside literal strings only):

| Old | New |
|---|---|
| `"engine"` | `"game_engine"` |
| `"art"` | `"art_asset_creation"` |
| `"animation"` | `"art_asset_creation"` |
| `"ui"` | `"art_asset_creation"` |
| `"vfx"` | `"art_asset_creation"` |
| `"deployment"` | `"deployment_publishing"` |
| `"ai_tooling"` | `"ai_coding_assistant"` |

Remove any code path that branches on `programming`, `networking`, `backend_services`, `monetization`, `analytics`, `narrative`, or `build_ci` — those categories no longer exist. The advisor will produce empty results for them, which is correct because no tools are present.

If `hiddenCategoriesForMode` lists any of the dropped categories, drop them from the array as well.

- [ ] **Step 3.4: Patch `routes/advisor.ts` if typecheck flags anything**

Likely no-op. If typecheck flags a category literal, rename per the table above.

- [ ] **Step 3.5: Typecheck again**

Run: `pnpm run typecheck` (root)
Expected: PASS for `@workspace/api-server`. Frontend may fail (out of scope).

- [ ] **Step 3.6: Boot smoke test**

```powershell
pnpm --filter @workspace/api-server run dev
```

Hit:
- `http://localhost:3000/api/healthz` → `{"status":"ok"}`
- `http://localhost:3000/api/tools/categories` → 7 elements

Stop the server (Ctrl+C).

- [ ] **Step 3.7: Commit**

```powershell
git add artifacts/api-server/src/lib/gameDevTools.ts artifacts/api-server/src/lib/advisorEngine.ts artifacts/api-server/src/routes/advisor.ts
git commit -m "refactor(api): load tool catalog from JSON, collapse to 7 PDD categories"
```

---

## Task 4: Update OpenAPI `Tool` and `Pricing` schemas

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (lines 488–538 for `Tool`, line 503 for `Pricing` enum, line 540 area for `ToolCategory.id`, lines 99–143 for `/tools` parameters and `/tools/{id}` path id type)

- [ ] **Step 4.1: Replace the `Tool` schema**

In `lib/api-spec/openapi.yaml`, replace the entire existing `Tool` schema (currently lines 488–538) with:

```yaml
    Tool:
      type: object
      properties:
        id:
          type: string
          description: Stable snake_case slug
        name:
          type: string
        category:
          type: string
          enum: [game_engine, ide, version_control, art_asset_creation, audio, ai_coding_assistant, deployment_publishing]
        subcategory:
          type: ["string", "null"]
        description:
          type: string
        bestUseCase:
          type: string
        supportedPlatforms:
          type: array
          items:
            type: string
            enum: [pc, mobile, web, console, vr, ar]
        pricing:
          type: string
          enum: [free, open_source, freemium, paid, subscription, revenue_share, enterprise]
        difficultyLevel:
          type: string
          enum: [beginner, intermediate, advanced]
        beginnerSuitability:
          type: integer
          minimum: 0
          maximum: 100
        teamSizeFit:
          type: array
          items:
            type: string
            enum: [solo, small, medium, large]
        genreFit:
          type: array
          items:
            type: string
        fit2d3d:
          type: string
          enum: [2d, 3d, both]
        pros:
          type: array
          items:
            type: string
        cons:
          type: array
          items:
            type: string
        alternatives:
          type: array
          items:
            type: string
        phase:
          type: array
          items:
            type: string
            enum: [planning, programming, version_control, art_assets, audio, deployment_publishing]
        website:
          type: ["string", "null"]
      required:
        - id
        - name
        - category
        - description
        - bestUseCase
        - supportedPlatforms
        - pricing
        - difficultyLevel
        - beginnerSuitability
        - teamSizeFit
        - genreFit
        - fit2d3d
        - pros
        - cons
        - alternatives
        - phase
```

- [ ] **Step 4.2: Update `ToolCategory.id` enum**

Find the `ToolCategory` schema (around line 540). Change `id` to:

```yaml
        id:
          type: string
          enum: [game_engine, ide, version_control, art_asset_creation, audio, ai_coding_assistant, deployment_publishing]
```

- [ ] **Step 4.3: Update `/tools` query params and `/tools/{id}` param type**

In the `/tools` path block (around line 99), replace the parameters list with:

```yaml
      parameters:
        - { name: category,    in: query, required: false, schema: { type: string } }
        - { name: platform,    in: query, required: false, schema: { type: string } }
        - { name: pricing,     in: query, required: false, schema: { type: string } }
        - { name: difficulty,  in: query, required: false, schema: { type: string } }
        - { name: teamSize,    in: query, required: false, schema: { type: string } }
        - { name: fit2d3d,     in: query, required: false, schema: { type: string } }
```

In `/tools/{id}` (around line 120), change `id` parameter schema from `type: integer` to `type: string`.

- [ ] **Step 4.4: Run codegen**

```powershell
pnpm --filter @workspace/api-spec run codegen
```

Expected: regenerates `lib/api-zod` and `lib/api-client-react` without error.

- [ ] **Step 4.5: Typecheck the api-server**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS. (Frontend typecheck is out of scope for Sprint 1; if it fails, note in PR description.)

- [ ] **Step 4.6: Commit**

```powershell
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api-spec): rewrite Tool schema for §2 fields, expand Pricing enum"
```

---

## Task 5: Switch `routes/tools.ts` to in-memory catalog

The Postgres `tools` table is removed in Sprint 2; in Sprint 1 we redirect reads to `TOOL_CATALOG` so the API already matches the new shape.

**Files:**
- Modify: `artifacts/api-server/src/routes/tools.ts` (replace entire contents)

- [ ] **Step 5.1: Replace the file**

```ts
import { Router, type IRouter } from "express";
import { TOOL_CATALOG, TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import type { ToolEntry } from "../types/pdd.js";

const router: IRouter = Router();

router.get("/tools/categories", (_req, res) => {
  const counts = TOOL_CATEGORIES.map((cat) => ({
    ...cat,
    toolCount: TOOL_CATALOG.filter((t) => t.category === cat.id).length,
  }));
  res.json(counts);
});

router.get("/tools", (req, res) => {
  const { category, platform, pricing, difficulty, teamSize, fit2d3d } = req.query;
  let result: ToolEntry[] = [...TOOL_CATALOG];
  if (typeof category === "string") result = result.filter((t) => t.category === category);
  if (typeof platform === "string") result = result.filter((t) => t.supportedPlatforms.includes(platform as ToolEntry["supportedPlatforms"][number]));
  if (typeof pricing === "string") result = result.filter((t) => t.pricing === pricing);
  if (typeof difficulty === "string") result = result.filter((t) => t.difficultyLevel === difficulty);
  if (typeof teamSize === "string") result = result.filter((t) => t.teamSizeFit.includes(teamSize as ToolEntry["teamSizeFit"][number]));
  if (typeof fit2d3d === "string") result = result.filter((t) => t.fit2d3d === fit2d3d);
  res.json(result);
});

router.get("/tools/:id", (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tool = TOOL_CATALOG.find((t) => t.id === id);
  if (!tool) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }
  res.json(tool);
});

export default router;
```

- [ ] **Step 5.2: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 5.3: Boot smoke test**

```powershell
pnpm --filter @workspace/api-server run dev
```

Hit:
- `GET /api/tools/categories` → 7-element array with `toolCount > 0` for every category
- `GET /api/tools?category=game_engine` → ~10 entries
- `GET /api/tools/unity` → full §2 entry
- `GET /api/tools?fit2d3d=2d` → only 2D-fit tools

Stop the server.

- [ ] **Step 5.4: Commit**

```powershell
git add artifacts/api-server/src/routes/tools.ts
git commit -m "feat(api): serve /tools from in-memory toolCatalog with §2 filters"
```

---

## Task 6: Sprint exit checklist

- [ ] **Step 6.1: Verify catalog acceptance**

```powershell
pnpm --filter @workspace/api-server run typecheck
# expected: pass

Select-String -Path artifacts/api-server/src/data/toolCatalog.json -Pattern '"category":' | ForEach-Object { ($_.Line -replace '.*"category":\s*"', '') -replace '".*', '' } | Sort-Object -Unique
# expected: exactly 7 lines, the PDD category ids
```

- [ ] **Step 6.2: Verify legacy advisor pipeline still boots**

```powershell
pnpm --filter @workspace/api-server run dev
```

POST to `/api/advisor/analyze` with:

```json
{ "projectIdea": "test", "budget": "low", "timeLimit": "month", "skillLevel": "beginner", "teamSize": "solo", "platformTarget": ["pc"], "artCapability": "basic" }
```

Expected: streaming response completes. RAG retrieval may be empty — fine, fallback narrative still streams.

- [ ] **Step 6.3: Push and open PR**

```powershell
git push -u origin <branch>
gh pr create --title "Sprint 1: PDD §2 catalog migration" --body "<reference spec §6 sprint 1>"
```

---

## Out of scope for Sprint 1

- Deleting the legacy `GAME_DEV_TOOLS` adapter — done in Sprint 3.
- Removing the Postgres `tools` table and seed code — done in Sprint 2.
- Updating `AnalysisResult` to add `phase`, `trustScore`, `retrieval` — done in Sprint 4.
- Frontend updates to consume the new `Tool` shape — separate spec.
