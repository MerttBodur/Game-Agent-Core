import assert from "node:assert/strict";
import test from "node:test";
import { scoreTool, type ScoringContext } from "./scoring.js";
import type { ToolEntry } from "../types/catalog.js";

const meshy: ToolEntry = {
  id: "meshy", name: "Meshy", categories: ["art_asset"], description: "x", bestUseCase: "x",
  toolNature: "ai", learningCurve: "low", engineCompatibility: ["any"], pricing: "freemium",
  difficultyLevel: "beginner", beginnerSuitability: 90, supportedPlatforms: ["web"],
  pros: ["x"], cons: ["x"],
};
const blender: ToolEntry = {
  ...meshy, id: "blender", name: "Blender", toolNature: "traditional", learningCurve: "high",
  pricing: "open_source", difficultyLevel: "advanced", beginnerSuitability: 30, supportedPlatforms: ["pc"],
};

const weakArtLowBudget: ScoringContext = {
  budget: "low", skillLevel: "beginner", artCapability: "none",
  platformTarget: ["pc"], pickedEngine: "Unity", category: "art_asset",
};

test("scores are clamped to 0-10", () => {
  const s = scoreTool(meshy, weakArtLowBudget);
  assert.ok(s >= 0 && s <= 10);
});

test("AI low-curve tool beats high-curve tool for weak-art + low-budget", () => {
  assert.ok(scoreTool(meshy, weakArtLowBudget) > scoreTool(blender, weakArtLowBudget));
});

test("engine-incompatible non-any tool scores low for art_asset regardless of engine", () => {
  // For non-game_engine categories, only "any" compatibility earns full engineFit.
  // A Unity-only tool scores 0.2 whether the picked engine is unity or unreal_engine.
  const unityOnly: ToolEntry = { ...blender, engineCompatibility: ["Unity"] };
  const forUnreal: ScoringContext = { ...weakArtLowBudget, pickedEngine: "unreal_engine", category: "art_asset" };
  const forUnity: ScoringContext = { ...weakArtLowBudget, pickedEngine: "unity", category: "art_asset" };
  assert.equal(scoreTool(unityOnly, forUnity), scoreTool(unityOnly, forUnreal));
});

test("any-compatible tool scores higher than engine-specific tool for art_asset", () => {
  const anyCompat: ToolEntry = { ...blender, engineCompatibility: ["any"] };
  const unityOnly: ToolEntry = { ...blender, engineCompatibility: ["Unity"] };
  const ctx: ScoringContext = { ...weakArtLowBudget, pickedEngine: "unity", category: "art_asset" };
  assert.ok(scoreTool(anyCompat, ctx) > scoreTool(unityOnly, ctx));
});

test("a tool outside the budget tier is penalized", () => {
  const paidTool: ToolEntry = { ...blender, pricing: "subscription" };
  const freeTool: ToolEntry = { ...blender, pricing: "open_source" };
  assert.ok(scoreTool(freeTool, weakArtLowBudget) > scoreTool(paidTool, weakArtLowBudget));
});
