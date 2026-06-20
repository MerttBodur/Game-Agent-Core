import type { AdvisorInput, CategoryRecommendation } from "../../types/advisor.js";
import type { Category, EngineName } from "../../types/catalog.js";
import { confidenceGate } from "../../lib/rag/retrievalGate.js";
import {
  buildCategorySchema,
  categorySystemPrompt,
  categoryUserPrompt,
} from "../prompts/advisorPrompts.js";

// Layer 2 decision, extracted as a pure helper so it is unit-testable without
// hitting Chroma or the LLM.
export function shouldSkipCategory(toolDocCount: number, topBm25Score: number): boolean {
  return !confidenceGate(toolDocCount, topBm25Score).passed;
}

export async function recommendCategory(
  input: AdvisorInput,
  category: Category,
  picked: EngineName,
): Promise<CategoryRecommendation | null> {
  const [{ chatModel }, { retrieveForCategory }] = await Promise.all([
    import("../../lib/rag/chatModel.js"),
    import("../../lib/rag/retriever.js"),
  ]);

  const query = `${input.projectIdea} ${category} budget ${input.budget} skill ${input.skillLevel} art ${input.artCapability}`;
  const { toolDocs, guidanceDocs, toolIds, topBm25Score } = await retrieveForCategory(query, category, picked);
  // Layer 2: weak/empty retrieval -> graceful skip instead of feeding the LLM low-signal context.
  if (shouldSkipCategory(toolDocs.length, topBm25Score)) return null;

  const candidates = formatCandidates(toolDocs, guidanceDocs);
  const model = chatModel().withStructuredOutput(buildCategorySchema(toolIds), {
    name: "category_recommendation",
  });
  const out = await model.invoke([
    { role: "system", content: categorySystemPrompt(category) },
    {
      role: "user",
      content: categoryUserPrompt({
        idea: input.projectIdea,
        budget: input.budget,
        skillLevel: input.skillLevel,
        artCapability: input.artCapability,
        category,
        candidates,
      }),
    },
  ]);
  // Layer 3: the model may declare candidates insufficient rather than be forced to pick.
  if (!out.answerPossible) return null;
  assertCandidatesOnly(out, toolIds);
  return {
    category,
    primary: { ...out.primary, score: 0, scoreReason: "" },
    alternatives: out.alternatives.map((a) => ({ ...a, score: 0, scoreReason: "" })),
    reasoning: out.reasoning,
  };
}

export function assertCandidatesOnly(
  out: { primary: { toolId: string }; alternatives: Array<{ toolId: string }> },
  allowed: string[],
): void {
  const set = new Set(allowed);
  for (const id of [out.primary.toolId, ...out.alternatives.map((a) => a.toolId)]) {
    if (!set.has(id)) throw new Error(`recommendation referenced non-candidate toolId: ${id}`);
  }
}

export function formatCandidates(
  toolDocs: Array<{ metadata: Record<string, unknown>; pageContent: string }>,
  guidanceDocs: Array<{ pageContent: string }>,
): string {
  const tools = toolDocs
    .map((d) => `toolId: ${d.metadata.toolId}\n${d.pageContent}`)
    .join("\n---\n");
  const guidance = guidanceDocs.map((d) => d.pageContent).join("\n");
  return `${tools}\n\nGuidance:\n${guidance}`;
}
