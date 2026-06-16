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
  platformTarget: ["pc"], pickedEngine: "Unity", category: "art_asset", paidPriorityCategories: [],
};

test("scores are clamped to 0-10", () => {
  const s = scoreTool(meshy, weakArtLowBudget);
  assert.ok(s >= 0 && s <= 10);
});

test("AI low-curve tool beats high-curve tool for weak-art + low-budget", () => {
  assert.ok(scoreTool(meshy, weakArtLowBudget) > scoreTool(blender, weakArtLowBudget));
});

test("engine-incompatible tool is penalized", () => {
  const unityOnly: ToolEntry = { ...blender, engineCompatibility: ["Unity"] };
  const forUnreal: ScoringContext = { ...weakArtLowBudget, pickedEngine: "Unreal", category: "art_asset" };
  const forUnity: ScoringContext = { ...weakArtLowBudget, pickedEngine: "Unity", category: "art_asset" };
  assert.ok(scoreTool(unityOnly, forUnity) > scoreTool(unityOnly, forUnreal));
});

test("paid-priority category relaxes the budget penalty", () => {
  const paidTool: ToolEntry = { ...blender, pricing: "subscription" };
  const strict: ScoringContext = { ...weakArtLowBudget, paidPriorityCategories: [] };
  const relaxed: ScoringContext = { ...weakArtLowBudget, paidPriorityCategories: ["art_asset"] };
  assert.ok(scoreTool(paidTool, relaxed) >= scoreTool(paidTool, strict));
});
