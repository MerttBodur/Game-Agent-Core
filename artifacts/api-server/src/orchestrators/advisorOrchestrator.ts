import { randomUUID } from "node:crypto";
import { runAnalyze } from "../agent/steps/analyze.js";
import { appendRetryHistory, checkRetry } from "../agent/steps/checkRetry.js";
import { runPickEngine } from "../agent/steps/pickEngine.js";
import { runRecommend } from "../agent/steps/recommend.js";
import { runRetrieve } from "../agent/steps/retrieve.js";
import {
  createAgentState,
  lockedCategoriesFromRetrieval,
  skippedCategoriesFromRetrieval,
} from "../agent/state.js";
import { persistSession } from "../services/sessionService.js";
import { TRUST_SCORE_BLOCK_THRESHOLD, trustTierFor } from "../services/scoringService.js";
import type {
  AdvisorFormInput,
  AnalyzeResult,
  EngineDecision,
  RetrievalResult,
  RetryMode,
} from "../types/agent.js";
import type { AnalysisResult } from "../types/recommendation.js";

export type AdvisorInput = Omit<AdvisorFormInput, "teamSize" | "multiplayer"> & {
  teamSize: string;
  multiplayer?: boolean;
  paidPriorityCategories?: string[];
  adviseAnyway?: boolean;
};

export type AdvisorEvent =
  | { type: "analyze_complete"; analyze: AnalyzeResult }
  | { type: "engine_picked"; engineDecision: EngineDecision }
  | { type: "retrieval_retry"; retry: { mode: RetryMode; attempt: number; previousCount: number } }
  | { type: "retrieval_complete"; retrieval: RetrievalCompletePayload }
  | { type: "done"; result: AnalysisResult };

export interface RetrievalCompletePayload {
  totalToolCount: number;
  retryCount: number;
  lockedCategories: Array<{ category: string; lockedTo: string[]; note: string }>;
  skippedCategories: Array<{ category: string; reason: string }>;
}

export async function runAdvisorPipeline(
  input: AdvisorInput,
  emit: (event: AdvisorEvent) => void,
): Promise<AnalysisResult> {
  let state = createAgentState(normalizeInput(input));

  const analyze = await runAnalyze(state);
  state = { ...state, analyze };
  emit({ type: "analyze_complete", analyze });

  const engineDecision = await runPickEngine(state);
  state = { ...state, engineDecision };
  emit({ type: "engine_picked", engineDecision });

  while (true) {
    const retrieval = await runRetrieve(state);
    state = { ...state, retrieval };

    const next = checkRetry(state);
    if (next === "done" || state.retryCount >= 2) {
      break;
    }

    const previousCount = retrieval.totalToolCount;
    const retryHistory = appendRetryHistory(state, next);
    state = {
      ...state,
      retryCount: state.retryCount + 1,
      retrieval: { ...retrieval, retryHistory },
    };
    emit({
      type: "retrieval_retry",
      retry: { mode: next, attempt: state.retryCount, previousCount },
    });
  }

  if (!state.retrieval) {
    throw new Error("Advisor pipeline completed retrieval loop without retrieval");
  }

  emit({ type: "retrieval_complete", retrieval: summarizeRetrieval(state.retrieval, state.retryCount) });

  const recommended = await runRecommend(state);
  const result = await applyTrustGateAndPersist(input, recommended);

  emit({ type: "done", result });
  return result;
}

function normalizeInput(input: AdvisorInput): AdvisorFormInput {
  return {
    projectIdea: input.projectIdea,
    budget: input.budget,
    timeLimit: input.timeLimit,
    skillLevel: input.skillLevel,
    teamSize: input.teamSize === "solo" ? "solo" : "team",
    platformTarget: input.platformTarget,
    artCapability: input.artCapability,
    multiplayer: input.multiplayer ?? false,
    otherConstraints: input.otherConstraints,
    pinnedToolIds: input.pinnedToolIds,
  };
}

function summarizeRetrieval(retrieval: RetrievalResult, retryCount: number): RetrievalCompletePayload {
  return {
    totalToolCount: retrieval.totalToolCount,
    retryCount,
    lockedCategories: lockedCategoriesFromRetrieval(retrieval),
    skippedCategories: skippedCategoriesFromRetrieval(retrieval),
  };
}

async function applyTrustGateAndPersist(
  input: AdvisorInput,
  result: AnalysisResult,
): Promise<AnalysisResult> {
  const terminated = result.trustScore < TRUST_SCORE_BLOCK_THRESHOLD;
  const sessionId = terminated ? "" : randomUUID();
  const gated: AnalysisResult = {
    ...result,
    sessionId,
    terminated,
    trustTier: trustTierFor(result.trustScore),
    recommendations: terminated ? [] : result.recommendations,
  };

  if (!terminated) {
    await persistSession({
      id: sessionId,
      inputs: input as unknown as Record<string, unknown>,
      result: gated,
    });
  }

  return gated;
}
