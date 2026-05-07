import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_CATALOG, TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import type { PddCategory } from "../types/pdd.js";
import type { ToolTree, ToolTreeCategoryNode, ToolTreeLeaf } from "../types/tree.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../data/toolTree.json");

function summarizeTool(t: (typeof TOOL_CATALOG)[number]): string {
  const platforms = t.supportedPlatforms.join(", ");
  return `${t.description} | ${t.difficultyLevel} difficulty | platforms: ${platforms} | ${t.fit2d3d} | ${t.pricing}`;
}

const categoryNodes: ToolTreeCategoryNode[] = TOOL_CATEGORIES.map((cat) => {
  const tools = TOOL_CATALOG.filter((t) => t.category === cat.id);
  const leaves: ToolTreeLeaf[] = tools.map((t) => ({
    node_id: `tool.${t.id}`,
    title: t.name,
    summary: summarizeTool(t),
    ref: { toolId: t.id },
  }));
  return {
    node_id: `cat.${cat.id}`,
    title: cat.label,
    summary: `${cat.description} (${tools.length} tools)`,
    category: cat.id as PddCategory,
    nodes: leaves,
  };
});

const tree: ToolTree = {
  node_id: "root",
  title: "Game Development Tools",
  summary: `Top-level catalog covering the ${TOOL_CATEGORIES.length} PDD MVP categories.`,
  nodes: categoryNodes,
};

writeFileSync(outPath, JSON.stringify(tree, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath} (${categoryNodes.reduce((n, c) => n + c.nodes.length, 0)} tool leaves)`);
