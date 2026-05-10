import { z } from "zod/v4";
import { openai } from "../../lib/openaiClient.js";
import { trustTierFor, scoreAgentCandidates } from "../../services/scoringService.js";
import type { AgentState, CandidateEntry, ToolRow } from "../../types/agent.js";
import type { AnalysisResult, Recommendation, RecommendationItem } from "../../types/recommendation.js";
import type { RetrievedContextPackage } from "../../types/tree.js";
import { buildRecommendMessages } from "../prompts/recommendPrompt.js";

const RecommendItemSchema = z.object({
  toolId: z.string().min(1),
  reasoning: z.string().min(1),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  compatibility: z.string().min(1),
  useCaseJustification: z.string().min(1),
});

const RecommendResponseSchema = z.object({
  projectSummary: z.string().min(1),
  engineExplanation: z.string().min(1),
  recommendations: z.array(
    z.object({
      category: z.string().min(1),
      primary: RecommendItemSchema,
      alternatives: z.array(RecommendItemSchema).max(2),
    }),
  ),
  lockedExplanations: z.array(
    z.object({
      category: z.string().min(1),
      lockedTo: z.array(z.string().min(1)),
      note: z.string().min(1),
    }),
  ),
  skippedExplanations: z.array(
    z.object({
      category: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
  trustScore: z.number().int().min(0).max(100),
  trustRationale: z.string().min(1),
  finalSummary: z.string().min(1),
});

type RecommendResponse = z.infer<typeof RecommendResponseSchema>;

// Built per-request so toolId is locked to the actual candidate pool via JSON
// schema enum. Makes "tool not in pool" a model-level impossibility under
// OpenAI structured outputs, not a runtime validation race.
export function buildRecommendJsonSchema(allowedToolIds: string[]) {
  return {
    name: "agent_recommend_result",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectSummary: { type: "string" },
        engineExplanation: { type: "string" },
        recommendations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              category: { type: "string" },
              primary: itemJsonSchema(allowedToolIds),
              alternatives: { type: "array", maxItems: 2, items: itemJsonSchema(allowedToolIds) },
            },
            required: ["category", "primary", "alternatives"],
          },
        },
        lockedExplanations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              category: { type: "string" },
              lockedTo: { type: "array", items: { type: "string" } },
              note: { type: "string" },
            },
            required: ["category", "lockedTo", "note"],
          },
        },
        skippedExplanations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              category: { type: "string" },
              reason: { type: "string" },
            },
            required: ["category", "reason"],
          },
        },
        trustScore: { type: "integer", minimum: 0, maximum: 100 },
        trustRationale: { type: "string" },
        finalSummary: { type: "string" },
      },
      required: [
        "projectSummary",
        "engineExplanation",
        "recommendations",
        "lockedExplanations",
        "skippedExplanations",
        "trustScore",
        "trustRationale",
        "finalSummary",
      ],
    },
    strict: true,
  } as const;
}

export async function runRecommend(state: AgentState): Promise<AnalysisResult> {
  if (!state.retrieval || !state.engineDecision) {
    throw new Error("Recommend step requires retrieval and engine decision");
  }

  const scored = scoreAgentCandidates(state.input, state.retrieval.candidatesByCategory);
  const allowedToolIds = collectAllowedToolIds(state.retrieval.candidatesByCategory);
  if (allowedToolIds.length === 0) {
    throw new Error("Recommend step has no candidate tools to choose from");
  }
  console.error("[recommend] scored candidate counts:", Object.fromEntries(Object.entries(scored).map(([k, v]) => [k, v.length])));
  console.error("[recommend] candidatesByCategory types:", Object.fromEntries(Object.entries(state.retrieval.candidatesByCategory).map(([k, v]) => [k, v.type])));
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: buildRecommendMessages(state, scored),
    response_format: {
      type: "json_schema",
      json_schema: buildRecommendJsonSchema(allowedToolIds),
    },
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    throw new Error("Recommend step returned empty content");
  }
  console.error("[recommend] raw LLM response:", raw);

  const parsed = RecommendResponseSchema.parse(JSON.parse(raw));
  validateRecommendResponse(parsed, state.retrieval.candidatesByCategory);

  const toolById = buildToolMap(state.retrieval.candidatesByCategory);
  const scoreById = new Map(
    Object.values(scored).flatMap((items) => items.map((item) => [item.tool.id, item.score] as const)),
  );
  const recommendations = parsed.recommendations.map((recommendation) =>
    liftRecommendation(recommendation, toolById, scoreById),
  );

  const trustScore = parsed.trustScore;
  return {
    sessionId: "",
    projectSummary: parsed.projectSummary,
    trustScore,
    trustTier: trustTierFor(trustScore),
    terminated: false,
    retrieval: toRetrievedContextPackage(state.retrieval.candidatesByCategory),
    engineDecision: state.engineDecision,
    lockedCategories: parsed.lockedExplanations,
    skippedCategories: parsed.skippedExplanations,
    retryMetadata: {
      retryCount: state.retryCount,
      history: state.retrieval.retryHistory,
    },
    recommendations,
    finalSummary: `${parsed.engineExplanation}\n\n${parsed.finalSummary}`,
  };
}

