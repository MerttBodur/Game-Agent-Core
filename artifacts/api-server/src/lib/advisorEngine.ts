import OpenAI from "openai";
import { GAME_DEV_TOOLS, TOOL_CATEGORIES, type GameDevTool } from "./gameDevTools.js";

const LOCKED_CATEGORIES = ["programming", "ui", "vfx", "build_ci"] as const;

export type Scope = "jam" | "prototype" | "indie" | "AA" | "AAA";
export type IdeaScoreTier = "pass" | "warn" | "block";
export type ProjectMode = "single_player" | "co_op_local" | "multiplayer_online" | "live_service";

const SCOPE_ORDER: Scope[] = ["jam", "prototype", "indie", "AA", "AAA"];

const BUDGET_USD: Record<string, number> = {
  zero: 0,
  low: 1_000,
  medium: 25_000,
  high: 500_000,
  enterprise: 5_000_000,
};

const TEAM_COUNT: Record<string, number> = {
  solo: 1,
  small: 3,
  medium: 8,
  large: 30,
};

const BUDGET_MIN_BY_SCOPE: Record<Scope, number> = {
  jam: 0,
  prototype: 0,
  indie: 1_000,
  AA: 500_000,
  AAA: 5_000_000,
};

const TEAM_MIN_BY_SCOPE: Record<Scope, number> = {
  jam: 1,
  prototype: 1,
  indie: 1,
  AA: 20,
  AAA: 100,
};

type ScoringAxis = "budget" | "skill" | "platform" | "time" | "art";

const WEIGHTS_BY_ARCHETYPE: Record<Scope, Record<ScoringAxis, number>> = {
  jam: { budget: 0.6, skill: 1.2, platform: 0.8, time: 1.5, art: 1.0 },
  prototype: { budget: 0.7, skill: 1.1, platform: 0.9, time: 1.3, art: 1.0 },
  indie: { budget: 1.0, skill: 1.0, platform: 1.0, time: 1.0, art: 1.0 },
  AA: { budget: 0.9, skill: 0.9, platform: 1.1, time: 0.8, art: 1.1 },
  AAA: { budget: 0.7, skill: 0.7, platform: 1.3, time: 0.6, art: 1.3 },
};

export let DATASET_IS_THIN = true;
export function setDatasetThin(value: boolean): void {
  DATASET_IS_THIN = value;
}

