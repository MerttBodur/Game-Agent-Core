import assert from "node:assert/strict";
import test from "node:test";
import { broadenCategories } from "./checkRetry.js";
import type { ToolTree } from "../../types/tree.js";

const fixtureTree: ToolTree = {
  node_id: "root",
  title: "root",
  summary: "root",
  nodes: [
    {
      node_id: "cat.engine",
      title: "Engine",
      summary: "Engine",
      category: "game_engine",
      nodes: [
        { node_id: "tool.godot", title: "Godot", summary: "Godot", ref: { toolId: "godot" } },
        { node_id: "tool.unity", title: "Unity", summary: "Unity", ref: { toolId: "unity" } },
      ],
    },
    {
      node_id: "cat.audio",
      title: "Audio",
      summary: "Audio",
      category: "audio",
      nodes: [
        { node_id: "tool.audacity", title: "Audacity", summary: "Audacity", ref: { toolId: "audacity" } },
      ],
    },
  ],
};

test("broadening adds sibling leaves without climbing ancestors", () => {
  assert.deepEqual(broadenCategories(["godot"], [], fixtureTree).sort(), ["godot", "unity"]);
});

test("broadening a leaf alone under its parent adds no ancestors", () => {
  assert.deepEqual(broadenCategories(["audacity"], [], fixtureTree), ["audacity"]);
});

test("already-broadened categories are not broadened again", () => {
  assert.deepEqual(
    broadenCategories(
      ["godot"],
      [{ attempt: 1, mode: "broaden", countBefore: 0, categories: ["godot"] }],
      fixtureTree,
    ),
    ["godot"],
  );
});
