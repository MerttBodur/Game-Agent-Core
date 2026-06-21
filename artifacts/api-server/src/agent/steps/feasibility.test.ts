import assert from "node:assert/strict";
import test from "node:test";
import { FeasibilitySchema } from "../prompts/advisorPrompts.js";

test("FeasibilitySchema accepts a decision without targetCategories", () => {
  const parsed = FeasibilitySchema.safeParse({
    feasible: true,
    reason: "Reasonable scope.",
  });
  assert.equal(parsed.success, true);
});

test("FeasibilitySchema rejects a missing reason", () => {
  const parsed = FeasibilitySchema.safeParse({ feasible: false, reason: "" });
  assert.equal(parsed.success, false);
});
