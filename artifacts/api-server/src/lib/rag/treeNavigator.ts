import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openai } from "../openaiClient.js";
import {
  PDD_CATEGORIES,
  PDD_CATEGORY_WEIGHTS,
  type PddCategory,
} from "../../types/pdd.js";
import {
  LLM_RETRIEVAL_JSON_SCHEMA,
  LlmRetrievalResponseSchema,
  type FallbackStatus,
  type RetrievedContextPackage,
  type ToolTree,
} from "../../types/tree.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const treePath = resolve(__dirname, "../../data/toolTree.json");

export const TOOL_TREE: ToolTree = JSON.parse(readFileSync(treePath, "utf8")) as ToolTree;

export interface ProjectInputs {
  projectIdea: string;
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: string;
  platformTarget: string[];
  artCapability: string;
  otherConstraints?: string | null;
}

export async function retrieveContext(
  inputs: ProjectInputs,
  tree: ToolTree = TOOL_TREE,
): Promise<RetrievedContextPackage> {
  const { allToolIds, validCategoryIds, treeIndex } = indexTree(tree);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: buildPrompt(inputs, tree),
    response_format: {
      type: "json_schema",
      json_schema: LLM_RETRIEVAL_JSON_SCHEMA,
    },
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    return emptyPackage("missing_domain");
  }

  const maybeJson = safeJsonParse(raw);
  if (!maybeJson) {
    return emptyPackage("missing_domain");
  }

  const parsed = LlmRetrievalResponseSchema.safeParse(maybeJson);
  if (!parsed.success) {
    return emptyPackage("missing_domain");
  }

  let domainViolation = false;

  const relevantCategories: PddCategory[] = [];
  for (const sel of parsed.data.selectedCategories) {
    if (validCategoryIds.has(sel.category) && PDD_CATEGORIES.includes(sel.category as PddCategory)) {
      const category = sel.category as PddCategory;
      if (!relevantCategories.includes(category)) {
        relevantCategories.push(category);
      }
      continue;
    }
    domainViolation = true;
  }

  const candidateTools: RetrievedContextPackage["candidateTools"] = [];
  const rejectedTools: RetrievedContextPackage["rejectedTools"] = [];

  for (const ev of parsed.data.toolEvaluations) {
    if (!allToolIds.has(ev.toolId)) {
      domainViolation = true;
      continue;
    }

    const node = treeIndex[ev.toolId];
    if (!node) {
      domainViolation = true;
      continue;
    }

    if (ev.marking === "strong" || ev.marking === "conditional") {
      candidateTools.push({
        toolId: ev.toolId,
        nodePath: node.path,
        fitNote: `[${ev.marking}] ${ev.fitNote}`,
      });
      continue;
    }

    rejectedTools.push({
      toolId: ev.toolId,
      reason: `[${ev.marking}] ${ev.fitNote}`,
    });
  }

  const retrievalConfidence = relevantCategories.reduce(
    (sum, category) => sum + (PDD_CATEGORY_WEIGHTS[category] ?? 0),
    0,
  );

  const fallbackStatus = computeFallbackStatus({
    inputs,
    candidateTools,
    domainViolation,
  });

  return {
    relevantCategories,
    candidateTools,
    rejectedTools,
    missingInformationNotes: [],
    retrievalConfidence,
    fallbackStatus,
  };
}

function buildPrompt(inputs: ProjectInputs, tree: ToolTree) {
  const treeBlock = tree.nodes
    .map((cat) => {
      const tools = cat.nodes.map((leaf) => `    - ${leaf.ref.toolId}: ${leaf.summary}`).join("\n");
      return `[${cat.category}] ${cat.title} - ${cat.summary}\n${tools}`;
    })
    .join("\n\n");

  const inputsBlock = JSON.stringify(inputs, null, 2);
  const system = [
    "You are a tool selection assistant for a game-development advisor.",
    "You receive structured project inputs and a catalog tree of categories and tools.",
    `Pick relevant categories from the 7 fixed PDD categories: ${PDD_CATEGORIES.join(", ")}.`,
    "Within selected categories evaluate listed tools and mark each one:",
    '- "strong" = clear top fit',
    '- "conditional" = fits if a tradeoff is accepted (note it)',
    '- "weak" = poor fit but possible',
    '- "reject" = wrong category or wrong project profile',
    "Only emit toolId values that appear in the catalog. Do not invent new ones.",
    "Do not assess project feasibility; only assess tool fit.",
  ].join("\n");

  const user = `Project inputs:
\`\`\`json
${inputsBlock}
\`\`\`

Catalog (category -> tools):
${treeBlock}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

function indexTree(tree: ToolTree) {
  const allToolIds = new Set<string>();
  const validCategoryIds = new Set<string>();
  const treeIndex: Record<string, { path: string }> = {};

  for (const cat of tree.nodes) {
    validCategoryIds.add(cat.category);

    for (const leaf of cat.nodes) {
      allToolIds.add(leaf.ref.toolId);
      treeIndex[leaf.ref.toolId] = { path: `root/${cat.node_id}/${leaf.node_id}` };
    }
  }

  return { allToolIds, validCategoryIds, treeIndex };
}

function computeFallbackStatus(args: {
  inputs: ProjectInputs;
  candidateTools: RetrievedContextPackage["candidateTools"];
  domainViolation: boolean;
}): FallbackStatus {
  if (args.domainViolation) return "missing_domain";

  const wordCount = args.inputs.projectIdea
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (wordCount < 10) return "ambiguous_input";

  const coreCategories: PddCategory[] = ["game_engine", "ide", "version_control"];
  const candidateCategories = new Set<PddCategory>();

  for (const c of args.candidateTools) {
    const match = /^root\/cat\.([^/]+)\//.exec(c.nodePath);
    if (!match) continue;
    const category = match[1];
    if (PDD_CATEGORIES.includes(category as PddCategory)) {
      candidateCategories.add(category as PddCategory);
    }
  }

  for (const category of coreCategories) {
    if (!candidateCategories.has(category)) return "weak_coverage";
  }

  return "ok";
}

function emptyPackage(status: FallbackStatus): RetrievedContextPackage {
  return {
    relevantCategories: [],
    candidateTools: [],
    rejectedTools: [],
    missingInformationNotes: [],
    retrievalConfidence: 0,
    fallbackStatus: status,
  };
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
