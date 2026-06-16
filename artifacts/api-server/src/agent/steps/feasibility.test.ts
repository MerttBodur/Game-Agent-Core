import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFeasibility } from "./feasibility.js";

test("blocked decision drops targetCategories", () => {
  const out = normalizeFeasibility({
    feasible: false,
    reason: "Too ambitious for a solo dev in a week.",
    targetCategories: ["art_asset", "audio"],
  });
  assert.deepEqual(out.targetCategories, []);
});

test("feasible decision keeps targetCategories", () => {
  const out = normalizeFeasibility({
    feasible: true,
    reason: "Reasonable scope.",
    targetCategories: ["audio"],
  });
  assert.deepEqual(out.targetCategories, ["audio"]);
});
