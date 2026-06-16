import "dotenv/config";
import assert from "node:assert/strict";
import { after } from "node:test";
import test from "node:test";
import { pool } from "@workspace/db";
import { runAdvisorPipeline } from "../orchestrators/advisorOrchestrator.js";
import type { AdvisorInput } from "../types/advisor.js";

// LIVE: requires `docker compose up -d chroma`, an indexed collection, and an OpenAI key.
const base: AdvisorInput = {
  projectIdea: "",
  budget: "low",
  skillLevel: "beginner",
  teamSize: "solo",
  platformTarget: ["pc"],
  artCapability: "none",
  paidPriorityCategories: [],
  notes: null,
};

after(async () => {
  await pool.end();
});

test("solo GTA 5 in a week is blocked with a reason and zero downstream work", async () => {
  const events: string[] = [];
  const result = await runAdvisorPipeline(
    { ...base, projectIdea: "Build GTA 5 - a full AAA open-world game - solo in one week." },
    (e) => events.push(e.type),
  );
  assert.equal(result.terminated, true);
  assert.equal(result.feasible, false);
  assert.ok(result.reason.length > 0);
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.sessionId, "");
  assert.ok(events.includes("feasibility_blocked"));
  assert.ok(!events.includes("engine_picked"));
});

test("a realistic cozy 2D game produces a scored, Zod-valid stack", async () => {
  const result = await runAdvisorPipeline(
    { ...base, projectIdea: "A cozy 2D pixel-art farming game with simple mechanics, shipping on PC." },
    () => {},
  );
  assert.equal(result.terminated, false);
  assert.ok(result.engineDecision);
  assert.ok(result.recommendations.length >= 1);
  for (const rec of result.recommendations) {
    assert.ok(rec.primary.score >= 0 && rec.primary.score <= 10);
    assert.ok(rec.primary.scoreReason.length > 0);
  }
});
