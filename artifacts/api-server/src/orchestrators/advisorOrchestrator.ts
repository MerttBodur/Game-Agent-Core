import { randomUUID } from "node:crypto";
import { retrieveContext } from "../lib/rag/treeNavigator.js";
import { reason } from "../services/reasoningService.js";
import { persistSession } from "../services/sessionService.js";
import type { AnalysisResult } from "../types/recommendation.js";

export interface AdvisorInput {
  projectIdea: string;
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: string;
  platformTarget: string[];
  artCapability: string;
  otherConstraints?: string | null;
  pinnedToolIds?: string[];
}

export type AdvisorEvent =
  | { type: "retrieval_complete"; retrieval: AnalysisResult["retrieval"] }
  | { type: "done"; result: AnalysisResult };

export async function runAdvisorPipeline(
  input: AdvisorInput,
  emit: (event: AdvisorEvent) => void,
): Promise<AnalysisResult> {
  const retrieval = await retrieveContext(input);
  emit({ type: "retrieval_complete", retrieval });

  const reasoning = await reason(
    {
      projectIdea: input.projectIdea,
      budget: input.budget,
      timeLimit: input.timeLimit,
      skillLevel: input.skillLevel,
      teamSize: input.teamSize,
      platformTarget: input.platformTarget,
      artCapability: input.artCapability,
      otherConstraints: input.otherConstraints,
      pinnedToolIds: input.pinnedToolIds ?? [],
    },
    retrieval,
  );

  const terminated = reasoning.trustTier === "block";
  const sessionId = terminated ? "" : randomUUID();
  const result: AnalysisResult = { ...reasoning, sessionId, terminated };

  if (!terminated) {
    await persistSession({
      id: sessionId,
      inputs: input as unknown as Record<string, unknown>,
      result,
    });
  }

  emit({ type: "done", result });
  return result;
}
