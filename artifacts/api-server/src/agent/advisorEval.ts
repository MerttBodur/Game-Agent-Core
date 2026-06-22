import "dotenv/config";
import { pool } from "@workspace/db";
import { runAdvisorPipeline } from "../orchestrators/advisorOrchestrator.js";
import type { AdvisorInput, AnalysisResult } from "../types/advisor.js";

/**
 * Live evaluation harness. Runs the full advisor pipeline against a fixed set of
 * scenarios and scores each /10 by comparing the real output to an acceptance
 * rubric. Prints a per-scenario breakdown and the assistant's total success rate.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/agent/advisorEval.ts
 * Requires: docker compose up -d mysql chroma + an indexed collection + OPENAI key.
 */

type Expect = {
  // null => no AI judgement on this axis; otherwise the set of acceptable values.
  feasible: boolean;
  engineOk?: (picked: string) => boolean;
  aiCodingOk?: (toolId: string) => boolean;
};

type Scenario = {
  name: string;
  input: AdvisorInput;
  expect: Expect;
};

// Frontier AI-coding tools (high budget + advanced should land here).
// Catalog ids only. Cursor is included as a premium agentic IDE alongside the
// two flagship agents the user named (Claude Code, ChatGPT Codex).
const FRONTIER_AI = new Set(["claude_code", "chatgpt_codex", "cursor"]);
// Value / price-performance / free picks (correct for low budget / beginner).
const VALUE_AI = new Set([
  "windsurf",
  "codeium",
  "gemini_code_assist",
  "cline",
  "aider",
  "github_copilot",
]);

const ENGINE_AAA_3D = (e: string) => e === "unreal_engine";
const ENGINE_2D_WEB = (e: string) => e === "phaser";
const ENGINE_3D_WEB = (e: string) => e === "threejs";
const ENGINE_FLEX_2D3D = (e: string) =>
  ["unity", "godot", "gamemaker"].includes(e);
const ENGINE_VN = (e: string) => e === "renpy";
const ENGINE_3D_ANY = (e: string) => ["unreal_engine", "unity", "godot"].includes(e);

