import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { TOOL_CATALOG } from "../lib/gameDevTools.js";
import type { AdvisorInput } from "../orchestrators/advisorOrchestrator.js";
import type { PddCategory } from "../types/pdd.js";
import type { AnalysisResult, Recommendation } from "../types/recommendation.js";
import type { FallbackStatus } from "../types/tree.js";

loadDotenv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const toolById = new Map(TOOL_CATALOG.map((tool) => [tool.id, tool]));
const knownToolIds = new Set(toolById.keys());

type ExpectedCategoryTools = Partial<Record<PddCategory, string[]>>;

interface Scenario {
  id: string;
  title: string;
  input: AdvisorInput;
  expectedCategories: PddCategory[];
  expectedPrimary: ExpectedCategoryTools;
  expectedFallback?: FallbackStatus;
  expectedPinnedPrimary?: ExpectedCategoryTools;
}

interface Check {
  name: string;
  status: "pass" | "partial" | "fail";
  detail: string;
}

const scenarios: Scenario[] = [
  {
    id: "S01",
    title: "Zero-budget solo 2D web platformer jam",
    input: {
      projectIdea:
        "A tiny 2D browser platformer for a weekend jam with simple tiles, keyboard controls, and instant web sharing.",
      budget: "zero",
      timeLimit: "jam",
      skillLevel: "beginner",
      teamSize: "solo",
      platformTarget: ["web"],
      artCapability: "basic",
      otherConstraints: "Must avoid paid tools and keep the workflow simple.",
    },
    expectedCategories: ["game_engine", "ide", "version_control", "deployment_publishing"],
    expectedPrimary: {
      game_engine: ["godot", "phaser", "defold"],
      ide: ["vs_code"],
      version_control: ["git_github"],
      deployment_publishing: ["itch_io", "poki", "crazygames"],
    },
  },
  {
    id: "S02",
    title: "Beginner mobile hypercasual prototype",
    input: {
      projectIdea:
        "A portrait mobile hypercasual runner prototype with simple monetization experiments, quick iteration, and basic 3D visuals.",
      budget: "low",
      timeLimit: "month",
      skillLevel: "beginner",
      teamSize: "solo",
      platformTarget: ["mobile"],
      artCapability: "basic",
      otherConstraints: "Prefer low setup cost and many learning resources.",
    },
    expectedCategories: ["game_engine", "ide", "version_control", "deployment_publishing"],
    expectedPrimary: {
      game_engine: ["unity", "godot", "defold"],
      ide: ["vs_code", "visual_studio"],
      deployment_publishing: ["google_play_store", "apple_app_store"],
    },
  },
  {
    id: "S03",
    title: "Small-team web multiplayer arena",
    input: {
      projectIdea:
        "A lightweight web multiplayer arena game with 2D characters, short matches, custom lobbies, and fast browser loading.",
      budget: "medium",
      timeLimit: "quarter",
      skillLevel: "intermediate",
      teamSize: "small",
      platformTarget: ["web", "pc"],
      artCapability: "intermediate",
      otherConstraints: "The stack should be friendly to JavaScript and web deployment.",
    },
    expectedCategories: ["game_engine", "ide", "version_control", "deployment_publishing"],
    expectedPrimary: {
      game_engine: ["phaser", "godot", "unity"],
      ide: ["vs_code"],
      version_control: ["git_github", "gitlab"],
      deployment_publishing: ["itch_io", "poki", "crazygames"],
    },
  },
  {
    id: "S04",
    title: "Advanced PC horror vertical slice",
    input: {
      projectIdea:
        "A realistic first-person PC horror vertical slice with dynamic lighting, cinematic scenes, and high quality 3D assets.",
      budget: "high",
      timeLimit: "quarter",
      skillLevel: "advanced",
      teamSize: "small",
      platformTarget: ["pc"],
      artCapability: "professional",
      otherConstraints: "Visual quality matters more than build size.",
    },
    expectedCategories: ["game_engine", "art_asset_creation", "audio", "ide", "version_control"],
    expectedPrimary: {
      game_engine: ["unreal_engine", "unity"],
      art_asset_creation: ["blender", "substance_painter", "houdini", "zbrush"],
      audio: ["fmod_studio", "wwise", "reaper"],
    },
  },
  {
    id: "S05",
    title: "VR training simulation",
    input: {
      projectIdea:
        "A VR maintenance training simulation with interactive machines, hand tracking style interactions, voiceover, and enterprise review cycles.",
      budget: "enterprise",
      timeLimit: "year",
      skillLevel: "advanced",
      teamSize: "medium",
      platformTarget: ["vr", "pc"],
      artCapability: "professional",
      otherConstraints: "Needs a mature VR path and professional audio middleware options.",
    },
    expectedCategories: ["game_engine", "art_asset_creation", "audio", "version_control"],
    expectedPrimary: {
      game_engine: ["unity", "unreal_engine"],
      audio: ["fmod_studio", "wwise"],
      version_control: ["perforce_helix_core", "gitlab", "git_github"],
    },
  },
  {
    id: "S06",
    title: "Open-source Rust ECS sandbox",
    input: {
      projectIdea:
        "A moddable PC sandbox focused on systems simulation, Rust programming, open source dependencies, and long-term engine control.",
      budget: "zero",
      timeLimit: "longterm",
      skillLevel: "advanced",
      teamSize: "small",
      platformTarget: ["pc"],
      artCapability: "intermediate",
      otherConstraints: "Prefer Rust and open source tooling even if the learning curve is high.",
    },
    expectedCategories: ["game_engine", "ide", "version_control"],
    expectedPrimary: {
      game_engine: ["bevy", "godot"],
      ide: ["vs_code"],
      version_control: ["git_github", "gitlab"],
    },
  },
  {
    id: "S07",
    title: "Enterprise console RPG",
    input: {
      projectIdea:
        "A console-focused 3D action RPG with a large content team, source control locking needs, cinematic effects, and certification planning.",
      budget: "enterprise",
      timeLimit: "longterm",
      skillLevel: "advanced",
      teamSize: "large",
      platformTarget: ["console", "pc"],
      artCapability: "professional",
      otherConstraints: "The team can pay for professional tools and needs scale.",
    },
    expectedCategories: ["game_engine", "version_control", "art_asset_creation", "deployment_publishing"],
    expectedPrimary: {
      game_engine: ["unreal_engine", "unity"],
      version_control: ["perforce_helix_core"],
      deployment_publishing: ["console_partner_portals", "steam", "epic_games_store"],
    },
  },
  {
    id: "S08",
    title: "No-code classroom web puzzle",
    input: {
      projectIdea:
        "A classroom-friendly web puzzle game made by non-programmers, with drag and drop logic, simple sprites, and shareable links.",
      budget: "medium",
      timeLimit: "month",
      skillLevel: "beginner",
      teamSize: "small",
      platformTarget: ["web"],
      artCapability: "none",
      otherConstraints: "Ease of use should beat engine flexibility.",
    },
    expectedCategories: ["game_engine", "art_asset_creation", "deployment_publishing"],
    expectedPrimary: {
      game_engine: ["construct_3", "gamemaker", "godot"],
      art_asset_creation: ["krita", "aseprite", "pyxel_edit"],
      deployment_publishing: ["itch_io", "poki", "crazygames"],
    },
  },
  {
    id: "S09",
    title: "Pixel-art roguelike",
    input: {
      projectIdea:
        "A turn-based pixel-art roguelike for PC with procedural rooms, keyboard controls, low budget, and a solo beginner developer.",
      budget: "low",
      timeLimit: "quarter",
      skillLevel: "beginner",
      teamSize: "solo",
      platformTarget: ["pc"],
      artCapability: "basic",
      otherConstraints: "Pixel art workflow should stay lightweight.",
    },
    expectedCategories: ["game_engine", "art_asset_creation", "ide", "version_control"],
    expectedPrimary: {
      game_engine: ["godot", "gamemaker", "defold"],
      art_asset_creation: ["aseprite", "krita", "pyxel_edit"],
      ide: ["vs_code"],
    },
  },
  {
    id: "S10",
    title: "Narrative visual novel on web and mobile",
    input: {
      projectIdea:
        "A branching narrative visual novel with static character art, dialogue choices, mobile export, web demo, and simple audio.",
      budget: "low",
      timeLimit: "quarter",
      skillLevel: "beginner",
      teamSize: "solo",
      platformTarget: ["web", "mobile"],
      artCapability: "intermediate",
      otherConstraints: "The catalog does not include Ren'Py, so choose the closest supported stack.",
    },
    expectedCategories: ["game_engine", "art_asset_creation", "audio", "deployment_publishing"],
    expectedPrimary: {
      game_engine: ["godot", "unity", "gamemaker"],
      art_asset_creation: ["krita", "aseprite", "live2d_cubism"],
      audio: ["audacity", "bfxr"],
    },
  },
  {
    id: "S11",
    title: "Large live-service shooter",
    input: {
      projectIdea:
        "A competitive live-service 3D shooter for PC and console with heavy networking needs, complex VFX, studio workflows, and audio middleware.",
      budget: "enterprise",
      timeLimit: "longterm",
      skillLevel: "advanced",
      teamSize: "large",
      platformTarget: ["pc", "console"],
      artCapability: "professional",
      otherConstraints: "Assume a professional studio team and paid tooling.",
    },
    expectedCategories: ["game_engine", "version_control", "art_asset_creation", "audio", "deployment_publishing"],
    expectedPrimary: {
      game_engine: ["unreal_engine", "unity"],
      version_control: ["perforce_helix_core"],
      audio: ["wwise", "fmod_studio"],
      deployment_publishing: ["steam", "epic_games_store", "console_partner_portals"],
    },
  },
  {
    id: "S12",
    title: "Cozy 3D farming game",
    input: {
      projectIdea:
        "A cozy 3D farming game for PC with stylized models, crafting systems, controller support, and a small intermediate team.",
      budget: "medium",
      timeLimit: "year",
      skillLevel: "intermediate",
      teamSize: "small",
      platformTarget: ["pc"],
      artCapability: "intermediate",
      otherConstraints: "Prefer a balanced toolchain with approachable 3D production.",
    },
    expectedCategories: ["game_engine", "art_asset_creation", "audio", "deployment_publishing"],
    expectedPrimary: {
      game_engine: ["unity", "godot", "unreal_engine"],
      art_asset_creation: ["blender", "substance_painter"],
      deployment_publishing: ["steam", "itch_io"],
    },
  },
  {
    id: "S13",
    title: "Mobile AR prototype",
    input: {
      projectIdea:
        "A mobile AR prototype that places collectible creatures on camera surfaces, needs quick iteration, and targets Android first.",
      budget: "high",
      timeLimit: "quarter",
      skillLevel: "advanced",
      teamSize: "small",
      platformTarget: ["mobile", "ar"],
      artCapability: "intermediate",
      otherConstraints: "AR support is more important than open source licensing.",
    },
    expectedCategories: ["game_engine", "art_asset_creation", "deployment_publishing"],
    expectedPrimary: {
      game_engine: ["unity", "unreal_engine"],
      deployment_publishing: ["google_play_store", "apple_app_store"],
    },
  },
  {
    id: "S14",
    title: "Sound-heavy rhythm game",
    input: {
      projectIdea:
        "A rhythm game for PC and mobile with beat timing, lots of sound effects, music iteration, and moderate 2D animation.",
      budget: "medium",
      timeLimit: "quarter",
      skillLevel: "intermediate",
      teamSize: "small",
      platformTarget: ["pc", "mobile"],
      artCapability: "intermediate",
      otherConstraints: "Audio workflow quality is a key concern.",
    },
    expectedCategories: ["game_engine", "audio", "art_asset_creation"],
    expectedPrimary: {
      game_engine: ["unity", "godot"],
      audio: ["fmod_studio", "wwise", "reaper", "audacity"],
    },
  },
  {
    id: "S15",
    title: "Ad-funded browser arcade game",
    input: {
      projectIdea:
        "A free browser arcade game designed for quick sessions, ad portal distribution, leaderboard experiments, and very simple art.",
      budget: "zero",
      timeLimit: "month",
      skillLevel: "beginner",
      teamSize: "solo",
      platformTarget: ["web"],
      artCapability: "basic",
      otherConstraints: "Publishing should prioritize browser portals with no upfront cost.",
    },
    expectedCategories: ["game_engine", "deployment_publishing", "art_asset_creation"],
    expectedPrimary: {
      game_engine: ["phaser", "godot", "defold"],
      deployment_publishing: ["poki", "crazygames", "itch_io"],
      art_asset_creation: ["krita", "godot_control_nodes"],
    },
  },
  {
    id: "S16",
    title: "Premium Steam strategy sim",
    input: {
      projectIdea:
        "A premium PC strategy simulation with many UI screens, save files, mod support aspirations, and a planned Steam release.",
      budget: "medium",
      timeLimit: "year",
      skillLevel: "intermediate",
      teamSize: "small",
      platformTarget: ["pc"],
      artCapability: "intermediate",
      otherConstraints: "Steam publishing matters more than mobile export.",
    },
    expectedCategories: ["game_engine", "deployment_publishing", "ide", "version_control"],
    expectedPrimary: {
      game_engine: ["godot", "unity"],
      deployment_publishing: ["steam"],
      ide: ["vs_code", "rider", "visual_studio"],
    },
  },
  {
    id: "S17",
    title: "Pinned Unreal despite beginner 2D jam",
    input: {
      projectIdea:
        "A beginner 2D jam game for PC with one room, simple collision, tiny art scope, and an explicit Unreal requirement.",
      budget: "zero",
      timeLimit: "jam",
      skillLevel: "beginner",
      teamSize: "solo",
      platformTarget: ["pc"],
      artCapability: "basic",
      otherConstraints: "Keep Unreal even if it is not the simplest choice.",
      pinnedToolIds: ["unreal_engine"],
    },
    expectedCategories: ["game_engine", "ide", "version_control"],
    expectedPrimary: {
      game_engine: ["unreal_engine"],
    },
    expectedPinnedPrimary: {
      game_engine: ["unreal_engine"],
    },
  },
  {
    id: "S18",
    title: "Out-of-domain CRM request",
    input: {
      projectIdea:
        "A sales CRM dashboard with lead scoring, email automation, account management, and no game development component at all.",
      budget: "medium",
      timeLimit: "quarter",
      skillLevel: "intermediate",
      teamSize: "small",
      platformTarget: ["web"],
      artCapability: "none",
      otherConstraints: "This should not receive a confident game development stack.",
    },
    expectedCategories: [],
    expectedPrimary: {},
    expectedFallback: "missing_domain",
  },
  {
    id: "S19",
    title: "Ambiguous one-word idea",
    input: {
      projectIdea: "Game",
      budget: "low",
      timeLimit: "month",
      skillLevel: "beginner",
      teamSize: "solo",
      platformTarget: ["pc"],
      artCapability: "basic",
      otherConstraints: null,
    },
    expectedCategories: [],
    expectedPrimary: {},
    expectedFallback: "ambiguous_input",
  },
  {
    id: "S20",
    title: "Expert-level 3D engine evaluation",
    input: {
      projectIdea:
        "An expert programmer wants a custom-feeling 3D PC prototype with advanced rendering experiments and willingness to handle complexity.",
      budget: "high",
      timeLimit: "longterm",
      skillLevel: "expert",
      teamSize: "solo",
      platformTarget: ["pc"],
      artCapability: "advanced",
      otherConstraints: "Expert skill should not be treated as less capable than advanced.",
    },
    expectedCategories: ["game_engine", "ide", "version_control", "art_asset_creation"],
    expectedPrimary: {
      game_engine: ["unreal_engine", "bevy", "godot"],
      art_asset_creation: ["blender", "houdini", "substance_painter"],
    },
  },
];

