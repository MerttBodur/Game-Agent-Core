import type { AgentState, AdvisorFormInput, RetrievalResult } from "../types/agent.js";

export function createAgentState(input: AdvisorFormInput): AgentState {
  return {
    input,
    retryCount: 0,
  };
}

export function lockedCategoriesFromRetrieval(retrieval: RetrievalResult) {
  return Object.entries(retrieval.candidatesByCategory)
    .filter(([, entry]) => entry.type === "locked")
    .map(([category, entry]) => ({
      category,
      lockedTo: entry.type === "locked" ? entry.lockedTo : [],
      note: entry.type === "locked" ? entry.note : "",
    }));
}

export function skippedCategoriesFromRetrieval(retrieval: RetrievalResult) {
  return Object.entries(retrieval.candidatesByCategory)
    .filter(([, entry]) => entry.type === "skipped")
    .map(([category, entry]) => ({
      category,
      reason: entry.type === "skipped" ? entry.reason : "",
    }));
}
