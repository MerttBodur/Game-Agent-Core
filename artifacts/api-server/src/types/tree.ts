import { z } from "zod/v4";
import { PDD_CATEGORIES, type PddCategory } from "./pdd.js";

// -- Tree shape ---------------------------------------------------------------

export interface ToolTreeLeaf {
  node_id: string;
  title: string;
  summary: string;
  ref: { toolId: string };
}

export interface ToolTreeCategoryNode {
  node_id: string;
  title: string;
  summary: string;
  category: PddCategory;
  nodes: ToolTreeLeaf[];
}

export interface ToolTree {
  node_id: "root";
  title: string;
  summary: string;
  nodes: ToolTreeCategoryNode[];
}

// -- Retrieval package (returned to advisor pipeline) -------------------------

export type FallbackStatus = "ok" | "weak_coverage" | "ambiguous_input" | "missing_domain";

export interface RetrievedContextPackage {
  relevantCategories: PddCategory[];
  candidateTools: Array<{ toolId: string; nodePath: string; fitNote: string }>;
  rejectedTools: Array<{ toolId: string; reason: string }>;
  missingInformationNotes: string[];
  retrievalConfidence: number;
  fallbackStatus: FallbackStatus;
}

// -- LLM response schema (validated post-call) --------------------------------

export const ToolMarking = z.enum(["strong", "conditional", "weak", "reject"]);
export type ToolMarking = z.infer<typeof ToolMarking>;

export const LlmRetrievalResponseSchema = z.object({
  selectedCategories: z.array(
    z.object({
      category: z.string(),
      reason: z.string().min(1),
    }),
  ),
  toolEvaluations: z.array(
    z.object({
      toolId: z.string(),
      marking: ToolMarking,
      fitNote: z.string().min(1),
    }),
  ),
});
export type LlmRetrievalResponse = z.infer<typeof LlmRetrievalResponseSchema>;

// JSON Schema literal for OpenAI structured output. Mirrors LlmRetrievalResponseSchema.
export const LLM_RETRIEVAL_JSON_SCHEMA = {
  name: "tool_retrieval_response",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      selectedCategories: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string", enum: [...PDD_CATEGORIES] },
            reason: { type: "string" },
          },
          required: ["category", "reason"],
        },
      },
      toolEvaluations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            toolId: { type: "string" },
            marking: { type: "string", enum: ["strong", "conditional", "weak", "reject"] },
            fitNote: { type: "string" },
          },
          required: ["toolId", "marking", "fitNote"],
        },
      },
    },
    required: ["selectedCategories", "toolEvaluations"],
  },
  strict: true,
} as const;
