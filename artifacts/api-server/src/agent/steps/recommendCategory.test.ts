import assert from "node:assert/strict";
import test from "node:test";
import { assertCandidatesOnly, formatCandidates } from "./recommendCategory.js";
import { categorySystemPrompt } from "../prompts/advisorPrompts.js";

test("passes when all ids are candidates", () => {
  assert.doesNotThrow(() =>
    assertCandidatesOnly(
      { primary: { toolId: "meshy" }, alternatives: [{ toolId: "blender" }] },
      ["meshy", "blender"],
    ),
  );
});

test("throws when a non-candidate id appears", () => {
  assert.throws(() =>
    assertCandidatesOnly({ primary: { toolId: "ghost" }, alternatives: [] }, ["meshy"]),
  );
});

test("formatCandidates separates candidates with --- and keeps full content", () => {
  const out = formatCandidates(
    [
      { metadata: { toolId: "aseprite" }, pageContent: "Aseprite\nPixel art tool\nPricing: paid" },
      { metadata: { toolId: "krita" }, pageContent: "Krita\nDigital painting\nPricing: open_source" },
    ],
    [{ pageContent: "Guidance text" }],
  );
  assert.match(out, /---/);
  assert.match(out, /aseprite/);
  assert.match(out, /krita/);
  assert.match(out, /Pricing: paid/);
});

test("categorySystemPrompt forbids fabricating attributes and guards engine-specific tools", () => {
  const p = categorySystemPrompt("art_asset");
  assert.match(p, /only/i);
  assert.match(p, /not invent|do not invent|don't invent/i);
  assert.match(p, /engine|specific/i);
  assert.doesNotMatch(p, /answerPossible/);
});

test("categorySystemPrompt has a symmetric high-budget/advanced rule favoring frontier tools", () => {
  const p = categorySystemPrompt("ai_coding");
  // The low-budget/low-skill rule must have a counterpart: high budget + advanced
  // skill should push toward frontier / highest-quality tools, not the value pick.
  assert.match(p, /high\b[\s\S]*budget|budget[\s\S]*high\b/i);
  assert.match(p, /advanced|experienced|expert/i);
  assert.match(p, /frontier|highest[- ]quality|best[- ]in[- ]class|top[- ]tier/i);
});

