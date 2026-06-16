import type { AdvisorInput, FeasibilityDecision } from "../../types/advisor.js";
import {
  FeasibilitySchema,
  feasibilitySystemPrompt,
  feasibilityUserPrompt,
} from "../prompts/advisorPrompts.js";

export async function runFeasibility(input: AdvisorInput): Promise<FeasibilityDecision> {
  // Dynamic imports defer module-level side effects (API key check) until call time,
  // keeping the pure normalizeFeasibility export testable without a real key.
  const [{ chatModel }, { retrieveFeasibilityContext }] = await Promise.all([
    import("../../lib/rag/chatModel.js"),
    import("../../lib/rag/retriever.js"),
  ]);

  const guidanceDocs = await retrieveFeasibilityContext(
    `${input.projectIdea} budget ${input.budget} skill ${input.skillLevel} team ${input.teamSize}`,
  );
  const guidance = guidanceDocs.map((d) => d.pageContent).join("\n---\n");
  const model = chatModel().withStructuredOutput(FeasibilitySchema, { name: "feasibility_decision" });
  const result = await model.invoke([
    { role: "system", content: feasibilitySystemPrompt() },
    { role: "user", content: feasibilityUserPrompt(input, guidance) },
  ]);
  return normalizeFeasibility(result as FeasibilityDecision);
}

// If blocked, targetCategories is irrelevant — force empty so downstream never fans out.
export function normalizeFeasibility(d: FeasibilityDecision): FeasibilityDecision {
  return d.feasible ? d : { ...d, targetCategories: [] };
}
