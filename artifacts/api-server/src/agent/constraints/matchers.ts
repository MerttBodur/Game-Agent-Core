import type { AdvisorFormInput, AnalyzeResult } from "../../types/agent.js";

type ConditionJson = Record<string, unknown> | null;

export function matchCondition(
  condition: ConditionJson,
  input: AdvisorFormInput,
  signals: AnalyzeResult["signals"],
): boolean {
  if (!condition) {
    return true;
  }

  if (typeof condition.multiplayer === "boolean" && input.multiplayer !== condition.multiplayer) {
    return false;
  }

  if (typeof condition.teamSize === "string" && input.teamSize !== condition.teamSize) {
    return false;
  }

  const platforms = new Set(input.platformTarget);
  platforms.add(signals.targetPlatformPrimary);

  if (!matchPlatformContains(condition, platforms)) {
    return false;
  }

  if (!matchPlatformOverlap(condition, platforms)) {
    return false;
  }

  return true;
}

function matchPlatformContains(condition: Record<string, unknown>, platforms: Set<string>): boolean {
  const raw = condition.platformContains;
  if (typeof raw === "string") {
    return platforms.has(raw);
  }
  if (Array.isArray(raw)) {
    return raw.every((entry) => typeof entry === "string" && platforms.has(entry));
  }
  return true;
}

function matchPlatformOverlap(condition: Record<string, unknown>, platforms: Set<string>): boolean {
  const raw = condition.platformOverlap;
  if (typeof raw === "string") {
    return platforms.has(raw);
  }
  if (Array.isArray(raw)) {
    return raw.some((entry) => typeof entry === "string" && platforms.has(entry));
  }
  return true;
}
