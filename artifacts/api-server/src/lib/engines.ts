import { TOOL_CATALOG } from "./catalog.js";
import type { EngineName } from "../types/catalog.js";

// Engine ids derived from the catalog: every tool tagged game_engine.
export const ENGINE_IDS: readonly EngineName[] = TOOL_CATALOG.filter((t) =>
  t.categories.includes("game_engine"),
).map((t) => t.id);

const ENGINE_ID_SET = new Set(ENGINE_IDS);

export function isEngineId(id: string): boolean {
  return ENGINE_ID_SET.has(id);
}
