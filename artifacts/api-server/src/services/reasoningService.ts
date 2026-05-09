import { openai } from "../lib/openaiClient.js";
import { TOOL_CATALOG } from "../lib/gameDevTools.js";
import type { PddCategory, Phase } from "../types/pdd.js";
import {
  REASONING_JSON_SCHEMA,
  ReasoningResponseSchema,
  type AnalysisResult,
  type Recommendation,
  type RecommendationItem,
  type ReasoningResponse,
} from "../types/recommendation.js";
import type { RetrievedContextPackage } from "../types/tree.js";
import {
  scoreByCategory,
  trustTierFor,
  type ScoredCategory,
  type ScoringInputs,
} from "./scoringService.js";

export interface ReasoningInputs extends ScoringInputs {
  projectIdea: string;
  otherConstraints?: string | null;
  pinnedToolIds?: string[];
}

export async function reason(
  inputs: ReasoningInputs,
  retrieval: RetrievedContextPackage,
): Promise<Omit<AnalysisResult, "sessionId" | "terminated">> {
  const scored = scoreByCategory(inputs, retrieval);
  const messages = buildPrompt(inputs, retrieval, scored);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages,
    response_format: { type: "json_schema", json_schema: REASONING_JSON_SCHEMA },
  });

  const raw = response.choices[0]?.message.content ?? "{}";
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return degraded(retrieval);
  }

  const parsed = ReasoningResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return degraded(retrieval);
  }

  return assemble(parsed.data, retrieval, scored);
}

function buildPrompt(
  inputs: ReasoningInputs,
  retrieval: RetrievedContextPackage,
  scored: ScoredCategory[],
) {
  const candidateBlock = scored
    .map((c) => {
      const lines = c.ranked
        .slice(0, 6)
        .map((s) => `    - ${s.tool.id} (${s.score}) - ${s.tool.name}: ${s.tool.bestUseCase}`)
        .join("\n");
      return `[${c.category}]\n${lines || "    (no candidates)"}`;
    })
    .join("\n\n");

  const pinned = (inputs.pinnedToolIds ?? []).join(", ");
  const retrievalNote = `Retrieval status: ${retrieval.fallbackStatus} (confidence ${retrieval.retrievalConfidence}).`;

  const system = `You are a senior game-development consultant.
Recommend ONE primary tool and up to 2 alternatives per relevant category.
Only use toolId values present in the candidate list. Do not invent new ones.
Do not assess project feasibility - that is captured separately.
Compute a trustScore 0-100 reflecting your confidence in the overall recommendation; this is YOUR confidence, not project feasibility.
If the user pinned tools, you MUST keep them as the primary in their category and explain how the rest of the stack adapts around the pin.
Output a markdown finalSummary (max ~250 words) addressed to the user.`;

  const user = `Project idea: ${inputs.projectIdea}
Project inputs: budget=${inputs.budget}, timeLimit=${inputs.timeLimit}, skillLevel=${inputs.skillLevel}, teamSize=${inputs.teamSize}, platformTarget=${inputs.platformTarget.join("|") || "any"}, artCapability=${inputs.artCapability}
Other constraints: ${inputs.otherConstraints ?? "none"}
Pinned toolIds: ${pinned || "none"}

${retrievalNote}

Candidate pool by category (id, fit-score 0-100, name, bestUseCase):
${candidateBlock}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

function assemble(
  llm: ReasoningResponse,
  retrieval: RetrievedContextPackage,
  scored: ScoredCategory[],
): Omit<AnalysisResult, "sessionId" | "terminated"> {
  const allCatalogIds = new Set(TOOL_CATALOG.map((t) => t.id));
  const phaseById = new Map(TOOL_CATALOG.map((t) => [t.id, t.phase as Phase[]]));
  const scoreById = new Map<string, number>();

  for (const category of scored) {
    for (const item of category.ranked) {
      scoreById.set(item.tool.id, item.score);
    }
  }

  let droppedReferences = 0;

  const liftItem = (
    item: { toolId: string } & Omit<RecommendationItem, "toolId" | "phase" | "score">,
  ): RecommendationItem | null => {
    if (!allCatalogIds.has(item.toolId)) {
      droppedReferences += 1;
      return null;
    }

    return {
      toolId: item.toolId,
      score: scoreById.get(item.toolId) ?? 0,
      reasoning: item.reasoning,
      pros: item.pros,
      cons: item.cons,
      compatibility: item.compatibility,
      useCaseJustification: item.useCaseJustification,
      phase: phaseById.get(item.toolId) ?? [],
    };
  };

  const recommendations: Recommendation[] = [];
  for (const rec of llm.recommendations) {
    const primary = liftItem(rec.primary);
    if (!primary) continue;

    const alternatives = rec.alternatives
      .map((alternative) => liftItem(alternative))
      .filter((x): x is RecommendationItem => x !== null);

    recommendations.push({
      category: rec.category as PddCategory,
      primary,
      alternatives,
    });
  }

  const trustScore = Math.max(0, llm.trustScore - droppedReferences * 10);

  return {
    projectSummary: llm.projectSummary,
    trustScore,
    trustTier: trustTierFor(trustScore),
    retrieval,
    recommendations,
    finalSummary: llm.finalSummary,
  };
}

function degraded(retrieval: RetrievedContextPackage): Omit<AnalysisResult, "sessionId" | "terminated"> {
  return {
    projectSummary: "Unable to parse reasoning model output.",
    trustScore: 0,
    trustTier: "block",
    retrieval,
    recommendations: [],
    finalSummary:
      "We could not produce a confident recommendation. Please refine your project description and try again.",
  };
}
