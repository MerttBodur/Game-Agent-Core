import assert from "node:assert/strict";
import test from "node:test";
import { applyConstraint } from "./apply.js";
import type { AdvisorFormInput, AnalyzeResult } from "../../types/agent.js";
import type { ConstraintRow } from "../../services/constraintService.js";

const input: AdvisorFormInput = {
  projectIdea: "2D co-op dungeon crawler",
  budget: "low",
  timeLimit: "quarter",
  skillLevel: "intermediate",
  teamSize: "team",
  platformTarget: ["pc"],
  artCapability: "basic",
  multiplayer: true,
  otherConstraints: null,
};

const signals: AnalyzeResult["signals"] = {
  is2D: true,
  is3D: false,
  targetPlatformPrimary: "pc",
  complexitySignals: [],
};

function row(overrides: Partial<ConstraintRow>): ConstraintRow {
  return {
    id: 1,
    engine: "*",
    category: "networking",
    constraintType: "feature_required",
    conditionJson: null,
    resultJson: {},
    priority: 0,
    ...overrides,
  };
}

test("no constraint fetches independent categories", () => {
  assert.equal(applyConstraint(null, input, signals).type, "fetched");
});

test("engine_locked always locks to result_json lockedTo", () => {
  const verdict = applyConstraint(
    row({
      constraintType: "engine_locked",
      resultJson: { lockedTo: ["C#"], note: "Unity locks language." },
    }),
    input,
    signals,
  );

  assert.deepEqual(verdict, { type: "locked", lockedTo: ["C#"], note: "Unity locks language." });
});

test("feature_required fetches when condition matches and skips otherwise", () => {
  assert.equal(
    applyConstraint(
      row({
        constraintType: "feature_required",
        conditionJson: { multiplayer: true },
        resultJson: { reason: "No multiplayer." },
      }),
      input,
      signals,
    ).type,
    "fetched",
  );

  assert.deepEqual(
    applyConstraint(
      row({
        constraintType: "feature_required",
        conditionJson: { multiplayer: false },
        resultJson: { reason: "No multiplayer." },
      }),
      input,
      signals,
    ),
    { type: "skipped", reason: "No multiplayer." },
  );
});

test("context_dependent returns context only when condition matches", () => {
  assert.deepEqual(
    applyConstraint(
      row({
        constraintType: "context_dependent",
        conditionJson: { teamSize: "team" },
        resultJson: { note: "Team workflow." },
      }),
      input,
      signals,
    ),
    { type: "context", tools: [], note: "Team workflow." },
  );

  assert.equal(
    applyConstraint(
      row({
        constraintType: "context_dependent",
        conditionJson: { platformContains: "mobile" },
        resultJson: { note: "Mobile workflow." },
      }),
      input,
      signals,
    ).type,
    "fetched",
  );
});
