import assert from "node:assert/strict";
import test from "node:test";
import type { AdvisorInput, CategoryRecommendation } from "../../types/advisor.js";
import { applyDeterministicScores } from "./scoreStack.js";

const input: AdvisorInput = {
  projectIdea: "x",
  budget: "low",
  skillLevel: "beginner",
  platformTarget: ["pc"],
  artCapability: "none",
};

const recs: CategoryRecommendation[] = [
  {
    category: "art_asset",
    primary: {
      toolId: "meshy",
      score: 0,
      scoreReason: "",
      reasoning: "x",
      pros: ["x"],
      cons: ["x"],
    },
    alternatives: [
      {
        toolId: "blender",
        score: 0,
        scoreReason: "",
        reasoning: "x",
        pros: ["x"],
        cons: ["x"],
      },
    ],
    reasoning: "x",
  },
];

test("fills numeric 0-10 scores from the deterministic scorer", () => {
  const out = applyDeterministicScores(recs, input, "Unity");
  assert.ok(out[0].primary.score > 0 && out[0].primary.score <= 10);
  assert.ok(out[0].primary.score >= out[0].alternatives[0].score);
});
