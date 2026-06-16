import { TOOL_BY_ID } from "../../lib/catalog.js";
import { scoreTool, type ScoringContext } from "../../services/scoring.js";
import type { AdvisorInput, CategoryRecommendation } from "../../types/advisor.js";
import type { EngineName } from "../../types/catalog.js";
import {
  buildReviewSchema,
  reviewSystemPrompt,
  reviewUserPrompt,
} from "../prompts/advisorPrompts.js";

export interface ScoredStack {
  projectSummary: string;
  finalSummary: string;
  recommendations: CategoryRecommendation[];
}

export function applyDeterministicScores(
  recs: CategoryRecommendation[],
  input: AdvisorInput,
  picked: EngineName,
): CategoryRecommendation[] {
  const scoreItem = (toolId: string, category: CategoryRecommendation["category"]) => {
    const tool = TOOL_BY_ID.get(toolId);
    if (!tool) return 0;
    const ctx: ScoringContext = {
      budget: input.budget,
      skillLevel: input.skillLevel,
      artCapability: input.artCapability,
      platformTarget: input.platformTarget,
      pickedEngine: picked,
      category,
      paidPriorityCategories: input.paidPriorityCategories ?? [],
    };
    return scoreTool(tool, ctx);
  };

  return recs.map((rec) => ({
    ...rec,
    primary: { ...rec.primary, score: scoreItem(rec.primary.toolId, rec.category) },
    alternatives: rec.alternatives.map((a) => ({
      ...a,
      score: scoreItem(a.toolId, rec.category),
    })),
  }));
}

export async function runScoreStack(
  input: AdvisorInput,
  recs: CategoryRecommendation[],
  picked: EngineName,
): Promise<ScoredStack> {
  const { chatModel } = await import("../../lib/rag/chatModel.js");

  const scored = applyDeterministicScores(recs, input, picked);
  const ids = [
    ...new Set(scored.flatMap((r) => [r.primary.toolId, ...r.alternatives.map((a) => a.toolId)])),
  ];
  const stackText = scored
    .map(
      (r) =>
        `[${r.category}] primary ${r.primary.toolId}=${r.primary.score}/10; alts: ${
          r.alternatives.map((a) => `${a.toolId}=${a.score}`).join(", ") || "none"
        }`,
    )
    .join("\n");

  const model = chatModel().withStructuredOutput(buildReviewSchema(ids.length ? ids : ["none"]), {
    name: "stack_review",
  });
  const review = await model.invoke([
    { role: "system", content: reviewSystemPrompt() },
    { role: "user", content: reviewUserPrompt(input.projectIdea, stackText) },
  ]);

  const reasonById = new Map(review.scoreReasons.map((r) => [r.toolId, r.scoreReason]));
  const withReasons = scored.map((r) => ({
    ...r,
    primary: { ...r.primary, scoreReason: reasonById.get(r.primary.toolId) ?? "" },
    alternatives: r.alternatives.map((a) => ({
      ...a,
      scoreReason: reasonById.get(a.toolId) ?? "",
    })),
  }));
  return {
    projectSummary: review.projectSummary,
    finalSummary: review.finalSummary,
    recommendations: withReasons,
  };
}
