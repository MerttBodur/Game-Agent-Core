import { randomUUID } from "node:crypto";
import { runFeasibility } from "../agent/steps/feasibility.js";
import { runPickEngine } from "../agent/steps/pickEngineRag.js";
import { recommendCategory } from "../agent/steps/recommendCategory.js";
import { runScoreStack } from "../agent/steps/scoreStack.js";
import { persistSession } from "../services/sessionService.js";
import type {
  AdvisorInput,
  AnalysisResult,
  CategoryRecommendation,
  EngineDecision,
} from "../types/advisor.js";
import { NON_ENGINE_CATEGORIES } from "../types/catalog.js";

export type AdvisorEvent =
  | { type: "feasibility_complete"; targetCategories: readonly string[] }
  | { type: "feasibility_blocked"; reason: string }
  | { type: "engine_picked"; engineDecision: EngineDecision }
  | { type: "category_recommended"; category: string; primaryToolId: string }
  | { type: "done"; result: AnalysisResult };

export async function runAdvisorPipeline(
  input: AdvisorInput,
  emit: (event: AdvisorEvent) => void,
): Promise<AnalysisResult> {
  const feasibility = await runFeasibility(input);

  if (!feasibility.feasible) {
    const result: AnalysisResult = {
      sessionId: "",
      feasible: false,
      reason: feasibility.reason,
      terminated: true,
      projectSummary: "",
      recommendations: [],
      finalSummary: "",
    };
    emit({ type: "feasibility_blocked", reason: feasibility.reason });
    emit({ type: "done", result });
    return result;
  }
  emit({ type: "feasibility_complete", targetCategories: NON_ENGINE_CATEGORIES });

  const engineDecision = await runPickEngine(input);
  emit({ type: "engine_picked", engineDecision });

  const recs: CategoryRecommendation[] = [];
  for (const category of NON_ENGINE_CATEGORIES) {
    const rec = await recommendCategory(input, category, engineDecision.picked);
    recs.push(rec);
    emit({ type: "category_recommended", category, primaryToolId: rec.primary.toolId });
  }

  const { projectSummary, finalSummary, recommendations } = await runScoreStack(
    input,
    recs,
    engineDecision.picked,
  );

  const sessionId = randomUUID();
  const result: AnalysisResult = {
    sessionId,
    feasible: true,
    reason: feasibility.reason,
    terminated: false,
    projectSummary,
    engineDecision,
    recommendations,
    finalSummary,
  };
  try {
    await persistSession({
      id: sessionId,
      inputs: input as unknown as Record<string, unknown>,
      result,
    });
  } catch (error) {
    console.warn("[advisor] analysis completed but session persistence failed", error);
  }

  emit({ type: "done", result });
  return result;
}