function hiddenCategoriesForMode(mode: ProjectMode): string[] {
  if (mode === "single_player") return ["networking", "backend_services"];
  if (mode === "co_op_local") return ["backend_services"];
  return [];
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
import { retrieveRelevantKnowledge } from "./rag/index.js";

export interface ProjectInput {
  projectIdea: string;
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: string;
  platformTarget: string[];
  artCapability: string;
  paidPriorityCategories?: string[];
  otherConstraints?: string | null;
  adviseAnyway?: boolean;
}

interface ToolScore {
  tool: GameDevTool;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  reasoning: string;
}

export interface ScoreBreakdown {
  budget: number;
  skill: number;
  platform: number;
  timeLimit: number;
  artCapability: number;
  popularity: number;
  paidPriority: number;
  jitter: number;
  total: number;
}

interface RetrievedKnowledgeChunk {
  content?: string;
  text?: string;
  chunk?: string;
  pageContent?: string;
  score?: number;
  source?: string | Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

type RetrievedKnowledgeResponse =
  | RetrievedKnowledgeChunk[]
  | {
      chunks?: RetrievedKnowledgeChunk[];
      results?: RetrievedKnowledgeChunk[];
      items?: RetrievedKnowledgeChunk[];
      documents?: RetrievedKnowledgeChunk[];
    };

export interface CategoryResultTool extends GameDevTool {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  reasoning: string;
}

export interface CategoryEntry {
  category: string;
  topTool: CategoryResultTool;
  alternatives: CategoryResultTool[];
}

export interface CategoryResults {
  locked: CategoryEntry[];
  flexible: CategoryEntry[];
  hidden: string[];
}

export interface AnalysisMetadata {
  projectSummary: string;
  detectedProjectType: string;
  stackOverview: string;
  overallConfidence: number;
  impliedScope: Scope;
  achievableScope: Scope;
  mismatchReasons: string[];
  projectMode: ProjectMode;
}

export interface IdeaScoreContext {
  input: ProjectInput;
  impliedScope: Scope;
  achievableScope: Scope;
}

export interface ScoringContext {
  input: ProjectInput;
  achievableScope: Scope;
  projectIdSeed: string;
}

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function injectJitter(score: number, toolName: string, projectIdSeed: string): number {
  const jitter = (djb2(`${toolName}::${projectIdSeed}`) % 1000) / 1000 - 0.5;
  return Math.max(0, Math.min(100, score + jitter));
}

function budgetDelta(tool: GameDevTool, input: ProjectInput): number {
  const budgetMap: Record<string, string[]> = {
    zero: ["open_source", "free"],
    low: ["open_source", "free", "freemium"],
    medium: ["open_source", "free", "freemium", "paid"],
    high: ["open_source", "free", "freemium", "paid", "subscription"],
    enterprise: ["open_source", "free", "freemium", "paid", "subscription"],
  };
  return (budgetMap[input.budget] ?? []).includes(tool.pricing) ? 15 : -20;
}

function skillDelta(tool: GameDevTool, input: ProjectInput): number {
  const levels = ["beginner", "intermediate", "advanced", "expert"];
  const userIdx = levels.indexOf(input.skillLevel);
  const toolIdx = levels.indexOf(tool.minSkillLevel);
  if (userIdx >= toolIdx) return userIdx - toolIdx >= 2 ? 15 : 10;
  return -15 * (toolIdx - userIdx);
}

function platformDelta(tool: GameDevTool, input: ProjectInput): number {
  if (input.platformTarget.length === 0) return 0;
  const userPlatforms = input.platformTarget.map((p) => p.toLowerCase());
  const toolPlatforms = tool.platforms.map((p) => p.toLowerCase());
  const overlap = userPlatforms.filter((p) => toolPlatforms.includes(p));
  if (overlap.length > 0) return 10 + (overlap.length - 1) * 3;
  return -25;
}

function timeDelta(tool: GameDevTool, input: ProjectInput): number {
  if (input.timeLimit !== "jam") return 0;
  let d = 0;
  if (tool.tags.includes("beginner-friendly") || tool.tags.includes("game-jam")) d += 15;
  if (tool.minSkillLevel === "expert" || tool.minSkillLevel === "advanced") d -= 10;
  return d;
}

function artDelta(tool: GameDevTool, input: ProjectInput): number {
  if (tool.category !== "art" && tool.category !== "animation") return 0;
  const artMap: Record<string, string[]> = {
    none: ["ai_tooling"],
    basic: ["ai_tooling", "beginner"],
    intermediate: ["ai_tooling", "beginner", "intermediate"],
    advanced: ["ai_tooling", "beginner", "intermediate", "advanced"],
    professional: ["ai_tooling", "beginner", "intermediate", "advanced", "expert"],
  };
  const allowed = artMap[input.artCapability] ?? [];
  return allowed.includes(tool.minSkillLevel) || allowed.includes("ai_tooling") ? 10 : -15;
}

export function scoreTool(
  tool: GameDevTool,
  ctx: ScoringContext,
): { total: number; breakdown: ScoreBreakdown } {
  const w = WEIGHTS_BY_ARCHETYPE[ctx.achievableScope];

  const budget = budgetDelta(tool, ctx.input) * w.budget;
  const skill = skillDelta(tool, ctx.input) * w.skill;
  const platform = platformDelta(tool, ctx.input) * w.platform;
  const time = timeDelta(tool, ctx.input) * w.time;
  const art = artDelta(tool, ctx.input) * w.art;

  let popularity = 0;
  if (tool.popularityByArchetype) {
    const p = tool.popularityByArchetype[ctx.achievableScope] ?? 0.5;
    const range = DATASET_IS_THIN ? 12.5 : 25;
    popularity = (p - 0.5) * range;
  }

  const isPaid = ["paid", "subscription", "freemium"].includes(tool.pricing);
  const flagged = ctx.input.paidPriorityCategories?.includes(tool.category) ?? false;
  let paidPriority = 0;
  if (isPaid && flagged) paidPriority = 8;
  else if (isPaid && !flagged) paidPriority = -6;
  else if (!isPaid && !flagged) paidPriority = 4;

  const archetypeBiasDelta = tool.archetypeBias?.[ctx.achievableScope] ?? 0;

  const preJitter = 50 + budget + skill + platform + time + art + popularity + paidPriority + archetypeBiasDelta;
  const total = injectJitter(preJitter, tool.name, ctx.projectIdSeed);
  const jitter = total - Math.max(0, Math.min(100, preJitter));

  return {
    total,
    breakdown: {
      budget,
      skill,
      platform,
      timeLimit: time,
      artCapability: art,
      popularity,
      paidPriority,
      jitter,
      total,
    },
  };
}

export function heuristicIdeaScore(ctx: IdeaScoreContext): { score: number; reasons: string[] } {
  let s = 100;
  const reasons: string[] = [];

  const gap = SCOPE_ORDER.indexOf(ctx.impliedScope) - SCOPE_ORDER.indexOf(ctx.achievableScope);
  if (gap >= 3) {
    s -= 50;
    reasons.push(
      `Implied scope (${ctx.impliedScope}) is far above what your resources support (${ctx.achievableScope}).`,
    );
  } else if (gap === 2) {
    s -= 30;
    reasons.push(
      `Implied scope (${ctx.impliedScope}) is two tiers above what your resources support (${ctx.achievableScope}).`,
    );
  } else if (gap === 1) {
    s -= 15;
    reasons.push(
      `Implied scope (${ctx.impliedScope}) is one tier above what your resources support (${ctx.achievableScope}).`,
    );
  }

  const budgetUsd = BUDGET_USD[ctx.input.budget] ?? 0;
  const budgetFloor = BUDGET_MIN_BY_SCOPE[ctx.impliedScope];
  if (budgetUsd < budgetFloor) {
    s -= 20;
    reasons.push(
      `Your budget (${ctx.input.budget}) is below the typical floor for ${ctx.impliedScope} projects.`,
    );
  }

  const teamCount = TEAM_COUNT[ctx.input.teamSize] ?? 1;
  const teamFloor = TEAM_MIN_BY_SCOPE[ctx.impliedScope];
  if (teamCount < teamFloor) {
    s -= 20;
    reasons.push(
      `Your team size (${ctx.input.teamSize}) is below the typical headcount for ${ctx.impliedScope} projects.`,
    );
  }

  return { score: Math.max(0, Math.min(100, s)), reasons };
}

export function tierFromScore(score: number): IdeaScoreTier {
  if (score < 30) return "block";
  if (score < 60) return "warn";
  return "pass";
}

function generateReasoning(tool: GameDevTool, input: ProjectInput, score: number): string {
  const parts: string[] = [];
  if (score >= 80) {
    parts.push(`${tool.name} is an excellent fit for this project.`);
  } else if (score >= 60) {
    parts.push(`${tool.name} is a solid choice for this project.`);
  } else {
    parts.push(`${tool.name} can work but has some limitations for this project.`);
  }

  // Platform note
  const overlap = input.platformTarget.filter((p) => tool.platforms.includes(p));
  if (overlap.length > 0) parts.push(`It natively supports your target platform(s): ${overlap.join(", ")}.`);

  // Budget note
  if (["free", "open_source"].includes(tool.pricing)) {
    parts.push("Completely free to use, fitting your budget constraint.");
  } else if (tool.pricing === "freemium") {
    parts.push("Freemium model: free to get started, paid tiers for commercial/advanced use.");
  }

  return parts.join(" ");
}

async function retrieveKnowledgeForAdvisor(input: ProjectInput): Promise<RetrievedKnowledgeResponse | null> {
  try {
    return await retrieveRelevantKnowledge(input, { topK: 5 });
  } catch (error) {
    console.warn("RAG retrieval failed; continuing with scoring-only advisor flow.", error);
    return null;
  }
}

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, maxLength - 1).trimEnd()}...`;
}

function getRetrievedKnowledgeChunks(retrieved: RetrievedKnowledgeResponse | null): RetrievedKnowledgeChunk[] {
  if (!retrieved) return [];
  if (Array.isArray(retrieved)) return retrieved;

  return retrieved.chunks ?? retrieved.results ?? retrieved.items ?? retrieved.documents ?? [];
}

function getChunkText(chunk: RetrievedKnowledgeChunk): string {
  const text = chunk.content ?? chunk.text ?? chunk.chunk ?? chunk.pageContent;
  return typeof text === "string" ? text : "";
}

function getSourceMetadata(chunk: RetrievedKnowledgeChunk): string {
  const parts: string[] = [];

  if (typeof chunk.source === "string" && chunk.source.trim()) {
    parts.push(`source=${compactText(chunk.source, 120)}`);
  } else if (typeof chunk.source === "object" && chunk.source !== null) {
    for (const key of ["title", "name", "url", "path", "id"]) {
      const value = chunk.source[key];
      if (typeof value === "string" && value.trim()) parts.push(`${key}=${compactText(value, 120)}`);
    }
  }

  if (chunk.metadata) {
    for (const key of ["title", "source", "url", "path", "section", "tool", "category"]) {
      const value = chunk.metadata[key];
      if (typeof value === "string" && value.trim()) parts.push(`${key}=${compactText(value, 120)}`);
    }
  }

  if (typeof chunk.score === "number") parts.push(`score=${chunk.score.toFixed(3)}`);

  return parts.length > 0 ? parts.join("; ") : "source=unknown";
}

function formatRetrievedKnowledgeContext(retrieved: RetrievedKnowledgeResponse | null): string {
  const chunks = getRetrievedKnowledgeChunks(retrieved)
    .map((chunk) => ({
      text: compactText(getChunkText(chunk), 900),
      sourceMetadata: getSourceMetadata(chunk),
    }))
    .filter((chunk) => chunk.text.length > 0);

  if (chunks.length === 0) {
    return "No retrieved knowledge context was available.";
  }

  return chunks.map((chunk, index) => `${index + 1}. ${chunk.text}\n   Source metadata: ${chunk.sourceMetadata}`).join("\n");
}

export function buildCategoryResults(
  input: ProjectInput,
  projectMode: ProjectMode = "single_player", // TODO Step 4: pass LLM-derived projectMode
  achievableScope: Scope = "indie",
  projectIdSeed: string = input.projectIdea.slice(0, 64),
): CategoryResults {
  const ctx: ScoringContext = { input, achievableScope, projectIdSeed };
  const hidden = hiddenCategoriesForMode(projectMode);
  const allCategoryIds = TOOL_CATEGORIES.map((c) => c.id);

  // 1. Score engine first to discover the ecosystem
  const engineEntry = scoreCategory("engine", ctx);
  if (!engineEntry) {
    return { locked: [], flexible: [], hidden };
  }
  const ecosystem = pickEcosystem(engineEntry.topTool);

  // 2. Walk every other category; apply hard filter to LOCKED_CATEGORIES
  const locked: CategoryEntry[] = [engineEntry]; // engine always sits in locked
  const flexible: CategoryEntry[] = [];

  for (const cat of allCategoryIds) {
    if (cat === "engine") continue;
    if (hidden.includes(cat)) continue;

    const isLocked = (LOCKED_CATEGORIES as readonly string[]).includes(cat);
    const candidatePool = isLocked
      ? GAME_DEV_TOOLS.filter(
          (t) =>
            t.category === cat &&
            (t.ecosystem.includes(ecosystem as never) || t.ecosystem.includes("engine_agnostic")),
        )
      : GAME_DEV_TOOLS.filter((t) => t.category === cat);

    const entry = scoreCategoryFromPool(cat, candidatePool, ctx);
    if (!entry) continue;

    (isLocked ? locked : flexible).push(entry);
  }

  return { locked, flexible, hidden };
}

function pickEcosystem(engineTool: CategoryResultTool): string {
  const specific = engineTool.ecosystem.find((e) => e !== "engine_agnostic");
  return specific ?? "engine_agnostic";
}

function scoreCategory(cat: string, ctx: ScoringContext): CategoryEntry | null {
  return scoreCategoryFromPool(cat, GAME_DEV_TOOLS.filter((t) => t.category === cat), ctx);
}

function scoreCategoryFromPool(
  cat: string,
  pool: GameDevTool[],
  ctx: ScoringContext,
): CategoryEntry | null {
  if (pool.length === 0) return null;

  const scored: ToolScore[] = pool.map((tool) => {
    const scoredTool = scoreTool(tool, ctx);
    return {
      tool,
      score: scoredTool.total,
      scoreBreakdown: scoredTool.breakdown,
      reasoning: generateReasoning(tool, ctx.input, scoredTool.total),
    };
  });
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  const alts = scored.slice(1, 3);

  return {
    category: cat,
    topTool: { ...top.tool, score: top.score, scoreBreakdown: top.scoreBreakdown, reasoning: top.reasoning },
    alternatives: alts.map((a) => ({ ...a.tool, score: a.score, scoreBreakdown: a.scoreBreakdown, reasoning: a.reasoning })),
  };
}

export function buildTopStackSummary(categoryResults: CategoryResults): string {
  return [...categoryResults.locked, ...categoryResults.flexible]
    .map((entry) => `${entry.category}: ${entry.topTool.name} (score: ${entry.topTool.score})`)
    .join(", ");
}

export async function retrieveAdvisorKnowledge(input: ProjectInput): Promise<{
  ragChunks: Array<{ text: string; source: string; score?: number | null }>;
  retrievedKnowledgeContext: string;
}> {
  const retrievedKnowledge = await retrieveKnowledgeForAdvisor(input);
  return {
    ragChunks: getRetrievedKnowledgeChunks(retrievedKnowledge)
    .map((chunk) => ({
      text: compactText(getChunkText(chunk), 280),
      source: getSourceMetadata(chunk),
      score: typeof chunk.score === "number" ? chunk.score : null,
    }))
    .filter((chunk) => chunk.text.length > 0),
    retrievedKnowledgeContext: formatRetrievedKnowledgeContext(retrievedKnowledge),
  };
}

function getMetadataPrompt(input: ProjectInput, topStackSummary: string, retrievedKnowledgeContext: string): string {
  return `You are a senior game development consultant. Analyze this game project and provide concise, expert analysis.

