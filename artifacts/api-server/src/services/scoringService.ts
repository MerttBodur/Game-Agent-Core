import { TOOL_CATALOG, TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import type { CandidateEntry, ToolRow } from "../types/agent.js";
import type { PddCategory, ToolEntry } from "../types/pdd.js";
import type { RetrievedContextPackage } from "../types/tree.js";

export const TRUST_SCORE_BLOCK_THRESHOLD = Number(
  process.env.TRUST_SCORE_BLOCK_THRESHOLD ?? "0",
);

// Sum to 1.0; tuned from the existing advisorEngine baseline.
export const SCORING_WEIGHTS = {
  budget: 0.25,
  skill: 0.2,
  platform: 0.2,
  timeLimit: 0.15,
  artCapability: 0.1,
  teamSize: 0.1,
} as const;

export interface ScoringInputs {
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: string;
  platformTarget: string[];
  artCapability: string;
}

export interface ScoredTool {
  tool: ToolEntry;
  score: number; // 0-100
  breakdown: Record<keyof typeof SCORING_WEIGHTS, number>;
}

export interface ScoredCategory {
  category: PddCategory;
  ranked: ScoredTool[]; // sorted desc, length <= candidates in category
}

const BUDGET_PRICING_FIT: Record<string, ToolEntry["pricing"][]> = {
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

const SKILL_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;

function scoreBudget(t: ToolEntry, budget: string): number {
  const allowed = BUDGET_PRICING_FIT[budget] ?? BUDGET_PRICING_FIT.medium;
  return allowed.includes(t.pricing) ? 100 : 0;
}

function scoreSkill(t: ToolEntry, skillLevel: string): number {
  const userRank = SKILL_RANK[skillLevel as keyof typeof SKILL_RANK] ?? 1;
  const toolRank = SKILL_RANK[t.difficultyLevel];
  if (userRank >= toolRank) return 100;
  const gap = toolRank - userRank;
  return Math.max(0, 100 - gap * 50);
}

function scorePlatform(t: ToolEntry, platforms: string[]): number {
  if (platforms.length === 0) return 50;
  const matched = platforms.filter((p) =>
    (t.supportedPlatforms as readonly string[]).includes(p),
  ).length;
  return Math.round((matched / platforms.length) * 100);
}

function scoreTimeLimit(t: ToolEntry, timeLimit: string): number {
  const tightWeight =
    { jam: 1, month: 0.7, quarter: 0.4, year: 0.2, longterm: 0 }[timeLimit] ?? 0.4;
  return Math.round(t.beginnerSuitability * tightWeight + 100 * (1 - tightWeight));
}

function scoreArt(t: ToolEntry, artCapability: string): number {
  if (t.category !== "art_asset_creation") return 100;
  const map: Record<string, number> = {
    none: 30,
    basic: 50,
    intermediate: 75,
    advanced: 90,
    professional: 100,
  };
  const userLevel = map[artCapability] ?? 50;
  if (t.difficultyLevel === "advanced" && userLevel < 75) return Math.max(0, userLevel - 30);
  return userLevel;
}

function scoreTeamSize(t: ToolEntry, teamSize: string): number {
  return (t.teamSizeFit as readonly string[]).includes(teamSize) ? 100 : 50;
}

export function scoreTool(tool: ToolEntry, inputs: ScoringInputs): ScoredTool {
  const breakdown = {
    budget: scoreBudget(tool, inputs.budget),
    skill: scoreSkill(tool, inputs.skillLevel),
    platform: scorePlatform(tool, inputs.platformTarget),
    timeLimit: scoreTimeLimit(tool, inputs.timeLimit),
    artCapability: scoreArt(tool, inputs.artCapability),
    teamSize: scoreTeamSize(tool, inputs.teamSize),
  };
  const score = Math.round(
    (Object.keys(SCORING_WEIGHTS) as (keyof typeof SCORING_WEIGHTS)[]).reduce(
      (sum, key) => sum + SCORING_WEIGHTS[key] * breakdown[key],
      0,
    ),
  );
  return { tool, score, breakdown };
}

export function scoreByCategory(
  inputs: ScoringInputs,
  retrieval: RetrievedContextPackage,
): ScoredCategory[] {
  const candidateIds = new Set(retrieval.candidateTools.map((c) => c.toolId));

  return TOOL_CATEGORIES.map((cat) => {
    const tools = TOOL_CATALOG.filter(
      (t) => t.category === cat.id && candidateIds.has(t.id),
    );
    const ranked = tools.map((t) => scoreTool(t, inputs)).sort((a, b) => b.score - a.score);
    return { category: cat.id, ranked };
  });
}

export function trustTierFor(score: number): "block" | "warn" | "pass" {
  if (score < TRUST_SCORE_BLOCK_THRESHOLD) return "block";
  if (score < 50) return "warn";
  return "pass";
}

export interface AgentScoredTool {
  tool: ToolRow;
  score: number;
}

export function scoreAgentCandidates(
  inputs: ScoringInputs,
  candidatesByCategory: Record<string, CandidateEntry>,
): Record<string, AgentScoredTool[]> {
  const scored: Record<string, AgentScoredTool[]> = {};

  for (const [category, entry] of Object.entries(candidatesByCategory)) {
    if (entry.type !== "fetched" && entry.type !== "context") {
      continue;
    }

    scored[category] = entry.tools
      .map((tool) => ({ tool, score: scoreAgentTool(tool, inputs) }))
      .sort((a, b) => b.score - a.score);
  }

  return scored;
}

function scoreAgentTool(tool: ToolRow, inputs: ScoringInputs): number {
  const priceScore = scoreAgentPrice(tool.priceModel, inputs.budget);
  const platformScore = scoreAgentPlatform(tool.platforms, inputs.platformTarget);
  const ratingScore = Math.max(0, Math.min(100, tool.rating * 20));

  return Math.round(priceScore * 0.35 + platformScore * 0.35 + ratingScore * 0.3);
}

function scoreAgentPrice(priceModel: ToolRow["priceModel"], budget: string): number {
  if (budget === "zero") {
    return priceModel === "free" ? 100 : priceModel === "freemium" ? 70 : 20;
  }
  if (budget === "low") {
    return priceModel === "free" ? 100 : priceModel === "freemium" ? 90 : 45;
  }
  return priceModel === "subscription" ? 75 : 90;
}

function scoreAgentPlatform(toolPlatforms: string[], targetPlatforms: string[]): number {
  if (targetPlatforms.length === 0) {
    return 50;
  }

  const supported = new Set(toolPlatforms.map((platform) => platform.toLowerCase()));
  const matches = targetPlatforms.filter((platform) => supported.has(platform.toLowerCase())).length;
  return Math.round((matches / targetPlatforms.length) * 100);
}
