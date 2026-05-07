import { TOOL_CATALOG, TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import type { ToolEntry } from "../types/pdd.js";

export interface CatalogFilters {
  category?: string;
  platform?: string;
  pricing?: string;
  difficulty?: string;
  teamSize?: string;
  fit2d3d?: string;
}

export function listCategoriesWithCounts() {
  return TOOL_CATEGORIES.map((cat) => ({
    ...cat,
    toolCount: TOOL_CATALOG.filter((t) => t.category === cat.id).length,
  }));
}

export function listTools(filters: CatalogFilters): ToolEntry[] {
  let result: ToolEntry[] = [...TOOL_CATALOG];
  if (filters.category) result = result.filter((t) => t.category === filters.category);
  if (filters.platform) {
    result = result.filter((t) =>
      (t.supportedPlatforms as readonly string[]).includes(filters.platform!),
    );
  }
  if (filters.pricing) result = result.filter((t) => t.pricing === filters.pricing);
  if (filters.difficulty) {
    result = result.filter((t) => t.difficultyLevel === filters.difficulty);
  }
  if (filters.teamSize) {
    result = result.filter((t) =>
      (t.teamSizeFit as readonly string[]).includes(filters.teamSize!),
    );
  }
  if (filters.fit2d3d) result = result.filter((t) => t.fit2d3d === filters.fit2d3d);
  return result;
}

export function findTool(id: string): ToolEntry | undefined {
  return TOOL_CATALOG.find((t) => t.id === id);
}
