import "dotenv/config";
import { runAdvisorPipeline } from "../orchestrators/advisorOrchestrator.js";

const result = await runAdvisorPipeline({
  projectIdea: "A 2D Web RPG Game",
  budget: "low" as const,
  skillLevel: "beginner" as const,
  platformTarget: ["web"],
  artCapability: "basic" as const,
}, () => {});

console.log("SMOKE_FEASIBLE=" + result.feasible + " TERMINATED=" + result.terminated);
console.log("SMOKE_ENGINE=" + result.engineDecision?.picked);
console.log("SMOKE_CATS=" + result.recommendations.map(r => r.category).join(","));
console.log("SMOKE_COUNT=" + result.recommendations.length);
for (const r of result.recommendations) console.log("SMOKE_REC " + r.category + " -> " + r.primary.toolId + " " + r.primary.score + "/10");