function allowedPricingForBudget(budget: string): Set<string> {
  const map: Record<string, string[]> = {
    zero: ["free", "open_source"],
    low: ["free", "open_source", "freemium"],
    medium: ["free", "open_source", "freemium", "subscription"],
    high: ["free", "open_source", "freemium", "paid", "subscription", "revenue_share"],
    enterprise: [
      "free",
      "open_source",
      "freemium",
      "paid",
      "subscription",
      "revenue_share",
      "enterprise",
    ],
  };
  return new Set(map[budget] ?? map.medium);
}

function findRecommendation(result: AnalysisResult, category: PddCategory): Recommendation | undefined {
  return result.recommendations.find((rec) => rec.category === category);
}

function checkResult(scenario: Scenario, result: AnalysisResult): Check[] {
  const checks: Check[] = [];
  const allReferencedIds = result.recommendations.flatMap((rec) => [
    rec.primary.toolId,
    ...rec.alternatives.map((alt) => alt.toolId),
  ]);
  const invented = allReferencedIds.filter((id) => !knownToolIds.has(id));

  checks.push({
    name: "schema_and_catalog_ids",
    status:
      invented.length === 0 &&
      result.recommendations.every((rec) => rec.alternatives.length <= 2) &&
      result.trustScore >= 0 &&
      result.trustScore <= 100
        ? "pass"
        : "fail",
    detail:
      invented.length === 0
        ? "All referenced tool ids exist and recommendation limits are respected."
        : `Invented ids: ${invented.join(", ")}`,
  });

  checks.push({
    name: "termination_contract",
    status:
      result.terminated === (result.trustTier === "block") &&
      (!result.terminated || result.recommendations.length === 0)
        ? "pass"
        : "fail",
    detail: `terminated=${result.terminated}, trustTier=${result.trustTier}, recommendations=${result.recommendations.length}`,
  });

  if (scenario.expectedFallback) {
    checks.push({
      name: "fallback_status",
      status: result.retrieval.fallbackStatus === scenario.expectedFallback ? "pass" : "fail",
      detail: `expected=${scenario.expectedFallback}, actual=${result.retrieval.fallbackStatus}`,
    });
  }

  for (const category of scenario.expectedCategories) {
    const inRetrieval = result.retrieval.relevantCategories.includes(category);
    const inRecommendations = result.recommendations.some((rec) => rec.category === category);
    checks.push({
      name: `category_${category}`,
      status: inRetrieval && inRecommendations ? "pass" : inRetrieval || inRecommendations ? "partial" : "fail",
      detail: `retrieval=${inRetrieval}, recommendation=${inRecommendations}`,
    });
  }

  for (const [category, expectedIds] of Object.entries(scenario.expectedPrimary) as [
    PddCategory,
    string[],
  ][]) {
    const rec = findRecommendation(result, category);
    if (!rec) {
      checks.push({
        name: `primary_${category}`,
        status: "fail",
        detail: `Missing recommendation for ${category}; expected one of ${expectedIds.join(", ")}`,
      });
      continue;
    }

    const alternativeHit = rec.alternatives.some((alt) => expectedIds.includes(alt.toolId));
    const primaryHit = expectedIds.includes(rec.primary.toolId);
    checks.push({
      name: `primary_${category}`,
      status: primaryHit ? "pass" : alternativeHit ? "partial" : "fail",
      detail: `primary=${rec.primary.toolId}, expected=${expectedIds.join("|")}`,
    });
  }

  for (const [category, expectedIds] of Object.entries(scenario.expectedPinnedPrimary ?? {}) as [
    PddCategory,
    string[],
  ][]) {
    const rec = findRecommendation(result, category);
    checks.push({
      name: `pinned_${category}`,
      status: rec && expectedIds.includes(rec.primary.toolId) ? "pass" : "fail",
      detail: `primary=${rec?.primary.toolId ?? "missing"}, expected pinned=${expectedIds.join("|")}`,
    });
  }

  const allowedPricing = allowedPricingForBudget(scenario.input.budget);
  const budgetViolations = result.recommendations
    .map((rec) => ({ category: rec.category, toolId: rec.primary.toolId, tool: toolById.get(rec.primary.toolId) }))
    .filter(({ toolId }) => !(scenario.input.pinnedToolIds ?? []).includes(toolId))
    .filter(({ tool }) => tool && !allowedPricing.has(tool.pricing));

  checks.push({
    name: "budget_fit_primary_tools",
    status: budgetViolations.length === 0 ? "pass" : "fail",
    detail:
      budgetViolations.length === 0
        ? "Primary recommendations fit the declared budget tier, excluding explicit pins."
        : budgetViolations
            .map(({ category, tool }) => `${category}:${tool?.id}(${tool?.pricing})`)
            .join(", "),
  });

  const engineRec = findRecommendation(result, "game_engine");
  const engineTool = engineRec ? toolById.get(engineRec.primary.toolId) : undefined;
  const platformTargets = scenario.input.platformTarget ?? [];
  const enginePlatformFit =
    !engineTool ||
    platformTargets.length === 0 ||
    platformTargets.some((platform) => engineTool.supportedPlatforms.includes(platform as never));

  checks.push({
    name: "engine_platform_fit",
    status: enginePlatformFit ? "pass" : "fail",
    detail: engineTool
      ? `engine=${engineTool.id}, targets=${platformTargets.join("|")}, supports=${engineTool.supportedPlatforms.join("|")}`
      : "No engine recommendation to evaluate.",
  });

  return checks;
}

