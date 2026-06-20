import "dotenv/config";
import { runFeasibility } from "../agent/steps/feasibility.js";
import { retrieveFeasibilityContext } from "../lib/rag/retriever.js";
import type { AdvisorInput } from "../types/advisor.js";

// Reproduces the user's prompt: "3D photorealistic horror game, <$500, zero experience".
const input: AdvisorInput = {
  projectIdea: "a 3D photorealistic horror game",
  budget: "low",
  skillLevel: "beginner",
  artCapability: "none",
  platformTarget: [],
};

async function main() {
  // Show exactly what guidance text the gate retrieves and feeds the model.
  const docs = await retrieveFeasibilityContext(
    `${input.projectIdea} budget ${input.budget} skill ${input.skillLevel}`,
  );
  console.log("=== RETRIEVED GUIDANCE (count=" + docs.length + ") ===");
  docs.forEach((d, i) => {
    console.log(`--- doc ${i} (topic=${d.metadata.topic}) len=${d.pageContent.length} ---`);
    console.log(d.pageContent.slice(0, 400));
  });

  console.log("\n=== RUNNING FEASIBILITY 3x (temp=0, should be stable) ===");
  for (let i = 0; i < 3; i++) {
    const out = await runFeasibility(input);
    console.log(`run ${i}: feasible=${out.feasible} | reason="${out.reason}"`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
