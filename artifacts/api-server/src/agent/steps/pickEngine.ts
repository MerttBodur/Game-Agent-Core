import { z } from "zod/v4";
import { openai } from "../../lib/openaiClient.js";
import type { AgentState, EngineDecision } from "../../types/agent.js";
import { buildPickEngineMessages } from "../prompts/pickEnginePrompt.js";

const ENGINE_VALUES = ["Unity", "Unreal", "Godot", "Custom", "unknown"] as const;
const PICKED_ENGINE_VALUES = ["Unity", "Unreal", "Godot", "Custom"] as const;
const AGREEMENT_VALUES = ["agreed", "challenged", "user_silent"] as const;

export const EngineDecisionSchema = z.object({
  picked: z.enum(PICKED_ENGINE_VALUES),
  userPreferred: z.enum(ENGINE_VALUES).nullable(),
  agreement: z.enum(AGREEMENT_VALUES),
  reasoning: z.string().min(1),
  alternativesConsidered: z.array(
    z.object({
      engine: z.enum(ENGINE_VALUES),
      reasonRejected: z.string().min(1),
    }),
  ),
});

export const PICK_ENGINE_JSON_SCHEMA = {
  name: "agent_engine_decision",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      picked: { type: "string", enum: [...PICKED_ENGINE_VALUES] },
      userPreferred: {
        anyOf: [{ type: "string", enum: [...ENGINE_VALUES] }, { type: "null" }],
      },
      agreement: { type: "string", enum: [...AGREEMENT_VALUES] },
      reasoning: { type: "string" },
      alternativesConsidered: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            engine: { type: "string", enum: [...ENGINE_VALUES] },
            reasonRejected: { type: "string" },
          },
          required: ["engine", "reasonRejected"],
        },
      },
    },
    required: ["picked", "userPreferred", "agreement", "reasoning", "alternativesConsidered"],
  },
  strict: true,
} as const;

export async function runPickEngine(state: AgentState): Promise<EngineDecision> {
  if (!state.analyze) {
    throw new Error("Pick engine step requires analyze result");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: buildPickEngineMessages(state),
    response_format: {
      type: "json_schema",
      json_schema: PICK_ENGINE_JSON_SCHEMA,
    },
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    throw new Error("Pick engine step returned empty content");
  }

  const parsed = EngineDecisionSchema.parse(JSON.parse(raw));
  assertAgreementInvariant(state, parsed);
  return parsed;
}

function assertAgreementInvariant(state: AgentState, decision: EngineDecision): void {
  const userMentionedEngine = state.analyze?.userMentionedEngine ?? null;

  if (userMentionedEngine === null && decision.agreement !== "user_silent") {
    throw new Error("Engine decision agreement must be user_silent when no engine was mentioned");
  }

  if (userMentionedEngine !== null && decision.userPreferred !== userMentionedEngine) {
    throw new Error("Engine decision userPreferred must match analyze.userMentionedEngine");
  }

  if (userMentionedEngine !== null && decision.picked === userMentionedEngine && decision.agreement !== "agreed") {
    throw new Error("Engine decision agreement must be agreed when picked engine matches user preference");
  }

  if (userMentionedEngine !== null && decision.picked !== userMentionedEngine && decision.agreement !== "challenged") {
    throw new Error("Engine decision agreement must be challenged when picked engine differs from user preference");
  }
}
