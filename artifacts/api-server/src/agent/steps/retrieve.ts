import { applyConstraint } from "../constraints/apply.js";
import { fetchToolsByCategory } from "../../services/catalogService.js";
import { resolveConstraint } from "../../services/constraintService.js";
import type { AgentState, CandidateEntry, RetrievalResult } from "../../types/agent.js";

export async function runRetrieve(state: AgentState): Promise<RetrievalResult> {
  if (!state.analyze) {
    throw new Error("Retrieve step requires analyze result");
  }
  if (!state.engineDecision) {
    throw new Error("Retrieve step requires engine decision");
  }

  const candidatesByCategory: Record<string, CandidateEntry> = {};
  let totalToolCount = 0;

  for (const category of state.analyze.targetCategories) {
    const constraint = await resolveConstraint(category, state.engineDecision.picked);
    const verdict = applyConstraint(constraint, state.input, state.analyze.signals);

    if (verdict.type === "fetched" || verdict.type === "context") {
      const fetchedTools = await fetchToolsByCategory(category, state.engineDecision.picked);
      const tools =
        verdict.type === "context"
          ? filterRecommendedTools(fetchedTools, constraint?.resultJson.recommend_ids)
          : fetchedTools;
      candidatesByCategory[category] =
        verdict.type === "fetched"
          ? { type: "fetched", tools }
          : { type: "context", tools, note: verdict.note };
      totalToolCount += tools.length;
      continue;
    }

    candidatesByCategory[category] = verdict;
  }

  return {
    candidatesByCategory,
    totalToolCount,
    retryHistory: state.retrieval?.retryHistory ?? [],
  };
}

function filterRecommendedTools<T extends { id: string }>(tools: T[], recommendIds: unknown): T[] {
  if (!Array.isArray(recommendIds)) {
    return tools;
  }

  const allowed = new Set(recommendIds.filter((id): id is string => typeof id === "string"));
  if (allowed.size === 0) {
    return tools;
  }

  return tools.filter((tool) => allowed.has(tool.id));
}
