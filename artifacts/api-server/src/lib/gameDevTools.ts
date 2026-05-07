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
