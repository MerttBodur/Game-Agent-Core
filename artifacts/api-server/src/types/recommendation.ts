import { z } from "zod/v4";
import { PDD_CATEGORIES, PHASES, type PddCategory, type Phase } from "./pdd.js";
import type { RetrievedContextPackage } from "./tree.js";
import type { EngineDecision, RetrievalResult } from "./agent.js";

export const TRUST_TIERS = ["block", "warn", "pass"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

export interface Recommendation {
  category: PddCategory;
  primary: RecommendationItem;
  alternatives: RecommendationItem[]; // length 0-2
}

export interface RecommendationItem {
  toolId: string;
  score: number; // 0-100, from scoringService
  reasoning: string;
  pros: string[];
  cons: string[];
  compatibility: string;
  useCaseJustification: string;
  phase: Phase[];
}

export interface AnalysisResult {
  sessionId: string; // empty on terminated responses
  projectSummary: string;
  trustScore: number; // 0-100
  trustTier: TrustTier;
  terminated: boolean;
  retrieval: RetrievedContextPackage;
  engineDecision?: EngineDecision;
  lockedCategories?: Array<{ category: string; lockedTo: string[]; note: string }>;
  skippedCategories?: Array<{ category: string; reason: string }>;
  retryMetadata?: { retryCount: number; history: RetrievalResult["retryHistory"] };
  recommendations: Recommendation[]; // empty when terminated === true
  finalSummary: string; // markdown
}

// -- LLM response schema -------------------------------------------------------

export const ReasoningRecommendationItemSchema = z.object({
  toolId: z.string(),
  reasoning: z.string().min(1),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  compatibility: z.string().min(1),
  useCaseJustification: z.string().min(1),
});
export type ReasoningRecommendationItem = z.infer<typeof ReasoningRecommendationItemSchema>;

export const ReasoningResponseSchema = z.object({
  projectSummary: z.string().min(1),
  recommendations: z.array(
    z.object({
      category: z.enum(PDD_CATEGORIES),
      primary: ReasoningRecommendationItemSchema,
      alternatives: z.array(ReasoningRecommendationItemSchema).max(2),
    }),
  ),
  trustScore: z.number().int().min(0).max(100),
  trustRationale: z.string().min(1),
  finalSummary: z.string().min(1),
});
export type ReasoningResponse = z.infer<typeof ReasoningResponseSchema>;

function itemJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      toolId: { type: "string" },
      reasoning: { type: "string" },
      pros: { type: "array", items: { type: "string" }, minItems: 1 },
      cons: { type: "array", items: { type: "string" }, minItems: 1 },
      compatibility: { type: "string" },
      useCaseJustification: { type: "string" },
    },
    required: ["toolId", "reasoning", "pros", "cons", "compatibility", "useCaseJustification"],
  } as const;
}

export const REASONING_JSON_SCHEMA = {
  name: "advisor_reasoning_response",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      projectSummary: { type: "string" },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string", enum: [...PDD_CATEGORIES] },
            primary: itemJsonSchema(),
            alternatives: { type: "array", maxItems: 2, items: itemJsonSchema() },
          },
          required: ["category", "primary", "alternatives"],
        },
      },
      trustScore: { type: "integer", minimum: 0, maximum: 100 },
      trustRationale: { type: "string" },
      finalSummary: { type: "string" },
    },
    required: ["projectSummary", "recommendations", "trustScore", "trustRationale", "finalSummary"],
  },
  strict: true,
} as const;

// Phase mapping is read from TOOL_CATALOG and copied onto RecommendationItem
// post-LLM (LLM never invents phases).
export const PHASE_VALUES: readonly Phase[] = PHASES;
