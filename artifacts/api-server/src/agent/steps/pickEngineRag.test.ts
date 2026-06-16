import assert from "node:assert/strict";
import test from "node:test";
import {
  assertEngineInvariant,
  detectUserPreferredEngine,
  normalizeEngineDecision,
} from "./pickEngineRag.js";

test("user_silent required when no engine mentioned", () => {
  assert.throws(() =>
    assertEngineInvariant({
      picked: "Unity",
      userPreferred: null,
      agreement: "agreed",
      reasoning: "x",
      alternativesConsidered: [],
    }),
  );
});

test("challenged required when picked differs from preference", () => {
  assert.throws(() =>
    assertEngineInvariant({
      picked: "Godot",
      userPreferred: "Unreal",
      agreement: "agreed",
      reasoning: "x",
      alternativesConsidered: [],
    }),
  );
});

test("valid agreed decision passes", () => {
  assert.doesNotThrow(() =>
    assertEngineInvariant({
      picked: "Unity",
      userPreferred: "Unity",
      agreement: "agreed",
      reasoning: "x",
      alternativesConsidered: [],
    }),
  );
});

test("detects explicit engine preference from project idea", () => {
  assert.equal(detectUserPreferredEngine("I want to make a mobile roguelite in Godot."), "Godot");
  assert.equal(detectUserPreferredEngine("Build this with UE5 and stylized 3D art."), "Unreal");
});

test("does not treat absent engine as a user preference", () => {
  const decision = normalizeEngineDecision(
    {
      picked: "Godot",
      userPreferred: "Godot",
      agreement: "agreed",
      reasoning: "x",
      alternativesConsidered: [],
    },
    "A cozy farming game for PC and web with simple 2D art.",
  );

  assert.equal(decision.userPreferred, null);
  assert.equal(decision.agreement, "user_silent");
});

test("normalizes challenged agreement when picked engine differs from explicit preference", () => {
  const decision = normalizeEngineDecision(
    {
      picked: "Godot",
      userPreferred: null,
      agreement: "user_silent",
      reasoning: "x",
      alternativesConsidered: [],
    },
    "I prefer Unreal Engine for a small 2D puzzle game.",
  );

  assert.equal(decision.userPreferred, "Unreal");
  assert.equal(decision.agreement, "challenged");
});
