import {
  CATEGORY_LIST,
  TOOL_BY_ID,
  TOOL_CATALOG,
  toolsInCategory,
} from "../lib/catalog.js";
import type { ToolEntry } from "../types/catalog.js";

export interface CatalogFilters {
  category?: string;
  platform?: string;
  pricing?: string;
  difficulty?: string;
  toolNature?: string;
}

export type ToolApiDto = ToolEntry;

export function listCategoriesWithCounts() {
  return CATEGORY_LIST.map((cat) => ({
    ...cat,
    toolCount: toolsInCategory(cat.id).length,
  }));
}

export function listTools(filters: CatalogFilters): ToolApiDto[] {
  let result: ToolEntry[] = [...TOOL_CATALOG];
  if (filters.category) {
    result = result.filter((t) => t.categories.includes(filters.category as ToolEntry["categories"][number]));
  }
  if (filters.platform) {
    result = result.filter((t) =>
      (t.supportedPlatforms as readonly string[]).includes(filters.platform!),
    );
  }
  if (filters.pricing) result = result.filter((t) => t.pricing === filters.pricing);
  if (filters.difficulty) result = result.filter((t) => t.difficultyLevel === filters.difficulty);
  if (filters.toolNature) result = result.filter((t) => t.toolNature === filters.toolNature);
  return result;
}

export function findTool(id: string): ToolApiDto | undefined {
  return TOOL_BY_ID.get(id);
}
