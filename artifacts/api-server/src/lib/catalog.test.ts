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

test("Three.js is in the catalog as a web 3D game engine", () => {
  const t = TOOL_BY_ID.get("threejs");
  assert.ok(t, "threejs must exist");
  assert.ok(t!.categories.includes("game_engine"));
  assert.deepEqual(t!.supportedPlatforms, ["web"]);
  assert.equal(t!.pricing, "open_source");
  assert.equal(t!.learningCurve, "high");
  assert.match(t!.description, /3D/);
});

test("ChatGPT Codex and Gemini are AI coding tools", () => {
  const ids = toolsInCategory("ai_coding").map((t) => t.id);
  assert.ok(ids.includes("chatgpt_codex"));
  assert.ok(ids.includes("gemini_code_assist"));
});

test("Claude Code pricing reflects token-usage cost", () => {
  const claude = TOOL_BY_ID.get("claude_code");
  assert.ok(claude);
  assert.equal(claude!.pricing, "subscription");
  // token-cost caution surfaced in cons text
  assert.ok(claude!.cons.some((c) => /token|expensive|cost/i.test(c)));
});