PROJECT DETAILS:
- Idea: ${input.projectIdea}
- Budget: ${input.budget}
- Timeline: ${input.timeLimit}
- Skill Level: ${input.skillLevel}
- Team: ${input.teamSize}
- Target Platforms: ${input.platformTarget.join(", ")}
- Art Capability: ${input.artCapability}
- Constraints: ${input.otherConstraints || "None"}

PRE-SCORED TOOL STACK:
${topStackSummary}

RETRIEVED KNOWLEDGE CONTEXT:
${retrievedKnowledgeContext}

SCOPE BASELINES (industry typical, USD):
- jam:       budget ~ $0,         team 1,         time hours-days
- prototype: budget ~ $0,         team 1-2,       time 1-3 months
- indie:     budget $1K - $500K,  team 1-10,      time 6-24 months
- AA:        budget $500K - $50M, team 20-100,    time 2-4 years
- AAA:       budget $50M+,        team 100-500+,  time 3-7 years

PROJECT MODE GUIDE:
- single_player: no networked play
- co_op_local: shared-screen / LAN-only multiplayer
- multiplayer_online: matchmaking, dedicated servers, cross-region play
- live_service: persistent online world with seasonal content

Use the pre-scored tool stack as the base ranking. When retrieved knowledge context is available, ground explanations in it and use source metadata to understand where each fact came from. Do not invent unsupported details about tools, pricing, capabilities, performance, or platform support.

