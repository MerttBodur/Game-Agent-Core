import assert from "node:assert/strict";
import test from "node:test";
import { TOOL_CATALOG, TOOL_BY_ID, toolsInCategory } from "./catalog.js";

test("catalog loads and validates against the schema", () => {
  assert.ok(TOOL_CATALOG.length >= 3);
});

test("tool ids are unique and indexed", () => {
  assert.equal(TOOL_BY_ID.size, TOOL_CATALOG.length);
  assert.equal(TOOL_BY_ID.get("unity")?.name, "Unity");
});

test("multi-membership category filtering works", () => {
  const artTools = toolsInCategory("art_asset").map((t) => t.id);
  assert.ok(artTools.includes("blender"));
  assert.ok(artTools.includes("meshy"));
});