const scenarios: Scenario[] = [
  {
    name: "Indie 3D action RPG, fancy combat, high budget, advanced (THE BUG)",
    input: idea(
      "An indie 3D action RPG, not huge like the Witcher 3, with fancy and delicious battle mechanics and high-end graphics.",
      { budget: "high", skillLevel: "advanced", artCapability: "professional" },
    ),
    expect: { feasible: true, engineOk: ENGINE_AAA_3D, aiCodingOk: (t) => FRONTIER_AI.has(t) },
  },
  {
    name: "High-fidelity 3D hack-and-slash, high budget, advanced",
    input: idea(
      "A graphically impressive 3D third-person hack-and-slash with cinematic combat animations.",
      { budget: "high", skillLevel: "advanced", artCapability: "professional" },
    ),
    expect: { feasible: true, engineOk: ENGINE_AAA_3D, aiCodingOk: (t) => FRONTIER_AI.has(t) },
  },
  {
    name: "Indie low-budget beginner 2D web puzzle",
    input: idea("A simple 2D browser puzzle game for the web.", {
      budget: "low",
      skillLevel: "beginner",
      artCapability: "none",
      platformTarget: ["web"],
    }),
    expect: { feasible: true, engineOk: ENGINE_2D_WEB, aiCodingOk: (t) => VALUE_AI.has(t) },
  },
  {
    name: "Cozy 2D pixel farming, mid budget, intermediate",
    input: idea("A cozy 2D pixel-art farming game with simple mechanics, on PC.", {
      budget: "medium",
      skillLevel: "intermediate",
      artCapability: "basic",
    }),
    expect: { feasible: true, engineOk: ENGINE_FLEX_2D3D },
  },
  {
    name: "3D web product showcase, mid budget, intermediate",
    input: idea("An interactive 3D product showcase that runs in the browser.", {
      budget: "medium",
      skillLevel: "intermediate",
      artCapability: "basic",
      platformTarget: ["web"],
    }),
    expect: { feasible: true, engineOk: ENGINE_3D_WEB },
  },
  {
    name: "Visual novel, low budget, beginner",
    input: idea("A story-driven visual novel with branching dialogue.", {
      budget: "low",
      skillLevel: "beginner",
      artCapability: "basic",
    }),
    expect: { feasible: true, engineOk: ENGINE_VN },
  },
  {
    name: "Mobile 3D casual runner, mid budget, intermediate",
    input: idea("A casual 3D endless runner for mobile.", {
      budget: "medium",
      skillLevel: "intermediate",
      artCapability: "basic",
      platformTarget: ["mobile"],
    }),
    // Mobile 3D favors Unity (lighter footprint) but Godot is acceptable.
    expect: { feasible: true, engineOk: (e) => ["unity", "godot"].includes(e) },
  },
  {
    name: "AAA-scale open world SOLO in one week (BLOCK)",
    input: idea("Build a full AAA open-world game like GTA 5, solo, in one week.", {
      budget: "low",
      skillLevel: "beginner",
      artCapability: "none",
    }),
    expect: { feasible: false },
  },
  {
    name: "Persistent MMO as first solo project (BLOCK)",
    input: idea("A persistent online MMORPG with thousands of players, as my first solo project.", {
      budget: "low",
      skillLevel: "beginner",
      artCapability: "none",
    }),
    expect: { feasible: false },
  },
  {
    name: "Ranked multiplayer FPS solo in 3 months (BLOCK)",
    input: idea("A competitive multiplayer FPS with ranked matchmaking, built solo in three months.", {
      budget: "low",
      skillLevel: "intermediate",
      artCapability: "none",
    }),
    expect: { feasible: false },
  },
  {
    name: "AA-scale solo metroidvania, long timeline (FEASIBLE, not block)",
    input: idea("A polished 2D metroidvania I plan to build solo over two years.", {
      budget: "low",
      skillLevel: "intermediate",
      artCapability: "basic",
    }),
    expect: { feasible: true, engineOk: ENGINE_FLEX_2D3D },
  },
  {
    name: "Realistic graphics + low budget + no art (FEASIBLE with caution)",
    input: idea("A 3D game with realistic graphics on a small budget; I can't make art myself.", {
      budget: "low",
      skillLevel: "intermediate",
      artCapability: "none",
    }),
    expect: { feasible: true, engineOk: ENGINE_3D_ANY },
  },
  {
    name: "3D souls-like, high budget, advanced (frontier AI expected)",
    input: idea("A challenging 3D souls-like with stamina-based combat and high-end visuals.", {
      budget: "high",
      skillLevel: "advanced",
      artCapability: "professional",
    }),
    expect: { feasible: true, engineOk: ENGINE_AAA_3D, aiCodingOk: (t) => FRONTIER_AI.has(t) },
  },
  {
    name: "Low-budget beginner 3D action RPG (value AI expected)",
    input: idea("A small 3D action RPG, my first real project, on a tight budget.", {
      budget: "low",
      skillLevel: "beginner",
      artCapability: "none",
    }),
    expect: { feasible: true, engineOk: ENGINE_3D_ANY, aiCodingOk: (t) => VALUE_AI.has(t) },
  },
  {
    name: "2D fighting game, mid budget, intermediate",
    input: idea("A 2D fighting game with tight controls and combos.", {
      budget: "medium",
      skillLevel: "intermediate",
      artCapability: "basic",
    }),
    expect: { feasible: true, engineOk: (e) => [...["unity", "godot", "gamemaker"]].includes(e) },
  },
  {
    name: "High-budget advanced 3D open-world action RPG (Unreal + frontier)",
    input: idea("A 3D open-world action RPG with rich combat and stunning graphics, well funded.", {
      budget: "high",
      skillLevel: "advanced",
      artCapability: "professional",
    }),
    expect: { feasible: true, engineOk: ENGINE_AAA_3D, aiCodingOk: (t) => FRONTIER_AI.has(t) },
  },
  {
    name: "Cross-platform 2D roguelite, mid budget, intermediate",
    input: idea("A 2D roguelite for PC and console with procedural levels.", {
      budget: "medium",
      skillLevel: "intermediate",
      artCapability: "basic",
      platformTarget: ["pc", "console"],
    }),
    expect: { feasible: true, engineOk: ENGINE_FLEX_2D3D },
  },
];

