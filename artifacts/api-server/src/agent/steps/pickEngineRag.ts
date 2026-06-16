import type { AdvisorInput, EngineDecision } from "../../types/advisor.js";
import type { EngineName } from "../../types/catalog.js";
import {
  EngineDecisionSchema,
  engineSystemPrompt,
  engineUserPrompt,
} from "../prompts/advisorPrompts.js";

const ENGINE_PATTERNS: Array<{ engine: EngineName; pattern: RegExp }> = [
  { engine: "Unity", pattern: /\bunity\b/gi },
  { engine: "Unreal", pattern: /\bunreal\s+engine\b|\bue[45]?\b/gi },
  { engine: "Godot", pattern: /\bgodot\b/gi },
];

const NEGATED_ENGINE_CONTEXT =
  /\b(no|not|avoid|without|against|instead of|do not want|don't want|dont want)\s+$/i;

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
