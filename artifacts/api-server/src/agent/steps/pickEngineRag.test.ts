import assert from "node:assert/strict";
import test from "node:test";
import { assertEngineInvariant } from "./pickEngineRag.js";

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
