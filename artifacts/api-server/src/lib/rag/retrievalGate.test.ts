import assert from "node:assert/strict";
import test from "node:test";
import { confidenceGate, MIN_BM25_SCORE, MIN_CHUNKS_REQUIRED } from "./retrievalGate.js";

test("passes with chunks and a top score above the floor", () => {
  const out = confidenceGate(3, MIN_BM25_SCORE + 1, {});
  assert.equal(out.passed, true);
});

test("blocks when no chunks were retrieved", () => {
  const out = confidenceGate(0, 0, {});
  assert.equal(out.passed, false);
  assert.equal(out.reason, "no_chunks");
});

test("blocks when fewer than the required chunks", () => {
  const out = confidenceGate(MIN_CHUNKS_REQUIRED - 1, MIN_BM25_SCORE + 5, {});
  assert.equal(out.passed, false);
});

test("blocks when top score is below the floor", () => {
  const out = confidenceGate(3, MIN_BM25_SCORE - 0.001, {});
  assert.equal(out.passed, false);
  assert.match(out.reason ?? "", /low_confidence/);
});

test("respects an explicit minScore override", () => {
  const out = confidenceGate(3, 2, { minScore: 5 });
  assert.equal(out.passed, false);
});