function statusFromChecks(checks: Check[]): "pass" | "partial" | "fail" {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "partial")) return "partial";
  return "pass";
}

async function main() {
  const { retrieveContext } = await import("../lib/rag/treeNavigator.js");
  const { reason } = await import("../services/reasoningService.js");

  const evaluated = [];
  for (const scenario of scenarios) {
    const retrieval = await retrieveContext(scenario.input);
    const reasoning = await reason(
      {
        projectIdea: scenario.input.projectIdea,
        budget: scenario.input.budget,
        timeLimit: scenario.input.timeLimit,
        skillLevel: scenario.input.skillLevel,
        teamSize: scenario.input.teamSize,
        platformTarget: scenario.input.platformTarget,
        artCapability: scenario.input.artCapability,
        otherConstraints: scenario.input.otherConstraints,
        pinnedToolIds: scenario.input.pinnedToolIds ?? [],
      },
      retrieval,
    );

    const result: AnalysisResult = {
      ...reasoning,
      sessionId: reasoning.trustTier === "block" ? "" : "eval-session",
      terminated: reasoning.trustTier === "block",
    };
    const checks = checkResult(scenario, result);
    const primaryTools = Object.fromEntries(
      result.recommendations.map((rec) => [rec.category, rec.primary.toolId]),
    );

    evaluated.push({
      id: scenario.id,
      title: scenario.title,
      input: scenario.input,
      expectedCategories: scenario.expectedCategories,
      expectedPrimary: scenario.expectedPrimary,
      retrieval: result.retrieval,
      trustScore: result.trustScore,
      trustTier: result.trustTier,
      terminated: result.terminated,
      primaryTools,
      checks,
      verdict: statusFromChecks(checks),
      finalSummary: result.finalSummary,
    });

    console.log(`${scenario.id} ${scenario.title}: ${statusFromChecks(checks)}`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    total: evaluated.length,
    pass: evaluated.filter((item) => item.verdict === "pass").length,
    partial: evaluated.filter((item) => item.verdict === "partial").length,
    fail: evaluated.filter((item) => item.verdict === "fail").length,
  };

  const outDir = resolve(process.cwd(), "eval-results");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "advisor-scenarios.json"),
    `${JSON.stringify({ summary, scenarios: evaluated }, null, 2)}\n`,
  );
  writeFileSync(resolve(outDir, "advisor-scenarios.md"), renderMarkdown(summary, evaluated));

  console.log(`\nSummary: ${summary.pass} pass, ${summary.partial} partial, ${summary.fail} fail`);
  console.log(`Wrote ${resolve(outDir, "advisor-scenarios.md")}`);
}