Respond with a JSON object with these EXACT keys:
{
  "projectSummary": "2-3 sentence summary",
  "detectedProjectType": "Brief label like '2D Platformer', 'Mobile Puzzle Game'",
  "stackOverview": "One crisp sentence listing core recommended tools",
  "overallConfidence": <0-100>,
  "impliedScope": "<one of: jam | prototype | indie | AA | AAA - what scope the project IDEA suggests>",
  "achievableScope": "<one of: jam | prototype | indie | AA | AAA - what scope the budget+team+time actually supports>",
  "mismatchReasons": ["short bullet strings describing concrete scope/budget/team/time gaps"],
  "projectMode": "<one of: single_player | co_op_local | multiplayer_online | live_service>"
}`;
}

function getFinalSummaryPrompt(
  input: ProjectInput,
  metadata: AnalysisMetadata,
  topStackSummary: string,
  retrievedKnowledgeContext: string,
): string {
  return `You are a senior game development consultant.

Write only the final recommendation narrative for this project in 3-4 sentences.

PROJECT DETAILS:
- Idea: ${input.projectIdea}
- Budget: ${input.budget}
- Timeline: ${input.timeLimit}
- Skill Level: ${input.skillLevel}
- Team: ${input.teamSize}
- Target Platforms: ${input.platformTarget.join(", ")}
- Art Capability: ${input.artCapability}
- Constraints: ${input.otherConstraints || "None"}

