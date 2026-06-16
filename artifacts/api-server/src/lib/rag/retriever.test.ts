import assert from "node:assert/strict";
import test from "node:test";
import { toolWhereForCategory, guidanceWhere, engineFlagKey } from "./retriever.js";

test("engineFlagKey maps engine names to boolean metadata keys", () => {
  assert.equal(engineFlagKey("Unreal"), "engine_unreal");
});

test("category where without engine omits the engine clause", () => {
  assert.deepEqual(toolWhereForCategory("audio"), {
    $and: [{ type: { $eq: "tool" } }, { category: { $eq: "audio" } }],
  });
});

test("category where with engine includes picked OR any", () => {
  const where = toolWhereForCategory("art_asset", "Unity") as { $and: unknown[] };
  assert.deepEqual(where.$and[2], { $or: [{ engine_unity: { $eq: true } }, { engine_any: { $eq: true } }] });
});

test("guidanceWhere filters by topic when provided", () => {
  assert.deepEqual(guidanceWhere("x"), { $and: [{ type: { $eq: "guidance" } }, { topic: { $eq: "x" } }] });
});
