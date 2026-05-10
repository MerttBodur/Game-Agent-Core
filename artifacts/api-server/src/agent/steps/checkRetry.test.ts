import assert from "node:assert/strict";
import test from "node:test";
import { checkRetry } from "./checkRetry.js";
import type { AgentState } from "../../types/agent.js";

function state(totalToolCount: number, retryCount: number): AgentState {
  return {
    retryCount,
    input: {
      projectIdea: "x",
      budget: "low",
      timeLimit: "month",
      skillLevel: "beginner",
      teamSize: "solo",
      platformTarget: ["pc"],
      artCapability: "basic",
      multiplayer: false,
    },
    retrieval: {
      candidatesByCategory: {},
      totalToolCount,
      retryHistory: [],
    },
  };
}

test("retry decision table matches count and retryCount thresholds", () => {
  const counts = [0, 2, 3, 10, 40, 41];
  const retryCounts = [0, 1, 2];
  const actual = retryCounts.map((retryCount) =>
    counts.map((count) => checkRetry(state(count, retryCount))),
  );

  assert.deepEqual(actual, [
    ["broaden", "broaden", "done", "done", "done", "pre_filter"],
    ["broaden", "broaden", "done", "done", "done", "pre_filter"],
    ["done", "done", "done", "done", "done", "done"],
  ]);
});