PRE-SCORED TOOL STACK:
${topStackSummary}

METADATA:
- Project Summary: ${metadata.projectSummary}
- Project Type: ${metadata.detectedProjectType}
- Stack Overview: ${metadata.stackOverview}

RETRIEVED KNOWLEDGE CONTEXT:
${retrievedKnowledgeContext}

Ground your narrative in the stack and available retrieved context. Do not invent unsupported details.`;
}

export async function generateMetadataWithAI(
  input: ProjectInput,
  categoryResults: CategoryResults,
  retrievedKnowledgeContext: string,
): Promise<AnalysisMetadata> {
  const prompt = getMetadataPrompt(input, buildTopStackSummary(categoryResults), retrievedKnowledgeContext);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const fallbackAchievable = deriveAchievableScopeFromInput(input);
  const fallbackImplied = deriveImpliedScopeFromInput(input);
  let parsed: Partial<AnalysisMetadata> = {};

  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  const parsedImpliedScope = isScope(parsed.impliedScope) ? parsed.impliedScope : fallbackImplied;
  const parsedAchievableScope = isScope(parsed.achievableScope) ? parsed.achievableScope : fallbackAchievable;
  const impliedScope = maxScope(parsedImpliedScope, fallbackImplied);
  const achievableScope = minScope(parsedAchievableScope, fallbackAchievable);
  const projectMode = isProjectMode(parsed.projectMode) ? parsed.projectMode : "single_player";

  return {
    projectSummary:
      parsed.projectSummary ?? "A game development project with specific constraints and goals.",
    detectedProjectType: parsed.detectedProjectType ?? "Indie Game",
    stackOverview:
      parsed.stackOverview ??
      [...categoryResults.locked, ...categoryResults.flexible]
        .map((entry) => entry.topTool.name)
        .slice(0, 4)
        .join(" + "),
    overallConfidence: typeof parsed.overallConfidence === "number" ? parsed.overallConfidence : 72,
    impliedScope,
    achievableScope,
    mismatchReasons: Array.isArray(parsed.mismatchReasons)
      ? parsed.mismatchReasons.filter((r): r is string => typeof r === "string")
      : [],
    projectMode,
  };
}

function isScope(v: unknown): v is Scope {
  return typeof v === "string" && (SCOPE_ORDER as string[]).includes(v);
}

function isProjectMode(v: unknown): v is ProjectMode {
  return v === "single_player" || v === "co_op_local" || v === "multiplayer_online" || v === "live_service";
}

function minScope(a: Scope, b: Scope): Scope {
  return SCOPE_ORDER.indexOf(a) <= SCOPE_ORDER.indexOf(b) ? a : b;
}

function maxScope(a: Scope, b: Scope): Scope {
  return SCOPE_ORDER.indexOf(a) >= SCOPE_ORDER.indexOf(b) ? a : b;
}

function deriveImpliedScopeFromInput(input: ProjectInput): Scope {
  const idea = input.projectIdea.toLowerCase();

  if (
    /\baaa\b/.test(idea) ||
    idea.includes("photoreal") ||
    idea.includes("open-world") ||
    idea.includes("open world") ||
    idea.includes("mmo") ||
    idea.includes("persistent online") ||
    idea.includes("100+ hour") ||
    idea.includes("full voice") ||
    idea.includes("motion-capture") ||
    idea.includes("cinematic")
  ) {
    return "AAA";
  }

  if (
    idea.includes("20-hour") ||
    idea.includes("20 hour") ||
    (idea.includes("3d") &&
      (idea.includes("rpg") ||
        idea.includes("campaign") ||
        idea.includes("branching") ||
        idea.includes("full combat")))
  ) {
    return "AA";
  }

  if (idea.includes("2d") || idea.includes("pixel") || idea.includes("platformer") || idea.includes("puzzle")) {
    return "indie";
  }

  if (input.timeLimit === "jam") return "jam";
  return "prototype";
}

function deriveAchievableScopeFromInput(input: ProjectInput): Scope {
  const budget = BUDGET_USD[input.budget] ?? 0;
  const team = TEAM_COUNT[input.teamSize] ?? 1;
  const resourceScope =
    budget >= BUDGET_MIN_BY_SCOPE.AA && team >= TEAM_MIN_BY_SCOPE.AA
      ? "AA"
      : budget >= BUDGET_MIN_BY_SCOPE.indie || team >= 2
        ? "indie"
        : "prototype";
  const timeScope: Scope =
    input.timeLimit === "jam"
      ? "jam"
      : input.timeLimit === "month" || input.timeLimit === "quarter"
        ? "prototype"
        : input.timeLimit === "year"
          ? "indie"
          : "AA";

  return minScope(resourceScope, timeScope);
}

export async function streamFinalSummaryWithAI(
  input: ProjectInput,
  metadata: AnalysisMetadata,
  categoryResults: CategoryResults,
  retrievedKnowledgeContext: string,
  onToken: (token: string) => void,
): Promise<string> {
  const prompt = getFinalSummaryPrompt(input, metadata, buildTopStackSummary(categoryResults), retrievedKnowledgeContext);
  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    stream: true,
    messages: [{ role: "user", content: prompt }],
  });

  let finalSummary = "";
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    if (token) {
      finalSummary += token;
      onToken(token);
    }
  }
  return finalSummary.trim();
}

export async function generateFinalSummaryWithAI(
  input: ProjectInput,
  metadata: AnalysisMetadata,
  categoryResults: CategoryResults,
  retrievedKnowledgeContext: string,
): Promise<string> {
  const prompt = getFinalSummaryPrompt(input, metadata, buildTopStackSummary(categoryResults), retrievedKnowledgeContext);
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  return (response.choices[0]?.message?.content ?? "").trim();
}

export async function analyzeProjectWithAI(input: ProjectInput): Promise<{
  projectSummary: string;
  detectedProjectType: string;
  categoryResults: CategoryResults;
  finalSummary: string;
  stackOverview: string;
  overallConfidence: number;
  ragChunks: Array<{ text: string; source: string; score?: number | null }>;
}> {
  const categoryResults = buildCategoryResults(input);
  const { ragChunks, retrievedKnowledgeContext } = await retrieveAdvisorKnowledge(input);
  const metadata = await generateMetadataWithAI(input, categoryResults, retrievedKnowledgeContext);
  const finalSummary = await generateFinalSummaryWithAI(input, metadata, categoryResults, retrievedKnowledgeContext);

  return {
    ...metadata,
    finalSummary:
      finalSummary ||
      "This stack has been selected based on your budget, skill level, and platform targets.",
    categoryResults,
    ragChunks,
  };
}
