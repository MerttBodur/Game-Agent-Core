import assert from "node:assert/strict";
import test from "node:test";
import { toolWhereForCategory, guidanceWhere, engineFlagKey, metadataMatchesWhere, fuseToolDocs } from "./retriever.js";
import { Document } from "@langchain/core/documents";

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

test("metadataMatchesWhere enforces category and engine OR-any", () => {
  const meta = { type: "tool", category: "art_asset", engine_unity: false, engine_any: true };
  assert.equal(metadataMatchesWhere(meta, "art_asset", "Unity"), true);
  const metaNo = { type: "tool", category: "art_asset", engine_unity: false, engine_any: false };
  assert.equal(metadataMatchesWhere(metaNo, "art_asset", "Unity"), false);
  assert.equal(metadataMatchesWhere(meta, "audio", "Unity"), false);
});

test("fuseToolDocs orders by RRF of vector and bm25 id lists", () => {
  const mk = (id: string) => new Document({ id, pageContent: id, metadata: { toolId: id } });
  const vector = [mk("a"), mk("b"), mk("c")];
  const bm25Ids = ["b", "a"];
  const fused = fuseToolDocs(vector, bm25Ids, 3);
  // 'b' is rank0 in bm25 and rank1 in vector; 'a' is rank1 bm25, rank0 vector — both beat 'c'.
  assert.deepEqual(fused.slice(0, 2).map((d) => d.metadata.toolId).sort(), ["a", "b"]);
  assert.equal(fused[2].metadata.toolId, "c");
});

test("fuseToolDocs skips bm25 ids that have no vector payload", () => {
  const mk = (id: string) => new Document({ id, pageContent: id, metadata: { toolId: id } });
  const vector = [mk("a"), mk("b")];
  const bm25Ids = ["c", "a"]; // 'c' is bm25-only, not in vector docs
  const fused = fuseToolDocs(vector, bm25Ids, 5);
  const ids = fused.map((d) => d.metadata.toolId);
  assert.ok(!ids.includes("c")); // bm25-only id is dropped (no payload)
  assert.deepEqual([...ids].sort(), ["a", "b"]);
});
