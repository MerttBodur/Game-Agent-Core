import assert from "node:assert/strict";
import test from "node:test";
import { tokenize, buildBm25, rrfFuse } from "./bm25.js";

test("tokenize lowercases and splits on non-word characters", () => {
  assert.deepEqual(tokenize("Pixel-Art, Sprite!"), ["pixel", "art", "sprite"]);
});

test("bm25 ranks the doc containing the query term first", () => {
  const idx = buildBm25([
    { id: "aseprite", text: "pixel art sprite animation tool" },
    { id: "fmod", text: "audio middleware sound engine" },
    { id: "blender", text: "3d modeling sculpting animation" },
  ]);
  const hits = idx.search("pixel art", 3);
  assert.equal(hits[0].id, "aseprite");
});

test("bm25 returns at most k results", () => {
  const idx = buildBm25([
    { id: "a", text: "alpha" },
    { id: "b", text: "alpha beta" },
    { id: "c", text: "alpha beta gamma" },
  ]);
  assert.equal(idx.search("alpha", 2).length, 2);
});

test("rrfFuse ranks an id appearing high in both lists above one in a single list", () => {
  const fused = rrfFuse([
    ["x", "y", "z"],
    ["y", "x", "w"],
  ]);
  // y is rank0+rank1, x is rank1+rank0 — both beat z and w which appear once.
  assert.deepEqual(fused.slice(0, 2).sort(), ["x", "y"]);
  assert.ok(fused.indexOf("z") > 1 && fused.indexOf("w") > 1);
});

test("rrfFuse dedupes ids", () => {
  const fused = rrfFuse([["a", "b"], ["a", "b"]]);
  assert.deepEqual([...fused].sort(), ["a", "b"]);
});
