import type { CandidateEntry } from "../../types/agent.js";
import type { ConstraintRow } from "../../services/constraintService.js";
import { matchCondition } from "./matchers.js";
import type { AdvisorFormInput, AnalyzeResult } from "../../types/agent.js";

export function applyConstraint(
  constraint: ConstraintRow | null,
  input: AdvisorFormInput,
  signals: AnalyzeResult["signals"],
): CandidateEntry {
  if (!constraint) {
    return { type: "fetched", tools: [] };
  }

  const conditionMatched = matchCondition(constraint.conditionJson, input, signals);

  switch (constraint.constraintType) {
    case "engine_locked":
      return {
        type: "locked",
        lockedTo: toStringArray(constraint.resultJson.lockedTo),
        note: toString(constraint.resultJson.note) ?? "",
      };
    case "feature_required":
      if (conditionMatched) {
        return { type: "fetched", tools: [] };
      }
      return {
        type: "skipped",
        reason: toString(constraint.resultJson.reason) ?? "Kategori kosullari saglanmadi.",
      };
    case "context_dependent":
      if (conditionMatched) {
        return {
          type: "context",
          tools: [],
          note: toString(constraint.resultJson.note) ?? "",
        };
      }
      return { type: "fetched", tools: [] };
    default:
      return { type: "fetched", tools: [] };
  }
}

function toString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}
