import assert from "node:assert/strict";
import test from "node:test";
import { toolDocuments, guidanceDocuments } from "./indexer.js";
import { TOOL_CATALOG } from "../catalog.js";

test("blender produces one document per category", () => {
  const docs = toolDocuments();
  const blender = docs.filter((d) => d.metadata.toolId === "blender");
  assert.ok(blender.length >= 2);
  for (const d of blender) {
    assert.equal(typeof d.metadata.category, "string");
  }
});

test("guidance docs are loaded with topic metadata", () => {
  const g = guidanceDocuments();
  assert.ok(g.length >= 4);
  assert.ok(g.every((d) => d.metadata.type === "guidance" && typeof d.metadata.topic === "string"));
});

test("cross-platform desktop tools include pc in supportedPlatforms", () => {
  const desktop = ["blender", "krita", "aseprite", "audacity", "reaper", "fmod_studio", "wwise", "autodesk_maya", "zbrush", "substance_painter"];
  for (const id of desktop) {
    const tool = TOOL_CATALOG.find((t) => t.id === id);
    assert.ok(tool, `missing tool ${id}`);
    assert.ok(tool!.supportedPlatforms.includes("pc"), `${id} should list pc`);
  }
});

test("tool documents carry platform flags and enriched content", () => {
  const blender = toolDocuments().find((d) => d.metadata.toolId === "blender");
  assert.ok(blender);
  assert.equal(blender!.metadata.platform_pc, true);
  assert.equal(typeof blender!.metadata.beginnerSuitability, "number");
  assert.equal(typeof blender!.metadata.difficultyLevel, "string");
  assert.match(blender!.pageContent, /Platforms:/);
  assert.match(blender!.pageContent, /Beginner suitability:/);
});

test("broadened catalog includes the new usability-filtered tools", () => {
  const expected = [
    "gamemaker", "construct_3", "gdevelop", "rpg_maker", "renpy", "defold", "phaser", "love2d",
    "nano_banana", "tripo", "rodin", "midjourney", "photoshop", "gimp", "clip_studio_paint", "magicavoxel",
    "kling", "opentoonz", "moho", "rive",
    "runway",
    "fl_studio", "lmms", "bosca_ceoil", "chiptone",
    "claude_code", "cline", "aider",
  ];
  const ids = new Set(TOOL_CATALOG.map((t) => t.id));
  for (const id of expected) assert.ok(ids.has(id), `missing new tool ${id}`);
  assert.equal(ids.has("leonardo_ai"), true); // dedupe: must not be duplicated
});
