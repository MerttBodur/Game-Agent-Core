import type { AdvisorInput, EngineDecision } from "../../types/advisor.js";
import {
  EngineDecisionSchema,
  engineSystemPrompt,
  engineUserPrompt,
} from "../prompts/advisorPrompts.js";

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
  assertEngineInvariant(decision as EngineDecision);
  return decision as EngineDecision;
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
