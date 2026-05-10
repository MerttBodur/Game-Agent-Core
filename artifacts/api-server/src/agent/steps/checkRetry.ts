import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentState, RetrievalResult, RetryMode } from "../../types/agent.js";
import type { ToolTree } from "../../types/tree.js";

export type RetryDecision = RetryMode | "done";

const __dirname = dirname(fileURLToPath(import.meta.url));
const treePath = resolve(__dirname, "../../data/toolTree.json");
const TOOL_TREE: ToolTree = JSON.parse(readFileSync(treePath, "utf8")) as ToolTree;

export function checkRetry(state: AgentState): RetryDecision {
  if (!state.retrieval || state.retryCount >= 2) {
    return "done";
  }

  const count = state.retrieval.totalToolCount;
  if (count < 3) {
    return "broaden";
  }
  if (count > 40) {
    return "pre_filter";
  }
  return "done";
}

export function appendRetryHistory(state: AgentState, mode: RetryMode): RetrievalResult["retryHistory"] {
  const previous = state.retrieval?.retryHistory ?? [];
  const categories =
    mode === "broaden" && state.analyze
      ? categoriesEligibleForBroaden(state.analyze.targetCategories, previous)
      : undefined;

  return [
    ...previous,
    {
      attempt: state.retryCount + 1,
      mode,
      countBefore: state.retrieval?.totalToolCount ?? 0,
      ...(categories && categories.length > 0 ? { categories } : {}),
    },
  ];
}

export function broadenCategories(
  categories: string[],
  retryHistory: RetrievalResult["retryHistory"],
  tree: ToolTree = TOOL_TREE,
): string[] {
  const eligible = new Set(categoriesEligibleForBroaden(categories, retryHistory));
  if (eligible.size === 0) {
    return categories;
  }

  const index = buildSiblingIndex(tree);
  const expanded = new Set(categories);

  for (const category of categories) {
    if (!eligible.has(category)) {
      continue;
    }

    const siblings = index.get(category) ?? [];
    for (const sibling of siblings) {
      expanded.add(sibling);
    }
  }

  return [...expanded];
}

function categoriesEligibleForBroaden(
  categories: string[],
  retryHistory: RetrievalResult["retryHistory"],
): string[] {
  const broadened = new Set(
    retryHistory.flatMap((entry) => (entry.mode === "broaden" ? (entry.categories ?? []) : [])),
  );

  return categories.filter((category) => !broadened.has(category));
}

function buildSiblingIndex(tree: ToolTree): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const rootIds = tree.nodes.map(nodeIdFor).filter((id): id is string => Boolean(id));

  for (const id of rootIds) {
    index.set(id, rootIds.filter((sibling) => sibling !== id));
  }

  for (const category of tree.nodes) {
    const childIds = category.nodes.map(nodeIdFor).filter((id): id is string => Boolean(id));
    for (const id of childIds) {
      index.set(id, childIds.filter((sibling) => sibling !== id));
    }
  }

  return index;
}

function nodeIdFor(node: ToolTree["nodes"][number] | ToolTree["nodes"][number]["nodes"][number]): string | null {
  if ("category" in node && typeof node.category === "string") {
    return node.category;
  }
  if ("ref" in node && node.ref?.toolId) {
    return node.ref.toolId;
  }
  return node.node_id.replace(/^(cat|tool)\./, "");
}