function toRetrievedContextPackage(
  candidatesByCategory: Record<string, CandidateEntry>,
): RetrievedContextPackage {
  const relevantCategories = Object.entries(candidatesByCategory)
    .filter(([, entry]) => entry.type === "fetched" || entry.type === "context")
    .map(([category]) => category as RetrievedContextPackage["relevantCategories"][number]);
  const candidateTools: RetrievedContextPackage["candidateTools"] = [];

  for (const [category, entry] of Object.entries(candidatesByCategory)) {
    if (entry.type !== "fetched" && entry.type !== "context") {
      continue;
    }

    candidateTools.push(
      ...entry.tools.map((tool) => ({
        toolId: tool.id,
        nodePath: `agent/${category}/${tool.id}`,
        fitNote: entry.type === "context" ? entry.note : "Fetched by deterministic retrieval.",
      })),
    );
  }

  return {
    relevantCategories,
    candidateTools,
    rejectedTools: [],
    missingInformationNotes: [],
    retrievalConfidence: Math.min(100, candidateTools.length * 10),
    fallbackStatus: candidateTools.length === 0 ? "weak_coverage" : "ok",
  };
}

function itemJsonSchema(allowedToolIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      toolId: { type: "string", enum: allowedToolIds },
      reasoning: { type: "string" },
      pros: { type: "array", items: { type: "string" }, minItems: 1 },
      cons: { type: "array", items: { type: "string" }, minItems: 1 },
      compatibility: { type: "string" },
      useCaseJustification: { type: "string" },
    },
    required: ["toolId", "reasoning", "pros", "cons", "compatibility", "useCaseJustification"],
  } as const;
}

function validateRecommendResponse(
  response: RecommendResponse,
  candidatesByCategory: Record<string, CandidateEntry>,
): void {
  const allowedByCategory = new Map<string, Set<string>>();
  const lockedOrSkipped = new Set<string>();

  for (const [category, entry] of Object.entries(candidatesByCategory)) {
    if (entry.type === "fetched" || entry.type === "context") {
      allowedByCategory.set(category, new Set(entry.tools.map((tool) => tool.id)));
    } else {
      lockedOrSkipped.add(category);
    }
  }

  for (const recommendation of response.recommendations) {
    if (lockedOrSkipped.has(recommendation.category)) {
      throw new Error(`Locked or skipped category appeared in recommendations: ${recommendation.category}`);
    }

    const allowed = allowedByCategory.get(recommendation.category);
    if (!allowed) {
      throw new Error(`Recommendation category was not fetched: ${recommendation.category}`);
    }

    for (const toolId of [
      recommendation.primary.toolId,
      ...recommendation.alternatives.map((alternative) => alternative.toolId),
    ]) {
      if (!allowed.has(toolId)) {
        throw new Error(`Recommendation referenced unknown candidate toolId: ${toolId}`);
      }
    }
  }
}

function collectAllowedToolIds(candidatesByCategory: Record<string, CandidateEntry>): string[] {
  const ids = new Set<string>();
  for (const entry of Object.values(candidatesByCategory)) {
    if (entry.type !== "fetched" && entry.type !== "context") {
      continue;
    }
    for (const tool of entry.tools) {
      ids.add(tool.id);
    }
  }
  return [...ids];
}

function buildToolMap(candidatesByCategory: Record<string, CandidateEntry>): Map<string, ToolRow> {
  const map = new Map<string, ToolRow>();
  for (const entry of Object.values(candidatesByCategory)) {
    if (entry.type !== "fetched" && entry.type !== "context") {
      continue;
    }
    for (const tool of entry.tools) {
      map.set(tool.id, tool);
    }
  }
  return map;
}

function liftRecommendation(
  response: RecommendResponse["recommendations"][number],
  toolById: Map<string, ToolRow>,
  scoreById: Map<string, number>,
): Recommendation {
  return {
    category: response.category as Recommendation["category"],
    primary: liftItem(response.primary, toolById, scoreById),
    alternatives: response.alternatives.map((alternative) => liftItem(alternative, toolById, scoreById)),
  };
}

function liftItem(
  response: z.infer<typeof RecommendItemSchema>,
  toolById: Map<string, ToolRow>,
  scoreById: Map<string, number>,
): RecommendationItem {
  const tool = toolById.get(response.toolId);
  if (!tool) {
    throw new Error(`Cannot lift missing tool: ${response.toolId}`);
  }

  return {
    toolId: response.toolId,
    score: scoreById.get(response.toolId) ?? 0,
    reasoning: response.reasoning,
    pros: response.pros,
    cons: response.cons,
    compatibility: response.compatibility,
    useCaseJustification: response.useCaseJustification,
    phase: [],
  };
}
