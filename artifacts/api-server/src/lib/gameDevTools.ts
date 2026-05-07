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
    throw new Error(
      `toolCatalog.json failed validation: ${JSON.stringify(parsed.error.format())}`,
    );
  }
  return parsed.data;
}

export const TOOL_CATALOG: readonly ToolEntry[] = loadCatalog();

export const TOOL_CATEGORIES: readonly {
  id: PddCategory;
  label: string;
  description: string;
}[] = PDD_CATEGORIES.map((id) => ({
  id,
  label: PDD_CATEGORY_LABELS[id].label,
  description: PDD_CATEGORY_LABELS[id].description,
}));

// Legacy adapter for advisor engine compatibility.
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
export const DATASET_HAS_POPULARITY_ROWS = false;