function idea(
  projectIdea: string,
  over: Partial<AdvisorInput>,
): AdvisorInput {
  return {
    projectIdea,
    budget: "medium",
    skillLevel: "intermediate",
    platformTarget: ["pc"],
    artCapability: "basic",
    ...over,
  };
}

type Scored = {
  name: string;
  score: number;
  max: number;
  notes: string[];
};

/** Score one result /10 against its rubric. Partial credit per axis. */
function scoreResult(s: Scenario, r: AnalysisResult): Scored {
  const notes: string[] = [];

  // Feasibility is the gating axis. If we get it wrong, the rest is moot.
  if (s.expect.feasible !== r.feasible) {
    notes.push(`feasibility WRONG: expected ${s.expect.feasible}, got ${r.feasible}`);
    return { name: s.name, score: 0, max: 10, notes };
  }
  notes.push(`feasibility OK (${r.feasible})`);

  // Correctly-blocked scenario: full marks for the block, nothing downstream.
  if (s.expect.feasible === false) {
    return { name: s.name, score: 10, max: 10, notes };
  }

  // Feasible scenarios: 3 pts feasibility, weight rest across the judged axes.
  let score = 3;
  let judged = 0;
  let earned = 0;

  if (s.expect.engineOk) {
    judged += 1;
    const picked = r.engineDecision?.picked ?? "(none)";
    if (s.expect.engineOk(picked)) {
      earned += 1;
      notes.push(`engine OK (${picked})`);
    } else {
      notes.push(`engine MISS (${picked})`);
    }
  }

  if (s.expect.aiCodingOk) {
    judged += 1;
    const ai = r.recommendations.find((x) => x.category === "ai_coding");
    const toolId = ai?.primary.toolId ?? "(none)";
    if (ai && s.expect.aiCodingOk(toolId)) {
      earned += 1;
      notes.push(`ai_coding OK (${toolId})`);
    } else {
      notes.push(`ai_coding MISS (${toolId})`);
    }
  }

  // Distribute the remaining 7 points across whatever axes we judged.
  score += judged === 0 ? 7 : Math.round((earned / judged) * 7);
  return { name: s.name, score, max: 10, notes };
}

async function main() {
  const results: Scored[] = [];
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    process.stdout.write(`[${i + 1}/${scenarios.length}] ${s.name} ... `);
    try {
      const r = await runAdvisorPipeline(s.input, () => {});
      const scored = scoreResult(s, r);
      results.push(scored);
      console.log(`${scored.score}/10`);
      for (const n of scored.notes) console.log(`        - ${n}`);
    } catch (err) {
      results.push({ name: s.name, score: 0, max: 10, notes: [`ERROR: ${String(err)}`] });
      console.log(`ERROR`);
      console.log(`        - ${String(err)}`);
    }
  }

  const total = results.reduce((a, b) => a + b.score, 0);
  const max = results.reduce((a, b) => a + b.max, 0);
  const pct = ((total / max) * 100).toFixed(1);

  console.log("\n=====================================================");
  console.log("  SCENARIO SCORES");
  console.log("=====================================================");
  for (const r of results) {
    console.log(`  ${String(r.score).padStart(2)}/10  ${r.name}`);
  }
  console.log("-----------------------------------------------------");
  console.log(`  TOTAL: ${total}/${max}   SUCCESS RATE: ${pct}%`);
  console.log("=====================================================");

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
