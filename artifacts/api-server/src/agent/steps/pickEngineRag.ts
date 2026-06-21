import type { AdvisorInput, EngineDecision } from "../../types/advisor.js";
import type { EngineName } from "../../types/catalog.js";
import { TOOL_CATALOG } from "../../lib/catalog.js";
import {
  EngineDecisionSchema,
  engineSystemPrompt,
  engineUserPrompt,
} from "../prompts/advisorPrompts.js";

// Build detection patterns from the catalog: each game_engine tool maps a
// name/alias regex to its id. Aliases cover common ways users name an engine.
const ENGINE_ALIASES: Record<string, string[]> = {
  unreal_engine: ["unreal\\s+engine", "unreal", "ue[45]?"],
  threejs: ["three\\.?js"],
  love2d: ["l[öo]ve2?d?", "l[öo]ve"],
  renpy: ["ren'?py"],
  construct_3: ["construct\\s*3?"],
  rpg_maker: ["rpg\\s*maker"],
};

const ENGINE_PATTERNS: Array<{ engine: EngineName; pattern: RegExp }> = TOOL_CATALOG.filter(
  (t) => t.categories.includes("game_engine"),
).map((t) => {
  const aliases = ENGINE_ALIASES[t.id] ?? [escapeRegExp(t.name)];
  return { engine: t.id, pattern: new RegExp(`\\b(?:${aliases.join("|")})\\b`, "gi") };
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NEGATED_ENGINE_CONTEXT =
  /\b(no|not|but|avoid|without|against|instead of|do not want|don't want|dont want)\s+$/i;

export async function runPickEngine(input: AdvisorInput): Promise<EngineDecision> {
  const [{ chatModel }, { retrieveEngineDocs }] = await Promise.all([
    import("../../lib/rag/chatModel.js"),
    import("../../lib/rag/retriever.js"),
  ]);

  const { toolDocs, guidanceDocs } = await retrieveEngineDocs(input.projectIdea);
  const context = [...toolDocs, ...guidanceDocs].map((d) => d.pageContent).join("\n---\n");
  const model = chatModel().withStructuredOutput(EngineDecisionSchema, { name: "engine_decision" });
  const decision = await model.invoke([
    { role: "system", content: engineSystemPrompt() },
    { role: "user", content: engineUserPrompt(input.projectIdea, context) },
  ]);
  const normalized = normalizeEngineDecision(decision as EngineDecision, input.projectIdea);
  assertEngineInvariant(normalized);
  return normalized;
}

export function detectUserPreferredEngine(projectIdea: string): EngineName | null {
  const matches: Array<{ engine: EngineName; index: number }> = [];

  for (const { engine, pattern } of ENGINE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of projectIdea.matchAll(pattern)) {
      const index = match.index ?? 0;
      const before = projectIdea.slice(Math.max(0, index - 32), index);
      if (NEGATED_ENGINE_CONTEXT.test(before)) continue;
      matches.push({ engine, index });
    }
  }

  matches.sort((a, b) => a.index - b.index);
  return matches[0]?.engine ?? null;
}

export function normalizeEngineDecision(
  decision: EngineDecision,
  projectIdea: string,
): EngineDecision {
  const userPreferred = detectUserPreferredEngine(projectIdea);
  const agreement =
    userPreferred === null
      ? "user_silent"
      : decision.picked === userPreferred
        ? "agreed"
        : "challenged";

  return {
    ...decision,
    userPreferred,
    agreement,
  };
}

export function assertEngineInvariant(d: EngineDecision): void {
  if (d.userPreferred === null && d.agreement !== "user_silent") {
    throw new Error("agreement must be user_silent when no engine was mentioned");
  }
  if (d.userPreferred !== null && d.picked === d.userPreferred && d.agreement !== "agreed") {
    throw new Error("agreement must be agreed when picked === userPreferred");
  }
  if (d.userPreferred !== null && d.picked !== d.userPreferred && d.agreement !== "challenged") {
    throw new Error("agreement must be challenged when picked !== userPreferred");
  }
}
