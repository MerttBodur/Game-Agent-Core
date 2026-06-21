import assert from "node:assert/strict";
import test from "node:test";
import { ENGINE_IDS, isEngineId } from "./engines.js";

test("ENGINE_IDS contains every game_engine catalog id", () => {
  assert.ok(ENGINE_IDS.includes("unity"));
  assert.ok(ENGINE_IDS.includes("unreal_engine"));
  assert.ok(ENGINE_IDS.includes("godot"));
  assert.ok(ENGINE_IDS.includes("phaser"));
  assert.ok(ENGINE_IDS.includes("threejs"));
});

test("ENGINE_IDS excludes non-engine tools", () => {
  assert.ok(!ENGINE_IDS.includes("blender"));
  assert.ok(!ENGINE_IDS.includes("claude_code"));
});

test("isEngineId recognizes catalog engines and rejects others", () => {
  assert.equal(isEngineId("godot"), true);
  assert.equal(isEngineId("cryengine"), false);
});
