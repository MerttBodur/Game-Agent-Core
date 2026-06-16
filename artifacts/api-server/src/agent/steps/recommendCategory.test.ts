import assert from "node:assert/strict";
import test from "node:test";
import { assertCandidatesOnly } from "./recommendCategory.js";

test("passes when all ids are candidates", () => {
  assert.doesNotThrow(() =>
    assertCandidatesOnly(
      { primary: { toolId: "meshy" }, alternatives: [{ toolId: "blender" }] },
      ["meshy", "blender"],
    ),
  );
});

test("throws when a non-candidate id appears", () => {
  assert.throws(() =>
    assertCandidatesOnly({ primary: { toolId: "ghost" }, alternatives: [] }, ["meshy"]),
  );
});
