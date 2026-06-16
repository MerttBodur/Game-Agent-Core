import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ToolCatalogSchema, CATEGORIES, CATEGORY_LABELS, type Category, type ToolEntry } from "../types/catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(__dirname, "../data/toolCatalog.json");

function loadCatalog(): ToolEntry[] {
  const raw = JSON.parse(readFileSync(catalogPath, "utf8"));
  const parsed = ToolCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`catalog failed validation: ${JSON.stringify(parsed.error.format())}`);
  }
  const ids = new Set<string>();
  for (const t of parsed.data) {
    if (ids.has(t.id)) throw new Error(`duplicate tool id: ${t.id}`);
    ids.add(t.id);
  }
  return parsed.data;
}

export const TOOL_CATALOG: readonly ToolEntry[] = loadCatalog();
export const TOOL_BY_ID: ReadonlyMap<string, ToolEntry> = new Map(TOOL_CATALOG.map((t) => [t.id, t]));

export function toolsInCategory(category: Category): ToolEntry[] {
  return TOOL_CATALOG.filter((t) => t.categories.includes(category));
}

export const CATEGORY_LIST = CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id] }));
