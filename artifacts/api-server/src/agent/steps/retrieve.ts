import { applyConstraint } from "../constraints/apply.js";
import { fetchToolsByCategory, type FetchToolsOptions } from "../../services/catalogService.js";
import { resolveConstraint } from "../../services/constraintService.js";
import type { AgentState, CandidateEntry, RetrievalResult } from "../../types/agent.js";
import { broadenCategories } from "./checkRetry.js";

export async function runRetrieve(state: AgentState): Promise<RetrievalResult> {
  if (!state.analyze) {
    throw new Error("Retrieve step requires analyze result");
  }
  if (!state.engineDecision) {
    throw new Error("Retrieve step requires engine decision");
  }

  const candidatesByCategory: Record<string, CandidateEntry> = {};
  let totalToolCount = 0;
  const activeRetry = activeRetryEntry(state);
  const priorHistory = (state.retrieval?.retryHistory ?? []).filter(
    (entry) => entry.attempt < state.retryCount,
  );
  const targetCategories =
    activeRetry?.mode === "broaden"
      ? broadenCategories(state.analyze.targetCategories, priorHistory)
      : state.analyze.targetCategories;
  const fetchOptions = activeRetry?.mode === "pre_filter" ? preFilterOptions(state) : undefined;

  for (const category of targetCategories) {
    const constraint = await resolveConstraint(category, state.engineDecision.picked);
    const verdict = applyConstraint(constraint, state.input, state.analyze.signals);

    if (verdict.type === "fetched" || verdict.type === "context") {
      const fetchedTools = await fetchToolsByCategory(category, state.engineDecision.picked, fetchOptions);
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

function activeRetryEntry(state: AgentState): RetrievalResult["retryHistory"][number] | null {
  if (state.retryCount <= 0) {
    return null;
  }

  return state.retrieval?.retryHistory.find((entry) => entry.attempt === state.retryCount) ?? null;
}

function preFilterOptions(state: AgentState): FetchToolsOptions {
  if (state.retryCount >= 2) {
    return {
      priceModels: ["free"],
      requirePlatformOverlap: state.input.platformTarget,
    };
  }

  return {
    priceModels: ["free", "freemium"],
    requirePlatformOverlap: state.input.platformTarget,
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
