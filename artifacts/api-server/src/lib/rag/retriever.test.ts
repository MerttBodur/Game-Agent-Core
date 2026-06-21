import assert from "node:assert/strict";
import test from "node:test";
import { toolWhereForCategory, guidanceWhere, metadataMatchesWhere, fuseToolDocs } from "./retriever.js";
import type { RetrievedCandidates } from "./retriever.js";
import { Document } from "@langchain/core/documents";

test("category where filters by type and category", () => {
  assert.deepEqual(toolWhereForCategory("audio"), {
    $and: [{ type: { $eq: "tool" } }, { category: { $eq: "audio" } }],
  });
});

test("guidanceWhere filters by topic when provided", () => {
  assert.deepEqual(guidanceWhere("x"), { $and: [{ type: { $eq: "guidance" } }, { topic: { $eq: "x" } }] });
});

test("metadataMatchesWhere enforces type and category only", () => {
  const meta = { type: "tool", category: "art_asset" };
  assert.equal(metadataMatchesWhere(meta, "art_asset"), true);
  assert.equal(metadataMatchesWhere(meta, "audio"), false);
  assert.equal(metadataMatchesWhere({ type: "guidance", category: "art_asset" }, "art_asset"), false);
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

test("RetrievedCandidates includes the top BM25 score signal", () => {
  const sample: RetrievedCandidates = {
    toolDocs: [],
    guidanceDocs: [],
    toolIds: [],
    topBm25Score: 1.25,
  };
  assert.equal(sample.topBm25Score, 1.25);
});
