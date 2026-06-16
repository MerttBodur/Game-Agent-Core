import type { AdvisorInput, CategoryRecommendation } from "../../types/advisor.js";
import type { Category, EngineName } from "../../types/catalog.js";
import {
  buildCategorySchema,
  categorySystemPrompt,
  categoryUserPrompt,
} from "../prompts/advisorPrompts.js";

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
  const { toolDocs, guidanceDocs, toolIds } = await retrieveForCategory(query, category, picked);
  if (toolIds.length === 0) return null;

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

function formatCandidates(
  toolDocs: Array<{ metadata: Record<string, unknown>; pageContent: string }>,
  guidanceDocs: Array<{ pageContent: string }>,
): string {
  const tools = toolDocs
    .map((d) => `- ${d.metadata.toolId}: ${d.pageContent.split("\n").slice(0, 3).join(" ")}`)
    .join("\n");
  const guidance = guidanceDocs.map((d) => d.pageContent).join("\n");
  return `${tools}\n\nGuidance:\n${guidance}`;
}
