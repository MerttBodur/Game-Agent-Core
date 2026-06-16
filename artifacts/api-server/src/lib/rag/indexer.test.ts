import assert from "node:assert/strict";
import test from "node:test";
import { toolDocuments, guidanceDocuments } from "./indexer.js";

test("blender produces one document per category", () => {
  const docs = toolDocuments();
  const blender = docs.filter((d) => d.metadata.toolId === "blender");
  assert.ok(blender.length >= 2);
  for (const d of blender) {
    assert.equal(typeof d.metadata.category, "string");
    assert.equal(d.metadata.engine_any, true);
  }
});

test("engine docs flatten compatibility into booleans", () => {
  const unity = toolDocuments().find((d) => d.metadata.toolId === "unity");
  assert.equal(unity?.metadata.engine_unity, true);
  assert.equal(unity?.metadata.engine_unreal, false);
});

test("guidance docs are loaded with topic metadata", () => {
  const g = guidanceDocuments();
  assert.ok(g.length >= 4);
  assert.ok(g.every((d) => d.metadata.type === "guidance" && typeof d.metadata.topic === "string"));
});
