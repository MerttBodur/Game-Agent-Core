import { z } from "zod/v4";
import { openai } from "../../lib/openaiClient.js";
import type { AgentState, AnalyzeResult } from "../../types/agent.js";
import { buildAnalyzeMessages } from "../prompts/analyzePrompt.js";

const ENGINE_VALUES = ["Unity", "Unreal", "Godot", "Custom", "unknown"] as const;

export const AnalyzeResultSchema = z.object({
  targetCategories: z.array(z.string().min(1)).min(1),
  projectSummary: z.string().min(1),
  userMentionedEngine: z.enum(ENGINE_VALUES).nullable(),
  signals: z.object({
    is2D: z.boolean(),
    is3D: z.boolean(),
    targetPlatformPrimary: z.string().min(1),
    complexitySignals: z.array(z.string().min(1)),
  }),
});

export const ANALYZE_JSON_SCHEMA = {
  name: "agent_analyze_result",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      targetCategories: {
        type: "array",
        minItems: 1,
        items: { type: "string" },
      },
      projectSummary: { type: "string" },
      userMentionedEngine: {
        anyOf: [{ type: "string", enum: [...ENGINE_VALUES] }, { type: "null" }],
      },
      signals: {
        type: "object",
        additionalProperties: false,
        properties: {
          is2D: { type: "boolean" },
          is3D: { type: "boolean" },
          targetPlatformPrimary: { type: "string" },
          complexitySignals: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["is2D", "is3D", "targetPlatformPrimary", "complexitySignals"],
      },
    },
    required: ["targetCategories", "projectSummary", "userMentionedEngine", "signals"],
  },
  strict: true,
} as const;

export async function runAnalyze(state: AgentState): Promise<AnalyzeResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: buildAnalyzeMessages(state.input),
    response_format: {
      type: "json_schema",
      json_schema: ANALYZE_JSON_SCHEMA,
    },
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    throw new Error("Analyze step returned empty content");
  }

  return AnalyzeResultSchema.parse(JSON.parse(raw));
}