function renderMarkdown(
  summary: { generatedAt: string; total: number; pass: number; partial: number; fail: number },
  evaluated: Array<{
    id: string;
    title: string;
    verdict: "pass" | "partial" | "fail";
    trustScore: number;
    trustTier: string;
    terminated: boolean;
    retrieval: { fallbackStatus: string; retrievalConfidence: number };
    primaryTools: Record<string, string>;
    checks: Check[];
  }>,
) {
  const lines = [
    "# Advisor Agent Scenario Evaluation",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    `Summary: ${summary.pass} pass, ${summary.partial} partial, ${summary.fail} fail out of ${summary.total}.`,
    "",
    "| ID | Verdict | Trust | Fallback | Primary tools | Failed/partial checks |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of evaluated) {
    const notableChecks = item.checks
      .filter((check) => check.status !== "pass")
      .map((check) => `${check.name}: ${check.detail}`)
      .join("<br>");
    const primaryTools = Object.entries(item.primaryTools)
      .map(([category, toolId]) => `${category}=${toolId}`)
      .join("<br>");
    lines.push(
      `| ${item.id} ${item.title} | ${item.verdict} | ${item.trustScore} ${item.trustTier} | ${item.retrieval.fallbackStatus} (${item.retrieval.retrievalConfidence}) | ${primaryTools || "none"} | ${notableChecks || "none"} |`,
    );
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
