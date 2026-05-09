import { TOOL_CATALOG, TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import { pool } from "@workspace/db";
import type { ToolEntry } from "../types/pdd.js";
import type { Engine, ToolRow } from "../types/agent.js";
import type { RowDataPacket } from "mysql2";

export interface CatalogFilters {
  category?: string;
  platform?: string;
  pricing?: string;
  difficulty?: string;
  teamSize?: string;
  fit2d3d?: string;
}

export interface FetchToolsOptions {
  limit?: number;
  priceModels?: Array<ToolRow["priceModel"]>;
  requirePlatformOverlap?: string[];
  minRating?: number;
}

interface ToolSqlRow extends RowDataPacket {
  id: string;
  name: string;
  leaf_category: string;
  description: string | null;
  price_model: ToolRow["priceModel"];
  compatible_engines: string | Engine[];
  tool_type: ToolRow["toolType"];
  platforms: string | string[];
  pros: string | string[] | null;
  cons: string | string[] | null;
  url: string | null;
  rating: string | number;
  last_updated: string | Date | null;
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

export async function fetchToolsByCategory(
  category: string,
  engine: Exclude<Engine, "unknown">,
  opts?: FetchToolsOptions,
): Promise<ToolRow[]> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 50, 200));
  const sqlParts = [
    `SELECT * FROM tools
     WHERE leaf_category = ?
       AND (
         JSON_CONTAINS(compatible_engines, JSON_QUOTE(?))
         OR JSON_CONTAINS(compatible_engines, '"Custom"')
       )`,
  ];
  const params: Array<string | number> = [category, engine];

  if (opts?.priceModels?.length) {
    sqlParts.push(`AND price_model IN (${opts.priceModels.map(() => "?").join(", ")})`);
    params.push(...opts.priceModels);
  }

  if (opts?.requirePlatformOverlap?.length) {
    sqlParts.push("AND JSON_OVERLAPS(platforms, ?)");
    params.push(JSON.stringify(opts.requirePlatformOverlap));
  }

  if (typeof opts?.minRating === "number") {
    sqlParts.push("AND rating >= ?");
    params.push(opts.minRating);
  }

  sqlParts.push("ORDER BY rating DESC");
  sqlParts.push("LIMIT ?");
  params.push(limit);

  const [rows] = await pool.query<ToolSqlRow[]>(sqlParts.join("\n"), params);
  return rows.map(mapToolRow);
}

function mapToolRow(row: ToolSqlRow): ToolRow {
  return {
    id: row.id,
    name: row.name,
    leafCategory: row.leaf_category,
    description: row.description,
    priceModel: row.price_model,
    compatibleEngines: parseJsonArray<Engine>(row.compatible_engines),
    toolType: row.tool_type,
    platforms: parseJsonArray<string>(row.platforms),
    pros: parseJsonArray<string>(row.pros),
    cons: parseJsonArray<string>(row.cons),
    url: row.url,
    rating: typeof row.rating === "number" ? row.rating : Number(row.rating),
    lastUpdated:
      row.last_updated === null
        ? null
        : row.last_updated instanceof Date
          ? row.last_updated.toISOString().slice(0, 10)
          : row.last_updated,
  };
}

function parseJsonArray<T>(value: string | T[] | null): T[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
